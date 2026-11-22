#!/usr/bin/env python3
import http.server
import json
import os
import platform
import re
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
from datetime import datetime

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR = os.path.abspath(os.path.dirname(__file__))
GDRIVE_FILE_ID = "1eKZVfJSo0c49VhZMonpZE5kURegY0V16"
GDRIVE_LINK = f"https://drive.google.com/file/d/{GDRIVE_FILE_ID}/view?usp=sharing"

server_proc = None
playit_proc = None
setup_proc = None
console_lines = []
playit_lines = []
last_sync_status = "Chưa đồng bộ trong phiên này"
last_sync_time = "-"
lock = threading.Lock()


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
    append_log(console_lines, "[Cloud Setup] Lần đầu khởi tạo máy chủ Cloud: Đang tự động tải gói 266 Mods & Libraries (1.06 GB) từ Google Drive của bạn...")
    append_log(console_lines, "[Cloud Setup] Quá trình tải trên mạng Cloud GitHub chỉ mất khoảng 20 - 40 giây. Vui lòng đợi thông báo hoàn tất rồi bấm ▶ BẬT SERVER!")

    script = (
        "set -e\n"
        "python3 -m pip install -q gdown\n"
        f"gdown {GDRIVE_FILE_ID} -O /tmp/NeoForge-ModSlime.zip\n"
        "echo '[Cloud Setup] Đã tải xong file nén! Đang giải nén 266 Mods & Libraries...'\n"
        "unzip -q -o /tmp/NeoForge-ModSlime.zip 'NeoForge-ModSlime/mods/*' 'NeoForge-ModSlime/libraries/*' -d /tmp/extract_modslime\n"
        "cp -rn /tmp/extract_modslime/NeoForge-ModSlime/mods ./ || true\n"
        "cp -rn /tmp/extract_modslime/NeoForge-ModSlime/libraries ./ || true\n"
        "rm -rf /tmp/NeoForge-ModSlime.zip /tmp/extract_modslime\n"
        "echo '[Cloud Setup] ✅ ĐÃ TẢI XONG TOÀN BỘ 266 MODS & LIBRARIES! Bây giờ bạn có thể bấm nút ▶ BẬT SERVER!'\n"
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



def append_log(buf, line, max_lines=400):
    with lock:
        buf.append(line.rstrip("\r\n"))
        if len(buf) > max_lines:
            del buf[: len(buf) - max_lines]


def read_stream(proc, buf, on_exit=None):
    try:
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            append_log(buf, line)
    except Exception as e:
        append_log(buf, f"[Panel Error] {e}")
    finally:
        if on_exit:
            on_exit()


def is_server_running():
    global server_proc
    return server_proc is not None and server_proc.poll() is None


def is_playit_running():
    global playit_proc
    return playit_proc is not None and playit_proc.poll() is None


def sync_to_github(reason="Auto-backup"):
    global last_sync_status, last_sync_time
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    append_log(console_lines, f"[Cloud Sync] Đang lưu dữ liệu world & config lên GitHub ({reason})...")
    try:
        subprocess.run(["git", "add", "world", "config", "server.properties", "ops.json", "whitelist.json", "usercache.json", "usernamecache.json"], cwd=ROOT_DIR, check=False)
        diff_check = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT_DIR)
        if diff_check.returncode == 0:
            last_sync_status = f"Đã đồng bộ (Không có thay đổi mới - {reason})"
            last_sync_time = now_str
            append_log(console_lines, "[Cloud Sync] Không có thay đổi mới cần đẩy lên GitHub.")
            return True, last_sync_status

        commit_msg = f"Save world & server data ({reason} - {now_str})"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=ROOT_DIR, check=True, capture_output=True, text=True)
        push_res = subprocess.run(["git", "push", "origin", "HEAD"], cwd=ROOT_DIR, capture_output=True, text=True)
        if push_res.returncode == 0:
            last_sync_status = f"Lưu lên GitHub thành công ({reason})"
            last_sync_time = now_str
            append_log(console_lines, f"[Cloud Sync] Đã lưu toàn bộ dữ liệu chơi lên GitHub thành công lúc {now_str}!")
            return True, last_sync_status
        else:
            err = push_res.stderr.strip() or push_res.stdout.strip()
            last_sync_status = f"Lỗi git push: {err[:120]}"
            last_sync_time = now_str
            append_log(console_lines, f"[Cloud Sync] Lỗi khi push lên GitHub: {err}")
            return False, last_sync_status
    except Exception as e:
        last_sync_status = f"Lỗi đồng bộ: {e}"
        last_sync_time = now_str
        append_log(console_lines, f"[Cloud Sync] Lỗi ngoại lệ: {e}")
        return False, last_sync_status


def start_minecraft_server():
    global server_proc, setup_proc
    if is_server_running():
        return False, "Server đang chạy rồi!"
    if setup_proc is not None and setup_proc.poll() is None:
        return False, "Máy chủ Cloud đang tải gói 266 Mods từ Google Drive (xem tiến độ ở khung Console bên dưới), vui lòng đợi vài giây!"
    if platform.system() == "Linux":
        mods_dir = os.path.join(ROOT_DIR, "mods")
        if not os.path.exists(mods_dir) or len([f for f in os.listdir(mods_dir) if f.endswith(".jar")]) < 200:
            ensure_mods_on_linux_bg()
            return False, "Đang bắt đầu tải gói 266 Mods từ Google Drive, hãy xem tiến độ trong Console và bấm lại sau 30 giây!"

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
        append_log(console_lines, "[Panel] Server đã tắt. Tự động sao lưu toàn bộ dữ liệu chơi lên GitHub...")
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
        )
        t = threading.Thread(target=read_stream, args=(server_proc, console_lines, on_server_exit), daemon=True)
        t.start()
        return True, "Đã gửi lệnh bật Server!"
    except Exception as e:
        append_log(console_lines, f"[Panel] Không thể khởi động server: {e}")
        return False, str(e)


def send_server_command(command_str):
    global server_proc
    if not is_server_running():
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
    send_server_command("chunky pause")
    time.sleep(0.3)
    send_server_command("save-all")
    time.sleep(1.0)
    res = send_server_command("stop")

    def _force_kill_if_hung():
        for _ in range(20):
            if not is_server_running():
                return
            time.sleep(1)
        if is_server_running() and server_proc is not None:
            append_log(console_lines, "[Panel] Server treo sau khi save-all, đang đóng tiến trình Java để giải phóng RAM...")
            try:
                server_proc.terminate()
            except Exception:
                pass

    threading.Thread(target=_force_kill_if_hung, daemon=True).start()
    return res


def start_playit():
    global playit_proc
    if is_playit_running():
        return True, "Playit.gg đang chạy!"

    playit_bin = os.path.join(ROOT_DIR, "playit-linux-amd64")
    if platform.system() == "Windows":
        playit_bin = shutil.which("playit") or os.path.join(ROOT_DIR, "playit.exe")

    if not playit_bin or not os.path.exists(playit_bin):
        return False, "Chưa có file playit trên hệ thống này."

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
        )
        t = threading.Thread(target=read_stream, args=(playit_proc, playit_lines), daemon=True)
        t.start()
        return True, "Đã bật Playit.gg Tunnel!"
    except Exception as e:
        return False, str(e)


def auto_backup_loop():
    while True:
        time.sleep(1800)  # Check every 30 minutes
        # Only run git backup in background when no players are online, or when server stops
        # (Manual backup button & stop button still save anytime)



def get_world_size_mb():
    total = 0
    world_dir = os.path.join(ROOT_DIR, "world")
    if os.path.exists(world_dir):
        for root, _, files in os.walk(world_dir):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    return round(total / (1024 * 1024), 2)


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


class PanelHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            claim_url, tunnel_addr = get_playit_info()
            setup_running = setup_proc is not None and setup_proc.poll() is None
            with lock:
                logs_tail = console_lines[-180:]
                playit_tail = playit_lines[-30:]
            if not logs_tail:
                latest_log = os.path.join(ROOT_DIR, "logs", "latest.log")
                if os.path.exists(latest_log):
                    try:
                        with open(latest_log, "r", encoding="utf-8", errors="replace") as f:
                            logs_tail = [l.rstrip("\r\n") for l in f.readlines()[-120:]]
                    except Exception:
                        pass
            self._send_json({
                "running": is_server_running(),
                "setup_running": setup_running,
                "playit_running": is_playit_running(),
                "playit_claim_url": claim_url,
                "playit_address": tunnel_addr,
                "world_size_mb": get_world_size_mb(),
                "last_sync_status": last_sync_status,
                "last_sync_time": last_sync_time,
                "gdrive_link": GDRIVE_LINK,
                "logs": logs_tail,
                "playit_logs": playit_tail,
            })
            return

        if parsed.path == "/" or parsed.path == "/index.html":
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
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            payload = {}

        if parsed.path == "/api/start":
            ok, msg = start_minecraft_server()
            self._send_json({"ok": ok, "message": msg})
        elif parsed.path == "/api/stop":
            ok, msg = stop_minecraft_server()
            self._send_json({"ok": ok, "message": msg})
        elif parsed.path == "/api/command":
            cmd = payload.get("command", "").strip()
            if not cmd:
                self._send_json({"ok": False, "message": "Lệnh trống!"}, 400)
            else:
                ok, msg = send_server_command(cmd)
                self._send_json({"ok": ok, "message": msg})
        elif parsed.path == "/api/backup":
            if is_server_running():
                send_server_command("save-all")
                time.sleep(3)
            ok, msg = sync_to_github("Manual Web Backup")
            self._send_json({"ok": ok, "message": msg})
        elif parsed.path == "/api/playit":
            ok, msg = start_playit()
            self._send_json({"ok": ok, "message": msg})
        elif parsed.path == "/api/shutdown-panel":
            if is_server_running():
                stop_minecraft_server()
                for _ in range(30):
                    if not is_server_running():
                        break
                    time.sleep(1)
                if is_server_running() and server_proc is not None:
                    try:
                        server_proc.terminate()
                    except Exception:
                        pass
            if is_playit_running() and playit_proc is not None:
                try:
                    playit_proc.terminate()
                except Exception:
                    pass
            sync_to_github("Panel Shutdown")
            self._send_json({"ok": True, "message": "Đã tắt Server, lưu dữ liệu lên GitHub và đóng hoàn toàn Web Panel (Giải phóng 100% RAM)!"})
            def _exit_soon():
                time.sleep(0.5)
                os._exit(0)
            threading.Thread(target=_exit_soon, daemon=True).start()
        else:
            self.send_error(404, "API endpoint not found")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    ensure_mods_on_linux_bg()
    t_backup = threading.Thread(target=auto_backup_loop, daemon=True)
    t_backup.start()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", port), PanelHandler) as httpd:
        print(f"ModSlime Web Control Panel running at http://localhost:{port}")
        httpd.serve_forever()
