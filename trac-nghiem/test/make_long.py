from docx import Document
from docx.shared import RGBColor
import random
random.seed(3)
d = Document(); d.styles['Normal'].font.name = 'Times New Roman'
sec = d.sections[0]
sec.header.paragraphs[0].text = 'Mã đề 101'
fp = sec.footer.paragraphs[0]
# trường PAGE trong chân trang
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
r = fp.add_run('Trang ')
for t,v in (('begin',None),('instr',' PAGE '),('end',None)):
    run = fp.add_run()
    if t=='instr':
        it = OxmlElement('w:instrText'); it.set(qn('xml:space'),'preserve'); it.text = v; run._r.append(it)
    else:
        fc = OxmlElement('w:fldChar'); fc.set(qn('w:fldCharType'), t); run._r.append(fc)
d.add_paragraph('ĐỀ ÔN TẬP 40 CÂU - MÔN: Lịch sử')
key = []
for i in range(1, 41):
    p = d.add_paragraph(); r = p.add_run(f'Câu {i}. '); r.bold = True
    p.add_run(f'Nội dung câu hỏi số {i} khá dài để có thể xuống dòng trong file PDF, hỏi về sự kiện lịch sử quan trọng thứ {i} trong chương trình học?')
    a = random.randrange(4); key.append('ABCD'[a])
    long = i % 3 == 0
    opts = [f'Phương án {L} của câu {i}' + (' với phần mô tả rất dài để phương án phải nằm riêng một dòng trong đề thi' if long else '') for L in 'ABCD']
    if long:
        for j,o in enumerate(opts):
            p = d.add_paragraph(); rr = p.add_run(f'{"ABCD"[j]}. '); rr.bold = True
            rr.underline = (j == a); p.add_run(o)
    else:
        p = d.add_paragraph()
        for j,o in enumerate(opts):
            rr = p.add_run(f'{"ABCD"[j]}. '); rr.bold = True; rr.underline = (j == a)
            p.add_run(f'{["Ý","Ý","Ý","Ý"][j]} {i}{"ABCD"[j]}' + ('\t' if j < 3 else ''))
d.add_paragraph('----- HẾT -----')
d.save('samples/de7_40cau.docx')
open('samples/de7_key.txt','w').write(''.join(key))
