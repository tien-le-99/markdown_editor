import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from '@/components/editor/utils/markdown-serializer';

describe('AST & Markdown Serializer Two-Way Conversion', () => {
  it('converts basic markdown formatting to HTML and back', () => {
    const markdown = `# Main Title

This is **bold** text and *italic* text with \`inline code\`.

> This is a blockquote.

* First bullet
* Second bullet`;

    const html = markdownToHtml(markdown);
    expect(html).toContain('id="main-title"');
    expect(html).toContain('Main Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>inline code</code>');
    expect(html).toContain('<blockquote><p>This is a blockquote.</p></blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>First bullet</li>');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('# Main Title');
    expect(roundtrip).toContain('**bold**');
    expect(roundtrip).toContain('*italic*');
    expect(roundtrip).toContain('`inline code`');
    expect(roundtrip).toContain('> This is a blockquote.');
  });

  it('converts GFM tables without corruption', () => {
    const tableMarkdown = `| Quarter | Revenue | Growth |
| --- | --- | --- |
| Q1 2026 | $42.8M | +18% |
| Q2 2026 | $51.2M | +20% |`;

    const html = markdownToHtml(tableMarkdown);
    expect(html).toContain('<table class="gfm-table">');
    expect(html).toContain('<th>Quarter</th>');
    expect(html).toContain('<td>Q1 2026</td>');
    expect(html).toContain('<td>$42.8M</td>');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('| Quarter | Revenue | Growth |');
    expect(roundtrip).toContain('| Q1 2026 | $42.8M | +18% |');
    expect(roundtrip).toContain('| Q2 2026 | $51.2M | +20% |');
  });

  it('correctly handles custom ```echarts code fence blocks', () => {
    const chartJson = JSON.stringify({
      title: { text: 'Sales' },
      xAxis: { type: 'category', data: ['A', 'B'] },
      series: [{ type: 'bar', data: [10, 20] }]
    }, null, 2);

    const markdown = `\`\`\`echarts\n${chartJson}\n\`\`\``;

    const html = markdownToHtml(markdown);
    expect(html).toContain('data-type="echarts"');
    expect(html).toContain('data-code=');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('```echarts');
    expect(roundtrip).toContain('"Sales"');
    expect(roundtrip).toContain('```');
  });

  it('correctly handles custom ```mermaid code fence blocks', () => {
    const mermaidCode = `sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice`;

    const markdown = `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;

    const html = markdownToHtml(markdown);
    expect(html).toContain('data-type="mermaid"');
    expect(html).toContain('data-code=');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('```mermaid');
    expect(roundtrip).toContain('Alice->>Bob: Hello Bob');
    expect(roundtrip).toContain('```');
  });

  it('handles standard syntax code blocks (typescript, python)', () => {
    const code = `\`\`\`typescript\nconst x: number = 42;\nconsole.log(x);\n\`\`\``;
    const html = markdownToHtml(code);
    expect(html).toContain('<pre><code class="language-typescript">');
    expect(html).toContain('const x: number = 42;');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('```typescript');
    expect(roundtrip).toContain('const x: number = 42;');
  });

  it('preserves underscores inside inline code tokens without corrupting to italics', () => {
    const md = 'Inspect `AWS_Architecture_Diagram.md` and `cantier_admin_be` and `x-amzn-marketplace-token`.';
    const html = markdownToHtml(md);

    expect(html).toContain('<code>AWS_Architecture_Diagram.md</code>');
    expect(html).toContain('<code>cantier_admin_be</code>');
    expect(html).not.toContain('<em>Architecture</em>');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('`AWS_Architecture_Diagram.md`');
    expect(roundtrip).toContain('`cantier_admin_be`');
  });

  it('generates GitHub-compliant slug IDs on headings for anchor links', () => {
    const md = '## 1.1 Tenant & Account Registration and Provisioning via Control Tower';
    const html = markdownToHtml(md);

    expect(html).toContain('id="11-tenant--account-registration-and-provisioning-via-control-tower"');
    expect(html).toContain('>1.1 Tenant & Account Registration and Provisioning via Control Tower</h2>');
  });

  it('parses and roundtrips GFM task item checkboxes', () => {
    const md = `- [x] **Verified step 1**\n- [ ] Pending step 2`;
    const html = markdownToHtml(md);

    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('checked');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('- [x] **Verified step 1**');
    expect(roundtrip).toContain('- [ ] Pending step 2');
  });

  it('keeps block-level structure inside blockquotes (headings, tables, code, rules)', () => {
    const md = `> Hi team,
>
> ### 1. Connection Parameters
>
> | Setting | Value |
> | --- | --- |
> | **Tunnel 1** | \`13.215.75.147\` |
>
> \`\`\`bash
> ping 10.0.3.181
> \`\`\`
>
> ---
>
> Done.`;

    const html = markdownToHtml(md);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<h3 id="1-connection-parameters">');
    expect(html).toContain('<table class="gfm-table">');
    expect(html).toContain('<pre><code class="language-bash">ping 10.0.3.181</code></pre>');
    expect(html).toContain('<hr />');
    expect(html).not.toContain('### 1. Connection Parameters');
    expect(html).not.toContain('| Setting | Value |');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('> Hi team,');
    expect(roundtrip).toContain('> ### 1. Connection Parameters');
    expect(roundtrip).toContain('> | Setting | Value |');
    expect(roundtrip).toContain('> ```bash');
    expect(roundtrip).toContain('> ping 10.0.3.181');
    expect(roundtrip).toContain('> ---');
    expect(roundtrip).toContain('> Done.');
  });

  it('parses GitHub alert callout blocks', () => {
    const md = `> [!IMPORTANT]\n> **ZERO DATA LOSS GUARANTEE**:\n> The database is preserved.`;
    const html = markdownToHtml(md);

    expect(html).toContain('data-callout="IMPORTANT"');
    expect(html).toContain('ZERO DATA LOSS GUARANTEE');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('> [!IMPORTANT]');
    expect(roundtrip).toContain('> **ZERO DATA LOSS GUARANTEE**:');
    expect(roundtrip).toContain('> The database is preserved.');
    expect(roundtrip).not.toContain('> IMPORTANT');
  });

  it('correctly handles AI-generated strings in backticks and double backtick code spans', () => {
    const md = 'AI generated `"string value"` and ``special ` code`` and `036486583523`.';
    const html = markdownToHtml(md);

    expect(html).toContain('<code>&quot;string value&quot;</code>');
    expect(html).toContain('<code>special ` code</code>');
    expect(html).toContain('<code>036486583523</code>');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('`"string value"`');
    expect(roundtrip).toContain('`036486583523`');
  });

  it('preserves ordered list numbering across code blocks and nested items using start attribute', () => {
    const md = `1. **Grant Permissions**: Step 1
2. **Change AMI ID**: Step 2
\`\`\`diff
- old
+ new
\`\`\`
3. **Commit & Push**: Step 3
\`\`\`bash
git push
\`\`\`
4. **Deploy**: Step 4
- *New tenants*: sub item 1
- *Existing tenants*: sub item 2
5. **Zero Data Loss**: Step 5`;

    const html = markdownToHtml(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<ol start="4">');
    expect(html).toContain('<ol start="5">');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('1. **Grant Permissions**: Step 1');
    expect(roundtrip).toContain('2. **Change AMI ID**: Step 2');
    expect(roundtrip).toContain('3. **Commit & Push**: Step 3');
    expect(roundtrip).toContain('4. **Deploy**: Step 4');
    expect(roundtrip).toContain('5. **Zero Data Loss**: Step 5');
  });

  it('correctly parses and roundtrips multi-level nested lists with sub-bullets', () => {
    const md = `- **AWS Management Console (Account \`036486583523\`)**:
  - **Account Visibility**: Appears under **Control Tower > Organization > Accounts** within the managed OU.
  - **Governance & Guardrails**: Automatic SCPs enforce encrypted EBS/RDS.
  - **Identity Center (AWS SSO)**: Scoped permissions.
- **Cantier Admin UI**:
  - Surfaces tenant status (\`PROVISIONING\`, \`ACTIVE\`).
  - Displays Target Account ID.`;

    const html = markdownToHtml(md);
    // Outer list
    expect(html).toContain('<ul>');
    // Inner nested lists
    expect(html).toContain('<ul>\n<li><strong>Account Visibility</strong>:');
    expect(html).toContain('<ul>\n<li>Surfaces tenant status');

    const roundtrip = htmlToMarkdown(html);
    expect(roundtrip).toContain('- **AWS Management Console (Account `036486583523`)**:');
    expect(roundtrip).toContain('  - **Account Visibility**: Appears under **Control Tower > Organization > Accounts** within the managed OU.');
    expect(roundtrip).toContain('  - **Governance & Guardrails**: Automatic SCPs enforce encrypted EBS/RDS.');
    expect(roundtrip).toContain('  - **Identity Center (AWS SSO)**: Scoped permissions.');
    expect(roundtrip).toContain('- **Cantier Admin UI**:');
    expect(roundtrip).toContain('  - Surfaces tenant status (`PROVISIONING`, `ACTIVE`).');
    expect(roundtrip).toContain('  - Displays Target Account ID.');
  });
});

