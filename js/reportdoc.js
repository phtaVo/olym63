// ============================================================
// REPORT — Báo cáo nghiên cứu khoa học theo form KHKT (trang bìa, lời cảm ơn, mục lục, tóm tắt, 4 phần, tài liệu tham khảo, phụ lục)
//  Dùng được cả trong trình duyệt (cần DOCGEN + thư viện docx) lẫn Node (tạo file mẫu).
//  Khổ A4 · Times New Roman 13 · giãn dòng 1,3 · lề trên/dưới/phải 2 cm, lề trái 3 cm (đóng gáy)
// ============================================================
const REPORT = (() => {
  // Cấu trúc báo cáo. h = cấp tiêu đề (1 = PHẦN, 2 = x.y, 3 = x.y.z); gen = false: không để AI tự viết nội dung
  const SECTIONS = [
    { id: 'abs', h: 1, t: 'TÓM TẮT', w: 250, g: 'Tóm tắt dự án trong 200–300 từ: vấn đề, giải pháp/phương pháp, kết quả chính, đóng góp.' },
    { id: 'p1', h: 1, t: 'PHẦN 1. MỞ ĐẦU' },
    { id: '1.1', h: 2, t: '1.1. Lý do chọn đề tài và đặt vấn đề' },
    { id: '1.1.1', h: 3, t: '1.1.1. Thực trạng', w: 250, g: 'Mô tả thực trạng liên quan đến đề tài, có số liệu hoặc ví dụ cụ thể lấy từ tài liệu.' },
    { id: '1.1.2', h: 3, t: '1.1.2. Lý do chọn đề tài và tính cấp thiết', w: 220, g: 'Vì sao cần nghiên cứu vấn đề này, ai được lợi, vì sao bây giờ.' },
    { id: '1.2', h: 2, t: '1.2. Vấn đề nghiên cứu và giả thuyết' },
    { id: '1.2.1', h: 3, t: '1.2.1. Vấn đề cần giải quyết', w: 180, g: 'Nêu rõ vấn đề khoa học/kỹ thuật cụ thể mà đề tài giải quyết.' },
    { id: '1.2.2', h: 3, t: '1.2.2. Giả thuyết nghiên cứu', w: 150, g: 'Giả thuyết có thể kiểm chứng được.' },
    { id: '1.3', h: 2, t: '1.3. Mục tiêu nghiên cứu' },
    { id: '1.3.1', h: 3, t: '1.3.1. Mục tiêu tổng quát', w: 80, g: 'Một đoạn ngắn.' },
    { id: '1.3.2', h: 3, t: '1.3.2. Mục tiêu cụ thể', w: 150, g: 'Danh sách 3–5 mục tiêu đo được.' },
    { id: '1.4', h: 2, t: '1.4. Đối tượng và phạm vi nghiên cứu', w: 150, g: 'Đối tượng nghiên cứu, phạm vi (không gian, thời gian, giới hạn).' },
    { id: 'p2', h: 1, t: 'PHẦN 2. NỘI DUNG CHÍNH' },
    { id: '2.1', h: 2, t: '2.1. Tổng quan tài liệu và cơ sở lý thuyết', w: 450, g: 'Các nghiên cứu/sản phẩm liên quan, cơ sở lý thuyết, khoảng trống mà đề tài giải quyết. Trích dẫn nguồn dạng [n].' },
    { id: '2.2', h: 2, t: '2.2. Phương pháp nghiên cứu' },
    { id: '2.2.1', h: 3, t: '2.2.1. Thiết kế nghiên cứu', w: 250, g: 'Loại nghiên cứu, các bước tiến hành, biến số/tiêu chí đánh giá.' },
    { id: '2.2.2', h: 3, t: '2.2.2. Dữ liệu, dụng cụ và công cụ sử dụng', w: 250, g: 'Dữ liệu lấy từ đâu, bao nhiêu mẫu; thiết bị, phần mềm.' },
    { id: '2.2.3', h: 3, t: '2.2.3. Quy trình thực hiện', w: 300, g: 'Quy trình theo từng bước, có thể kèm sơ đồ.' },
    { id: '2.3', h: 2, t: '2.3. Kết quả và thảo luận' },
    { id: '2.3.1', h: 3, t: '2.3.1. Kết quả đạt được', w: 350, g: 'Trình bày kết quả có số liệu, bảng, biểu đồ.', fig: true },
    { id: '2.3.2', h: 3, t: '2.3.2. Đánh giá', w: 250, g: 'So sánh với mục tiêu/giả thuyết, độ tin cậy, minh chứng.' },
    { id: '2.3.3', h: 3, t: '2.3.3. Thảo luận', w: 250, g: 'Ý nghĩa của kết quả, điểm mạnh, hạn chế.' },
    { id: 'p3', h: 1, t: 'PHẦN 3. ỨNG DỤNG VÀ HƯỚNG PHÁT TRIỂN' },
    { id: '3.1', h: 2, t: '3.1. Khả năng ứng dụng và triển khai', w: 250, g: 'Ứng dụng thực tế, đối tượng sử dụng, cách triển khai, chi phí.' },
    { id: '3.2', h: 2, t: '3.2. Hạn chế và hướng phát triển', w: 200, g: 'Hạn chế còn tồn tại, kế hoạch tiếp theo.' },
    { id: 'p4', h: 1, t: 'PHẦN 4. KẾT LUẬN VÀ KIẾN NGHỊ' },
    { id: '4.1', h: 2, t: '4.1. Kết luận', w: 180, g: 'Tóm lại kết quả so với mục tiêu.' },
    { id: '4.2', h: 2, t: '4.2. Kiến nghị', w: 120, g: 'Kiến nghị với nhà trường, địa phương, người dùng.' },
    { id: 'ref', h: 1, t: 'TÀI LIỆU THAM KHẢO', refs: true, g: 'Danh sách tài liệu đánh số [1], [2]… chỉ gồm tài liệu có trong các nguồn đã nạp.' },
    { id: 'app', h: 1, t: 'PHỤ LỤC', w: 100, g: 'Danh mục phụ lục (bảng hỏi, hình ảnh minh chứng, mã nguồn…).' }
  ];
  const LEAVES = SECTIONS.filter(s => s.g);
  const DEF = { org: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO ………………', school: 'TRƯỜNG ……………………………………', contest: 'TÊN CUỘC THI ……………………………………', audience: '', year: 'Năm học ……… – ………', kind: 'BÁO CÁO KẾT QUẢ THỰC HIỆN DỰ ÁN', field: 'Lĩnh vực: …………………………………', title: 'TÊN ĐỀ TÀI', authors: [{ n: 'Họ và tên', c: 'Lớp' }], teacher: 'Giáo viên hướng dẫn: …………………', place: '………………', date: '', link: '' };

  function build(D, meta, content, opt) {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Footer, Header, PageNumber, NumberFormat, TableOfContents, PageBreak, ImageRun, Table, TableRow, TableCell, WidthType } = D;
    const m = Object.assign({}, DEF, meta || {}); content = content || {}; opt = opt || {};
    const F = 'Times New Roman', tr = (t, o) => new TextRun(Object.assign({ text: t, font: F, size: 26 }, o || {}));
    const P = (t, o, po) => new Paragraph(Object.assign({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [tr(t, o)] }, po || {}));
    // ---------- trang bìa ----------
    const cover = [
      P(m.org, { size: 26, bold: true }), P(m.school, { size: 28, bold: true }, { spacing: { after: 360 } }),
      P(m.contest, { size: 28, bold: true }), P(m.audience, { size: 26, italics: true }), P(m.year, { size: 26, bold: true }, { spacing: { after: 480 } }),
      P(m.kind, { size: 30, bold: true }, { spacing: { after: 160 } }), P(m.field, { size: 26 }, { spacing: { after: 360 } }),
      P(String(m.title || '').toUpperCase(), { size: 34, bold: true, color: '1F3864' }, { spacing: { before: 120, after: 600, line: 360 } }),
      P('Học sinh thực hiện:', { bold: true }, { alignment: AlignmentType.LEFT, indent: { left: 3000 } })
    ].concat((m.authors || []).map(a => P(a.n + (a.c ? ' – ' + a.c : ''), {}, { alignment: AlignmentType.LEFT, indent: { left: 3000 }, spacing: { after: 60 } })))
      .concat([P(m.teacher, { bold: true }, { alignment: AlignmentType.LEFT, indent: { left: 3000 }, spacing: { before: 200, after: 120 } })])
      .concat(m.link ? [P('Sản phẩm trực tuyến: ' + m.link, { italics: true, size: 24 }, { spacing: { before: 300 } })] : [])
      .concat([P((m.place || '') + (m.date ? ', ' + m.date : ''), { italics: true }, { spacing: { before: 700 } })]);
    // ---------- phần đầu: lời cảm ơn + mục lục + viết tắt ----------
    const hd = t => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 }, children: [tr(t, { bold: true, size: 28 })] });
    const body = txt => D_md(D, txt);
    const front = [hd('LỜI CẢM ƠN')].concat(body(content.thanks || '(Cảm ơn thầy cô hướng dẫn, nhà trường, đơn vị phối hợp và những người đã giúp đỡ nhóm trong quá trình thực hiện đề tài.)'))
      .concat([new Paragraph({ children: [new PageBreak()] }), hd('MỤC LỤC'), new TableOfContents('Mục lục', { hyperlink: true, headingStyleRange: '1-3' }), new Paragraph({ children: [new PageBreak()] }), hd('DANH MỤC TỪ VIẾT TẮT')])
      .concat(abbrTable(D, content.abbr));
    // ---------- thân báo cáo ----------
    const HL = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
    const main = []; let figN = 0;
    SECTIONS.forEach(s => {
      main.push(new Paragraph({ heading: HL[s.h], alignment: s.h === 1 ? AlignmentType.CENTER : AlignmentType.LEFT, pageBreakBefore: s.h === 1 && !['p2', 'p3', 'p4', 'abs'].includes(s.id) ? true : (s.id === 'abs'), children: [tr(s.t)] }));
      const txt = content[s.id]; if (txt) body(txt, s).forEach(k => main.push(k)); else if (s.g && opt.hints) main.push(new Paragraph({ spacing: { after: 120 }, children: [tr('(' + s.g + ')', { italics: true, color: '7F7F7F' })] }));
      if (s.fig) (content.figures || []).forEach(f => { if (!f.png) return; figN++; const w = Math.min(520, f.w || 520), h = Math.round(w * (f.h || 320) / (f.w || 520)); main.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true, children: [new ImageRun({ type: 'png', data: f.png, transformation: { width: w, height: h } })] })); main.push(P('Hình ' + figN + '. ' + f.title + (f.src ? ' (Nguồn: ' + f.src + ')' : ''), { italics: true, size: 24 }, { spacing: { after: 200 } })); });
    });
    const common = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } };
    const foot = fmt => ({ default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: F, size: 24 })] })] }) });
    const hs = (size, o) => ({ run: Object.assign({ font: F, size, bold: true, color: '000000' }, o || {}), paragraph: { spacing: { before: 240, after: 120, line: 312 }, keepNext: true } });
    const doc = new Document({
      creator: (m.authors && m.authors[0] && m.authors[0].n) || 'Olym63', title: m.title, description: 'Báo cáo NCKH tạo bởi Olym63', features: { updateFields: true },
      styles: {
        default: { document: { run: { font: F, size: 26 }, paragraph: { spacing: { line: 312 } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(28).run, paragraph: Object.assign(hs(28).paragraph, { outlineLevel: 0 }) },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(26).run, paragraph: Object.assign(hs(26).paragraph, { outlineLevel: 1 }) },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(26, { italics: true }).run, paragraph: Object.assign(hs(26).paragraph, { outlineLevel: 2 }) }
        ]
      },
      numbering: { config: [{ reference: 'bul', levels: [0, 1, 2].map(l => ({ level: l, format: D.LevelFormat.BULLET, text: ['•', '–', '·'][l], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567 + l * 454, hanging: 283 } } } })) }, { reference: 'num', levels: [0, 1, 2].map(l => ({ level: l, format: D.LevelFormat.DECIMAL, text: `%${l + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567 + l * 454, hanging: 283 } } } })) }] },
      sections: [
        { properties: { page: Object.assign({ borders: { pageBorders: { display: 'allPages', offsetFrom: 'page' }, pageBorderTop: { style: BorderStyle.DOUBLE, size: 6, color: '1F3864', space: 24 }, pageBorderBottom: { style: BorderStyle.DOUBLE, size: 6, color: '1F3864', space: 24 }, pageBorderLeft: { style: BorderStyle.DOUBLE, size: 6, color: '1F3864', space: 24 }, pageBorderRight: { style: BorderStyle.DOUBLE, size: 6, color: '1F3864', space: 24 } } }, common) }, children: cover },
        { properties: { page: Object.assign({ pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } }, common) }, footers: foot(), children: front },
        { properties: { page: Object.assign({ pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }, common) }, footers: foot(), children: main }
      ]
    });
    return D.Packer.toBlob ? D.Packer.toBlob(doc) : D.Packer.toBuffer(doc);
  }
  function D_md(D, txt) { return (typeof DOCGEN !== 'undefined' ? DOCGEN : require('./docgen.js')).mdKids(D, String(txt || ''), { center1: false }); }
  function abbrTable(D, rows) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, ShadingType } = D; const F = 'Times New Roman';
    rows = rows && rows.length ? rows : [['Chữ viết tắt', 'Nghĩa đầy đủ'], ['KHKT', 'Khoa học kỹ thuật'], ['…', '…']];
    const bd = { style: BorderStyle.SINGLE, size: 4, color: '808080' }, w = [2400, 6671];
    const cell = (t, i, head) => new TableCell({ width: { size: w[i], type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: String(t), font: F, size: 24, bold: !!head })] })] });
    return [new Table({ width: { size: 9071, type: WidthType.DXA }, columnWidths: w, borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd }, rows: rows.map((r, k) => new TableRow({ tableHeader: k === 0, children: [cell(r[0], 0, k === 0), cell(r[1], 1, k === 0)] })) }), new Paragraph({ children: [] })];
  }
  return { SECTIONS, LEAVES, DEF, build };
})();
if (typeof module !== 'undefined') module.exports = REPORT;
