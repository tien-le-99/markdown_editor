import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from '@/components/editor/utils/markdown-serializer';
import katex from 'katex';

describe('LaTeX Math AST Parsing & Bidirectional Serialization', () => {
  it('converts inline LaTeX formulas like $E = mc^2$ to KaTeX and roundtrips', () => {
    const md = 'Energy mass equivalence is defined by $E = mc^2$ in modern physics.';
    const html = markdownToHtml(md);

    expect(html).toContain('data-type="math-inline"');
    expect(html).toContain('data-code="E%20%3D%20mc%5E2"');
    expect(html).toContain('class="katex"');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('$E = mc^2$');
  });

  it('correctly handles transition vectors like $\\rightarrow$ from DEMO.md', () => {
    const md = 'Portal signup $\\rightarrow$ Step Functions vending $\\rightarrow$ CodePipeline Terraform apply';
    const html = markdownToHtml(md);

    expect(html).toContain('data-type="math-inline"');
    expect(html).toContain('class="katex"');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('Portal signup $\\rightarrow$ Step Functions vending $\\rightarrow$ CodePipeline Terraform apply');
  });

  it('does not confuse standard currency amounts with LaTeX math', () => {
    const md = 'Total contract revenue was $50.00 and average subscription cost was $100 per month.';
    const html = markdownToHtml(md);

    expect(html).not.toContain('data-type="math-inline"');
    expect(html).toContain('$50.00');
    expect(html).toContain('$100');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('$50.00');
    expect(roundtrip).toContain('$100');
  });

  it('converts single-line display math $$ formula $$ and roundtrips', () => {
    const md = '$$ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} $$';
    const html = markdownToHtml(md);

    expect(html).toContain('data-type="math-block"');
    expect(html).toContain('data-code=');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('$$');
    expect(roundtrip).toContain('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
  });

  it('converts multi-line display math $$ ... $$ and roundtrips', () => {
    const md = `$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$`;
    const html = markdownToHtml(md);

    expect(html).toContain('data-type="math-block"');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('$$');
    expect(roundtrip).toContain('\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}');
  });

  it('converts ```math and ```latex code fences into math blocks', () => {
    const mathFence = `\`\`\`math
e^{i\\pi} + 1 = 0
\`\`\``;

    const html = markdownToHtml(mathFence);
    expect(html).toContain('data-type="math-block"');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('$$');
    expect(roundtrip).toContain('e^{i\\pi} + 1 = 0');
  });

  it('handles KaTeX rendering resilience without throwing unhandled exceptions', () => {
    // Malformed LaTeX formula
    const brokenFormula = '\\frac{unclosed';
    let didThrow = false;
    let rendered = '';
    try {
      rendered = katex.renderToString(brokenFormula, { displayMode: false, throwOnError: false });
    } catch {
      didThrow = true;
    }

    expect(didThrow).toBe(false);
    expect(rendered).toContain('katex-error');
  });
});
