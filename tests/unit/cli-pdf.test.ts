import { describe, it, expect } from 'vitest';
import { pdfInfo, formatPdfInfo } from '../../scripts/cli-pdf.mjs';

const MINIMAL_PDF = Buffer.from(
  `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R /Outlines 5 0 R /MarkInfo << /Marked true >> >>
endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>
endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>
endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1191] >>
endobj
5 0 obj << /Type /Outlines /First 6 0 R /Last 6 0 R /Count 1 >>
endobj
`,
  'latin1'
);

describe('cli pdfInfo', () => {
  it('reads pages, boxes, outlines and tagged flags', () => {
    const info = pdfInfo(MINIMAL_PDF);
    expect(info.headerOk).toBe(true);
    expect(info.bytes).toBe(MINIMAL_PDF.length);
    // /Pages tree must not count as a leaf page.
    expect(info.pages).toBe(2);
    expect(info.boxes).toEqual([
      [0, 0, 595, 842],
      [0, 0, 842, 1191],
    ]);
    expect(info.outlines).toBe(true);
    expect(info.tagged).toBe(true);
  });

  it('rejects non-PDF buffers and formats a summary', () => {
    const info = pdfInfo(Buffer.from('hello'));
    expect(info.headerOk).toBe(false);
    expect(info.pages).toBe(0);
    expect(formatPdfInfo(info, 'x')).toContain('BAD');
    expect(formatPdfInfo(pdfInfo(MINIMAL_PDF), 'mini.pdf')).toContain('pages: 2');
  });
});
