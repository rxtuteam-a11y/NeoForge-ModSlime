from docx import Document
from docx.shared import RGBColor, Pt
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml.ns import qn
from lxml import etree
import copy

def add(p, text, **kw):
    r = p.add_run(text)
    if kw.get('b'): r.bold = True
    if kw.get('u'): r.underline = True
    if kw.get('i'): r.italic = True
    if kw.get('red'): r.font.color.rgb = RGBColor(0xFF,0,0)
    if kw.get('blue'): r.font.color.rgb = RGBColor(0,0,0xFF)
    if kw.get('hl'): r.font.highlight_color = WD_COLOR_INDEX.YELLOW
    if kw.get('sup'): r.font.superscript = True
    return r

M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
def add_math(p, xml):
    el = etree.fromstring(f'<m:oMath xmlns:m="{M}">{xml}</m:oMath>')
    p._p.append(el)

# ---------- Mẫu 1: đề cũ, gạch chân đáp án, phương án trên 1 dòng & 2 dòng ----------
d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
d.add_paragraph('SỞ GD&ĐT HÀ NỘI')
d.add_paragraph('ĐỀ KIỂM TRA 15 PHÚT - MÔN: Vật lí 10')
d.add_paragraph('Thời gian làm bài: 15 phút')
p = d.add_paragraph(); add(p, 'Câu 1. ', b=True); add(p, 'Đơn vị của lực trong hệ SI là')
p = d.add_paragraph(); add(p, 'A. ', b=True); add(p, 'kg.\t'); add(p, 'B.', b=True, u=True); add(p, ' N.\t'); add(p,'C. ',b=True); add(p,'J.\t'); add(p,'D. ',b=True); add(p,'W.')
p = d.add_paragraph(); add(p, 'Câu 2: ', b=True); add(p, 'Công thức tính vận tốc trung bình là')
p = d.add_paragraph(); add(p, 'A. '); add(p, 'v = s.t')
p = d.add_paragraph(); add(p, 'B. '); add(p, 'v = t/s')
p = d.add_paragraph(); add(p, 'C. ', u=True); add(p, 'v = s/t', u=True)
p = d.add_paragraph(); add(p, 'D. '); add(p, 'v = s + t')
p = d.add_paragraph(); add(p, 'Câu 3. ', b=True); add(p, 'Cho tam giác ABC vuông tại A. Điểm B. nằm ở đâu? Khẳng định nào sau đây ')
add(p, 'KHÔNG', b=True, u=True); add(p, ' đúng?')
p = d.add_paragraph(); add(p, 'A. Điểm B.\tB. '); add(p,'Điểm C.'); add(p, '\tC. '); add(p,'Đáp án C đúng.', u=True); add(p,'\tD. Điểm D.')
p = d.add_paragraph(); add(p, 'Câu 4. ', b=True); add(p, 'Giá trị của ')
add_math(p, f'<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f><m:r><m:t>+</m:t></m:r><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:r><m:t>4</m:t></m:r></m:e></m:rad>')
add(p, ' bằng')
p = d.add_paragraph(); add(p, 'A. '); add_math(p, '<m:r><m:t>2,5</m:t></m:r>'); add(p, '\t'); add(p,'B. '); add_math(p, '<m:r><m:t>3</m:t></m:r>'); add(p,'\tC. '); add_math(p,'<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>'); add(p,'\tD. 4')
p = d.add_paragraph('Lời giải: Ta có 1/2 + 2 = 2,5. Chọn A.')
p = d.add_paragraph(); add(p,'Câu 5. ',b=True); add(p,'Thủ đô của Việt Nam là')
p = d.add_paragraph('A. TP. Hồ Chí Minh.    B. Đà Nẵng.')
p = d.add_paragraph('C. Hà Nội.    D. Huế.')
p = d.add_paragraph('Đáp án: C')
d.add_paragraph('----------- HẾT -----------')
d.save('samples/de1_gachchan.docx')

# ---------- Mẫu 2: Đề THPT 2025: 3 phần, màu đỏ, đúng/sai, trả lời ngắn ----------
d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
d.add_paragraph('ĐỀ THI THỬ TỐT NGHIỆP THPT 2025 - MÔN TOÁN')
d.add_paragraph('Thời gian làm bài: 90 phút, không kể thời gian phát đề')
p = d.add_paragraph(); add(p, 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', b=True); add(p,' Thí sinh trả lời từ câu 1 đến câu 3. Mỗi câu hỏi thí sinh chỉ chọn một phương án.')
for i,(stem,opts,ans) in enumerate([('Tập xác định của hàm số y = log x là',['(0; +∞)','ℝ','[0; +∞)','(1; +∞)'],0),
                                     ('Nghiệm của phương trình 2x = 4 là',['x = 1','x = 2','x = 3','x = 4'],1),
                                     ('Số mặt của hình lập phương là',['4','8','6','12'],2)]):
    p = d.add_paragraph(); add(p, f'Câu {i+1}: ', b=True); add(p, stem)
    p = d.add_paragraph()
    for j,o in enumerate(opts):
        L = 'ABCD'[j]
        if j == ans: add(p, f'{L}. ', b=True, red=True); add(p, o, red=True)
        else: add(p, f'{L}. ', b=True, blue=True); add(p, o)
        if j<3: add(p,'\t')
p = d.add_paragraph(); add(p, 'PHẦN II. Câu trắc nghiệm đúng sai.', b=True); add(p, ' Thí sinh trả lời từ câu 1 đến câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.')
p = d.add_paragraph(); add(p, 'Câu 1. ', b=True); add(p,'Cho hàm số f(x) = x² − 4x + 3. Xét tính đúng sai của các mệnh đề sau:')
tf = [('f(1) = 0',True),('Hàm số đồng biến trên ℝ',False),('f(x) đạt giá trị nhỏ nhất bằng −1',True),('Đồ thị cắt trục tung tại điểm (0; 4)',False)]
for j,(t,v) in enumerate(tf):
    p = d.add_paragraph(); add(p, f'{"abcd"[j]}) ', b=True, red=v); add(p, t, red=v)
p = d.add_paragraph(); add(p, 'Câu 2. ', b=True); add(p,'Một vật chuyển động thẳng với vận tốc v(t) = 3t (m/s).')
tf = [('Tại t = 1 vận tốc bằng 3 m/s',True),('Quãng đường đi được trong 2 giây đầu là 6 m',True),('Vật chuyển động chậm dần',False),('Gia tốc bằng 3 m/s²',True)]
for j,(t,v) in enumerate(tf):
    p = d.add_paragraph(); add(p, f'{"abcd"[j]}) ', b=True, red=v); add(p, t, red=v)
p = d.add_paragraph(); add(p, 'PHẦN III. Câu trắc nghiệm trả lời ngắn.', b=True); add(p, ' Thí sinh trả lời từ câu 1 đến câu 2.')
p = d.add_paragraph(); add(p, 'Câu 1. ', b=True); add(p,'Tính giá trị của biểu thức 2,5 + 3,75.')
d.add_paragraph('Đáp án: 6,25')
p = d.add_paragraph(); add(p, 'Câu 2. ', b=True); add(p,'Có bao nhiêu số tự nhiên có 2 chữ số?')
d.add_paragraph('Đáp số: 90')
d.save('samples/de2_thpt2025.docx')

# ---------- Mẫu 3: đánh số tự động + bảng đáp án cuối đề + dấu * ----------
d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
d.add_paragraph('BÀI KIỂM TRA TIẾNG ANH')
stems = ['She ___ to school every day.', 'They ___ football yesterday.', 'I have ___ apple.', 'Which word is a noun?']
opts = [['go','goes','going','gone'],['play','played','playing','plays'],['a','an','the','no article'],['run','quickly','happiness','blue']]
for i,s in enumerate(stems):
    p = d.add_paragraph(f'Question {i+1}. {s}')
    for j,o in enumerate(opts[i]):
        d.add_paragraph(f'{"ABCD"[j]}. {o}')
d.add_paragraph('Question 5. What is the capital of France?')
d.add_paragraph('*A. Paris')
d.add_paragraph('B. London')
d.add_paragraph('C. Berlin')
d.add_paragraph('D. Rome')
d.add_paragraph('BẢNG ĐÁP ÁN')
t = d.add_table(rows=2, cols=5)
for i in range(4):
    t.cell(0,i).text = str(i+1); t.cell(1,i).text = 'BBBC'[i]
t.cell(0,4).text = '5'; t.cell(1,4).text = 'A'
d.save('samples/de3_bangdapan.docx')

# ---------- Mẫu 4: Word auto numbering "Câu %1." & "%1." upperLetter, đáp án tô vàng ----------
d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
num_xml = d.part.numbering_part.element
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
absx = etree.fromstring(f'''<w:abstractNum xmlns:w="{W}" w:abstractNumId="90">
 <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="Câu %1."/></w:lvl>
</w:abstractNum>''')
absy = etree.fromstring(f'''<w:abstractNum xmlns:w="{W}" w:abstractNumId="91">
 <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1."/></w:lvl>
</w:abstractNum>''')
num_xml.insert(0, absy); num_xml.insert(0, absx)
num_xml.append(etree.fromstring(f'<w:num xmlns:w="{W}" w:numId="90"><w:abstractNumId w:val="90"/></w:num>'))
def setnum(p, numId, restart=False):
    pPr = p._p.get_or_add_pPr()
    numPr = etree.SubElement(pPr, qn('w:numPr'))
    il = etree.SubElement(numPr, qn('w:ilvl')); il.set(qn('w:val'), '0')
    ni = etree.SubElement(numPr, qn('w:numId')); ni.set(qn('w:val'), str(numId))
nid = 100
for i in range(3):
    p = d.add_paragraph(['Hai cộng hai bằng mấy?','Màu của lá cây thường là','Trái đất quay quanh'][i]); setnum(p, 90)
    nid += 1
    num_xml.append(etree.fromstring(f'<w:num xmlns:w="{W}" w:numId="{nid}"><w:abstractNumId w:val="91"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>'))
    for j,o in enumerate([['3','4','5','6'],['đỏ','xanh lục','tím','đen'],['Mặt Trăng','Sao Hỏa','Mặt Trời','Sao Kim']][i]):
        p = d.add_paragraph(); r = add(p, o, hl=(j==[1,1,2][i])); setnum(p, nid)
d.save('samples/de4_autonumber.docx')
print('ok')
