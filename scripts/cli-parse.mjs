/**
 * Pure argv parser for the markdown_editor test CLI (no side effects,
 * unit-tested). Hand-rolled: zero dependencies.
 *
 * Usage shape:
 *   cli <command> [--flag value | --flag=value] [--bool-flag]
 */

export const COMMANDS = ['export-pdf', 'pdf-info', 'pdf-shot', 'pdf-render', 'shot', 'shot-diagram'];

const BOOLEAN_FLAGS = new Set(['help', 'full-page']);

const VALUE_FLAGS = new Set([
  'server',
  'input',
  'out',
  'mode',
  'page',
  'width',
  'dpr',
  'scale',
  'settle',
  'timeout',
  'viewbox',
  // Per-diagram layout overrides (export-pdf, shot, shot-diagram).
  'curve',
  'node-spacing',
  'rank-spacing',
  'padding',
  'line-gap',
  'box-gap',
]);

export const PDF_MODES = ['enlarge', 'landscape', 'rotate', 'fit', 'paginate'];

/** Mirror of MERMAID_CURVE_OPTIONS in MermaidNode.tsx (kept in sync by hand). */
export const MERMAID_CURVES = [
  'stepBefore',
  'stepAfter',
  'linear',
  'basis',
  'cardinal',
  'monotoneX',
  'bumpX',
  'natural',
];

/**
 * Parse raw argv (without node/script prefix) into { command, flags, error }.
 * `error` is a human-readable message when parsing fails; callers print help.
 */
export function parseArgs(argv) {
  const out = { command: null, flags: {}, error: null };
  const args = [...argv];

  // Top-level --help with no command.
  if (args.length === 0 || (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))) {
    out.flags.help = true;
    return out;
  }

  const [maybeCommand, ...rest] = args;
  if (!COMMANDS.includes(maybeCommand)) {
    out.error = `Unknown command "${maybeCommand}".`;
    return out;
  }
  out.command = maybeCommand;

  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--help' || tok === '-h') {
      out.flags.help = true;
      continue;
    }
    const m = tok.match(/^--([a-z-]+)(=(.*))?$/);
    if (!m) {
      out.error = `Unexpected argument "${tok}". Flags look like --flag value or --flag=value.`;
      return out;
    }
    const name = m[1];
    if (BOOLEAN_FLAGS.has(name) && name !== 'help') {
      if (m[3] !== undefined) {
        out.error = `Flag --${name} takes no value.`;
        return out;
      }
      out.flags[camel(name)] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      out.error = `Unknown flag --${name}.`;
      return out;
    }
    let value = m[3];
    if (value === undefined) {
      value = rest[++i];
      if (value === undefined || value.startsWith('--')) {
        out.error = `Flag --${name} needs a value.`;
        return out;
      }
    }
    out.flags[camel(name)] = value;
  }

  const need = {
    'export-pdf': ['input', 'out'],
    'pdf-info': ['input'],
    'pdf-shot': ['input', 'page', 'out'],
    'pdf-render': ['input', 'page', 'out'],
    shot: ['input', 'out'],
    'shot-diagram': ['input', 'out'],
  }[out.command];
  const missing = need.filter((k) => out.flags[k] === undefined);
  if (missing.length > 0 && !out.flags.help) {
    out.error = `Missing required flag(s): ${missing.map((k) => `--${k}`).join(', ')}.`;
    return out;
  }

  // Typed validation.
  const check = validateFlags(out.command, out.flags);
  if (check) {
    out.error = check;
    return out;
  }
  return out;
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function isPositiveInt(v) {
  return /^\d+$/.test(v) && Number(v) > 0;
}

function validateFlags(command, flags) {
  if (flags.mode !== undefined && !PDF_MODES.includes(flags.mode)) {
    return `Invalid --mode "${flags.mode}". Pick one of: ${PDF_MODES.join(', ')}.`;
  }
  for (const k of ['page', 'width', 'settle', 'timeout']) {
    if (flags[k] !== undefined && !isPositiveInt(String(flags[k]))) {
      return `Invalid --${k} "${flags[k]}". Want a positive integer.`;
    }
  }
  if (flags.dpr !== undefined && !/^[1-4]$/.test(String(flags.dpr))) {
    return `Invalid --dpr "${flags.dpr}". Want 1, 2, 3 or 4 (render resolution multiplier).`;
  }
  if (flags.scale !== undefined && !/^[1-6]$/.test(String(flags.scale))) {
    return `Invalid --scale "${flags.scale}". Want 1-6 (PDF points to PNG pixels).`;
  }
  if (flags.curve !== undefined && !MERMAID_CURVES.includes(flags.curve)) {
    return `Invalid --curve "${flags.curve}". Pick one of: ${MERMAID_CURVES.join(', ')}.`;
  }
  for (const k of ['node-spacing', 'rank-spacing', 'padding', 'line-gap', 'box-gap']) {
    if (flags[camel(k)] !== undefined && !/^\d+$/.test(String(flags[camel(k)]))) {
      return `Invalid --${k} "${flags[camel(k)]}". Want a non-negative integer (app clamps to slider bounds).`;
    }
  }
  if (flags.viewbox !== undefined) {
    const parts = String(flags.viewbox).split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return `Invalid --viewbox "${flags.viewbox}". Want "x,y,w,h" numbers.`;
    }
    if (parts[2] <= 0 || parts[3] <= 0) {
      return `Invalid --viewbox "${flags.viewbox}". Width and height must be positive.`;
    }
  }
  if (command === 'pdf-shot' && flags.server !== undefined) {
    // pdf-shot renders a local file and needs no app server.
    return `Flag --server does not apply to pdf-shot (it renders a local file).`;
  }
  return null;
}

export function topHelp() {
  return [
    'markdown_editor test CLI — drive the real app for reproducible testing.',
    '',
    '  npm run cli -- <command> [options]',
    '',
    'Commands:',
    '  export-pdf    md -> PDF through the real editor pipeline (render + export).',
    '  pdf-info      print PDF metadata: pages, page sizes, outlines, tagged.',
    '  pdf-shot      render one PDF page to PNG (needs a display).',
    '  shot          screenshot the editor after loading a markdown file.',
    '  shot-diagram  screenshot the first rendered Mermaid SVG, full-res.',
    '',
    'Run with --help after a command for its flags. Global: --server <url>.',
  ].join('\n');
}

export function commandHelp(command) {
  const common = 'Global: --server <url> (default http://localhost:3000).';
  const layout =
    'Layout (first diagram): --curve <name> --node-spacing <n> --rank-spacing <n>\n  --padding <n> --line-gap <n> --box-gap <n> (applied live before capture).';
  const help = {
    'export-pdf': [
      'export-pdf --input <md> --out <pdf> [--mode <m>] [--settle <ms>] [--timeout <ms>]',
      '',
      '  --mode  enlarge|landscape|rotate|fit|paginate (default: app default).',
      '  --settle  render settle wait in ms (default 5000).',
      '  --timeout download wait in ms (default 180000).',
      layout,
      common,
    ],
    'pdf-info': ['pdf-info --input <pdf>', '', common],
    'pdf-shot': [
      'pdf-shot --input <pdf> --page <n> --out <png> [--width <px>] [--dpr <1-4>]',
      '',
      '  Quick look through the viewer window (needs a display).',
      '  --width  viewport width in px (default 1000).',
      '  --dpr    resolution multiplier (default 2). The viewer rasterizes',
      '           vector PDF content at device pixels, so dpr 3-4 gives',
      '           print-sharp page PNGs straight from the PDF.',
    ],
    'pdf-render': [
      'pdf-render --input <pdf> --page <n> --out <png> [--scale <1-6>]',
      '',
      '  True PDF->PNG conversion (Mozilla pdf.js, headless, no viewer).',
      '  Renders only the requested page at --scale pixels per PDF point',
      '  (default 3: an A4 page becomes ~1785x2525 px). Use this when you',
      '  need maximum quality without any browser chrome.',
    ],
    shot: [
      'shot --input <md> --out <png> [--full-page] [--width <px>]',
      '',
      '  --width  viewport width in px (default 1400).',
      layout,
      common,
    ],
    'shot-diagram': [
      'shot-diagram --input <md> --out <png> [--viewbox x,y,w,h] [--width <px>]',
      '',
      '  Isolates the first Mermaid SVG at full resolution.',
      '  --viewbox  crop to SVG user units, e.g. "1850,55300,1900,800".',
      '  --width    overlay width in px (default 1400).',
      layout,
      common,
    ],
  }[command];
  return (help || []).join('\n');
}
