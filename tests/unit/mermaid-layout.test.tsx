import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  MermaidComponent,
  MermaidNode,
  sanitizeMermaidLayout,
  parseMermaidLayoutJson,
  numberAttrOr,
  hopRadiusForLineGap,
  MERMAID_LAYOUT_DEFAULTS,
  MERMAID_CURVE_OPTIONS,
  MERMAID_MAX_ZOOM,
  MERMAID_MIN_ZOOM,
  MERMAID_LINE_GAP_MIN,
  MERMAID_LINE_GAP_MAX,
  MERMAID_BOX_GAP_MIN,
  MERMAID_BOX_GAP_MAX,
} from '@/components/editor/extensions/MermaidNode';
import mermaid from 'mermaid';
import Panzoom from '@panzoom/panzoom';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation((id: string, code: string) => {
      if (code.includes('INVALID_SYNTAX')) {
        return Promise.reject(new Error('Syntax error in graph syntax'));
      }
      return Promise.resolve({
        svg: `<svg id="${id}" data-testid="mock-mermaid-svg"><g><text>Rendered Diagram</text></g></svg>`,
      });
    }),
  },
}));

vi.mock('@panzoom/panzoom', () => {
  return {
    default: vi.fn(() => {
      let scale = 1;
      return {
        zoomIn: vi.fn(() => { scale = 1.25; }),
        zoomOut: vi.fn(() => { scale = 0.8; }),
        reset: vi.fn(() => { scale = 1; }),
        getScale: vi.fn(() => scale),
        zoomWithWheel: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  };
});

describe('sanitizeMermaidLayout', () => {
  it('returns defaults for missing or empty attrs', () => {
    expect(sanitizeMermaidLayout({})).toEqual(MERMAID_LAYOUT_DEFAULTS);
  });

  it('accepts every documented curve option', () => {
    for (const o of MERMAID_CURVE_OPTIONS) {
      expect(sanitizeMermaidLayout({ curve: o.value }).curve).toBe(o.value);
    }
  });

  it('falls back to stepBefore for unknown curves', () => {
    expect(sanitizeMermaidLayout({ curve: 'wavy' }).curve).toBe('stepBefore');
    expect(sanitizeMermaidLayout({ curve: null }).curve).toBe('stepBefore');
  });

  it('clamps out-of-range numbers and drops non-numbers', () => {
    expect(
      sanitizeMermaidLayout({ nodeSpacing: 999, rankSpacing: -5, padding: NaN })
    ).toEqual({ curve: 'stepBefore', nodeSpacing: 300, rankSpacing: 0, padding: 20, lineGap: 20, boxGap: 15 });
    // Numeric strings from parsed HTML are accepted.
    expect(sanitizeMermaidLayout({ nodeSpacing: '120' }).nodeSpacing).toBe(120);
  });

  it('clamps the line gap to its slider bounds', () => {
    expect(sanitizeMermaidLayout({}).lineGap).toBe(20);
    expect(sanitizeMermaidLayout({ lineGap: 999 }).lineGap).toBe(MERMAID_LINE_GAP_MAX);
    expect(sanitizeMermaidLayout({ lineGap: 0 }).lineGap).toBe(MERMAID_LINE_GAP_MIN);
    expect(sanitizeMermaidLayout({ lineGap: '30' }).lineGap).toBe(30);
  });

  it('clamps the box gap to its slider bounds', () => {
    expect(sanitizeMermaidLayout({}).boxGap).toBe(15);
    expect(sanitizeMermaidLayout({ boxGap: 999 }).boxGap).toBe(MERMAID_BOX_GAP_MAX);
    expect(sanitizeMermaidLayout({ boxGap: 0 }).boxGap).toBe(MERMAID_BOX_GAP_MIN);
    expect(sanitizeMermaidLayout({ boxGap: '30' }).boxGap).toBe(30);
  });
});

describe('parseMermaidLayoutJson', () => {
  it('parses a full flat config and clamps it like the sliders', () => {
    expect(
      parseMermaidLayoutJson('{"curve":"basis","nodeSpacing":120,"rankSpacing":40,"padding":10,"lineGap":30,"boxGap":30}')
    ).toEqual({ curve: 'basis', nodeSpacing: 120, rankSpacing: 40, padding: 10, lineGap: 30, boxGap: 30 });
    // Unknown keys dropped, bad curve falls back, numbers clamp.
    expect(
      parseMermaidLayoutJson('{"curve":"wavy","nodeSpacing":999,"extra":1}')
    ).toMatchObject({ curve: 'stepBefore', nodeSpacing: 300 });
  });

  it('accepts partial configs (missing keys take defaults)', () => {
    expect(parseMermaidLayoutJson('{"lineGap": 33}')).toEqual({ ...MERMAID_LAYOUT_DEFAULTS, lineGap: 33 });
    expect(parseMermaidLayoutJson('{}')).toEqual(MERMAID_LAYOUT_DEFAULTS);
  });

  it('accepts a nested flowchart object for pasted mermaid configs', () => {
    expect(
      parseMermaidLayoutJson('{"flowchart": {"curve": "linear", "nodeSpacing": 80}}')
    ).toMatchObject({ curve: 'linear', nodeSpacing: 80, rankSpacing: 80 });
    // Flat keys win over nested ones.
    expect(
      parseMermaidLayoutJson('{"curve": "basis", "flowchart": {"curve": "linear"}}').curve
    ).toBe('basis');
  });

  it('throws on malformed JSON and non-object payloads (old config kept)', () => {
    expect(() => parseMermaidLayoutJson('{curve:}')).toThrow(/Invalid JSON/);
    expect(() => parseMermaidLayoutJson('')).toThrow(/Invalid JSON/);
    expect(() => parseMermaidLayoutJson('[1,2]')).toThrow(/must be a JSON object/);
    expect(() => parseMermaidLayoutJson('42')).toThrow(/must be a JSON object/);
    expect(() => parseMermaidLayoutJson('"x"')).toThrow(/must be a JSON object/);
    expect(() => parseMermaidLayoutJson('null')).toThrow(/must be a JSON object/);
  });
});

describe('hopRadiusForLineGap', () => {  it('keeps standard hops at the default lane and caps above', () => {
    expect(hopRadiusForLineGap(20)).toBe(8);
    expect(hopRadiusForLineGap(48)).toBe(8);
  });

  it('shrinks hops so the arc diameter stays under narrow lanes', () => {
    expect(hopRadiusForLineGap(16)).toBe(6);
    expect(hopRadiusForLineGap(8)).toBe(4);
  });
});

describe('numberAttrOr', () => {
  const elWith = (attrs: Record<string, string>) => {
    const el = document.createElement('div');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  it('falls back for missing, empty, or malformed attributes', () => {
    // Regression: Number(null) === 0, so a missing attribute must not parse as 0.
    expect(numberAttrOr(elWith({}), 'data-node-spacing', 60)).toBe(60);
    expect(numberAttrOr(elWith({ 'data-node-spacing': '' }), 'data-node-spacing', 60)).toBe(60);
    expect(numberAttrOr(elWith({ 'data-node-spacing': 'abc' }), 'data-node-spacing', 60)).toBe(60);
  });

  it('reads present numeric attributes including zero', () => {
    expect(numberAttrOr(elWith({ 'data-node-spacing': '120' }), 'data-node-spacing', 60)).toBe(120);
    expect(numberAttrOr(elWith({ 'data-node-spacing': '0' }), 'data-node-spacing', 60)).toBe(0);
  });
});

describe('Mermaid layout popover', () => {
  const initialCode = `graph TD\n  A[Start] --> B[Finish]`;

  const createProps = (attrs?: any) => ({
    node: { attrs: { code: initialCode, pdfLayout: 'auto', ...MERMAID_LAYOUT_DEFAULTS, ...attrs } } as any,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    extension: {} as any,
    editor: {} as any,
    getPos: () => 0,
    decorations: [],
    selected: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openPopover = async (props: ReturnType<typeof createProps>) => {
    render(<MermaidComponent {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mermaid-layout-button'));
    expect(screen.getByTestId('mermaid-layout-popover')).toBeInTheDocument();
  };

  it('toggles the layout popover from the header button', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mermaid-layout-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('mermaid-layout-button'));
    expect(screen.getByTestId('mermaid-layout-popover')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mermaid-layout-button'));
    expect(screen.queryByTestId('mermaid-layout-popover')).toBeNull();
  });

  it('changing the curve select updates the curve attribute', async () => {
    const props = createProps();
    await openPopover(props);
    fireEvent.change(screen.getByTestId('mermaid-curve-select'), { target: { value: 'basis' } });
    expect(props.updateAttributes).toHaveBeenCalledWith({ curve: 'basis' });
  });

  it('moving spacing sliders updates spacing attributes', async () => {
    const props = createProps();
    await openPopover(props);
    fireEvent.change(screen.getByTestId('mermaid-spacing-node'), { target: { value: '120' } });
    expect(props.updateAttributes).toHaveBeenCalledWith({ nodeSpacing: 120 });
    fireEvent.change(screen.getByTestId('mermaid-spacing-rank'), { target: { value: '40' } });
    expect(props.updateAttributes).toHaveBeenCalledWith({ rankSpacing: 40 });
    fireEvent.change(screen.getByTestId('mermaid-spacing-padding'), { target: { value: '8' } });
    expect(props.updateAttributes).toHaveBeenCalledWith({ padding: 8 });
    fireEvent.change(screen.getByTestId('mermaid-spacing-line'), { target: { value: '30' } });
    expect(props.updateAttributes).toHaveBeenCalledWith({ lineGap: 30 });
    fireEvent.change(screen.getByTestId('mermaid-spacing-box'), { target: { value: '30' } });
    expect(props.updateAttributes).toHaveBeenCalledWith({ boxGap: 30 });
  });

  it('applying edited JSON overwrites the whole stored layout config', async () => {
    const props = createProps();
    await openPopover(props);
    const box = screen.getByTestId('mermaid-layout-json');
    // Draft shows the current config.
    expect((box as HTMLTextAreaElement).value).toContain('"curve": "stepBefore"');
    fireEvent.change(box, {
      target: { value: '{"curve":"basis","nodeSpacing":120,"rankSpacing":40,"padding":10,"lineGap":30,"boxGap":30}' },
    });
    fireEvent.click(screen.getByTestId('mermaid-layout-json-apply'));
    expect(props.updateAttributes).toHaveBeenCalledWith({
      curve: 'basis', nodeSpacing: 120, rankSpacing: 40, padding: 10, lineGap: 30, boxGap: 30,
    });
    expect(screen.queryByTestId('mermaid-layout-json-error')).toBeNull();
  });

  it('invalid JSON keeps the old config and shows an error', async () => {
    const props = createProps();
    await openPopover(props);
    fireEvent.change(screen.getByTestId('mermaid-layout-json'), { target: { value: '{oops' } });
    fireEvent.click(screen.getByTestId('mermaid-layout-json-apply'));
    expect(props.updateAttributes).not.toHaveBeenCalled();
    expect(screen.getByTestId('mermaid-layout-json-error')).toBeInTheDocument();
  });

  it('reload refreshes the draft from the stored attrs', async () => {
    const props = createProps({ lineGap: 33 });
    await openPopover(props);
    const box = screen.getByTestId('mermaid-layout-json') as HTMLTextAreaElement;
    expect(box.value).toContain('"lineGap": 33');
    fireEvent.change(box, { target: { value: '{"lineGap": 10}' } });
    fireEvent.click(screen.getByTestId('mermaid-layout-json-reload'));
    expect(box.value).toContain('"lineGap": 33');
  });

  it('reset restores all layout defaults', async () => {
    const props = createProps({ curve: 'basis', nodeSpacing: 10, rankSpacing: 10, padding: 5, lineGap: 10, boxGap: 8 });
    await openPopover(props);
    fireEvent.click(screen.getByTestId('mermaid-layout-reset'));
    expect(props.updateAttributes).toHaveBeenCalledWith({ ...MERMAID_LAYOUT_DEFAULTS });
  });

  it('warns that curvy lines skip crossing bridges', async () => {
    const props = createProps({ curve: 'basis' });
    await openPopover(props);
    expect(screen.getByText(/skip crossing bridges/i)).toBeInTheDocument();
  });

  it('initializes mermaid with the node layout settings', async () => {
    const props = createProps({ curve: 'basis', nodeSpacing: 100, rankSpacing: 40, padding: 10 });
    render(<MermaidComponent {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          flowchart: expect.objectContaining({
            curve: 'basis',
            nodeSpacing: 100,
            rankSpacing: 40,
            padding: 10,
          }),
        })
      );
    });
  });

  it('falls back to stepBefore when stored curve is invalid', async () => {
    const props = createProps({ curve: 'wavy' });
    render(<MermaidComponent {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          flowchart: expect.objectContaining({ curve: 'stepBefore' }),
        })
      );
    });
  });

  it('allows deep zoom for dense diagrams (10x ceiling)', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });
    expect(Panzoom).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxScale: MERMAID_MAX_ZOOM, minScale: MERMAID_MIN_ZOOM })
    );
    expect(MERMAID_MAX_ZOOM).toBe(10);
  });
});

describe('MermaidNode schema', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('registers every layout attr the popover writes (no silent drops)', () => {
    // Regression: boxGap once existed in UI + sanitize but not in
    // addAttributes, so updateAttributes silently dropped it and the slider
    // looked dead. The schema must accept all layout keys with defaults.
    editor = new Editor({
      extensions: [StarterKit, MermaidNode],
      content: '<div data-type="mermaid" data-code="graph TD"></div>',
    });
    const attrs = editor.schema.nodes.mermaid.spec.attrs as Record<string, { default: unknown }>;
    for (const key of ['curve', 'nodeSpacing', 'rankSpacing', 'padding', 'lineGap', 'boxGap'] as const) {
      expect(attrs[key]).toBeDefined();
      expect(attrs[key].default).toBe(MERMAID_LAYOUT_DEFAULTS[key]);
    }
    // Parsed nodes carry the layout defaults.
    const node = editor.state.doc.firstChild;
    expect(node?.attrs).toMatchObject({ ...MERMAID_LAYOUT_DEFAULTS });
  });
});
