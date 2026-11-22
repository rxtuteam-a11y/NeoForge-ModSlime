# NeoForge ModSlime

- Minecraft Java Edition 1.21.1, NeoForge 21.1.267, Java 21.
- Mở Start-ModSlime.bat. Khi hiện Done, vào Multiplayer với địa chỉ localhost:25565 nếu chơi trên máy chạy server.
- Gõ stop trong cửa sổ server để lưu thế giới và tắt. Khi tạo thế giới mới, đợi ít nhất 45 giây sau Done trước khi tắt để Tensura có thời gian dựng mê cung.
- user_jvm_args.txt đặt RAM khởi tạo 2 GB và giới hạn heap Java 6 GB.
- run.bat dùng bản Java 21 có sẵn trên máy này. Nếu chuyển thư mục sang máy khác, cài Java 21 và để lệnh java trỏ tới bản đó.
- Với máy chơi, dùng bộ mod ModSlime gốc, bỏ spear-backport và thêm hai file pondererlib và mebahel-elder-scrolls-core từ thư mục mods của server. Thay tensura_tno-1.0.6.5.jar bằng tensura_tno-1.0.6.5-modslime-fix.jar từ cùng thư mục.
- client-mods chứa 28 file dành cho máy chơi đã được đưa ra khỏi mods của server. disabled-conflicts giữ Backported Spears, bị trùng đăng ký vật phẩm với Vanilla Backport, và bản Tensura TNO gốc. Bản Tensura TNO đã sửa chỉ thay tên đích của một mixin để nó gọi đúng overload của One Enough Block 1.1.5.


## Kết quả chạy thử

Server đã mở cổng 25565, nhận kết nối TCP nội bộ, tạo thế giới mới và lưu xong khi tắt. Chưa thử đăng nhập bằng Minecraft. Nhật ký khởi động ghi 9 công thức không nạp được và cảnh báo tạo areas.json của In Control.

