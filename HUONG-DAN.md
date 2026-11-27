# NeoForge ModSlime

Minecraft Java 1.21.1 · NeoForge 21.1.267 · Java 21 · 266 mod.

## Bật server bằng trang web (không cần chạy file .bat)

Trang web: **https://rxtuteam-a11y.github.io/NeoForge-ModSlime/**

Bấm **▶ BẬT SERVER** → GitHub Actions dựng một máy Linux (4 CPU, 16 GB RAM), lấy world mới nhất
trong repo, nạp 266 mod (lần đầu tải từ Google Drive, các lần sau lấy từ cache), rồi chạy NeoForge.
Sau 3–5 phút trang tự chuyển sang "Đang chạy", console hiện log và ô gõ lệnh dùng được.

- **Tắt**: bấm **■ TẮT SERVER** → server `save-all`, tắt, đẩy world lên GitHub (và Google Drive nếu đã cấu hình),
  rồi phiên GitHub tự đóng sau 10 phút.
- **Tự lưu**: world được đẩy lên GitHub mỗi 10 phút trong lúc chạy.
- **Giới hạn**: mỗi phiên tối đa khoảng 5 giờ 40 phút. 8 phút trước khi hết giờ server tự báo người chơi, lưu và tắt.
  Muốn chơi tiếp thì bấm bật lại.
- **Huỷ phiên ngay** chỉ dùng khi server bị treo, vì có thể mất tối đa 10 phút tiến trình chưa lưu.

### Cài đặt một lần

**1. GitHub token** (để trang web được phép bật server)
1. Mở https://github.com/settings/personal-access-tokens/new
2. Repository access → Only select repositories → chọn `NeoForge-ModSlime`.
3. Permissions → **Actions: Read and write**, **Contents: Read-only**.
4. Generate, chép token, dán vào **⚙ Cài đặt** trên trang web. Token chỉ lưu trong trình duyệt của bạn.

**Không có tài khoản/mật khẩu nào.** Ai mở trang cũng xem được trạng thái, log, người chơi (chế độ chỉ xem).
Chỉ người có GitHub token của chủ repo (hoặc người được thêm làm collaborator có quyền Write) mới bật/tắt,
gõ lệnh và sao lưu được. Web Panel tự hỏi GitHub để xác minh token đó.

> Mẹo: nếu token có thêm quyền **Secrets** và **Variables: Read and write**, bạn nhập Playit / địa chỉ game / rclone.conf
> ngay trong **⚙ Cài đặt → Cấu hình server trên GitHub** của trang web, khỏi làm bước 3 của mục 2 và mục 3 bên dưới bằng tay.

**2. Playit.gg** (để người chơi vào được game, vì máy GitHub không có IP công khai)
1. Đăng nhập https://playit.gg → Agents → thêm agent mới kiểu **Docker / self-managed** → chép giá trị **SECRET_KEY**.
2. Tạo tunnel **Minecraft Java** trỏ về agent đó, địa chỉ nội bộ `127.0.0.1:25565`. Chép địa chỉ tunnel (vd. `abc.joinmc.link`).
3. Trên GitHub: repo → Settings → Secrets and variables → Actions
   - tab **Secrets** → New repository secret: tên `PLAYIT_SECRET`, giá trị là SECRET_KEY.
   - tab **Variables** → New repository variable: tên `MC_ADDRESS`, giá trị là địa chỉ tunnel. Trang web sẽ hiện địa chỉ này.

**3. Google Drive** (tuỳ chọn: lưu thêm bản zip world lên Drive)
1. Tải rclone (https://rclone.org/downloads/), chạy `rclone config` → `n` (new remote) → tên `gdrive` → loại `drive`
   → bỏ trống client_id/secret → scope `1` (full) → đăng nhập Google trong trình duyệt.
2. Chạy `rclone config file` để biết đường dẫn file `rclone.conf`, mở file, chép toàn bộ nội dung.
3. Tạo GitHub secret `RCLONE_CONFIG` = nội dung đó.
4. (Tuỳ chọn) biến `GDRIVE_BACKUP_PATH`, mặc định `gdrive:ModSlime-Backups`.

Sau đó mỗi lần tắt server, và khi bấm **Lưu lên Google Drive**, file `ModSlime-world-<ngày-giờ>.zip` được tải lên thư mục đó.
Chỉ giữ 3 bản mới nhất (world lớn, mỗi bản vài GB).

## Cho thiết bị khác / bạn bè bật server (không cần cài lại)

1. Trên máy đã cài: **⚙ Cài đặt → 📲 Cho thiết bị khác điều khiển server → Tạo link chia sẻ**.
2. Gửi link (hoặc cho quét mã QR bằng điện thoại). Mở link là thiết bị đó bật/tắt, gõ lệnh được ngay.
3. Ai có link đều điều khiển được server. Với bạn bè, nên tạo **token riêng** chỉ có quyền
   *Actions: Read and write* + *Contents: Read-only*, đặt ngày hết hạn, dán vào ô "Token dùng cho link" rồi mới tạo link.
   Muốn thu hồi: xoá token đó ở https://github.com/settings/personal-access-tokens.

Chỉ cần **xem** trạng thái/log/địa chỉ game thì gửi link trang web bình thường, không cần token.

## Gói mod cho người chơi mới (1 link duy nhất)

Trang web (thẻ 🎮 Vào game) có link **"Tải trọn gói mod + config cho người chơi"**:
`https://github.com/rxtuteam-a11y/NeoForge-ModSlime/releases/download/client-pack-latest/ModSlime-Client-Full.zip`

Gói này tự động gồm: bộ mod ModSlime gốc đã chỉnh đúng cho máy chơi (gỡ Backported Spears xung đột,
dùng bản Tensura TNO đã sửa, thêm pondererlib/mebahel-elder-scrolls-core) + 10 mod nấu ăn mới +
toàn bộ config/kubejs hiện tại của server (nhiệm vụ FTB Quests, hình ảnh, bản dịch...).

Người chơi chỉ cần giải nén và chép đè vào thư mục instance NeoForge 1.21.1 (21.1.267) của họ.

**Cài tự động cho TLauncher (Legacy):** mở TLauncher, chọn "NeoForge 1.21.1", vào game 1 lần tới menu chính rồi tắt.
Sau đó mở PowerShell (Windows + X → Terminal) và chạy:
```
irm https://rxtuteam-a11y.github.io/NeoForge-ModSlime/cai-dat.ps1 | iex
```
Script tải gói, đổi tên thư mục `mods` cũ thành `mods_cu_<ngày-giờ>` (không xoá), cài mods/config/kubejs mới
và kiểm tra có đủ mod vá + VanillaBackport.

**Cập nhật gói này sau khi thêm mod / overrides mới:**
GitHub → Actions → **Đóng gói mod cho người chơi** → Run workflow → chọn `dong_goi`.
(`xem` chỉ để kiểm tra cấu trúc file gốc trên Drive, không đổi gì.)

## Thêm mod (ví dụ mod nấu ăn)

1. Sửa `extra-mods/danh-sach.txt` (mỗi dòng 1 mod: slug hoặc tên trên Modrinth).
2. GitHub → Actions → **Thêm mod (Modrinth)** → Run workflow. Workflow tải bản NeoForge 1.21.1, kèm thư viện còn thiếu,
   bỏ qua mod server đã có, lưu vào `extra-mods/` và tạo `docs/mods-them.zip`.
3. Server tự chép các mod này vào `mods` ở lần bật tiếp theo.
4. **Mọi người chơi** phải tải `mods-them.zip` (link trên trang web, thẻ Vào game) và chép các file .jar vào thư mục `mods`
   của mình. Thiếu mod hoặc khác phiên bản sẽ bị lỗi "Máy chủ gửi các bản ghi có khoá không xác định" khi vào server.

## Chạy trên máy riêng (Radmin VPN)

Vẫn dùng được như trước: chạy `web-panel/Start-Web-Panel.bat`, mở http://localhost:8080.
Không bật server trên máy riêng và trên cloud cùng lúc, vì cả hai cùng đẩy world lên GitHub.

## Ghi chú mod

- Khi tạo thế giới mới, đợi ít nhất 45 giây sau Done trước khi tắt để Tensura có thời gian dựng mê cung.
- `user_jvm_args.txt` đặt heap Java 6 GB.
- Với máy chơi, dùng bộ mod ModSlime gốc, bỏ spear-backport và thêm hai file pondererlib và mebahel-elder-scrolls-core
  từ thư mục mods của server. Thay tensura_tno-1.0.6.5.jar bằng tensura_tno-1.0.6.5-modslime-fix.jar từ cùng thư mục.
- client-mods chứa 28 file dành cho máy chơi đã được đưa ra khỏi mods của server. disabled-conflicts giữ Backported Spears,
  bị trùng đăng ký vật phẩm với Vanilla Backport, và bản Tensura TNO gốc.
