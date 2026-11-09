import { describe, it, expect } from 'vitest';
import { parseArgs, commandHelp, topHelp } from '../../scripts/cli-parse.mjs';

describe('cli parseArgs', () => {
  it('shows top help with no args or --help', () => {
    expect(parseArgs([]).flags.help).toBe(true);
    expect(parseArgs(['--help']).flags.help).toBe(true);
    expect(topHelp()).toContain('export-pdf');
  });

  it('rejects unknown commands and flags', () => {
    expect(parseArgs(['frobnicate']).error).toMatch(/Unknown command/);
    expect(parseArgs(['shot', '--input', 'a.md', '--out', 'b.png', '--bogus', 'x']).error).toMatch(
      /Unknown flag/
    );
    expect(parseArgs(['shot', '--nope']).error).toMatch(/needs a value|Unknown flag/);
  });

  it('requires per-command flags', () => {
    expect(parseArgs(['export-pdf', '--input', 'a.md']).error).toMatch(/--out/);
    expect(parseArgs(['pdf-shot', '--input', 'a.pdf', '--page', '7']).error).toMatch(/--out/);
  });

  it('parses --flag value and --flag=value forms plus booleans', () => {
    const a = parseArgs(['export-pdf', '--input', 'a.md', '--out=b.pdf', '--mode', 'paginate']);
    expect(a.error).toBeNull();
    expect(a.command).toBe('export-pdf');
    expect(a.flags).toMatchObject({ input: 'a.md', out: 'b.pdf', mode: 'paginate' });
    const b = parseArgs(['shot', '--input', 'a.md', '--out', 'b.png', '--full-page']);
    expect(b.error).toBeNull();
    expect(b.flags.fullPage).toBe(true);
    expect(parseArgs(['pdf-shot', '--help']).flags.help).toBe(true);
  });

  it('validates modes, integers, viewbox and pdf-shot server misuse', () => {    expect(parseArgs(['export-pdf', '--input', 'a', '--out', 'b', '--mode', 'rotato']).error).toMatch(
      /Invalid --mode/
    );
    expect(parseArgs(['pdf-shot', '--input', 'a', '--page', '0', '--out', 'b']).error).toMatch(
      /positive integer/
    );
    expect(parseArgs(['pdf-shot', '--input', 'a', '--page', '7', '--out', 'b', '--server', 'x']).error).toMatch(
      /does not apply/
    );
    expect(
      parseArgs(['shot-diagram', '--input', 'a', '--out', 'b', '--viewbox', '1,2,3']).error
    ).toMatch(/x,y,w,h/);
    expect(commandHelp('pdf-shot')).toContain('--page');
  });

  it('validates the pdf-shot dpr multiplier', () => {
    const ok = (dpr) =>
      parseArgs(['pdf-shot', '--input', 'a', '--page', '7', '--out', 'b', '--dpr', dpr]).error;
    expect(ok('3')).toBeNull();
    expect(ok('1')).toBeNull();
    expect(ok('0')).toMatch(/dpr/);
    expect(ok('7')).toMatch(/dpr/);
    expect(ok('1.5')).toMatch(/dpr/);
  });

  it('validates the pdf-render scale factor', () => {
    const run = (extra) => parseArgs(['pdf-render', '--input', 'a', '--page', '2', '--out', 'b', ...extra]).error;
    expect(run([])).toBeNull();
    expect(run(['--scale', '4'])).toBeNull();
    expect(run(['--scale', '0'])).toMatch(/scale/);
    expect(run(['--scale', '9'])).toMatch(/scale/);
    expect(run(['--scale', 'x'])).toMatch(/scale/);
  });

  it('accepts per-diagram layout flags and validates them', () => {
    const run = (extra) =>
      parseArgs(['shot-diagram', '--input', 'a', '--out', 'b', ...extra]);
    expect(run(['--curve', 'basis']).error).toBeNull();
    expect(run(['--curve', 'wavy']).error).toMatch(/curve/);
    expect(run(['--line-gap', '30', '--box-gap', '24']).error).toBeNull();
    expect(run(['--box-gap', '-5']).error).toMatch(/box-gap/);
    expect(run(['--node-spacing', 'abc']).error).toMatch(/node-spacing/);
    const ok = run(['--curve', 'linear', '--node-spacing', '80', '--rank-spacing', '100', '--padding', '10']);
    expect(ok.error).toBeNull();
    expect(ok.flags).toMatchObject({ curve: 'linear', nodeSpacing: '80', rankSpacing: '100', padding: '10' });
  });
});
