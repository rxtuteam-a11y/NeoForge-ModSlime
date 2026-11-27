#!/usr/bin/env python3
"""
NeoForge ModSlime Minecraft Server - Web Control Panel Backend
Zero external pip dependencies (Python 3 standard library only).
Features:
  - No accounts/passwords: anyone can watch; on the cloud, control requires a GitHub token
    with write access to the repo (verified against the GitHub API)
  - Automatic Radmin VPN (26.x.x.x) & LAN IPv4 detection
  - 24/7 real-time GitHub Auto-Save while server is running + guaranteed save on stop
  - One-click GitHub Pull Latest World when server is stopped
  - Live console streaming, player tracking, RAM usage, uptime & Playit.gg support
"""

import hashlib
import http.server
import json
import os
import platform
import re
import shutil
import socket
import socketserver
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR = os.path.abspath(os.path.dirname(__file__))
AUTH_CONFIG_PATH = os.path.join(WEB_DIR, "auth_config.json")

GDRIVE_FILE_ID = "1eKZVfJSo0c49VhZMonpZE5kURegY0V16"
GDRIVE_LINK = f"https://drive.google.com/file/d/{GDRIVE_FILE_ID}/view?usp=sharing"
GITHUB_REPO_URL = "https://github.com/rxtuteam-a11y/NeoForge-ModSlime"
GITHUB_COMMITS_URL = f"{GITHUB_REPO_URL}/commits/main"

GITHUB_API = os.environ.get("MODSLIME_GH_API", "https://api.github.com").rstrip("/")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "rxtuteam-a11y/NeoForge-ModSlime")
GH_VERIFY_TTL_SEC = 10 * 60
WEB_PORT = int(os.environ.get("PORT", 8080))

# ---- Cloud mode (GitHub Actions) ----
# MODSLIME_CLOUD=1      : panel runs on a GitHub Actions runner (started from the website)
# MODSLIME_AUTOSTART=1  : start the Minecraft server as soon as the panel boots
# MODSLIME_DEADLINE     : unix time when the runner will be killed -> stop & save before it
# MODSLIME_IDLE_EXIT_MIN: exit the panel (ends the Actions run) after the server stayed off this long
# GIT_BRANCH            : branch that world saves are pushed to
# RCLONE_REMOTE         : e.g. "gdrive:ModSlime-Backups" -> zip of world uploaded to Google Drive
CLOUD_MODE = os.environ.get("MODSLIME_CLOUD", "") == "1"
AUTOSTART = os.environ.get("MODSLIME_AUTOSTART", "") == "1"
CLOUD_DEADLINE = float(os.environ.get("MODSLIME_DEADLINE", "0") or 0)
IDLE_EXIT_MIN = float(os.environ.get("MODSLIME_IDLE_EXIT_MIN", "10") or 10)
GIT_BRANCH = os.environ.get("GIT_BRANCH", "main") or "main"
RCLONE_REMOTE = os.environ.get("RCLONE_REMOTE", "").strip()
GDRIVE_KEEP = int(os.environ.get("GDRIVE_KEEP", "3") or 3)  # số bản sao lưu world giữ lại trên Drive
CLOUD_PUBLIC_URL = os.environ.get("MODSLIME_PUBLIC_URL", "")
CLOUD_MC_ADDRESS = os.environ.get("MODSLIME_MC_ADDRESS", "")
CLOUD_RUN_URL = os.environ.get("MODSLIME_RUN_URL", "")

# Runtime process & state globals
server_proc = None
playit_proc = None
setup_proc = None

console_lines = []
gdrive_status = "Chưa cấu hình Google Drive" if not RCLONE_REMOTE else "Chưa sao lưu trong phiên này"
gdrive_last_time = "-"
gdrive_in_progress = False
gdrive_lock = threading.Lock()
server_stopped_since = time.time()
playit_lines = []

server_ready = False
server_start_time = None
online_players = set()

autosave_enabled = True
autosave_interval_min = 10
next_autosave_ts = None

last_sync_status = "Chưa đồng bộ trong phiên này"
last_sync_time = "-"
backup_in_progress = False
backup_history = []  # newest first, max 10 entries

# Caches to keep /api/status fast (<5ms)
_net_cache = {"ts": 0.0, "radmin_ip": None, "lan_ip": None}
_world_size_cache = {"ts": 0.0, "mb": 0.0}
_ram_cache = {"ts": 0.0, "mb": None}
_props_cache = {"ts": 0.0, "mc_port": 25565, "max_players": 20}

# Panel settings (autosave) & verified GitHub tokens
auth_config = {}
_gh_verified = {}  # sha256(token) -> (login or None, expires_at)

lock = threading.Lock()
git_lock = threading.Lock()
auth_lock = threading.Lock()

# Windows subprocess helper flag to prevent popping console windows
SUBPROCESS_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0) if platform.system() == "Windows" else 0


# ============================================================
# Authentication & Configuration Helpers
# ============================================================

def save_auth_config():
    with auth_lock:
        tmp_path = AUTH_CONFIG_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(auth_config, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_path, AUTH_CONFIG_PATH)


def load_auth_config():
    """Load panel settings (autosave). The file no longer holds any accounts."""
    global auth_config, autosave_enabled, autosave_interval_min
    loaded = {}
    if os.path.exists(AUTH_CONFIG_PATH):
        try:
            with open(AUTH_CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
        except Exception:
            loaded = {}
    if not isinstance(loaded, dict):
        loaded = {}
    loaded.setdefault("autosave_enabled", True)
    loaded.setdefault("autosave_interval_min", 10)
    with auth_lock:
        auth_config = loaded
        autosave_enabled = bool(auth_config.get("autosave_enabled", True))
        try:
            autosave_interval_min = max(1, min(120, int(auth_config.get("autosave_interval_min", 10))))
        except Exception:
            autosave_interval_min = 10


def verify_github_token(token: str):
    """Return the GitHub login if the token belongs to someone with write access to the repo, else None."""
    if not token:
        return None
    key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.time()
    with auth_lock:
        hit = _gh_verified.get(key)
        if hit and hit[1] > now:
            return hit[0]

    def _get(path):
        req = urllib.request.Request(
            GITHUB_API + path,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "modslime-panel",
            },
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8"))

    login = None
    try:
        me = _get("/user").get("login") or ""
        owner = GITHUB_REPOSITORY.split("/")[0]
        if me and me.lower() == owner.lower():
            login = me
        elif me:
            perm = _get(f"/repos/{GITHUB_REPOSITORY}/collaborators/{me}/permission").get("permission")
            if perm in ("admin", "maintain", "write"):
                login = me
    except Exception:
        login = None
    with auth_lock:
        # cache failures briefly so a wrong token does not hammer the GitHub API
        _gh_verified[key] = (login, now + (GH_VERIFY_TTL_SEC if login else 30))
    return login


# ============================================================
# Network (Radmin VPN + LAN) & Server Properties Detection
# ============================================================

def read_server_properties(force=False):
    now = time.time()
    if not force and (now - _props_cache["ts"]) < 30:
        return _props_cache["mc_port"], _props_cache["max_players"]
    mc_port = 25565
    max_players = 20
    props_path = os.path.join(ROOT_DIR, "server.properties")
    if os.path.exists(props_path):
        try:
            with open(props_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip()
                    if k == "server-port" and v.isdigit():
                        mc_port = int(v)
                    elif k == "max-players" and v.isdigit():
                        max_players = int(v)
        except Exception:
            pass
    _props_cache["ts"] = now
    _props_cache["mc_port"] = mc_port
    _props_cache["max_players"] = max_players
    return mc_port, max_players


def _is_lan_ipv4(ip: str) -> bool:
    if not ip or ip.startswith("127.") or ip.startswith("169.254.") or ip.startswith("26."):
        return False
    if ip.startswith("192.168.") or ip.startswith("10."):
        return True
    m = re.match(r"^172\.(\d+)\.", ip)
    if m and 16 <= int(m.group(1)) <= 31:
        return True
    return False


def detect_network_info(force=False):
    now = time.time()
    if not force and (now - _net_cache["ts"]) < 15:
        return _net_cache["radmin_ip"], _net_cache["lan_ip"]

    radmin_ip = None
    lan_ip = None
    candidate_ips = []

    # Method 1: Parse ipconfig on Windows (accurately catches Radmin VPN adapter)
    if platform.system() == "Windows":
        try:
            res = subprocess.run(
                ["ipconfig"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=4,
                creationflags=SUBPROCESS_FLAGS,
            )
            current_adapter = ""
            for raw_line in res.stdout.splitlines():
                line = raw_line.strip()
                if raw_line and not raw_line[0].isspace() and raw_line.rstrip().endswith(":"):
                    current_adapter = line.lower()
                    continue
                # Match IPv4 lines only (avoid Default Gateway 26.0.0.1 and Subnet Mask 255.0.0.0)
                if "ipv4" in line.lower() or "ip address" in line.lower():
                    m = re.search(r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})", line)
                    if m:
                        ip = m.group(1)
                        candidate_ips.append(ip)
                        if ip.startswith("26.") and ip != "26.0.0.1":
                            if "radmin" in current_adapter or not radmin_ip:
                                radmin_ip = ip
                        elif _is_lan_ipv4(ip) and not lan_ip:
                            lan_ip = ip
        except Exception:
            pass

    # Method 2: socket.getaddrinfo fallback (works cross-platform & non-English Windows)
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in candidate_ips:
                candidate_ips.append(ip)
            if not radmin_ip and ip.startswith("26.") and ip != "26.0.0.1":
                radmin_ip = ip
            if not lan_ip and _is_lan_ipv4(ip):
                lan_ip = ip
    except Exception:
        pass

    # Method 3: Outbound UDP socket trick to detect primary LAN IP
    if not lan_ip:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.5)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127.") and not ip.startswith("26."):
                lan_ip = ip
        except Exception:
            pass

    _net_cache["ts"] = now
    _net_cache["radmin_ip"] = radmin_ip
    _net_cache["lan_ip"] = lan_ip
    return radmin_ip, lan_ip


# ============================================================
# Logging, Process Metrics & Minecraft Log Parser
# ============================================================

def append_log(buf, line, max_lines=1500):
    clean = line.rstrip("\r\n")
    with lock:
        buf.append(clean)
        if len(buf) > max_lines:
            del buf[: len(buf) - max_lines]


def _parse_minecraft_log_line(line: str):
    global server_ready, next_autosave_ts
    if "Saved the game" in line:
        world_saved_event.set()
    if "All dimensions are saved" in line:
        world_stop_saved_event.set()
    # Detect server startup completion
    if not server_ready and ("Done (" in line and ")!" in line):
        with lock:
            server_ready = True
            if autosave_enabled and next_autosave_ts is None:
                next_autosave_ts = time.time() + autosave_interval_min * 60

    # Player joined
    m_join = re.search(r":\s+([A-Za-z0-9_]{1,32})\s+joined the game\s*$", line)
    if m_join:
        with lock:
            online_players.add(m_join.group(1))
        return

    # Player left
    m_left = re.search(r":\s+([A-Za-z0-9_]{1,32})\s+left the game\s*$", line)
    if m_left:
        with lock:
            online_players.discard(m_left.group(1))
        return

    # Output of `list` command: "There are 2 of a max of 20 players online: pacalaca, Yazmm"
    m_list = re.search(r"There are (\d+) of a max of \d+ players online:(.*)$", line)
    if m_list:
        count = int(m_list.group(1))
        names_raw = m_list.group(2).strip()
        with lock:
            online_players.clear()
            if count > 0 and names_raw:
                for name in names_raw.split(","):
                    n = name.strip()
                    if n:
                        online_players.add(n)


def read_stream(proc, buf, on_exit=None, parse_mc=False):
    try:
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            append_log(buf, line)
            if parse_mc:
                _parse_minecraft_log_line(line)
    except Exception as e:
        append_log(buf, f"[Panel Error] {e}")
    finally:
        if on_exit:
            on_exit()


def is_server_running() -> bool:
    return server_proc is not None and server_proc.poll() is None


def is_playit_running() -> bool:
    return playit_proc is not None and playit_proc.poll() is None


def get_java_ram_mb():
    if not is_server_running() or server_proc is None:
        _ram_cache["mb"] = 0.0
        _ram_cache["ts"] = time.time()
        return 0.0
    now = time.time()
    if (now - _ram_cache["ts"]) < 5 and _ram_cache["mb"] is not None:
        return _ram_cache["mb"]

    pid = server_proc.pid
    mb = None
    try:
        if platform.system() == "Windows":
            res = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=3,
                creationflags=SUBPROCESS_FLAGS,
            )
            for line in res.stdout.splitlines():
                if f'"{pid}"' in line:
                    # Last CSV field is memory e.g. "3,412,500 K"
                    parts = [p.strip('"') for p in line.split('","')]
                    if parts:
                        mem_str = parts[-1]
                        digits = re.sub(r"[^\d]", "", mem_str)
                        if digits:
                            mb = round(int(digits) / 1024.0, 1)
                    break
        else:
            status_file = f"/proc/{pid}/status"
            if os.path.exists(status_file):
                with open(status_file, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("VmRSS:"):
                            kb = int(re.findall(r"\d+", line)[0])
                            mb = round(kb / 1024.0, 1)
                            break
    except Exception:
        pass

    _ram_cache["ts"] = now
    _ram_cache["mb"] = mb
    return mb


def get_world_size_mb(force=False) -> float:
    now = time.time()
    if not force and (now - _world_size_cache["ts"]) < 15:
        return _world_size_cache["mb"]
    total = 0
    world_dir = os.path.join(ROOT_DIR, "world")
    if os.path.exists(world_dir):
        for root, _, files in os.walk(world_dir):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    mb = round(total / (1024 * 1024), 2)
    _world_size_cache["ts"] = now
    _world_size_cache["mb"] = mb
    return mb


def _record_backup_history(reason: str, ok: bool, message: str, timestamp: str = None):
    ts = timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = {
        "time": ts,
        "reason": reason,
        "ok": bool(ok),
        "message": message,
    }
    with lock:
        backup_history.insert(0, entry)
        if len(backup_history) > 10:
            del backup_history[10:]


# ============================================================
# Linux Cloud Auto-Setup (Codespaces)
# ============================================================

def ensure_mods_on_linux_bg():
    global setup_proc
    if platform.system() != "Linux" or CLOUD_MODE:
        return
    mods_dir = os.path.join(ROOT_DIR, "mods")
    libs_dir = os.path.join(ROOT_DIR, "libraries")
    jar_count = 0
    if os.path.exists(mods_dir):
        jar_count = len([f for f in os.listdir(mods_dir) if f.endswith(".jar")])
    if jar_count >= 200 and os.path.exists(libs_dir):
        return
    if setup_proc is not None and setup_proc.poll() is None:
        return

    append_log(console_lines, "==================================================")
    append_log(console_lines, "[Cloud Setup] Đang tự động tải gói 266 Mods & Libraries (1.06 GB) từ Google Drive...")
    script = (
        "set -e\n"
        "python3 -m pip install -q gdown\n"
        f"gdown {GDRIVE_FILE_ID} -O /tmp/NeoForge-ModSlime.zip\n"
        "echo '[Cloud Setup] Đã tải xong file nén! Đang giải nén 266 Mods & Libraries...'\n"
        "unzip -q -o /tmp/NeoForge-ModSlime.zip 'NeoForge-ModSlime/mods/*' 'NeoForge-ModSlime/libraries/*' -d /tmp/extract_modslime\n"
        "cp -rn /tmp/extract_modslime/NeoForge-ModSlime/mods ./ || true\n"
        "cp -rn /tmp/extract_modslime/NeoForge-ModSlime/libraries ./ || true\n"
        "rm -rf /tmp/NeoForge-ModSlime.zip /tmp/extract_modslime\n"
        "echo '[Cloud Setup] ĐÃ TẢI XONG TOÀN BỘ 266 MODS & LIBRARIES! Bây giờ bạn có thể bấm ▶ BẬT SERVER!'\n"
    )
    setup_proc = subprocess.Popen(
        ["bash", "-c", script],
        cwd=ROOT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    threading.Thread(target=read_stream, args=(setup_proc, console_lines), daemon=True).start()


# ============================================================
# GitHub Sync (24/7 Auto-Save, Manual Backup, Pull World)
# ============================================================

def _git(args, input_text=None, env=None):
    return subprocess.run(
        ["git"] + args, cwd=ROOT_DIR, input=input_text, capture_output=True, text=True,
        encoding="utf-8", errors="replace", env=env, creationflags=SUBPROCESS_FLAGS,
    )


# Dữ liệu server ghi ra và cần lưu (config chỉ lưu những file chính server đã sửa trong phiên)
SYNC_PATHS = [
    "world", "server.properties", "ops.json", "whitelist.json",
    "banned-players.json", "banned-ips.json", "usercache.json", "usernamecache.json",
]
_session_base = None


def _get_session_base():
    """Commit mà phiên này bắt đầu từ đó. HEAD không bao giờ bị dời trong phiên."""
    global _session_base
    if not _session_base:
        _session_base = os.environ.get("MODSLIME_SESSION_BASE") or _git(["rev-parse", "HEAD"]).stdout.strip()
    return _session_base


def _collect_changes():
    """Stage (index thường, có cache stat nên nhanh) mọi thay đổi server tạo ra từ đầu phiên.
    Trả về danh sách bản ghi cho `git update-index --index-info`."""
    base = _get_session_base()
    paths = [p for p in SYNC_PATHS if os.path.exists(os.path.join(ROOT_DIR, p))]
    cfg = set()
    for args in (["diff", "--name-only", "-z", base, "--", "config"],
                 ["ls-files", "--others", "--exclude-standard", "-z", "--", "config"]):
        cfg.update(x for x in _git(args).stdout.split("\0") if x)
    if paths:
        r = _git(["add", "-A", "--"] + paths)
        if r.returncode != 0:
            raise RuntimeError("git add lỗi: " + (r.stderr or r.stdout).strip()[:200])
    cfg_list = sorted(cfg)
    for i in range(0, len(cfg_list), 200):
        _git(["add", "-A", "--"] + cfg_list[i:i + 200])
    spec = paths + (["config"] if cfg_list else [])
    if not spec:
        return []
    toks = _git(["diff", "--cached", "--name-status", "-z", "--no-renames", base, "--"] + spec).stdout.split("\0")
    changes = []
    i = 0
    while i + 1 < len(toks) and toks[i]:
        changes.append((toks[i][0], toks[i + 1]))
        i += 2
    if not changes:
        return []
    entries = {}
    for rec in _git(["ls-files", "-s", "-z", "--"] + spec).stdout.split("\0"):
        if "\t" in rec:
            meta, path = rec.split("\t", 1)
            mode, sha, _stage = meta.split(" ")
            entries[path] = (mode, sha)
    recs = []
    for status, path in changes:
        if status == "D" or path not in entries:
            recs.append("0 " + "0" * 40 + "\t" + path)
        else:
            mode, sha = entries[path]
            recs.append(f"{mode} {sha}\t{path}")
    return recs


def _push_changes(recs, message):
    """Tạo commit = (bản mới nhất trên GitHub) + (thay đổi của server) rồi push.
    Không rebase, không autostash, không đụng working tree -> an toàn khi Minecraft đang ghi file."""
    shallow = _git(["rev-parse", "--is-shallow-repository"]).stdout.strip() == "true"
    idx = _git(["rev-parse", "--git-path", "modslime-sync-index"]).stdout.strip()
    if not os.path.isabs(idx):
        idx = os.path.join(ROOT_DIR, idx)
    env = dict(os.environ, GIT_INDEX_FILE=idx)
    cenv = dict(os.environ,
                GIT_AUTHOR_NAME="ModSlime Cloud AutoSave", GIT_AUTHOR_EMAIL="modslime-bot@users.noreply.github.com",
                GIT_COMMITTER_NAME="ModSlime Cloud AutoSave", GIT_COMMITTER_EMAIL="modslime-bot@users.noreply.github.com")
    last_err = ""
    for attempt in range(1, 6):
        f = _git(["fetch", "--quiet"] + (["--depth=1"] if shallow else []) + ["origin", GIT_BRANCH])
        if f.returncode != 0:
            last_err = (f.stderr or f.stdout).strip()
            time.sleep(attempt * 3)
            continue
        remote = _git(["rev-parse", "FETCH_HEAD"]).stdout.strip()
        _git(["read-tree", remote], env=env)
        u = _git(["update-index", "-z", "--index-info"], input_text="\0".join(recs) + "\0", env=env)
        if u.returncode != 0:
            raise RuntimeError("update-index lỗi: " + (u.stderr or u.stdout).strip()[:200])
        tree = _git(["write-tree"], env=env).stdout.strip()
        if tree and tree == _git(["rev-parse", remote + "^{tree}"]).stdout.strip():
            return True, "nochange"
        commit = _git(["commit-tree", tree, "-p", remote, "-m", message], env=cenv).stdout.strip()
        if not commit:
            raise RuntimeError("Không tạo được commit")
        p = _git(["push", "origin", f"{commit}:refs/heads/{GIT_BRANCH}"])
        if p.returncode == 0:
            return True, commit[:8]
        last_err = (p.stderr or p.stdout).strip()
        append_log(console_lines, f"[Cloud Sync] Push chưa được (lần {attempt}), thử lại: {last_err[:160]}")
        time.sleep(attempt * 3)
    return False, last_err


def sync_to_github(reason="Auto-backup"):
    global last_sync_status, last_sync_time, backup_in_progress
    with git_lock:
        backup_in_progress = True
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        append_log(console_lines, f"[Cloud Sync] Đang lưu dữ liệu world & config lên GitHub ({reason})...")
        try:
            recs = _collect_changes()
            ok, info = (True, "nochange") if not recs else _push_changes(
                recs, f"Save world & server data ({reason} - {now_str})")
            if ok and info == "nochange":
                last_sync_status = f"Đã đồng bộ (Không có thay đổi mới - {reason})"
                append_log(console_lines, f"[Cloud Sync] GitHub đã có bản mới nhất ({reason}).")
                _record_backup_history(reason, True, "Không có thay đổi mới", now_str)
            elif ok:
                last_sync_status = f"Lưu lên GitHub thành công ({reason})"
                append_log(console_lines, f"[Cloud Sync] Đã lưu {len(recs)} file lên GitHub (commit {info}) lúc {now_str}!")
                _record_backup_history(reason, True, f"Đẩy lên GitHub thành công ({len(recs)} file)", now_str)
            else:
                last_sync_status = f"Lỗi git push: {info[:120]}"
                append_log(console_lines, f"[Cloud Sync] LỖI: không đẩy được lên GitHub sau 5 lần thử: {info}")
                _record_backup_history(reason, False, last_sync_status, now_str)
            last_sync_time = now_str
            get_world_size_mb(force=True)
            return ok, last_sync_status
        except Exception as e:
            last_sync_status = f"Lỗi đồng bộ: {e}"
            last_sync_time = now_str
            append_log(console_lines, f"[Cloud Sync] Lỗi ngoại lệ: {e}")
            _record_backup_history(reason, False, str(e), now_str)
            return False, last_sync_status
        finally:
            backup_in_progress = False


def pull_world_from_github():
    global last_sync_status, last_sync_time, backup_in_progress, _session_base
    if is_server_running():
        return False, "Hãy TẮT Server trước khi tải World mới nhất từ GitHub!"
    # Đẩy nốt thay đổi chưa lưu (nếu có) trước khi thay world bằng bản trên GitHub
    ok, msg = sync_to_github("Trước khi tải World")
    if not ok:
        return False, "Chưa đẩy được dữ liệu hiện tại lên GitHub nên không tải đè: " + msg
    with git_lock:
        backup_in_progress = True
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        append_log(console_lines, "[Cloud Pull] Đang tải World & Config mới nhất từ GitHub...")
        try:
            f = _git(["fetch", "--quiet", "origin", GIT_BRANCH])
            r = _git(["reset", "--hard", "FETCH_HEAD"]) if f.returncode == 0 else f
            if r.returncode == 0:
                _session_base = _git(["rev-parse", "HEAD"]).stdout.strip()
                summary = "Đã cập nhật World mới nhất từ GitHub!"
                last_sync_status, last_sync_time = summary, now_str
                append_log(console_lines, f"[Cloud Pull] {summary}")
                _record_backup_history("Pull World", True, summary, now_str)
                get_world_size_mb(force=True)
                return True, summary
            msg = f"Lỗi khi tải World từ GitHub: {(r.stderr or r.stdout).strip()[:150]}"
            last_sync_status, last_sync_time = msg, now_str
            append_log(console_lines, f"[Cloud Pull] {msg}")
            _record_backup_history("Pull World", False, msg, now_str)
            return False, msg
        except Exception as e:
            msg = f"Lỗi ngoại lệ khi tải World: {e}"
            last_sync_status, last_sync_time = msg, now_str
            append_log(console_lines, f"[Cloud Pull] {msg}")
            return False, msg
        finally:
            backup_in_progress = False


world_saved_event = threading.Event()
world_stop_saved_event = threading.Event()


def save_world_snapshot(timeout=120):
    """save-off -> save-all flush -> chờ Minecraft báo 'Saved the game' để bản lưu không bị ghi dở.
    Luôn gọi save_world_resume() sau khi sao lưu xong."""
    if not is_server_running():
        return True
    world_saved_event.clear()
    send_server_command("save-off")
    send_server_command("save-all flush")
    ok = world_saved_event.wait(timeout)
    if not ok:
        append_log(console_lines, f"[Cloud Sync] Cảnh báo: chưa thấy 'Saved the game' sau {timeout}s, vẫn sao lưu.")
    return ok


def save_world_resume():
    if is_server_running():
        send_server_command("save-on")


def auto_backup_loop():
    global next_autosave_ts
    while True:
        time.sleep(1)
        try:
            running = is_server_running()
            if not running or not autosave_enabled or not server_ready:
                next_autosave_ts = None
                continue

            now = time.time()
            if next_autosave_ts is None:
                next_autosave_ts = now + autosave_interval_min * 60
                continue

            if now >= next_autosave_ts:
                append_log(
                    console_lines,
                    f"[Auto-Save 24/7] Đến chu kỳ {autosave_interval_min} phút — đang lưu World vào ổ đĩa và đẩy lên GitHub...",
                )
                try:
                    save_world_snapshot()
                    if is_server_running():
                        sync_to_github(f"Auto-Save 24/7 ({autosave_interval_min}m)")
                finally:
                    save_world_resume()
                next_autosave_ts = time.time() + autosave_interval_min * 60 if is_server_running() else None
        except Exception as e:
            append_log(console_lines, f"[Auto-Save Error] {e}")
            time.sleep(5)


# ============================================================
# Google Drive Backup (rclone)
# ============================================================

def backup_to_gdrive(reason="Manual"):
    """Zip world + config and upload to Google Drive via rclone (remote from RCLONE_REMOTE)."""
    global gdrive_status, gdrive_last_time, gdrive_in_progress
    if not RCLONE_REMOTE:
        return False, "Chưa cấu hình Google Drive (thiếu secret RCLONE_CONFIG trên GitHub)."
    if not shutil.which("rclone"):
        return False, "Máy chủ chưa cài rclone nên không thể lưu lên Google Drive."
    if not gdrive_lock.acquire(blocking=False):
        return False, "Đang có một lần sao lưu Google Drive khác chạy."
    gdrive_in_progress = True
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    zip_base = os.path.join("/tmp" if os.path.isdir("/tmp") else ROOT_DIR, f"ModSlime-world-{stamp}")
    zip_path = zip_base + ".zip"
    try:
        append_log(console_lines, f"[Google Drive] Đang nén world + config ({reason})...")
        import zipfile
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
            for top in ("world", "config", "server.properties", "ops.json", "whitelist.json",
                        "banned-players.json", "banned-ips.json", "usercache.json"):
                full = os.path.join(ROOT_DIR, top)
                if os.path.isfile(full):
                    zf.write(full, top)
                elif os.path.isdir(full):
                    for root, _, files in os.walk(full):
                        for f in files:
                            if f == "session.lock":
                                continue
                            fp = os.path.join(root, f)
                            try:
                                zf.write(fp, os.path.relpath(fp, ROOT_DIR))
                            except OSError:
                                pass
        size_mb = os.path.getsize(zip_path) / (1024 * 1024)
        append_log(console_lines, f"[Google Drive] Đang tải {size_mb:.1f} MB lên {RCLONE_REMOTE} ...")
        res = subprocess.run(
            ["rclone", "copy", zip_path, RCLONE_REMOTE, "--retries", "3"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=SUBPROCESS_FLAGS,
        )
        if res.returncode != 0:
            err = (res.stderr or res.stdout or "rclone lỗi").strip().splitlines()[-1:]
            gdrive_status = f"Lỗi Google Drive: {' '.join(err)[:150]}"
            gdrive_last_time = now_str
            append_log(console_lines, f"[Google Drive] {gdrive_status}")
            _record_backup_history(f"Google Drive ({reason})", False, gdrive_status, now_str)
            return False, gdrive_status
        # Chỉ giữ GDRIVE_KEEP bản mới nhất (tên file có ngày giờ nên sắp xếp theo tên là đúng thứ tự)
        lsf = subprocess.run(
            ["rclone", "lsf", RCLONE_REMOTE, "--files-only", "--include", "ModSlime-world-*.zip"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=SUBPROCESS_FLAGS,
        )
        old_files = sorted(f.strip() for f in lsf.stdout.splitlines() if f.strip())[:-GDRIVE_KEEP]
        for f in old_files:
            subprocess.run(["rclone", "deletefile", f"{RCLONE_REMOTE.rstrip('/')}/{f}"],
                           capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
        if old_files:
            append_log(console_lines, f"[Google Drive] Đã xoá {len(old_files)} bản sao lưu cũ (giữ {GDRIVE_KEEP} bản mới nhất).")
        gdrive_status = f"Đã lưu {os.path.basename(zip_path)} ({size_mb:.1f} MB) lên Google Drive"
        gdrive_last_time = now_str
        append_log(console_lines, f"[Google Drive] {gdrive_status}")
        _record_backup_history(f"Google Drive ({reason})", True, gdrive_status, now_str)
        return True, gdrive_status
    except Exception as e:
        gdrive_status = f"Lỗi Google Drive: {e}"
        gdrive_last_time = now_str
        append_log(console_lines, f"[Google Drive] {gdrive_status}")
        return False, gdrive_status
    finally:
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)
        except OSError:
            pass
        gdrive_in_progress = False
        gdrive_lock.release()


# ============================================================
# Cloud watchdog: save before the Actions runner time limit, end run when idle
# ============================================================

def cloud_watchdog_loop():
    deadline_stop_sent = False
    while True:
        time.sleep(5)
        try:
            now = time.time()
            running = is_server_running()
            if CLOUD_DEADLINE and not deadline_stop_sent and running and now >= CLOUD_DEADLINE - 8 * 60:
                deadline_stop_sent = True
                append_log(console_lines, "[Cloud] Sắp hết thời gian của phiên GitHub Actions — đang báo người chơi, lưu world và tắt server...")
                send_server_command("say Server se tat sau 60 giay de luu world (het gio phien cloud). Hay bat lai tren web!")
                time.sleep(60)
                stop_minecraft_server()
            busy = backup_in_progress or gdrive_in_progress or (setup_proc is not None and setup_proc.poll() is None)
            idle_for = now - server_stopped_since
            if not running and not busy:
                if (CLOUD_DEADLINE and now >= CLOUD_DEADLINE - 4 * 60) or idle_for >= IDLE_EXIT_MIN * 60:
                    append_log(console_lines, "[Cloud] Server đã tắt và dữ liệu đã lưu — kết thúc phiên GitHub Actions.")
                    time.sleep(3)
                    os._exit(0)
        except Exception as e:
            append_log(console_lines, f"[Cloud Watchdog Error] {e}")


# ============================================================
# Minecraft Server & Playit.gg Control
# ============================================================

def start_minecraft_server():
    global server_proc, setup_proc, server_ready, server_start_time, next_autosave_ts
    if is_server_running():
        return False, "Server đang chạy rồi!"
    if setup_proc is not None and setup_proc.poll() is None:
        return False, "Máy chủ Cloud đang tải gói 266 Mods từ Google Drive, vui lòng đợi vài giây!"
    if platform.system() == "Linux":
        mods_dir = os.path.join(ROOT_DIR, "mods")
        if not os.path.exists(mods_dir) or len([f for f in os.listdir(mods_dir) if f.endswith(".jar")]) < 200:
            ensure_mods_on_linux_bg()
            return False, "Đang tải gói 266 Mods từ Google Drive, hãy xem Console và bấm lại sau 30 giây!"

    with lock:
        server_ready = False
        online_players.clear()
        server_start_time = time.time()
        next_autosave_ts = None

    append_log(console_lines, "==========================================")
    append_log(console_lines, f"[Panel] Đang khởi động NeoForge ModSlime Server ({platform.system()})...")

    if platform.system() == "Windows":
        java_path = r"D:\Legacy\Minecraft\jre\java-runtime-delta\windows-x64\java-runtime-delta\bin\java.exe"
        if not os.path.exists(java_path):
            java_path = "java"
        cmd = [java_path, "@user_jvm_args.txt", "@libraries/net/neoforged/neoforge/21.1.267/win_args.txt", "nogui"]
    else:
        jvm_args = os.environ.get("MODSLIME_JVM_ARGS_FILE", "user_jvm_args.txt")
        cmd = ["java", f"@{jvm_args}", "@libraries/net/neoforged/neoforge/21.1.267/unix_args.txt", "nogui"]

    def on_server_exit():
        global server_ready, server_start_time, next_autosave_ts, server_stopped_since
        with lock:
            server_ready = False
            server_start_time = None
            online_players.clear()
            next_autosave_ts = None
        _ram_cache["mb"] = 0.0
        server_stopped_since = time.time()
        append_log(console_lines, "[Panel] Server đã tắt. Tự động đồng bộ bản lưu World cuối cùng lên GitHub...")
        sync_to_github("Server Stopped")
        if RCLONE_REMOTE:
            backup_to_gdrive("Server Stopped")
        server_stopped_since = time.time()

    try:
        server_proc = subprocess.Popen(
            cmd,
            cwd=ROOT_DIR,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
            creationflags=SUBPROCESS_FLAGS,
        )
        t = threading.Thread(
            target=read_stream,
            args=(server_proc, console_lines, on_server_exit, True),
            daemon=True,
        )
        t.start()
        return True, "Đã gửi lệnh bật NeoForge ModSlime Server!"
    except Exception as e:
        with lock:
            server_ready = False
            server_start_time = None
        append_log(console_lines, f"[Panel] Không thể khởi động server: {e}")
        return False, str(e)


def send_server_command(command_str: str):
    if not is_server_running() or server_proc is None or server_proc.stdin is None:
        return False, "Server hiện đang tắt!"
    try:
        append_log(console_lines, f"> {command_str}")
        server_proc.stdin.write(command_str + "\n")
        server_proc.stdin.flush()
        return True, f"Đã gửi lệnh: {command_str}"
    except Exception as e:
        return False, str(e)


def stop_minecraft_server():
    if not is_server_running():
        return False, "Server đã tắt sẵn!"
    append_log(console_lines, "[Panel] Đang tạm dừng Chunky, lưu World (save-all flush) và tắt Server an toàn...")
    send_server_command("chunky pause")
    time.sleep(0.3)
    send_server_command("save-on")
    send_server_command("save-all flush")
    time.sleep(2.0)
    world_stop_saved_event.clear()
    ok, msg = send_server_command("stop")

    def _force_kill_if_hung():
        for _ in range(35):
            if not is_server_running():
                return
            time.sleep(1)
        # Chưa lưu xong (world lớn) -> chờ thêm tối đa 5 phút, tuyệt đối không ép tắt khi đang ghi
        if not world_stop_saved_event.is_set():
            append_log(console_lines, "[Panel] World đang được lưu khi tắt, chờ lưu xong rồi mới đóng Java...")
            world_stop_saved_event.wait(300)
        for _ in range(20):
            if not is_server_running():
                return
            time.sleep(1)
        if is_server_running() and server_proc is not None:
            append_log(console_lines, "[Panel] World đã lưu nhưng Java chưa thoát (mod treo khi tắt) — đang đóng tiến trình Java...")
            try:
                server_proc.terminate()
            except Exception:
                pass
            for _ in range(20):
                if not is_server_running():
                    return
                time.sleep(1)
            if is_server_running():
                append_log(console_lines, "[Panel] Java vẫn treo — buộc dừng (world đã được lưu trước đó).")
                try:
                    server_proc.kill()
                except Exception:
                    pass

    threading.Thread(target=_force_kill_if_hung, daemon=True).start()
    return ok, "Đã gửi lệnh lưu World & tắt Server an toàn (tự động đồng bộ lên GitHub ngay khi tắt)!"


def start_playit():
    global playit_proc
    if is_playit_running():
        return True, "Playit.gg đang chạy!"

    playit_bin = os.path.join(ROOT_DIR, "playit-linux-amd64")
    if platform.system() == "Windows":
        playit_bin = shutil.which("playit") or os.path.join(ROOT_DIR, "playit.exe")

    if not playit_bin or not os.path.exists(playit_bin):
        return False, "Chưa có file playit trên hệ thống này (khuyến nghị dùng Radmin VPN)."

    try:
        playit_cmd = [playit_bin]
        playit_secret = os.environ.get("PLAYIT_SECRET", "").strip()
        if playit_secret:
            playit_cmd += ["--secret", playit_secret]
        playit_proc = subprocess.Popen(
            playit_cmd,
            cwd=ROOT_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
            creationflags=SUBPROCESS_FLAGS,
        )
        t = threading.Thread(target=read_stream, args=(playit_proc, playit_lines), daemon=True)
        t.start()
        return True, "Đã bật Playit.gg Tunnel!"
    except Exception as e:
        return False, str(e)


def get_playit_info():
    claim_url = None
    tunnel_addr = None
    ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
    with lock:
        for raw in playit_lines:
            line = ansi_escape.sub("", raw)
            m_url = re.search(r"(https://playit\.gg/claim/[a-zA-Z0-9_-]+)", line)
            if m_url:
                claim_url = m_url.group(1)
            m_addr = re.search(r"([a-zA-Z0-9.-]+\.(?:gl\.joinmc\.link|ply\.gg)(?::\d+)?)", line)
            if m_addr:
                tunnel_addr = m_addr.group(1)
    return claim_url, tunnel_addr


# ============================================================
# HTTP Request Handler
# ============================================================

class PanelHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _write_cors_headers(self):
        origin = self.headers.get("Origin")
        if origin and origin != "null":
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-GitHub-Token")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send_json(self, data, status=200, extra_headers=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self._write_cors_headers()
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _control_user(self):
        """Who may control the server. Local/Radmin mode: everyone on the network.
        Cloud mode: only holders of a GitHub token with write access to the repo."""
        if not CLOUD_MODE:
            return "local"
        return verify_github_token(self.headers.get("X-GitHub-Token", "").strip())

    def _require_control(self):
        user = self._control_user()
        if not user:
            self._send_json(
                {
                    "ok": False,
                    "can_control": False,
                    "error": "forbidden",
                    "message": "Cần GitHub token của chủ server (⚙ Cài đặt) để điều khiển server.",
                },
                status=403,
            )
            return None
        return user

    def do_OPTIONS(self):
        self.send_response(204)
        self._write_cors_headers()
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/status":
            user = self._control_user() if self.headers.get("X-GitHub-Token") or not CLOUD_MODE else None
            is_auth = True  # status & logs are public (read-only)
            running = is_server_running()
            radmin_ip, lan_ip = detect_network_info()
            mc_port, max_players = read_server_properties()

            if running and server_ready:
                server_state = "running"
            elif running:
                server_state = "starting"
            else:
                server_state = "stopped"

            uptime_sec = int(time.time() - server_start_time) if (running and server_start_time) else 0
            next_sec = None
            if running and server_ready and autosave_enabled and next_autosave_ts is not None:
                next_sec = max(0, int(next_autosave_ts - time.time()))

            with lock:
                players_list = sorted(online_players)
                hist_copy = list(backup_history)
                logs_tail = console_lines[-400:] if is_auth else []
                playit_tail = playit_lines[-30:] if is_auth else []

            if is_auth and not logs_tail:
                latest_log = os.path.join(ROOT_DIR, "logs", "latest.log")
                if os.path.exists(latest_log):
                    try:
                        with open(latest_log, "r", encoding="utf-8", errors="replace") as f:
                            logs_tail = [l.rstrip("\r\n") for l in f.readlines()[-120:]]
                    except Exception:
                        pass

            claim_url, tunnel_addr = get_playit_info() if is_auth else (None, None)
            setup_running = setup_proc is not None and setup_proc.poll() is None

            payload = {
                "can_control": bool(user),
                "username": user,
                "running": running,
                "server_ready": bool(running and server_ready),
                "server_state": server_state,
                "radmin_ip": radmin_ip,
                "radmin_mc_address": f"{radmin_ip}:{mc_port}" if radmin_ip else None,
                "radmin_web_url": f"http://{radmin_ip}:{WEB_PORT}" if radmin_ip else None,
                "lan_ip": lan_ip,
                "lan_mc_address": f"{lan_ip}:{mc_port}" if lan_ip else None,
                "lan_web_url": f"http://{lan_ip}:{WEB_PORT}" if lan_ip else None,
                "mc_port": mc_port,
                "web_port": WEB_PORT,
                "uptime_sec": uptime_sec,
                "online_players": players_list,
                "player_count": len(players_list),
                "max_players": max_players,
                "world_size_mb": get_world_size_mb(),
                "autosave_enabled": autosave_enabled,
                "autosave_interval_min": autosave_interval_min,
                "next_autosave_sec": next_sec,
                "backup_in_progress": backup_in_progress,
                "last_sync_status": last_sync_status,
                "last_sync_time": last_sync_time,
                "gdrive_link": GDRIVE_LINK,
                "gdrive_enabled": bool(RCLONE_REMOTE),
                "gdrive_remote": RCLONE_REMOTE if user else None,
                "gdrive_status": gdrive_status,
                "gdrive_last_time": gdrive_last_time,
                "gdrive_in_progress": gdrive_in_progress,
                "cloud_mode": CLOUD_MODE,
                "cloud_deadline": int(CLOUD_DEADLINE) if CLOUD_DEADLINE else None,
                "cloud_public_url": CLOUD_PUBLIC_URL or None,
                "cloud_mc_address": CLOUD_MC_ADDRESS or None,
                "cloud_run_url": CLOUD_RUN_URL or None,
                "server_time": int(time.time()),
                "github_repo_url": GITHUB_REPO_URL,
                "github_commits_url": GITHUB_COMMITS_URL,
                # Authenticated-only detailed operational data
                "setup_running": setup_running if is_auth else False,
                "playit_running": is_playit_running() if is_auth else False,
                "playit_claim_url": claim_url if user else None,
                "playit_address": tunnel_addr,
                "ram_mb": get_java_ram_mb() if is_auth else None,
                "backup_history": hist_copy if is_auth else [],
                "logs": logs_tail,
                "playit_logs": playit_tail,
            }
            self._send_json(payload)
            return

        if parsed.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if parsed.path in ("/", "/index.html"):
            index_file = os.path.join(ROOT_DIR, "docs", "index.html")
            if os.path.exists(index_file):
                with open(index_file, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                self.end_headers()
                self.wfile.write(content)
                return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length).decode("utf-8", errors="replace") if length > 0 else "{}"
        try:
            payload = json.loads(raw_body) if raw_body else {}
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}

        user = self._require_control()
        if not user:
            return

        if parsed.path == "/api/start":
            ok, msg = start_minecraft_server()
            self._send_json({"ok": ok, "message": msg})
            return

        if parsed.path == "/api/stop":
            ok, msg = stop_minecraft_server()
            self._send_json({"ok": ok, "message": msg})
            return

        if parsed.path == "/api/command":
            cmd = str(payload.get("command", "")).strip()
            if not cmd:
                self._send_json({"ok": False, "message": "Lệnh trống!"}, status=400)
            else:
                ok, msg = send_server_command(cmd)
                self._send_json({"ok": ok, "message": msg})
            return

        if parsed.path == "/api/backup":
            try:
                save_world_snapshot()
                ok, msg = sync_to_github(f"Manual Backup ({user})")
            finally:
                save_world_resume()
            with lock:
                hist_copy = list(backup_history)
            self._send_json({
                "ok": ok,
                "message": msg,
                "last_sync_status": last_sync_status,
                "last_sync_time": last_sync_time,
                "backup_history": hist_copy,
            })
            return

        if parsed.path == "/api/backup-gdrive":
            try:
                save_world_snapshot()
                ok, msg = backup_to_gdrive(f"Thủ công ({user})")
            finally:
                save_world_resume()
            self._send_json({"ok": ok, "message": msg, "gdrive_status": gdrive_status,
                             "gdrive_last_time": gdrive_last_time}, status=200 if ok else 400)
            return

        if parsed.path == "/api/pull-world":
            if is_server_running():
                self._send_json(
                    {"ok": False, "message": "Hãy TẮT Server trước khi tải World mới nhất từ GitHub!"},
                    status=400,
                )
                return
            ok, msg = pull_world_from_github()
            with lock:
                hist_copy = list(backup_history)
            self._send_json({
                "ok": ok,
                "message": msg,
                "world_size_mb": get_world_size_mb(),
                "last_sync_status": last_sync_status,
                "last_sync_time": last_sync_time,
                "backup_history": hist_copy,
            })
            return

        if parsed.path == "/api/autosave-config":
            global autosave_enabled, autosave_interval_min, next_autosave_ts
            raw_enabled = payload.get("enabled", payload.get("autosave_enabled", autosave_enabled))
            raw_interval = payload.get("interval_min", payload.get("autosave_interval_min", autosave_interval_min))
            try:
                iv = int(raw_interval)
                if iv < 1 or iv > 120:
                    raise ValueError("out of range")
            except Exception:
                self._send_json(
                    {"ok": False, "message": "Chu kỳ lưu tự động phải từ 1 đến 120 phút (khuyến nghị 5/10/15/30 phút)!"},
                    status=400,
                )
                return

            autosave_enabled = bool(raw_enabled)
            autosave_interval_min = iv
            with auth_lock:
                auth_config["autosave_enabled"] = autosave_enabled
                auth_config["autosave_interval_min"] = autosave_interval_min
            save_auth_config()

            if is_server_running() and server_ready and autosave_enabled:
                next_autosave_ts = time.time() + autosave_interval_min * 60
            else:
                next_autosave_ts = None

            next_sec = max(0, int(next_autosave_ts - time.time())) if next_autosave_ts else None
            state_txt = f"BẬT (mỗi {autosave_interval_min} phút)" if autosave_enabled else "TẮT"
            append_log(console_lines, f"[Auto-Save 24/7] {user} đã cập nhật chế độ tự động lưu: {state_txt}.")
            self._send_json({
                "ok": True,
                "autosave_enabled": autosave_enabled,
                "autosave_interval_min": autosave_interval_min,
                "next_autosave_sec": next_sec,
                "message": f"Đã lưu cấu hình Auto-Save 24/7: {state_txt}!",
            })
            return

        if parsed.path == "/api/playit":
            ok, msg = start_playit()
            self._send_json({"ok": ok, "message": msg})
            return

        if parsed.path == "/api/shutdown-panel":
            if is_server_running():
                stop_minecraft_server()
                for _ in range(35):
                    if not is_server_running():
                        break
                    time.sleep(1)
                if is_server_running() and server_proc is not None:
                    try:
                        server_proc.terminate()
                    except Exception:
                        pass
                time.sleep(0.5)
            if is_playit_running() and playit_proc is not None:
                try:
                    playit_proc.terminate()
                except Exception:
                    pass
            sync_to_github("Panel Shutdown")
            self._send_json({
                "ok": True,
                "message": "Đã tắt Server, lưu dữ liệu lên GitHub và đóng hoàn toàn Web Panel (Giải phóng 100% RAM)!",
            })

            def _exit_soon():
                time.sleep(0.5)
                os._exit(0)

            threading.Thread(target=_exit_soon, daemon=True).start()
            return

        self._send_json({"ok": False, "message": "API endpoint not found"}, status=404)


if __name__ == "__main__":
    load_auth_config()
    ensure_mods_on_linux_bg()
    t_backup = threading.Thread(target=auto_backup_loop, daemon=True)
    t_backup.start()
    if CLOUD_MODE:
        threading.Thread(target=cloud_watchdog_loop, daemon=True).start()
    if AUTOSTART:
        def _autostart():
            time.sleep(1.5)
            ok, msg = start_minecraft_server()
            append_log(console_lines, f"[Cloud] Tự động bật server: {msg}")
        threading.Thread(target=_autostart, daemon=True).start()

    radmin_ip, lan_ip = detect_network_info(force=True)
    mc_port, _ = read_server_properties(force=True)

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", WEB_PORT), PanelHandler) as httpd:
        print("============================================================")
        print("  MODSLIME MINECRAFT SERVER - WEB CONTROL PANEL (RADMIN VPN)")
        print("============================================================")
        print(f"  Local Web Panel : http://localhost:{WEB_PORT}")
        if radmin_ip:
            print(f"  Radmin Web Panel: http://{radmin_ip}:{WEB_PORT}  (Gui link nay cho ban be)")
            print(f"  Radmin MC Server: {radmin_ip}:{mc_port}          (IP vao game Minecraft)")
        else:
            print("  Radmin VPN      : Chua phat hien IP 26.x.x.x (Hay bat Radmin VPN!)")
        if lan_ip:
            print(f"  LAN Web Panel   : http://{lan_ip}:{WEB_PORT}")
        print(f"  24/7 Auto-Save  : {'BAT' if autosave_enabled else 'TAT'} (moi {autosave_interval_min} phut)")
        print("============================================================")
        httpd.serve_forever()
