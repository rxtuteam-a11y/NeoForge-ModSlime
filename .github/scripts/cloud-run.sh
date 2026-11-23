#!/usr/bin/env bash
# Chạy trên GitHub Actions: Web Panel + NeoForge + đường hầm Cloudflare (web) + Playit (game).
# Ghi địa chỉ vào nhánh "server-status" (file status.json) để trang web GitHub Pages tự tìm thấy.
# Dùng: cloud-run.sh            -> chạy server
#       cloud-run.sh --offline  -> chỉ báo trạng thái offline
set -u
cd "$(dirname "$0")/../.."
ROOT="$PWD"
REPO_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-0}"

publish_status() {  # $1=state  $2=panel_url  $3=mc_address  $4=deadline
  local tmp; tmp="$(mktemp -d)"
  cat > "$tmp/status.json" <<JSON
{
  "state": "$1",
  "panel_url": "$2",
  "mc_address": "$3",
  "deadline": ${4:-0},
  "run_id": ${GITHUB_RUN_ID:-0},
  "run_url": "$RUN_URL",
  "updated_at": $(date +%s)
}
JSON
  (
    cd "$tmp" && git init -q && git checkout -q -b server-status &&
    git -c user.name="ModSlime Cloud" -c user.email="modslime-bot@users.noreply.github.com" add status.json &&
    git -c user.name="ModSlime Cloud" -c user.email="modslime-bot@users.noreply.github.com" commit -q -m "status: $1" &&
    for i in 1 2 3; do git push -q -f "$REPO_URL" server-status && break; sleep 3; done
  ) || echo "Không ghi được status.json"
  rm -rf "$tmp"
}

if [ "${1:-}" = "--offline" ]; then
  publish_status "offline" "" "${MC_ADDRESS:-}" 0
  exit 0
fi

DURATION_MIN="${DURATION_MIN:-340}"
[ "$DURATION_MIN" -gt 340 ] 2>/dev/null && DURATION_MIN=340
DEADLINE=$(( $(date +%s) + DURATION_MIN * 60 ))

git config user.name "ModSlime Cloud AutoSave"
git config user.email "modslime-bot@users.noreply.github.com"
rm -f world/session.lock
chmod +x run.sh

# ---- Playit.gg (cổng game) ----
if [ -n "${PLAYIT_SECRET:-}" ]; then
  # Giống image Docker chính thức: playitd --secret=... --platform-docker
  # socket/cert đặt trong /tmp vì runner không có quyền ghi /run/playit
  mkdir -p /tmp/playit-certs
  PLAYIT_LOG=info ./playit-linux-amd64 --secret="$PLAYIT_SECRET" --platform-docker \
    --socket-path /tmp/playitd.sock --cert-dir /tmp/playit-certs > playit.log 2>&1 &
  PLAYIT_PID=$!
  sleep 8
  if kill -0 "$PLAYIT_PID" 2>/dev/null; then echo "Đã bật Playit.gg (agent đang chạy)."
  else echo "::error::Playit agent dừng ngay khi khởi động:"; fi
  sed -E 's/[0-9a-f]{40,}/***/g' playit.log | head -n 20
else
  echo "::warning::Chưa có secret PLAYIT_SECRET -> người chơi chưa vào game được (xem HUONG-DAN.md)."
fi

# ---- Cloudflare quick tunnel (Web Panel) ----
cloudflared tunnel --no-autoupdate --url http://localhost:8080 > cloudflared.log 2>&1 &
PANEL_URL=""
for i in $(seq 1 60); do
  PANEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared.log | head -n1)"
  [ -n "$PANEL_URL" ] && break
  sleep 1
done
echo "Web Panel: ${PANEL_URL:-không lấy được link Cloudflare}"

# ---- Web Panel + tự bật NeoForge ----
export MODSLIME_CLOUD=1 MODSLIME_AUTOSTART=1 MODSLIME_DEADLINE="$DEADLINE"
export MODSLIME_IDLE_EXIT_MIN="${IDLE_EXIT_MIN:-3}" GIT_BRANCH=main
export MODSLIME_PUBLIC_URL="$PANEL_URL" MODSLIME_MC_ADDRESS="${MC_ADDRESS:-}" MODSLIME_RUN_URL="$RUN_URL"
if [ "${RCLONE_REMOTE_SET:-false}" = "true" ]; then
  REMOTE_NAME="$(rclone listremotes | head -n1)"
  export RCLONE_REMOTE="${GDRIVE_BACKUP_PATH:-${REMOTE_NAME}ModSlime-Backups}"
  echo "Sao lưu Google Drive: $RCLONE_REMOTE"
fi
python3 -u web-panel/app.py > panel.log 2>&1 &
PANEL_PID=$!

publish_status "online" "$PANEL_URL" "${MC_ADDRESS:-}" "$DEADLINE"
{
  echo "## ModSlime Cloud Server"
  echo "- Web Panel (log + lệnh): ${PANEL_URL}"
  echo "- Địa chỉ vào game: ${MC_ADDRESS:-chưa cấu hình biến MC_ADDRESS}"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

# Giữ step chạy tới khi Web Panel tự thoát (server tắt + đã lưu, hoặc hết giờ)
LAST_PRINTED=0
READY_SHOWN=0
while kill -0 "$PANEL_PID" 2>/dev/null; do
  sleep 20
  if [ "$READY_SHOWN" = 0 ] && grep -q "Done (" logs/latest.log 2>/dev/null; then
    READY_SHOWN=1
    echo "::notice title=Server đã sẵn sàng::Vào game: ${MC_ADDRESS:-chưa cấu hình Playit} · Log & lệnh: ${PANEL_URL}"
    echo "=================================================================="
    echo "  ✅ SERVER ĐÃ SẴN SÀNG. Bước này sẽ tiếp tục chạy cho tới khi tắt."
    echo "  Web Panel : ${PANEL_URL}"
    echo "  Vào game  : ${MC_ADDRESS:-chưa cấu hình Playit -> chưa ai vào được}"
    echo "  Tự tắt lúc: $(date -d @$(( DEADLINE - 480 )) +'%H:%M %d/%m')"
    echo "=================================================================="
  fi
  N=$(wc -l < logs/latest.log 2>/dev/null || echo 0)
  if [ "$N" -gt "$LAST_PRINTED" ]; then
    sed -n "$((LAST_PRINTED + 1)),${N}p" logs/latest.log | tail -n 40
    LAST_PRINTED=$N
  fi
  if [ -n "${PLAYIT_PID:-}" ] && ! kill -0 "$PLAYIT_PID" 2>/dev/null && [ -z "${PLAYIT_DEAD:-}" ]; then
    PLAYIT_DEAD=1; echo "::warning::Playit agent đã dừng:"; sed -E 's/[0-9a-f]{40,}/***/g' playit.log | tail -n 20
  fi
  if [ "$(date +%s)" -gt $(( DEADLINE + 300 )) ]; then
    echo "Quá giờ, dừng Web Panel."; kill "$PANEL_PID"; break
  fi
done
echo "=== panel.log (cuối) ==="; tail -n 60 panel.log || true
publish_status "offline" "" "${MC_ADDRESS:-}" 0
