#!/usr/bin/env python3
"""Chỉ giữ dữ liệu world của N phiên server gần nhất trên nhánh main.

Lịch sử mới = 1 commit cho mỗi phiên (bản world lúc tắt server của phiên đó), cũ nhất làm gốc,
cộng thêm commit mới nhất nếu sau phiên cuối có thay đổi khác (vd. cập nhật code).
Mọi bản auto-save giữa phiên và các phiên cũ hơn bị bỏ khỏi lịch sử -> không còn tồn đọng.

- Chỉ đọc danh sách commit (clone --filter=tree:0, vài MB), không tải world.
- Tạo commit mới bằng GitHub API trên các "tree" đã có sẵn trên GitHub -> không tải/đẩy dữ liệu world.
- Cập nhật main bằng force có kiểm tra: nếu main đổi trong lúc chạy thì huỷ, không ghi đè.

Biến môi trường: GITHUB_TOKEN, GITHUB_REPOSITORY, KEEP_SESSIONS (mặc định 5), BRANCH (main),
DRY_RUN=1 để chỉ in kế hoạch.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = os.environ["GITHUB_REPOSITORY"]
KEEP = int(os.environ.get("KEEP_SESSIONS", "5") or 5)
BRANCH = os.environ.get("BRANCH", "main")
DRY = os.environ.get("DRY_RUN", "") == "1"
API = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
GIT_URL = os.environ.get("TRIM_GIT_URL") or f"https://x-access-token:{TOKEN}@github.com/{REPO}.git"
MOVE_TAGS = [t for t in os.environ.get("MOVE_TAGS", "client-pack-latest").split(",") if t]

# Commit đánh dấu kết thúc một phiên server
SESSION_END = re.compile(r"\(Server Stopped - |^Cloud save world|Lưu dự phòng cuối phiên")


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(5):
        req = urllib.request.Request(API + path, data=data, method=method, headers={
            "Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
            "Content-Type": "application/json", "User-Agent": "modslime-trim-history"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if e.code in (403, 429, 500, 502, 503) and attempt < 4 and "workflow" not in msg:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"{method} {path} -> {e.code}: {msg}") from None


def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def parse_commit(raw):
    head, _, message = raw.partition("\n\n")
    info = {"message": message}
    for line in head.splitlines():
        key, _, val = line.partition(" ")
        if key in ("tree", "author", "committer"):
            info[key] = val
    return info


def person(val):
    # "Tên <email> 1700000000 +0700" -> dict cho GitHub API
    m = re.match(r"(.*) <(.*)> (\d+) ([+-])(\d\d)(\d\d)$", val)
    name, email, ts, sign, hh, mm = m.groups()
    t = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(int(ts)))
    return {"name": name, "email": email, "date": t + "Z"}


def main():
    work = tempfile.mkdtemp(prefix="trim-")
    print(f"== Đọc danh sách commit của {BRANCH} (không tải world) ==")
    git("clone", "--quiet", "--bare", "--filter=tree:0", "--single-branch", "--branch", BRANCH, GIT_URL, work)
    tip = git("rev-parse", BRANCH, cwd=work).strip()
    rows = [l.split("\t", 1) for l in git("log", "--first-parent", "--format=%H\t%s", BRANCH, cwd=work).splitlines()]
    ends = [sha for sha, subj in rows if SESSION_END.search(subj)]
    print(f"Tổng {len(rows)} commit, {len(ends)} phiên server có bản lưu cuối phiên. Giữ {KEEP} phiên gần nhất.")
    total_old = len(rows)
    if len(ends) <= KEEP and total_old <= len(ends) + 1:
        print("Lịch sử đã gọn, không cần cắt.")
        return 0
    keep = list(reversed(ends[:KEEP]))  # cũ -> mới
    if not keep:
        print("Chưa có phiên nào kết thúc -> bỏ qua.")
        return 0
    commits = [parse_commit(git("cat-file", "commit", sha, cwd=work)) for sha in keep]
    tip_info = parse_commit(git("cat-file", "commit", tip, cwd=work))
    if tip_info["tree"] != commits[-1]["tree"]:
        commits.append(tip_info)  # thay đổi sau phiên cuối (code mới...) vẫn được giữ nguyên
    print(f"Lịch sử mới: {len(commits)} commit (trước đây {total_old}).")
    for c in commits:
        print("  -", c["message"].splitlines()[0] if c["message"] else "")
    if DRY:
        print("DRY_RUN=1 -> không thay đổi gì.")
        return 0

    parent = None
    for c in commits:
        body = {"message": c["message"].rstrip("\n") or "World snapshot", "tree": c["tree"],
                "parents": [parent] if parent else [],
                "author": person(c["author"]), "committer": person(c["committer"])}
        parent = api("POST", f"/repos/{REPO}/git/commits", body)["sha"]
    new_tip = parent
    if api("GET", f"/repos/{REPO}/git/commits/{new_tip}")["tree"]["sha"] != tip_info["tree"]:
        raise RuntimeError("Commit mới không khớp dữ liệu hiện tại -> huỷ, không đổi main.")

    # Kiểm tra lần cuối: main không được thay đổi trong lúc cắt
    cur = api("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")["object"]["sha"]
    if cur != tip:
        print(f"main vừa có commit mới ({cur[:8]}) -> huỷ lần cắt này, để lần sau.")
        return 0
    api("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": new_tip, "force": True})
    print(f"Đã cắt lịch sử {BRANCH}: {tip[:8]} -> {new_tip[:8]} (dữ liệu hiện tại giữ nguyên).")
    # Tag của bản phát hành gói mod trỏ vào commit cũ -> dời sang commit mới để lịch sử cũ không bị giữ lại
    for tag in MOVE_TAGS:
        try:
            api("PATCH", f"/repos/{REPO}/git/refs/tags/{tag}", {"sha": new_tip, "force": True})
            print(f"Đã dời tag {tag} sang lịch sử mới.")
        except RuntimeError as e:
            print(f"(Bỏ qua tag {tag}: {e})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
