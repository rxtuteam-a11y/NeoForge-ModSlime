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
5. Cũng trong Cài đặt, nhập mật khẩu tài khoản Web Panel (`modslime`) để xem log và gõ lệnh.

Bạn bè không có token vẫn mở được trang, xem trạng thái, đăng nhập tài khoản chung để xem log/gõ lệnh; chỉ không bấm bật được.

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
Các bản cũ hơn 14 ngày tự bị xoá.

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
