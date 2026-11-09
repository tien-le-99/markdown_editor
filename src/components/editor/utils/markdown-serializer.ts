/**
 * Bidirectional AST Markdown <-> HTML & ProseMirror Serializer
 * Supports GFM tables, interactive ECharts fences, Mermaid diagrams,
 * code blocks, headings with anchor IDs, task lists, GitHub alerts, blockquotes,
 * lists, and inline styles with underscore preservation.
 */

import katex from 'katex';

// Helper to escape HTML entities
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper to unescape HTML entities
export function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * Generate a URL-safe GitHub-compliant anchor slug from heading text.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '') // remove HTML tags
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links
    .replace(/[^\w\s-]/g, '') // remove punctuation except whitespace and hyphen
    .trim()
    .replace(/\s/g, '-');
}

/**
 * Safely parse inline formatting (code, bold, italic, links, images)
 * Protecting inline code backticks from being corrupted by underscores or asterisks.
 */
export function parseInline(text: string): string {
  if (!text) return '';

  // Step 1: Protect inline code `...` before processing formatting markers
  const codeTokens: string[] = [];
  // Double backtick code span: ``...`` (allowing single backticks inside)
  let processed = text.replace(/``((?:[^`]|`[^`])+)``/g, (_match, code) => {
    const token = `\uE000CODETOKEN${codeTokens.length}\uE000`;
    codeTokens.push(`<code>${escapeHtml(code.trim())}</code>`);
    return token;
  });
  // Single backtick code span: `...`
  processed = processed.replace(/`([^`]+?)`/g, (_match, code) => {
    const token = `\uE000CODETOKEN${codeTokens.length}\uE000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  // Step 2: Protect inline LaTeX math $...$
  const mathTokens: string[] = [];
  processed = processed.replace(/(?<!\\)\$(?!\s|\$)(.+?)(?<!\s)\$(?!\d)/g, (match, formula) => {
    // If formula is purely numbers, keep it as regular currency (e.g. $50, $100.00)
    if (/^\d+([.,]\d+)?$/.test(formula.trim())) {
      return match;
    }
    const token = `\uE001MATHTOKEN${mathTokens.length}\uE001`;
    let rendered = '';
    try {
      rendered = katex.renderToString(formula, { displayMode: false, throwOnError: false });
    } catch {
      rendered = escapeHtml(formula);
    }
    mathTokens.push(
      `<span data-type="math-inline" data-code="${encodeURIComponent(formula)}" class="math-inline">${rendered}</span>`
    );
    return token;
  });

  // Step 3: Bold + Italic
  processed = processed
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/___(.*?)___/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/(?:^|\s)_(.*?)_(?:\s|$)/g, ' <em>$1</em> ')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Step 4: Restore protected math and code tokens
  mathTokens.forEach((tokenHtml, idx) => {
    processed = processed.replaceAll(`\uE001MATHTOKEN${idx}\uE001`, tokenHtml);
  });
  codeTokens.forEach((tokenHtml, idx) => {
    processed = processed.replaceAll(`\uE000CODETOKEN${idx}\uE000`, tokenHtml);
  });

  return processed;
}

/**
 * Converts Markdown string into clean, semantic HTML suitable for Tiptap editor.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let inMathBlock = false;
  let mathBlockContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  interface ListLevel {
    type: 'ul' | 'ol' | 'taskList';
    indent: number;
    itemOpen: boolean;
  }
  const listStack: ListLevel[] = [];

  const closeItem = (top: ListLevel) => {
    if (!top.itemOpen) return;
    if (output.length > 0 && !output[output.length - 1].endsWith('</li>') && !output[output.length - 1].endsWith('</ul>') && !output[output.length - 1].endsWith('</ol>')) {
      output[output.length - 1] += '</li>';
    } else {
      output.push('</li>');
    }
    top.itemOpen = false;
  };

  const closeTopLevel = () => {
    if (listStack.length === 0) return;
    const top = listStack.pop()!;
    closeItem(top);
    if (top.type === 'ol') {
      output.push('</ol>');
    } else {
      output.push('</ul>');
    }
  };

  const flushList = () => {
    while (listStack.length > 0) {
      closeTopLevel();
    }
  };

  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  const flushBlockquote = () => {
    if (!inBlockquote) return;

    const lines = blockquoteLines;
    inBlockquote = false;
    blockquoteLines = [];

    if (lines.length === 0) return;

    const firstLine = lines[0].trim();
    const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

    if (alertMatch) {
      const type = alertMatch[1].toUpperCase();
      const bodyMarkdown = lines.slice(1).join('\n');
      // Parse the alert body as full Markdown so tables, code fences and
      // nested lists inside a callout keep their structure instead of being
      // flattened into plain paragraphs.
      const bodyHtml = bodyMarkdown.trim() ? markdownToHtml(bodyMarkdown) : '';
      const borderClass = type === 'IMPORTANT' || type === 'WARNING' || type === 'CAUTION' ? 'border-amber-500 bg-amber-50/60' : 'border-sky-500 bg-sky-50/60';
      output.push(
        `<blockquote class="callout callout-${type.toLowerCase()} my-4 p-4 rounded-xl border-l-4 ${borderClass} not-italic text-slate-800" data-callout="${type}"><strong class="callout-title block font-semibold text-xs uppercase tracking-wider mb-1.5 text-slate-900">${type}</strong>${bodyHtml}</blockquote>`
      );
    } else {
      // A blockquote can contain any block-level Markdown (headings, GFM
      // tables, fenced code, rules, nested quotes...). Recursively parse the
      // de-prefixed body so the ProseMirror document keeps that structure
      // instead of collapsing everything into one italic paragraph.
      const innerHtml = markdownToHtml(lines.join('\n'));
      output.push(`<blockquote>${innerHtml || '<p></p>'}</blockquote>`);
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<table class="gfm-table"><thead><tr>';
      const headerRow = tableRows[0];
      for (const cell of headerRow) {
        tableHtml += `<th>${parseInline(cell.trim())}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';

      for (let i = 1; i < tableRows.length; i++) {
        tableHtml += '<tr>';
        for (const cell of tableRows[i]) {
          tableHtml += `<td>${parseInline(cell.trim())}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      output.push(tableHtml);
      inTable = false;
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code fence boundary
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // Closing fence
        const content = codeBlockContent.join('\n');
        if (codeBlockLang === 'echarts') {
          output.push(`<div data-type="echarts" data-code="${encodeURIComponent(content)}"><pre class="hidden">${escapeHtml(content)}</pre></div>`);
        } else if (codeBlockLang === 'mermaid') {
          output.push(`<div data-type="mermaid" data-code="${encodeURIComponent(content)}"><pre class="hidden">${escapeHtml(content)}</pre></div>`);
        } else if (codeBlockLang === 'math' || codeBlockLang === 'latex') {
          output.push(`<div data-type="math-block" data-code="${encodeURIComponent(content)}"><pre class="hidden">${escapeHtml(content)}</pre></div>`);
        } else {
          output.push(`<pre><code class="language-${codeBlockLang}">${escapeHtml(content)}</code></pre>`);
        }
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockContent = [];
        continue;
      } else {
        // Opening fence
        flushTable();
        flushList();
        flushBlockquote();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockContent = [];
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Handle $$ math block
    if (line.trim().startsWith('$$')) {
      if (inMathBlock) {
        // Closing $$
        const content = mathBlockContent.join('\n');
        output.push(`<div data-type="math-block" data-code="${encodeURIComponent(content)}"><pre class="hidden">${escapeHtml(content)}</pre></div>`);
        inMathBlock = false;
        mathBlockContent = [];
        continue;
      } else {
        const trimmed = line.trim();
        // Check single-line $$ formula $$
        if (trimmed.length > 2 && trimmed.endsWith('$$')) {
          flushTable();
          flushList();
          flushBlockquote();
          const formula = trimmed.slice(2, -2).trim();
          output.push(`<div data-type="math-block" data-code="${encodeURIComponent(formula)}"><pre class="hidden">${escapeHtml(formula)}</pre></div>`);
          continue;
        } else {
          // Multi-line $$ opening
          flushTable();
          flushList();
          flushBlockquote();
          inMathBlock = true;
          mathBlockContent = [];
          continue;
        }
      }
    }

    if (inMathBlock) {
      mathBlockContent.push(line);
      continue;
    }

    // Handle Tables (| col 1 | col 2 |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      flushBlockquote();
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      // Check if delimiter row (| --- | --- |)
      const isDelimiter = cells.every(c => /^:?-+:?$/.test(c));
      if (isDelimiter) {
        inTable = true;
        continue;
      }

      inTable = true;
      tableRows.push(cells);
      continue;
    } else {
      flushTable();
    }

    // Blockquote (> text)
    const bqMatch = line.match(/^(\s*)>\s?(.*)$/);
    if (bqMatch) {
      flushList();
      inBlockquote = true;
      blockquoteLines.push(bqMatch[2]);
      continue;
    } else {
      flushBlockquote();
    }

    // Horizontal rule (--- or ***)
    if (/^(---|___|\*\*\*)$/.test(line.trim())) {
      flushList();
      output.push('<hr />');
      continue;
    }

    // Headings (# H1 to ###### H6)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2];
      const text = parseInline(rawTitle);
      const slug = slugifyHeading(rawTitle);
      output.push(`<h${level} id="${slug}">${text}</h${level}>`);
      continue;
    }

    // GFM Task Item (- [x] item or - [ ] item)
    // GFM Task Item (- [x] item or - [ ] item)
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    // Unordered List (- item or * item)
    const ulMatch = !taskMatch ? line.match(/^(\s*)[-*+]\s+(.*)$/) : null;
    // Ordered List (1. item)
    const olMatch = !taskMatch && !ulMatch ? line.match(/^(\s*)(\d+)\.\s+(.*)$/) : null;

    if (taskMatch || ulMatch || olMatch) {
      flushTable();
      flushBlockquote();

      const rawSpaces = (taskMatch || ulMatch || olMatch)![1];
      const indent = rawSpaces.replace(/\t/g, '  ').length;

      let itemType: 'ul' | 'ol' | 'taskList' = 'ul';
      let itemContentHtml = '';
      let olStart = 1;

      if (taskMatch) {
        itemType = 'taskList';
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const itemContent = parseInline(taskMatch[3]);
        itemContentHtml = `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${isChecked ? 'checked="checked"' : ''}><span></span></label><div><p>${itemContent}</p></div>`;
      } else if (ulMatch) {
        itemType = 'ul';
        itemContentHtml = `<li>${parseInline(ulMatch[2])}`;
      } else if (olMatch) {
        itemType = 'ol';
        olStart = parseInt(olMatch[2], 10);
        itemContentHtml = `<li>${parseInline(olMatch[3])}`;
      }

      const openListTag = (type: 'ul' | 'ol' | 'taskList', start: number) => {
        if (type === 'ol') {
          return start !== 1 ? `<ol start="${start}">` : '<ol>';
        } else if (type === 'taskList') {
          return '<ul data-type="taskList">';
        }
        return '<ul>';
      };

      if (listStack.length === 0) {
        output.push(openListTag(itemType, olStart));
        output.push(itemContentHtml);
        listStack.push({ type: itemType, indent, itemOpen: true });
        continue;
      }

      const current = listStack[listStack.length - 1];

      if (indent > current.indent) {
        // Child list nested within open <li> of current level
        output.push(openListTag(itemType, olStart));
        output.push(itemContentHtml);
        listStack.push({ type: itemType, indent, itemOpen: true });
      } else if (indent < current.indent) {
        // Unindent: close child levels until reaching matching or parent indent
        while (listStack.length > 1 && listStack[listStack.length - 1].indent > indent) {
          closeTopLevel();
        }
        const top = listStack[listStack.length - 1];
        if (top.indent === indent && top.type === itemType) {
          closeItem(top);
          output.push(itemContentHtml);
          top.itemOpen = true;
        } else {
          if (top.indent === indent) {
            closeTopLevel();
          }
          output.push(openListTag(itemType, olStart));
          output.push(itemContentHtml);
          listStack.push({ type: itemType, indent, itemOpen: true });
        }
      } else {
        // Same indent as current
        if (current.type === itemType) {
          closeItem(current);
          output.push(itemContentHtml);
          current.itemOpen = true;
        } else {
          closeTopLevel();
          output.push(openListTag(itemType, olStart));
          output.push(itemContentHtml);
          listStack.push({ type: itemType, indent, itemOpen: true });
        }
      }
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Standard paragraph
    flushList();
    output.push(`<p>${parseInline(line)}</p>`);
  }

  flushTable();
  flushList();
  flushBlockquote();

  return output.join('\n');
}

/**
 * Converts HTML content from Tiptap back into clean GitHub Flavored Markdown.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  // Use DOM parser if in browser or JSDOM environment
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return nodeToMarkdown(doc.body).trim();
  }

  // Regex fallback for pure SSR environments without DOM
  return html
    .replace(/<div data-type="math-block" data-code="([^"]+)">[\s\S]*?<\/div>/gi, (_m, code) => {
      try { return `\n\n$$\n${decodeURIComponent(code).trim()}\n$$\n\n`; } catch { return `\n\n$$\n${code.trim()}\n$$\n\n`; }
    })
    .replace(/<span data-type="math-inline" data-code="([^"]+)">[\s\S]*?<\/span>/gi, (_m, code) => {
      try { return `$${decodeURIComponent(code)}$`; } catch { return `$${code}$`; }
    })
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .trim();
}

/**
 * Prefix every line of a Markdown block with the GFM blockquote marker.
 * Blank lines become a bare ">" so fenced code blocks, tables and headings
 * inside the quote stay inside it when the document is reloaded.
 */
function prefixBlockquote(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * Convert a <ul> or <ol> element to Markdown, supporting arbitrary nesting depth.
 */
function listToMarkdown(el: HTMLElement, depth: number): string {
  const isOrdered = el.tagName.toLowerCase() === 'ol';
  const isTaskList = el.getAttribute('data-type') === 'taskList' || el.classList.contains('task-list');
  const items = Array.from(el.querySelectorAll(':scope > li'));
  const indent = '  '.repeat(depth);
  const startNum = isOrdered && el.getAttribute('start') ? parseInt(el.getAttribute('start')!, 10) : 1;
  const lines: string[] = [];

  items.forEach((li, idx) => {
    const childLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(':scope > ul, :scope > ol, input, label').forEach(n => n.remove());
    const directText = nodeToMarkdown(clone, depth).trim();

    let prefix = '';
    if (isOrdered) {
      prefix = `${indent}${idx + startNum}. `;
    } else if (isTaskList || li.getAttribute('data-type') === 'taskItem' || !!li.querySelector('input[type="checkbox"]')) {
      const input = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const checked = input ? input.checked : (li.getAttribute('data-checked') === 'true' || li.getAttribute('aria-checked') === 'true');
      prefix = `${indent}- [${checked ? 'x' : ' '}] `;
    } else {
      prefix = `${indent}- `;
    }

    lines.push(`${prefix}${directText}`);

    childLists.forEach(child => {
      const childMd = listToMarkdown(child as HTMLElement, depth + 1);
      if (childMd.trim()) {
        lines.push(childMd.trimEnd());
      }
    });
  });

  return lines.join('\n');
}

/**
 * Recursive DOM node to markdown converter.
 */
function nodeToMarkdown(node: Node, depth: number = 0): string {
  let result = '';

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];

    if (child.nodeType === 3) {
      // Text node
      result += child.textContent || '';
      continue;
    }

    if (child.nodeType !== 1) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Check custom ECharts node
    if (el.getAttribute('data-type') === 'echarts') {
      const raw = el.getAttribute('data-code') || el.innerText || '';
      let code = raw;
      try { code = decodeURIComponent(raw); } catch { /* ignore */ }
      result += `\n\n\`\`\`echarts\n${code.trim()}\n\`\`\`\n\n`;
      continue;
    }

    // Check custom Mermaid node
    if (el.getAttribute('data-type') === 'mermaid') {
      const raw = el.getAttribute('data-code') || el.innerText || '';
      let code = raw;
      try { code = decodeURIComponent(raw); } catch { /* ignore */ }
      result += `\n\n\`\`\`mermaid\n${code.trim()}\n\`\`\`\n\n`;
      continue;
    }

    // Check custom Math block node
    if (el.getAttribute('data-type') === 'math-block') {
      const raw = el.getAttribute('data-code') || el.innerText || '';
      let code = raw;
      try { code = decodeURIComponent(raw); } catch { /* ignore */ }
      result += `\n\n$$\n${code.trim()}\n$$\n\n`;
      continue;
    }

    // Check custom Math inline node
    if (el.getAttribute('data-type') === 'math-inline') {
      const raw = el.getAttribute('data-code') || '';
      let code = raw;
      try { code = decodeURIComponent(raw); } catch { /* ignore */ }
      result += `$${code}$`;
      continue;
    }

    // Check callout alerts
    if (el.hasAttribute('data-callout')) {
      const calloutType = el.getAttribute('data-callout') || 'NOTE';
      // Drop the synthesized title so it is not duplicated in the source, then
      // serialize the body as Markdown and quote every line it produces.
      const body = el.cloneNode(true) as HTMLElement;
      body.querySelectorAll('.callout-title').forEach((title) => title.remove());
      const bodyMarkdown = nodeToMarkdown(body).trim();
      result += `\n\n> [!${calloutType}]\n${prefixBlockquote(bodyMarkdown)}\n\n`;
      continue;
    }

    switch (tag) {
      case 'h1':
        result += `\n\n# ${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'h2':
        result += `\n\n## ${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'h3':
        result += `\n\n### ${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'h4':
        result += `\n\n#### ${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'h5':
        result += `\n\n##### ${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'h6':
        result += `\n\n###### ${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'p':
        result += `\n\n${nodeToMarkdown(el).trim()}\n\n`;
        break;
      case 'strong':
      case 'b':
        result += `**${nodeToMarkdown(el)}**`;
        break;
      case 'em':
      case 'i':
        result += `*${nodeToMarkdown(el)}*`;
        break;
      case 'code':
        result += `\`${el.textContent || ''}\``;
        break;
      case 'pre': {
        const codeChild = el.querySelector('code');
        let lang = '';
        if (codeChild && codeChild.className) {
          const m = codeChild.className.match(/language-(\S+)/);
          if (m) lang = m[1];
        }
        if (lang === 'math' || lang === 'latex') {
          const codeText = codeChild ? codeChild.textContent : el.textContent;
          result += `\n\n$$\n${(codeText || '').trim()}\n$$\n\n`;
          break;
        }
        const codeText = codeChild ? codeChild.textContent : el.textContent;
        result += `\n\n\`\`\`${lang}\n${codeText || ''}\n\`\`\`\n\n`;
        break;
      }
      case 'blockquote': {
        const innerMarkdown = nodeToMarkdown(el).trim();
        result += `\n\n${prefixBlockquote(innerMarkdown)}\n\n`;
        break;
      }
      case 'hr':
        result += '\n\n---\n\n';
        break;
      case 'ul':
      case 'ol': {
        const listContent = listToMarkdown(el, depth);
        result += depth === 0 ? `\n\n${listContent}\n\n` : listContent;
        break;
      }
      case 'table': {
        result += '\n\n' + formatTableToMarkdown(el) + '\n\n';
        break;
      }
      case 'a': {
        const href = el.getAttribute('href') || '#';
        result += `[${nodeToMarkdown(el, depth)}](${href})`;
        break;
      }
      default:
        result += nodeToMarkdown(el, depth);
    }
  }

  // Normalize excessive newlines
  return result.replace(/\n{3,}/g, '\n\n');
}

/**
 * Formats a DOM <table> element into clean GitHub Flavored Markdown table.
 */
function formatTableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const matrix: string[][] = [];

  rows.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('th, td'));
    matrix.push(cells.map(cell => nodeToMarkdown(cell).replace(/\n/g, ' ').trim()));
  });

  if (matrix.length === 0 || matrix[0].length === 0) return '';

  const colCount = Math.max(...matrix.map(r => r.length));
  // Normalize row cell counts
  matrix.forEach(r => {
    while (r.length < colCount) r.push('');
  });

  const headerRow = matrix[0];
  const delimiterRow = Array(colCount).fill('---');
  const dataRows = matrix.slice(1);

  const lines: string[] = [];
  lines.push(`| ${headerRow.join(' | ')} |`);
  lines.push(`| ${delimiterRow.join(' | ')} |`);

  dataRows.forEach(row => {
    lines.push(`| ${row.join(' | ')} |`);
  });

  return lines.join('\n');
}
