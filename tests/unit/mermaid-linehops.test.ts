import { describe, it, expect } from 'vitest';
import {
  parsePolylinePoints,
  segmentIntersection,
  segmentAngleDeg,
  findHopCrossings,
  insertHopArcs,
  applyLineHopsToSvgMarkup,
  applyConnectorStylingToSvgMarkup,
  applyClusterTransparencyToSvgMarkup,
  LINE_HOP_RADIUS,
} from '@/components/editor/utils/mermaid-linehops';

describe('polyline d parsing', () => {
  it('parses absolute M/L/H/V paths', () => {
    expect(parsePolylinePoints('M4558,331L4558,411.5L4558,488')).toEqual([
      { x: 4558, y: 331 },
      { x: 4558, y: 411.5 },
      { x: 4558, y: 488 },
    ]);
    expect(parsePolylinePoints('M0,0H100V50')).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('rejects curves, relative, close and degenerate paths', () => {
    expect(parsePolylinePoints('M0,0C10,10 20,20 30,0')).toBeNull();
    expect(parsePolylinePoints('M0,0 A10 10 0 0 1 20,0')).toBeNull();
    expect(parsePolylinePoints('m0,0l10,10')).toBeNull();
    expect(parsePolylinePoints('M0,0L10,10Z')).toBeNull();
    expect(parsePolylinePoints('M0,0')).toBeNull();
    expect(parsePolylinePoints('')).toBeNull();
    expect(parsePolylinePoints(null)).toBeNull();
  });
});

describe('segment intersection', () => {
  it('finds proper X crossings', () => {
    const p = segmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 }
    );
    expect(p?.x).toBeCloseTo(5, 6);
    expect(p?.y).toBeCloseTo(5, 6);
  });

  it('returns null for parallel, collinear and disjoint segments', () => {
    const horiz = (y: number) => [{ x: 0, y }, { x: 10, y }];
    const [a1, a2] = horiz(0);
    const [b1, b2] = horiz(5);
    expect(segmentIntersection(a1, a2, b1, b2)).toBeNull();
    // Collinear overlap is not a hop candidate.
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })
    ).toBeNull();
    // Disjoint.
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 5, y: 5 }, { x: 9, y: 1 })
    ).toBeNull();
  });

  it('measures segment angles', () => {
    const h1 = { x: 0, y: 0 };
    const h2 = { x: 10, y: 0 };
    expect(segmentAngleDeg(h1, h2, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 6);
    expect(segmentAngleDeg(h1, h2, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 6);
  });
});

describe('crossing detection', () => {
  const vertical = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
  ];
  const horizontal = [
    { x: -50, y: 50 },
    { x: 50, y: 50 },
  ];

  it('reports the crossing with later path hopping', () => {
    const found = findHopCrossings([vertical, horizontal]);
    expect(found).toHaveLength(1);
    expect(found[0].straight).toBe(0);
    expect(found[0].hopper).toBe(1);
    expect(found[0].point.x).toBeCloseTo(0, 6);
    expect(found[0].point.y).toBeCloseTo(50, 6);
  });

  it('skips crossings too close to path ends (arrowhead zone)', () => {
    const short = [
      { x: -50, y: 96 },
      { x: 50, y: 96 },
    ];
    // Crossing at (0,96): 4 units from vertical's end -> skipped.
    expect(findHopCrossings([vertical, short])).toHaveLength(0);
  });

  it('skips near-parallel shared routes', () => {
    const almostParallel = [
      { x: -5, y: -50 },
      { x: 5, y: 150 },
    ];
    // 2.9° from vertical, crossing mid-path on both: skipped by angle alone.
    expect(findHopCrossings([vertical, almostParallel])).toHaveLength(0);
  });
});

describe('hop arc insertion', () => {
  it('merges near-coincident crossings on one segment into a single hop', () => {
    const pts = [
      { x: -50, y: 50 },
      { x: 50, y: 50 },
    ];
    // Two edges crossing at (0,50) and (2,50): closer than 2R -> one hop.
    const d = insertHopArcs(
      pts,
      [
        { seg: 0, point: { x: 0, y: 50 } },
        { seg: 0, point: { x: 2, y: 50 } },
      ],
      12
    );
    expect(d.match(/A12 12 0 0 1/g)).toHaveLength(1);
    // Well-separated crossings on one segment each get their own hop.
    const d2 = insertHopArcs(
      pts,
      [
        { seg: 0, point: { x: -30, y: 50 } },
        { seg: 0, point: { x: 30, y: 50 } },
      ],
      12
    );
    expect(d2.match(/A12 12 0 0 1/g)).toHaveLength(2);
  });

  it('inserts a semicircle of the hop radius at the crossing', () => {
    const pts = [
      { x: -50, y: 50 },
      { x: 50, y: 50 },
    ];
    const d = insertHopArcs(pts, [{ seg: 0, point: { x: 0, y: 50 } }], 12);
    // Arc from (-12,50) to (12,50) with r=12: an exact semicircle.
    expect(d).toContain(`L-12,50A12 12 0 0 1 12,50`);
    expect(d.startsWith('M-50,50')).toBe(true);
    expect(d.endsWith('L50,50')).toBe(true);
  });
});

describe('applyLineHopsToSvgMarkup', () => {
  const twoCrossingLines = `<svg viewBox="0 0 200 200"><g class="edgePaths"><path d="M100,0L100,200" marker-end="url(#a)"></path><path d="M0,100L200,100"></path></g></svg>`;

  it('adds a hop arc to the later path at the crossing', () => {
    const out = applyLineHopsToSvgMarkup(twoCrossingLines);
    expect(out).toContain('A8 8 0 0 1');
    // First path untouched (no arc), marker preserved.
    expect(out).toContain('d="M100,0L100,200"');
    expect(out).toContain('marker-end="url(#a)"');
  });

  it('leaves parallel lines and tiny diagrams unchanged', () => {
    const parallel = `<svg viewBox="0 0 200 200"><g class="edgePaths"><path d="M10,0L10,200"></path><path d="M30,0L30,200"></path></g></svg>`;
    expect(applyLineHopsToSvgMarkup(parallel)).toBe(parallel);
    const single = `<svg viewBox="0 0 200 200"><g class="edgePaths"><path d="M0,0L200,200"></path></g></svg>`;
    expect(applyLineHopsToSvgMarkup(single)).toBe(single);
  });

  it('passes through non-flowchart svg and bad input byte-identical', () => {    const seq = `<svg viewBox="0 0 200 200"><g class="messageLine"><line x1="0" y1="0" x2="10" y2="10"></line></g></svg>`;
    expect(applyLineHopsToSvgMarkup(seq)).toBe(seq);
    expect(applyLineHopsToSvgMarkup('')).toBe('');
    expect(applyLineHopsToSvgMarkup('not svg')).toBe('not svg');
  });

  it('skips curved paths instead of corrupting them', () => {
    const mixed = `<svg viewBox="0 0 200 200"><g class="edgePaths"><path d="M100,0L100,200"></path><path d="M0,100C50,100 150,100 200,100"></path></g></svg>`;
    // Curved path is not a parseable polyline: no hop pair forms.
    expect(applyLineHopsToSvgMarkup(mixed)).toBe(mixed);
  });
});

describe('applyClusterTransparencyToSvgMarkup', () => {
  // Mirrors real mermaid output: per-cluster accent fill as INLINE !important
  // (beats any stylesheet rule) plus a colored frame border to preserve.
  const clustered =
    `<svg viewBox="0 0 500 400"><g class="clusters"><g class="cluster"><rect x="10" y="10" width="300" height="200" style="fill:#ddd6fe !important;stroke:#6d28d9 !important;stroke-width:4px !important;"/><g class="cluster-label" transform="translate(10,10)"><foreignObject width="200" height="24"></foreignObject></g></g></g><g class="edgePaths"><path d="M0,0L10,10"></path></g></svg>`;

  it('neutralizes opaque cluster washes while keeping rects and borders', () => {
    const out = applyClusterTransparencyToSvgMarkup(clustered);
    expect(out).toContain('g.cluster > rect{fill:none !important;}');
    // Background rect element itself is preserved (only its fill is dropped).
    expect(out).toContain('<rect');
    // Inline fill is neutralized on the element itself. (The vitest-bundled
    // jsdom drops the priority flag on read-back, so assert the value here;
    // the stylesheet marker rule below is the testable backstop, and real
    // browsers honor the important flag set by the implementation.)
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const rect = doc.querySelector('g.cluster > rect') as unknown as HTMLElement;
    expect(rect.style.getPropertyValue('fill')).toBe('none');
    expect(out).toContain('fill: none');
    // Original accent border is preserved (jsdom serializes with a space).
    expect(out.replace(/\s+/g, '')).toContain('stroke:#6d28d9');
  });

  it('shares one style tag with connector styling and stays idempotent', () => {
    const styled = applyConnectorStylingToSvgMarkup(clustered);
    const both = applyClusterTransparencyToSvgMarkup(styled);
    expect(both).toContain('stroke-width:2.5px');
    expect(both).toContain('fill:none');
    expect(both.match(/data-connector-styling="1"/g)).toHaveLength(1);
    expect(applyClusterTransparencyToSvgMarkup(both)).toBe(both);
  });

  it('passes through diagrams without clusters', () => {
    const plain = `<svg viewBox="0 0 200 200"><g class="edgePaths"><path d="M0,0L10,10"></path></g></svg>`;
    expect(applyClusterTransparencyToSvgMarkup(plain)).toBe(plain);
    expect(applyClusterTransparencyToSvgMarkup('')).toBe('');
  });
});
describe('applyConnectorStylingToSvgMarkup', () => {
  const flow = `<svg viewBox="0 0 200 200"><g class="edgePaths"><path class="flowchart-link edge-thickness-normal" d="M0,0L200,200"></path></g></svg>`;

  it('appends a stroke-width and round-join override rule', () => {
    const out = applyConnectorStylingToSvgMarkup(flow);
    expect(out).toContain('data-connector-styling="1"');
    expect(out).toContain('stroke-width:2.5px !important');
    expect(out).toContain('stroke-linejoin:round !important');
    // Original content preserved.
    expect(out).toContain('d="M0,0L200,200"');
  });

  it('is idempotent and passes through non-flowchart input', () => {
    const once = applyConnectorStylingToSvgMarkup(flow);
    expect(applyConnectorStylingToSvgMarkup(once)).toBe(once);
    const seq = `<svg viewBox="0 0 200 200"><g class="messageLine"><line x1="0" y1="0" x2="10" y2="10"></line></g></svg>`;
    expect(applyConnectorStylingToSvgMarkup(seq)).toBe(seq);
    expect(applyConnectorStylingToSvgMarkup('')).toBe('');
  });
});
