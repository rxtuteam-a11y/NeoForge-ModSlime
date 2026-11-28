from docx import Document
from docx.shared import RGBColor, Inches
import struct, zlib
def add(p, text, **kw):
    r = p.add_run(text)
    if kw.get('b'): r.bold = True
    if kw.get('u'): r.underline = True
    if kw.get('red'): r.font.color.rgb = RGBColor(0xFF,0,0)
    return r
def png(path, w=120, h=60):
    raw = b''.join(b'\x00' + bytes([200,230,220]*w) for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
png('samples/hinh.png')

d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
d.add_paragraph('Mã đề 101')
d.add_paragraph('PHẦN I. TRẮC NGHIỆM (3 điểm)')
p = d.add_paragraph(); add(p,'Câu 1 (NB): ',b=True); add(p,'Hình bên là đồ thị của hàm số nào?')
d.add_paragraph().add_run().add_picture('samples/hinh.png', width=Inches(1.2))
p = d.add_paragraph(); add(p,'A',u=True); add(p,'. y = x²\tB. y = x³\tC. y = 2x\tD. y = −x')
p = d.add_paragraph(); add(p,'Câu 2. ',b=True); add(p,'Số nào là số nguyên tố? A. 4   B. 6   C. 7   D. 9')
p = d.add_paragraph(); add(p,'Câu 3. ',b=True); add(p,'Chọn phương án đúng nhất về nước:')
t = d.add_table(rows=2, cols=2)
t.cell(0,0).text='A. Sôi ở 50°C'; t.cell(0,1).text='B. Đóng băng ở 0°C'; t.cell(1,0).text='C. Không màu, không mùi'; t.cell(1,1).text='D. Cả B và C'
p = d.add_paragraph(); add(p,'Câu 4. ',b=True); add(p,'Chọn khẳng định đúng.')
d.add_paragraph('A. 1 > 2'); d.add_paragraph('B. 2 > 3'); d.add_paragraph('C. 3 > 4'); d.add_paragraph('D. 5 > 4')
d.add_paragraph('PHẦN II. Câu trắc nghiệm đúng sai')
p = d.add_paragraph(); add(p,'Câu 1. ',b=True); add(p,'Cho tam giác ABC đều cạnh 2.')
d.add_paragraph('a) Chu vi bằng 6.'); d.add_paragraph('b) Các góc bằng 60°.'); d.add_paragraph('c) Diện tích bằng 4.'); d.add_paragraph('d) Đường cao bằng 2.')
d.add_paragraph('PHẦN III. TỰ LUẬN')
p = d.add_paragraph(); add(p,'Bài 1 (2 điểm). ',b=True); add(p,'Cho phương trình x² − 5x + 6 = 0.')
d.add_paragraph('a) Giải phương trình.'); d.add_paragraph('b) Tính tổng hai nghiệm.')
d.add_paragraph('Trang 1/2')
d.add_paragraph('------ HẾT ------')
d.add_paragraph('ĐÁP ÁN')
d.add_paragraph('PHẦN I')
t = d.add_table(rows=2, cols=5)
for i,(n,a) in enumerate([('Câu','Đáp án'),('1','A'),('2','C'),('3','D'),('4','D')]):
    t.cell(0,i).text=n; t.cell(1,i).text=a
d.add_paragraph('PHẦN II')
d.add_paragraph('Câu 1: a) Đ  b) Đ  c) S  d) S')
d.save('samples/de5_kho.docx')

# Đề có lời giải chi tiết sau HẾT + đáp án dạng "1.A 2.B"
d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
for i,(s,o) in enumerate([('2 + 3 = ?',['4','5','6','7']),('Thủ đô Pháp?',['Paris','Rome','Berlin','Madrid']),('Nước sôi ở bao nhiêu độ C (áp suất chuẩn)?',['90','95','100','110'])]):
    d.add_paragraph(f'{i+1}. {s}')
    d.add_paragraph('   '.join(f'{"ABCD"[j]}. {x}' for j,x in enumerate(o)))
d.add_paragraph('Đáp án và lời giải chi tiết')
d.add_paragraph('1.B 2.A')
d.add_paragraph('Câu 3. Ở áp suất 1 atm nước sôi ở 100 độ C. Chọn C.')
d.save('samples/de6_loigiai.docx')
print('ok')
