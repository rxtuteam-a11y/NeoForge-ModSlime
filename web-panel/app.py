#!/usr/bin/env python3
"""
NeoForge ModSlime Minecraft Server - Web Control Panel Backend
Zero external pip dependencies (Python 3 standard library only).
Features:
  - Shared account/password login with PBKDF2-HMAC-SHA256 + Cookie/Header session tokens
  - Automatic Radmin VPN (26.x.x.x) & LAN IPv4 detection
  - 24/7 real-time GitHub Auto-Save while server is running + guaranteed save on stop
  - One-click GitHub Pull Latest World when server is stopped
  - Live console streaming, player tracking, RAM usage, uptime & Playit.gg support
"""

import hashlib
import hmac
import http.cookies
import http.server
import json
import os
import platform
import re
import secrets
import shutil
import socket
import socketserver
import subprocess
import threading
import time
import urllib.parse
from datetime import datetime

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR = os.path.abspath(os.path.dirname(__file__))
AUTH_CONFIG_PATH = os.path.join(WEB_DIR, "auth_config.json")
STATE_FILE_PATH = os.path.join(ROOT_DIR, ".panel_state.json")

GDRIVE_FILE_ID = "1eKZVfJSo0c49VhZMonpZE5kURegY0V16"
GDRIVE_LINK = f"https://drive.google.com/file/d/{GDRIVE_FILE_ID}/view?usp=sharing"
GITHUB_REPO_URL = "https://github.com/rxtuteam-a11y/NeoForge-ModSlime"
GITHUB_COMMITS_URL = f"{GITHUB_REPO_URL}/commits/main"

PBKDF2_ITERATIONS = 120_000
SESSION_TTL_SEC = 7 * 24 * 3600  # 7 days
SESSION_COOKIE_NAME = "modslime_token"
WEB_PORT = int(os.environ.get("PORT", 8080))

# Runtime process & state globals
server_proc = None
playit_proc = None
setup_proc = None

console_lines = []
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

# Auth & session state
auth_config = {}
active_sessions = {}  # token -> {"username": str, "created_at": float, "expires_at": float}
runtime_session_secret = ""

lock = threading.Lock()
git_lock = threading.Lock()
auth_lock = threading.Lock()

# Windows subprocess helper flag to prevent popping console windows
SUBPROCESS_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0) if platform.system() == "Windows" else 0


# ============================================================
# Authentication & Configuration Helpers
# ============================================================

def hash_password(password: str, salt: str = None):
    if not salt:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return salt, dk.hex()


def verify_password(account: dict, password: str) -> bool:
    if not isinstance(account, dict) or not isinstance(password, str):
        return False
    # Support manual plaintext override if user edits auth_config.json directly
    if "password" in account and isinstance(account["password"], str) and account["password"]:
        if hmac.compare_digest(account["password"], password):
            return True
    salt = account.get("salt", "")
    expected_hash = account.get("password_hash", "")
    if salt and expected_hash:
        _, actual_hash = hash_password(password, salt)
        return hmac.compare_digest(actual_hash, expected_hash)
    return False


def _default_auth_config() -> dict:
    salt, pw_hash = hash_password("modslime2026", "modslime_v1_salt_2026")
    return {
        "session_secret": "",
        "autosave_enabled": True,
        "autosave_interval_min": 10,
        "accounts": [
            {
                "username": "modslime",
                "salt": salt,
                "password_hash": pw_hash,
                "role": "admin",
            }
        ],
    }


def save_auth_config():
    with auth_lock:
        tmp_path = AUTH_CONFIG_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(auth_config, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_path, AUTH_CONFIG_PATH)


def load_auth_config():
    global auth_config, autosave_enabled, autosave_interval_min, runtime_session_secret
    with auth_lock:
        if os.path.exists(AUTH_CONFIG_PATH):
            try:
                with open(AUTH_CONFIG_PATH, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if not isinstance(loaded, dict):
                    loaded = _default_auth_config()
            except Exception:
                loaded = _default_auth_config()
        else:
            loaded = _default_auth_config()
            try:
                with open(AUTH_CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(loaded, f, ensure_ascii=False, indent=2)
                    f.write("\n")
            except Exception:
                pass

        if not loaded.get("accounts"):
            loaded["accounts"] = _default_auth_config()["accounts"]

        auth_config = loaded
        autosave_enabled = bool(auth_config.get("autosave_enabled", True))
        try:
            iv = int(auth_config.get("autosave_interval_min", 10))
            autosave_interval_min = max(1, min(120, iv))
        except Exception:
            autosave_interval_min = 10

        runtime_session_secret = auth_config.get("session_secret") or ""

    _load_runtime_state()


def _load_runtime_state():
    global runtime_session_secret, active_sessions
    now = time.time()
    if os.path.exists(STATE_FILE_PATH):
        try:
            with open(STATE_FILE_PATH, "r", encoding="utf-8") as f:
                st = json.load(f)
            if not runtime_session_secret and st.get("runtime_session_secret"):
                runtime_session_secret = st["runtime_session_secret"]
            saved_sessions = st.get("sessions", {})
            if isinstance(saved_sessions, dict):
                with auth_lock:
                    for tok, info in saved_sessions.items():
                        if isinstance(info, dict) and info.get("expires_at", 0) > now:
                            active_sessions[tok] = info
        except Exception:
            pass
    if not runtime_session_secret:
        runtime_session_secret = secrets.token_hex(32)
        _save_runtime_state()


def _save_runtime_state():
    try:
        now = time.time()
        with auth_lock:
            valid = {
                tok: info
                for tok, info in active_sessions.items()
                if info.get("expires_at", 0) > now
            }
            active_sessions.clear()
            active_sessions.update(valid)
            data = {
                "runtime_session_secret": runtime_session_secret,
                "sessions": valid,
            }
        tmp_path = STATE_FILE_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, STATE_FILE_PATH)
    except Exception:
        pass


def create_session(username: str) -> str:
    raw = secrets.token_urlsafe(32)
    sig = hmac.new(
        runtime_session_secret.encode("utf-8"),
        f"{username}:{raw}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:16]
    token = f"{raw}.{sig}"
    now = time.time()
    with auth_lock:
        active_sessions[token] = {
            "username": username,
            "created_at": now,
            "expires_at": now + SESSION_TTL_SEC,
        }
    _save_runtime_state()
    return token


def validate_session(token: str):
    if not token:
        return None
    now = time.time()
    with auth_lock:
        info = active_sessions.get(token)
        if not info:
            return None
        if info.get("expires_at", 0) <= now:
            active_sessions.pop(token, None)
            return None
        return info.get("username")


def revoke_session(token: str):
    if not token:
        return
    with auth_lock:
        active_sessions.pop(token, None)
    _save_runtime_state()


def authenticate_credentials(username: str, password: str):
    uname = (username or "").strip()
    if not uname or not isinstance(password, str) or not password:
        return None
    with auth_lock:
        accounts = auth_config.get("accounts", [])
        for acc in accounts:
            if acc.get("username", "").strip() == uname:
                if verify_password(acc, password):
                    return acc.get("username", uname)
    return None


def update_credentials(current_username: str, current_password: str, new_username: str, new_password: str):
    new_pw = (new_password or "").strip()
    new_user = (new_username or "").strip() or current_username
    if len(new_pw) < 4:
        return False, "Mật khẩu mới phải có ít nhất 4 ký tự!", current_username
    if len(new_user) < 2 or len(new_user) > 32:
        return False, "Tên tài khoản phải từ 2 đến 32 ký tự!", current_username

    with auth_lock:
        accounts = auth_config.get("accounts", [])
        target = None
        for acc in accounts:
            if acc.get("username", "").strip() == current_username:
                target = acc
                break
        if target is None and accounts:
            target = accounts[0]
        if target is None:
            return False, "Không tìm thấy tài khoản để cập nhật!", current_username

        if current_password is not None and current_password != "":
            if not verify_password(target, current_password):
                return False, "Mật khẩu hiện tại không đúng!", current_username

        salt, pw_hash = hash_password(new_pw)
        target["username"] = new_user
        target["salt"] = salt
        target["password_hash"] = pw_hash
        target.pop("password", None)

        # Update active sessions for renamed user so current user stays logged in
        for info in active_sessions.values():
            if info.get("username") == current_username:
                info["username"] = new_user

    save_auth_config()
    _save_runtime_state()
    return True, f"Đã cập nhật tài khoản chung ({new_user}) & mật khẩu thành công!", new_user


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

def append_log(buf, line, max_lines=400):
    clean = line.rstrip("\r\n")
    with lock:
        buf.append(clean)
        if len(buf) > max_lines:
            del buf[: len(buf) - max_lines]


def _parse_minecraft_log_line(line: str):
    global server_ready, next_autosave_ts
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
    if platform.system() != "Linux":
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

def sync_to_github(reason="Auto-backup"):
    global last_sync_status, last_sync_time, backup_in_progress
    with git_lock:
        backup_in_progress = True
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        append_log(console_lines, f"[Cloud Sync] Đang lưu dữ liệu world & config lên GitHub ({reason})...")
        try:
            targets = [
                "world",
                "config",
                "server.properties",
                "ops.json",
                "whitelist.json",
                "usercache.json",
                "usernamecache.json",
            ]
            existing_targets = [t for t in targets if os.path.exists(os.path.join(ROOT_DIR, t))]
            if existing_targets:
                subprocess.run(
                    ["git", "add", "--"] + existing_targets,
                    cwd=ROOT_DIR,
                    check=False,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    creationflags=SUBPROCESS_FLAGS,
                )

            diff_check = subprocess.run(
                ["git", "diff", "--cached", "--quiet"],
                cwd=ROOT_DIR,
                creationflags=SUBPROCESS_FLAGS,
            )
            if diff_check.returncode == 0:
                last_sync_status = f"Đã đồng bộ (Không có thay đổi mới - {reason})"
                last_sync_time = now_str
                append_log(console_lines, f"[Cloud Sync] Không có thay đổi mới cần đẩy lên GitHub ({reason}).")
                _record_backup_history(reason, True, "Không có thay đổi mới", now_str)
                get_world_size_mb(force=True)
                return True, last_sync_status

            commit_msg = f"Save world & server data ({reason} - {now_str})"
            commit_res = subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=ROOT_DIR,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=SUBPROCESS_FLAGS,
            )
            if commit_res.returncode != 0:
                err = (commit_res.stderr or commit_res.stdout or "git commit failed").strip()
                last_sync_status = f"Lỗi git commit: {err[:120]}"
                last_sync_time = now_str
                append_log(console_lines, f"[Cloud Sync] Lỗi git commit: {err}")
                _record_backup_history(reason, False, last_sync_status, now_str)
                return False, last_sync_status

            push_res = subprocess.run(
                ["git", "push", "origin", "main"],
                cwd=ROOT_DIR,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=SUBPROCESS_FLAGS,
            )
            if push_res.returncode != 0:
                # Try safe pull --rebase --autostash before retrying push
                append_log(console_lines, "[Cloud Sync] Remote có commit mới, đang thử git pull --rebase --autostash origin main...")
                rebase_res = subprocess.run(
                    ["git", "pull", "--rebase", "--autostash", "origin", "main"],
                    cwd=ROOT_DIR,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    creationflags=SUBPROCESS_FLAGS,
                )
                if rebase_res.returncode == 0:
                    push_res = subprocess.run(
                        ["git", "push", "origin", "main"],
                        cwd=ROOT_DIR,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        creationflags=SUBPROCESS_FLAGS,
                    )
                else:
                    subprocess.run(
                        ["git", "rebase", "--abort"],
                        cwd=ROOT_DIR,
                        check=False,
                        capture_output=True,
                        creationflags=SUBPROCESS_FLAGS,
                    )

            if push_res.returncode == 0:
                last_sync_status = f"Lưu lên GitHub thành công ({reason})"
                last_sync_time = now_str
                append_log(console_lines, f"[Cloud Sync] Đã lưu toàn bộ dữ liệu chơi lên GitHub thành công lúc {now_str}!")
                _record_backup_history(reason, True, "Đẩy lên GitHub thành công", now_str)
                get_world_size_mb(force=True)
                return True, last_sync_status
            else:
                err = (push_res.stderr or push_res.stdout or "git push failed").strip()
                last_sync_status = f"Lỗi git push: {err[:120]}"
                last_sync_time = now_str
                append_log(console_lines, f"[Cloud Sync] Lỗi khi push lên GitHub: {err}")
                _record_backup_history(reason, False, last_sync_status, now_str)
                return False, last_sync_status
        except Exception as e:
            last_sync_status = f"Lỗi đồng bộ: {e}"
            last_sync_time = now_str
            append_log(console_lines, f"[Cloud Sync] Lỗi ngoại lệ: {e}")
            _record_backup_history(reason, False, str(e), now_str)
            return False, last_sync_status
        finally:
            backup_in_progress = False


def pull_world_from_github():
    global last_sync_status, last_sync_time, backup_in_progress
    if is_server_running():
        return False, "Hãy TẮT Server trước khi tải World mới nhất từ GitHub!"

    with git_lock:
        backup_in_progress = True
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        append_log(console_lines, "[Cloud Pull] Đang tải World & Config mới nhất từ GitHub (origin main)...")
        try:
            res = subprocess.run(
                ["git", "pull", "--autostash", "origin", "main"],
                cwd=ROOT_DIR,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=SUBPROCESS_FLAGS,
            )
            out = (res.stdout or "").strip()
            err = (res.stderr or "").strip()
            if res.returncode == 0:
                summary = "Đã cập nhật World mới nhất từ GitHub!"
                if "Already up to date" in out:
                    summary = "World trên máy đã là bản mới nhất trên GitHub!"
                last_sync_status = summary
                last_sync_time = now_str
                append_log(console_lines, f"[Cloud Pull] {summary}")
                _record_backup_history("Pull World", True, summary, now_str)
                get_world_size_mb(force=True)
                return True, summary
            else:
                msg = f"Lỗi khi tải World từ GitHub: {(err or out)[:150]}"
                last_sync_status = msg
                last_sync_time = now_str
                append_log(console_lines, f"[Cloud Pull] {msg}")
                _record_backup_history("Pull World", False, msg, now_str)
                return False, msg
        except Exception as e:
            msg = f"Lỗi ngoại lệ khi tải World: {e}"
            last_sync_status = msg
            last_sync_time = now_str
            append_log(console_lines, f"[Cloud Pull] {msg}")
            _record_backup_history("Pull World", False, msg, now_str)
            return False, msg
        finally:
            backup_in_progress = False


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
                send_server_command("save-all flush")
                # Wait 3 seconds so Minecraft flushes chunks to disk
                for _ in range(6):
                    if not is_server_running():
                        break
                    time.sleep(0.5)
                if is_server_running():
                    sync_to_github(f"Auto-Save 24/7 ({autosave_interval_min}m)")
                    next_autosave_ts = time.time() + autosave_interval_min * 60
                else:
                    next_autosave_ts = None
        except Exception as e:
            append_log(console_lines, f"[Auto-Save Error] {e}")
            time.sleep(5)


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
        cmd = ["java", "@user_jvm_args.txt", "@libraries/net/neoforged/neoforge/21.1.267/unix_args.txt", "nogui"]

    def on_server_exit():
        global server_ready, server_start_time, next_autosave_ts
        with lock:
            server_ready = False
            server_start_time = None
            online_players.clear()
            next_autosave_ts = None
        _ram_cache["mb"] = 0.0
        append_log(console_lines, "[Panel] Server đã tắt. Tự động đồng bộ bản lưu World cuối cùng lên GitHub...")
        sync_to_github("Server Stopped")

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
    send_server_command("save-all flush")
    time.sleep(2.0)
    ok, msg = send_server_command("stop")

    def _force_kill_if_hung():
        for _ in range(35):
            if not is_server_running():
                return
            time.sleep(1)
        if is_server_running() and server_proc is not None:
            append_log(console_lines, "[Panel] Server treo sau khi save-all flush, đang đóng tiến trình Java để giải phóng RAM...")
            try:
                server_proc.terminate()
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
        playit_proc = subprocess.Popen(
            [playit_bin, "--stdout"],
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token, Authorization")
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

    def _extract_token(self) -> str:
        # 1. X-Auth-Token header
        tok = self.headers.get("X-Auth-Token", "").strip()
        if tok:
            return tok
        # 2. Authorization: Bearer <token>
        auth_hdr = self.headers.get("Authorization", "").strip()
        if auth_hdr.lower().startswith("bearer "):
            return auth_hdr[7:].strip()
        # 3. HttpOnly Cookie
        cookie_hdr = self.headers.get("Cookie", "")
        if cookie_hdr:
            try:
                c = http.cookies.SimpleCookie()
                c.load(cookie_hdr)
                if SESSION_COOKIE_NAME in c:
                    return c[SESSION_COOKIE_NAME].value.strip()
            except Exception:
                pass
        return ""

    def _get_auth_user(self):
        tok = self._extract_token()
        return validate_session(tok), tok

    def _require_auth(self):
        user, tok = self._get_auth_user()
        if not user:
            self._send_json(
                {
                    "ok": False,
                    "authenticated": False,
                    "error": "unauthorized",
                    "message": "Vui lòng đăng nhập bằng tài khoản chung để điều khiển Server!",
                },
                status=401,
            )
            return None, ""
        return user, tok

    def do_OPTIONS(self):
        self.send_response(204)
        self._write_cors_headers()
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/auth/check":
            user, _ = self._get_auth_user()
            self._send_json({
                "ok": True,
                "authenticated": bool(user),
                "username": user,
            })
            return

        if parsed.path == "/api/status":
            user, _ = self._get_auth_user()
            is_auth = bool(user)
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
                logs_tail = console_lines[-200:] if is_auth else []
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
                "authenticated": is_auth,
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
                "github_repo_url": GITHUB_REPO_URL,
                "github_commits_url": GITHUB_COMMITS_URL,
                # Authenticated-only detailed operational data
                "setup_running": setup_running if is_auth else False,
                "playit_running": is_playit_running() if is_auth else False,
                "playit_claim_url": claim_url,
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

        # Public auth endpoints
        if parsed.path == "/api/login":
            username = payload.get("username", "")
            password = payload.get("password", "")
            authed_user = authenticate_credentials(username, password)
            if not authed_user:
                self._send_json(
                    {
                        "ok": False,
                        "authenticated": False,
                        "message": "Sai tài khoản hoặc mật khẩu! Vui lòng kiểm tra lại.",
                    },
                    status=401,
                )
                return
            token = create_session(authed_user)
            cookie_val = f"{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SEC}"
            self._send_json(
                {
                    "ok": True,
                    "authenticated": True,
                    "token": token,
                    "username": authed_user,
                    "message": f"Đăng nhập thành công ({authed_user})!",
                },
                status=200,
                extra_headers=[("Set-Cookie", cookie_val)],
            )
            return

        if parsed.path == "/api/logout":
            tok = self._extract_token()
            revoke_session(tok)
            clear_cookie = f"{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            self._send_json(
                {
                    "ok": True,
                    "authenticated": False,
                    "message": "Đã đăng xuất thành công!",
                },
                status=200,
                extra_headers=[("Set-Cookie", clear_cookie)],
            )
            return

        # All endpoints below require authentication
        user, _ = self._require_auth()
        if not user:
            return

        if parsed.path == "/api/auth/change-password":
            cur_pw = payload.get("current_password")
            new_user = payload.get("new_username", user)
            new_pw = payload.get("new_password", "")
            ok, msg, updated_user = update_credentials(user, cur_pw, new_user, new_pw)
            self._send_json(
                {"ok": ok, "username": updated_user, "message": msg},
                status=200 if ok else 400,
            )
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
            if is_server_running():
                send_server_command("save-all flush")
                time.sleep(3)
            ok, msg = sync_to_github(f"Manual Backup ({user})")
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
