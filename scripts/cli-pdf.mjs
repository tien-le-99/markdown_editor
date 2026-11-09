/**
 * Tiny pure-JS PDF inspector for the test CLI (no dependencies).
 * The app's Playwright/Skia PDFs keep their dictionaries readable as
 * plain text, so regex over the raw buffer is enough for testing metadata.
 */

/**
 * Inspect a PDF buffer. Returns:
 * { bytes, headerOk, pages, boxes, outlines, tagged }
 * - pages: number of /Type /Page leaf objects.
 * - boxes: every MediaBox as [x0, y0, x1, y1] numbers (may repeat per page).
 * - outlines/tagged: presence of native bookmarks / MarkInfo << /Marked true >>.
 */
export function pdfInfo(buffer) {
  const bytes = buffer.length;
  const headerOk = bytes >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const text = buffer.toString('latin1');
  const pages = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length;
  const boxes = [];
  for (const m of text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)) {
    const nums = m[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
    if (nums.length === 4) boxes.push(nums);
  }
  const outlines = /\/Outlines\b/.test(text);
  const tagged = /\/Marked\s+true/.test(text);
  return { bytes, headerOk, pages, boxes, outlines, tagged };
}

export function formatPdfInfo(info, name) {
  const lines = [
    `${name}: ${info.bytes} bytes, header ${info.headerOk ? '%PDF- ok' : 'BAD'}`,
    `pages: ${info.pages}`,
  ];
  const uniq = [...new Set(info.boxes.map((b) => b.join('x')))];
  lines.push(`page sizes (pt): ${uniq.length > 0 ? uniq.join(', ') : '?'}`);
  lines.push(`outlines: ${info.outlines ? 'yes' : 'no'}, tagged: ${info.tagged ? 'yes' : 'no'}`);
  return lines.join('\n');
}
