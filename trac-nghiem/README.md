# Trắc Nghiệm Online

Trang web tạo đề trắc nghiệm từ file Word / PDF, tự tách câu hỏi, nhận đáp án và chấm điểm tự động.

## Chạy

Cần **Node.js 22.5 trở lên** (https://nodejs.org).

```bash
cd trac-nghiem
npm install
npm start
```

Mở http://localhost:3000 — đăng ký tài khoản giáo viên, tạo đề, gửi mã đề / link cho học sinh.
Trên Windows: bấm đúp `Chay-Trang-Trac-Nghiem.bat`.

- Cổng: biến môi trường `PORT` (mặc định 3000). Dữ liệu (CSDL SQLite + ảnh) lưu trong thư mục `data/` (đổi bằng `DATA_DIR`).
- Cài thêm **LibreOffice** (không bắt buộc) để: đọc file `.doc` cũ và hiển thị công thức MathType (ảnh WMF/EMF) sắc nét.
- Học sinh ở máy khác: dùng địa chỉ IP của máy chạy server (VD `http://192.168.1.10:3000`) hoặc đưa lên một máy chủ / dịch vụ như Render, Railway, VPS.

## Tính năng

- Tạo đề từ `.docx`, `.doc`, `.pdf`, `.txt` hoặc dán văn bản; soạn thủ công; lấy câu từ đề khác.
- Tự tách câu (`Câu 1.`, `Question 1.`, `Bài 1`, `1.` hoặc đánh số tự động của Word), phương án A–D cùng dòng / mỗi dòng / trong bảng / chung dòng với câu hỏi, giữ ảnh và công thức (Equation → KaTeX, MathType → ảnh).
- Nhận đáp án: gạch chân, tô màu, tô sáng, in đậm khác biệt, dấu `*`, dòng `Đáp án: B` / `Chọn B`, lời giải, bảng đáp án cuối đề (theo từng phần).
- Đủ dạng câu: một đáp án, nhiều đáp án, đúng/sai a-b-c-d (thang Bộ GD 2025), trả lời ngắn (so sánh số 0,5 = 0.5 = 1/2), tự luận (học sinh gửi chữ + ảnh, giáo viên chấm).
- Cấu trúc PHẦN I / II / III, đảo câu trong từng phần, đảo phương án.
- Cài đặt: thời gian, giờ mở/đóng, mật khẩu, số lượt làm, xem điểm / đáp án / lời giải, chống gian lận (ghi nhận rời màn hình, tự nộp khi quá số lần, chặn sao chép).
- Học sinh: vào bằng mã đề / link / QR, tự nhập tên hoặc chọn tên trong danh sách lớp; tự lưu bài, mất mạng / tải lại trang vẫn làm tiếp; hết giờ tự nộp.
- Giáo viên: bảng kết quả, danh sách chưa làm, sửa điểm, nhận xét, chấm lại, thống kê phổ điểm / xếp loại / tỉ lệ đúng từng câu, xuất Excel, in đề nhiều mã đề kèm đáp án, lớp học (nhập/xuất Excel), thư mục đề.

## Kiểm thử

```bash
npm test                                   # tách câu các file mẫu trong test/samples
node test/e2e_api.js http://localhost:3000 # luồng đầy đủ qua API (server phải đang chạy)
```
