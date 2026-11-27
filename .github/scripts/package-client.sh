#!/usr/bin/env bash
# Đóng gói MỘT file duy nhất cho người chơi mới: bộ mod ModSlime gốc đã chỉnh cho máy chơi
# (theo HUONG-DAN.md) + 10 mod nấu ăn mới + toàn bộ config/kubejs (FTB Quests, lang, assets...)
# đang chạy trên server. Phát hành qua GitHub Release (ổn định, tải trực tiếp, không cần Google Drive).
#
# Dùng: package-client.sh xem        -> chỉ liệt kê cấu trúc file gốc trên Drive, không làm gì khác
#       package-client.sh dong_goi   -> đóng gói thật và đăng lên GitHub Release
set -euo pipefail
MODE="${1:-xem}"
WORK=/tmp/client-pack
rm -rf "$WORK" && mkdir -p "$WORK/base" "$WORK/final/mods" "$WORK/final/config" "$WORK/final/kubejs" "$WORK/final/defaultconfigs"

echo "== Tải gói gốc (mods + libraries + client-mods + disabled-conflicts) từ Google Drive =="
python3 -m pip install -q gdown
gdown "$GDRIVE_MODS_ID" -O /tmp/base.zip

if [ "$MODE" = "xem" ]; then
  echo "== Cấu trúc thư mục cấp 1-2 trong file zip gốc =="
  python3 - <<'PY'
import zipfile, collections
z = zipfile.ZipFile("/tmp/base.zip")
names = z.namelist()
print("Tổng số mục:", len(names))
tops = collections.Counter(n.split("/")[1] for n in names if n.count("/") >= 1 and n.split("/")[0])
for t, c in tops.most_common(30):
    print(f"  {t}: {c}")
print("== Tìm các file nhắc tới trong HUONG-DAN.md ==")
for n in names:
    low = n.lower()
    if any(k in low for k in ("spear-backport", "tensura_tno", "pondererlib", "mebahel-elder-scrolls-core")):
        print("  ", n)
PY
  echo "== Soi cấu trúc thư viện Platform / VanillaBackport (để viết mod vá) =="
  mkdir -p /tmp/insp && cd /tmp/insp
  unzip -q -o /tmp/base.zip "NeoForge-ModSlime/mods/Platform-*.jar" "NeoForge-ModSlime/mods/VanillaBackport-*.jar" -d . || true
  for j in NeoForge-ModSlime/mods/Platform-*.jar NeoForge-ModSlime/mods/VanillaBackport-*.jar; do
    echo "### $j"; unzip -q -o "$j" -d "x_$(basename "$j")"
  done
  P=$(ls -d x_Platform-*); V=$(ls -d x_VanillaBackport-*)
  javap -p -s -cp "$P" com.blackgear.platform.core.util.config.neoforge.ForgeConfigValue || true
  javap -p -c -cp "$P" com.blackgear.platform.core.util.config.neoforge.ForgeConfigValue | head -80 || true
  javap -p -s -cp "$V" com.blackgear.vanillabackport.client.api.modules.block_rendering.DynamicBlockRenderingHandler || true
  ls "$P/META-INF" ; cat "$P"/META-INF/neoforge.mods.toml 2>/dev/null | head -30
  exit 0
fi

echo "== Giải nén toàn bộ (đóng gói thật, có thể mất vài phút) =="
unzip -q -o /tmp/base.zip -d "$WORK/base"
ROOT="$WORK/base"
# zip có thể bọc trong 1 thư mục gốc (vd. NeoForge-ModSlime/)
if [ "$(ls -A "$ROOT" | wc -l)" = 1 ] && [ -d "$ROOT/$(ls -A "$ROOT")" ]; then
  ROOT="$ROOT/$(ls -A "$ROOT")"
fi
echo "Gốc: $ROOT"
ls "$ROOT"

copy_dir() { [ -d "$1" ] && cp -a "$1/." "$2/" 2>/dev/null || true; }

# 1) Bắt đầu từ mods của server
copy_dir "$ROOT/mods" "$WORK/final/mods"

# 2) Thêm lại các mod chỉ dành cho máy chơi (đã bị gỡ khỏi mods của server)
if [ -d "$ROOT/client-mods" ]; then
  n=$(find "$ROOT/client-mods" -name '*.jar' | wc -l)
  copy_dir "$ROOT/client-mods" "$WORK/final/mods"
  echo "Đã thêm $n mod dành riêng cho máy chơi (client-mods)."
fi

# 3) Bỏ Backported Spears (trùng đăng ký vật phẩm với Vanilla Backport) và bản Tensura TNO gốc
shopt -s nullglob
for f in "$WORK"/final/mods/*spear*backport*.jar "$WORK"/final/mods/*Spear*Backport*.jar; do
  echo "Gỡ (xung đột trên máy chơi): $(basename "$f")"; rm -f "$f"
done
orig_tno=("$WORK"/final/mods/tensura_tno-*.jar)
fix_tno=("$WORK"/final/mods/*modslime-fix*.jar)
if [ ${#fix_tno[@]} -gt 0 ]; then
  for f in "${orig_tno[@]}"; do
    [[ "$f" == *modslime-fix* ]] && continue
    echo "Gỡ bản Tensura TNO gốc: $(basename "$f")"; rm -f "$f"
  done
else
  echo "::warning::Không thấy file Tensura TNO đã sửa (modslime-fix) trong mods của server."
fi

# 4) Thêm mod nấu ăn mới (kèm mod chỉ dành cho máy chơi nếu có)
copy_dir "extra-mods" "$WORK/final/mods"
copy_dir "extra-mods/chi-may-choi" "$WORK/final/mods"
rm -f "$WORK"/final/mods/danh-sach.txt "$WORK"/final/mods/khoa-phien-ban.txt

# 4b) Mod vá ModSlime Fix: chống crash "Cannot get config value before config is loaded"
# của Platform/VanillaBackport trên máy chậm (xem fix-mod/). Build bằng libraries của gói gốc.
fix-mod/build.sh "$ROOT/libraries" "$WORK/final/mods/modslime-fix-1.0.0.jar"

# 5) Config / KubeJS / defaultconfigs hiện tại của server (nhiệm vụ FTB Quests, lang, assets, cấu hình mod)
copy_dir "config" "$WORK/final/config"
# Không chép config phía máy chơi (*-client.toml, *client*.snbt): server không dùng chúng, và
# các file trong repo đến từ overrides.zip của bản modpack cũ -> lệch định dạng với bản mod hiện
# tại. Ví dụ vanillabackport-client.toml cũ làm VanillaBackport 1.2.2 crash khi khởi động
# ("Cannot get config value before config is loaded"). Thiếu file thì mod tự tạo bản đúng.
n_client_cfg=$(find "$WORK/final/config" \( -name '*-client.toml' -o -name '*_client.toml' -o -name '*client*.snbt' \) -type f | wc -l)
find "$WORK/final/config" \( -name '*-client.toml' -o -name '*_client.toml' -o -name '*client*.snbt' \) -type f -delete
echo "Bỏ $n_client_cfg file config phía máy chơi (mod sẽ tự tạo lại đúng phiên bản)."
copy_dir "kubejs" "$WORK/final/kubejs"
copy_dir "defaultconfigs" "$WORK/final/defaultconfigs"

n_mods=$(find "$WORK/final/mods" -name '*.jar' | wc -l)
echo "Tổng số mod trong gói máy chơi: $n_mods"

cat > "$WORK/final/DOC-TRUOC-KHI-CAI.txt" <<TXT
GÓI MOD + CONFIG CHO NGƯỜI CHƠI MODSLIME
=========================================
Minecraft Java 1.21.1, NeoForge 21.1.267, Java 21.

CÁCH CÀI:
1. Tạo một instance NeoForge 1.21.1 (21.1.267) trong launcher bạn dùng
   (CurseForge, Prism, MultiMC...), hoặc dùng bản cài đặt NeoForge chính thức.
2. Giải nén toàn bộ nội dung file zip này, CHÉP ĐÈ vào thư mục gốc của instance đó
   (nơi có thư mục "mods", "config"...).
3. Mở game, vào Multiplayer, kết nối tới địa chỉ server (xem trên trang web ModSlime).

Gói này gồm: $n_mods mod (bộ mod ModSlime gốc đã chỉnh cho máy chơi + mod nấu ăn mới)
và toàn bộ config/kubejs hiện tại của server (nhiệm vụ FTB Quests, hình ảnh, bản dịch...).

Thiếu mod hoặc lệch phiên bản so với server sẽ gây lỗi dạng:
"Máy chủ gửi các bản ghi có khoá không xác định" khi vào server.
TXT

echo "== Nén gói cuối =="
( cd "$WORK/final" && zip -rq -1 /tmp/ModSlime-Client-Full.zip . )
ls -lh /tmp/ModSlime-Client-Full.zip
