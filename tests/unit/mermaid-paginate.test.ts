import { describe, it, expect } from 'vitest';
import {
  isTallMermaidDiagram,
  computeMermaidPaginatePlan,
  paginateSliceOffsets,
  buildInkOccupancy,
  snapCutToGap,
  planSliceBoundaries,
  inkSpansFromRects,
  translateYOf,
  accumulatedTranslateY,
  shapeSpanFromAttrs,
  inkSpansFromCloneSvg,
  parseSvgViewBoxSize,
  resolveMermaidExportSvg,
  getMermaidExportSize,
  areMermaidDiagramsReady,
  waitForMermaidDiagramsReady,
  A4_PORTRAIT_CONTENT_WIDTH_MM,
  A4_PORTRAIT_CONTENT_HEIGHT_MM,
  MM_TO_PX,
} from '@/components/editor/utils/mermaid-paginate';

describe('mermaid paginate slicing math', () => {
  it('does not treat wide diagrams as tall', () => {
    // Typical wide sequence diagram: much wider than high.
    expect(isTallMermaidDiagram(1600, 640)).toBe(false);
    expect(isTallMermaidDiagram(1200, 500)).toBe(false);
  });

  it('detects very tall timeline diagrams (Vietnam history shape)', () => {
    // Tall top-down flowchart: narrow but thousands of px high.
    expect(isTallMermaidDiagram(800, 4200)).toBe(true);
    // Absolute-height rule catches tall diagrams even at moderate aspect.
    expect(isTallMermaidDiagram(900, 1500)).toBe(true);
    // Narrow portrait aspect without extreme height still counts.
    expect(isTallMermaidDiagram(500, 900)).toBe(true);
  });

  it('rejects degenerate dimensions', () => {
    expect(isTallMermaidDiagram(0, 100)).toBe(false);
    expect(isTallMermaidDiagram(100, 0)).toBe(false);
    expect(isTallMermaidDiagram(-10, 500)).toBe(false);
    expect(computeMermaidPaginatePlan(0, 500)).toBeNull();
    expect(computeMermaidPaginatePlan(800, 0)).toBeNull();
  });

  it('returns null when the diagram fits on a single A4 portrait page', () => {
    expect(computeMermaidPaginatePlan(600, 400)).toBeNull();
    expect(computeMermaidPaginatePlan(600, 900)).toBeNull();
    expect(computeMermaidPaginatePlan(1600, 640)).toBeNull();
  });

  it('slices a Vietnam-history-sized diagram across 4 strict A4 pages', () => {
    const plan = computeMermaidPaginatePlan(800, 4200);
    expect(plan).not.toBeNull();
    // 800px wide scales to ~672.8px content width; ~3532px scaled height
    // over ~986.5px usable page height => 4 pages.
    expect(plan!.pages).toBe(4);
    expect(plan!.scale).toBeLessThanOrEqual(1);
    expect(plan!.scaledWidthPx).toBeLessThanOrEqual(
      A4_PORTRAIT_CONTENT_WIDTH_MM * MM_TO_PX + 1e-6
    );

    const offsets = paginateSliceOffsets(plan!);
    expect(offsets).toHaveLength(4);
    expect(offsets[0]).toBe(0);
    // Evenly spaced slices.
    for (let k = 1; k < offsets.length; k++) {
      expect(offsets[k] - offsets[k - 1]).toBeCloseTo(plan!.sliceHeightPx, 6);
    }
    // Full coverage: last slice reaches the diagram end without a wasted page.
    expect(offsets[offsets.length - 1] + plan!.sliceHeightPx).toBeGreaterThanOrEqual(
      plan!.scaledHeightPx
    );
    expect(offsets[offsets.length - 1]).toBeLessThan(plan!.scaledHeightPx);
  });

  it('never downscales narrow diagrams, only slices vertically', () => {
    const plan = computeMermaidPaginatePlan(500, 2500);
    expect(plan).not.toBeNull();
    expect(plan!.scale).toBe(1);
    expect(plan!.scaledWidthPx).toBe(500);
    expect(plan!.pages).toBe(
      Math.ceil(2500 / (A4_PORTRAIT_CONTENT_HEIGHT_MM * MM_TO_PX))
    );
  });
});

describe('gap-snapped slice boundaries', () => {
  it('builds an occupancy map from ink spans', () => {
    const occ = buildInkOccupancy([{ y: 0, height: 100 }], 1000, 10);
    expect(occ).toHaveLength(10);
    expect(occ[0]).toBe(1);
    expect(occ[5]).toBe(0);
    expect(buildInkOccupancy([], 1000, 10).every((v) => v === 0)).toBe(true);
  });

  it('returns the nominal cut when there is no ink map', () => {
    expect(snapCutToGap([], 800, 3000, 200)).toBe(800);
    // All-empty map: nominal is already optimal.
    expect(snapCutToGap(new Array(64).fill(0), 800, 3000, 200)).toBe(800);
  });

  it('snaps a cut backward into a whitespace gap, never through ink', () => {
    // Ink everywhere except a clear gap band at [700, 760].
    const spans = [
      { y: 0, height: 700 },
      { y: 760, height: 2240 },
    ];
    const occ = buildInkOccupancy(spans, 3000, 300);
    const cut = snapCutToGap(occ, 900, 3000, 300);
    expect(cut).toBeLessThan(900);
    expect(cut).toBeGreaterThanOrEqual(700);
    expect(cut).toBeLessThanOrEqual(760);
  });

  it('keeps the nominal cut when the diagram is densely inked', () => {
    const occ = new Array(64).fill(3);
    expect(snapCutToGap(occ, 800, 3000, 200)).toBe(800);
  });

  it('falls back to uniform slicing without ink spans', () => {
    expect(planSliceBoundaries(3000, 1000, [])).toEqual([0, 1000, 2000, 3000]);
  });

  it('snaps every boundary into gaps with full coverage and no overflow', () => {
    // Four node bands separated by clear rank gaps; nominal cuts at
    // 1000/2000/3000 would land mid-node.
    const spans = [
      { y: 0, height: 950 },
      { y: 1050, height: 900 },
      { y: 2050, height: 850 },
      { y: 3000, height: 550 },
    ];
    const cuts = planSliceBoundaries(3600, 1000, spans);
    expect(cuts[0]).toBe(0);
    expect(cuts[cuts.length - 1]).toBe(3600);
    expect(cuts.length).toBeGreaterThan(2);
    // Every slice fits on its page and every cut avoids ink.
    for (let k = 0; k < cuts.length - 1; k++) {
      const sliceH = cuts[k + 1] - cuts[k];
      expect(sliceH).toBeLessThanOrEqual(1000);
      expect(sliceH).toBeGreaterThanOrEqual(450);
      if (k > 0) {
        const cut = cuts[k];
        const inGap = spans.every((s) => cut <= s.y || cut >= s.y + s.height);
        expect(inGap).toBe(true);
      }
    }
  });

  it('resolves narrow rank gaps on very tall diagrams', () => {
    // Regression: coarse histograms blur narrow rank gaps into neighboring
    // node ink, stranding nominal cuts mid-box. Bins must resolve gaps far
    // smaller than one slice (~30u here at 41945u total height).
    const H = 41945;
    const slice = 1820;
    const spans = [
      { y: 0, height: 1790 },
      { y: 1820, height: H - 1820 },
    ];
    const cuts = planSliceBoundaries(H, slice, spans);
    expect(cuts[1]).not.toBe(slice);
    expect(cuts[1]).toBeGreaterThanOrEqual(1790);
    expect(cuts[1]).toBeLessThanOrEqual(1820);
  });

  it('bisects the remainder instead of stranding a sliver page', () => {    // 2400 units at 1000-unit slices: a third full slice would leave a
    // 400-unit sliver, so the remainder is halved into two fitting slices.
    const cuts = planSliceBoundaries(2400, 1000, []);
    expect(cuts).toEqual([0, 1000, 1700, 2400]);
  });

  it('never emits sliver pages when the only gap is near the slice start', () => {
    // snapCutToGap itself may return a gap below the sliver threshold; the
    // planner guard rejects cuts closer than minSlice to the slice start.
    const occ = buildInkOccupancy([{ y: 0, height: 3000 }], 3000, 1000);
    occ[250] = 0; // 75% back — within snap's window but the full-ink
    // planner case below must still fall through to nominal slices.
    const cut = snapCutToGap(occ, 1000, 3000, 500);
    expect(cut).toBeLessThan(1000);
    const cuts = planSliceBoundaries(3000, 1000, [{ y: 0, height: 3000 }]);
    expect(cuts[1]).toBe(1000);
  });

  it('escapes a cut trapped inside a node taller than the search window', () => {
    // Regression: nominal cut at 1000 sits deep inside a node whose top gap
    // is farther back than the normal 0.5-slice window, so snapCutToGap
    // keeps nominal — mid-box. The escape search must reach the real gap
    // near the node top instead of bisecting it.
    const spans = [
      { y: 250, height: 900 },
      { y: 1300, height: 900 },
      { y: 2300, height: 700 },
    ];
    const cuts = planSliceBoundaries(3000, 1000, spans);
    expect(cuts[1]).not.toBe(1000);
    // Escaped into the gap above the trapping node.
    expect(cuts[1]).toBeLessThanOrEqual(250);
    expect(cuts[1]).toBeGreaterThan(0);
    expect(cuts[cuts.length - 1]).toBe(3000);
    // All cuts land in gaps.
    cuts.slice(1, -1).forEach((c) => {
      expect(spans.every((s) => c <= s.y || c >= s.y + s.height)).toBe(true);
    });
  });

  it('keeps nominal when the trapped node is taller than the whole slice', () => {
    // One node spans the entire diagram: no gap exists anywhere, so a cut
    // through it is unavoidable and the planner must still terminate.
    const cuts = planSliceBoundaries(3000, 1000, [{ y: 0, height: 3000 }]);
    expect(cuts).toEqual([0, 1000, 2000, 3000]);
  });
});

describe('rendered-rect ink mapping', () => {
  it('maps rendered rects back to SVG user units', () => {
    // SVG content 3000 units tall rendered at 1500px: 2 units per px.
    const spans = inkSpansFromRects(100, 1500, 3000, [
      { top: 100, height: 80 },
      { top: 1100, height: 160 },
    ]);
    expect(spans).toEqual([
      { y: 0, height: 160 },
      { y: 2000, height: 320 },
    ]);
  });

  it('cancels uniform pan/zoom ancestor transforms', () => {
    // Same layout shifted by pan (+200px) and 1.5x zoom: identical units.
    const plain = inkSpansFromRects(100, 1500, 3000, [{ top: 1100, height: 160 }]);
    const zoomed = inkSpansFromRects(350, 2250, 3000, [{ top: 1850, height: 240 }]);
    expect(zoomed[0].y).toBeCloseTo(plain[0].y, 6);
    expect(zoomed[0].height).toBeCloseTo(plain[0].height, 6);
  });

  it('skips degenerate rects and empty inputs', () => {
    expect(inkSpansFromRects(0, 0, 3000, [{ top: 10, height: 50 }])).toEqual([]);
    expect(
      inkSpansFromRects(0, 1500, 3000, [
        { top: 10, height: 0 },
        { top: NaN, height: 50 },
        { top: 20, height: -5 },
      ])
    ).toEqual([]);
  });

  it('end to end: rects of translated nodes snap cuts into gaps', () => {
    // svg 1500px = 3000u (2u/px). Node 1 spans [800,1600]u so the nominal
    // cut at 1000u lands mid-node; it must snap back into the gap below.
    const spans = inkSpansFromRects(0, 1500, 3000, [
      { top: 400, height: 400 },
      { top: 1100, height: 80 },
    ]);
    expect(spans[0]).toEqual({ y: 800, height: 800 });
    const cuts = planSliceBoundaries(3000, 1000, spans);
    expect(cuts[1]).not.toBe(1000);
    const inGap = spans.every((s) => cuts[1] <= s.y || cuts[1] >= s.y + s.height);
    expect(inGap).toBe(true);
  });
});

describe('clone-markup ink spans (deterministic, no layout)', () => {
  it('parses translateY variants', () => {
    expect(translateYOf('translate(100,2000)')).toBe(2000);
    expect(translateYOf('translate(50 500)')).toBe(500);
    expect(translateYOf('translate(30)')).toBe(0);
    expect(translateYOf(null)).toBe(0);
    expect(translateYOf('scale(2)')).toBe(0);
  });

  it('reads shape geometry from attributes', () => {
    const doc = new DOMParser().parseFromString(
      `<svg>
        <rect x="0" y="10" width="200" height="80"/>
        <ellipse cx="50" cy="200" rx="30" ry="25"/>
        <circle cx="50" cy="300" r="20"/>
        <polygon points="0,400 100,400 100,460 0,460"/>
        <foreignObject x="0" y="500" width="120" height="40"></foreignObject>
        <path d="M0 0 L10 10"/>
      </svg>`,
      'text/html'
    );
    const spanOf = (sel: string) => shapeSpanFromAttrs(doc.querySelector(sel)!);
    expect(spanOf('rect')).toEqual({ y: 10, height: 80 });
    expect(spanOf('ellipse')).toEqual({ y: 175, height: 50 });
    expect(spanOf('circle')).toEqual({ y: 280, height: 40 });
    expect(spanOf('polygon')).toEqual({ y: 400, height: 60 });
    expect(spanOf('foreignObject')).toEqual({ y: 500, height: 40 });
    expect(spanOf('path')).toBeNull();
  });

  it('treats missing y on rect/foreignObject as SVG default 0', () => {
    const doc = new DOMParser().parseFromString(
      `<svg>
        <rect width="200" height="80"/>
        <foreignObject width="120" height="40"></foreignObject>
        <rect width="200"/>
        <foreignObject width="120"></foreignObject>
      </svg>`,
      'text/html'
    );
    const spans = Array.from(doc.querySelectorAll('rect, foreignObject')).map((el) =>
      shapeSpanFromAttrs(el)
    );
    expect(spans[0]).toEqual({ y: 0, height: 80 });
    expect(spans[1]).toEqual({ y: 0, height: 40 });
    expect(spans[2]).toBeNull();
    expect(spans[3]).toBeNull();
  });

  it('accumulates ancestor translates and ignores edge paths', () => {    const doc = new DOMParser().parseFromString(
      `<svg viewBox="0 0 800 3000">
        <g transform="translate(0,100)">
          <g class="node" transform="translate(100,2000)">
            <rect x="0" y="0" width="200" height="80"/>
          </g>
        </g>
        <g class="edgeLabel" transform="translate(300,1000)">
          <foreignObject x="0" y="0" width="120" height="40"></foreignObject>
        </g>
        <g class="edgePaths"><path d="M0 0 L800 3000"/></g>
      </svg>`,
      'text/html'
    );
    const svg = doc.querySelector('svg')!;
    expect(accumulatedTranslateY(svg.querySelector('g.node rect')!, svg)).toBe(2100);
    const spans = inkSpansFromCloneSvg(svg);
    expect(spans).toEqual([
      { y: 2100, height: 80 },
      { y: 1000, height: 40 },
    ]);
    // Gap-snapped cuts from markup spans avoid the translated node.
    const cuts = planSliceBoundaries(3000, 1000, spans);
    cuts.slice(1, -1).forEach((cut) => {
      expect(spans.every((s) => cut <= s.y || cut >= s.y + s.height)).toBe(true);
    });
  });
});

describe('export-time diagram svg resolution', () => {
  const parse = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html');

  it('parses viewBox sizes and rejects malformed values', () => {
    expect(parseSvgViewBoxSize('0 0 800 4200')).toEqual({ width: 800, height: 4200 });
    expect(parseSvgViewBoxSize('0,0,800,4200')).toEqual({ width: 800, height: 4200 });
    expect(parseSvgViewBoxSize(null)).toBeNull();
    expect(parseSvgViewBoxSize('')).toBeNull();
    expect(parseSvgViewBoxSize('0 0 800')).toBeNull();
    expect(parseSvgViewBoxSize('0 0 -5 100')).toBeNull();
    expect(parseSvgViewBoxSize('0 0 abc 100')).toBeNull();
  });

  it('prefers the diagram svg inside .panzoom-wrapper over chrome icons', () => {
    // Regression: node headers hold 24px Lucide icon SVGs; a bare
    // querySelector('svg') grabs one and corrupts slice geometry (wrong plan,
    // duplicated slice windows that read as stacked content).
    const doc = parse(
      `<div class="mermaid-node-container">
         <div class="header"><svg width="24" height="24" viewBox="0 0 24 24"></svg></div>
         <div class="mermaid-canvas-viewport"><div class="panzoom-wrapper"><svg viewBox="0 0 800 4200"></svg></div></div>
       </div>`
    );
    const svg = resolveMermaidExportSvg(doc.querySelector('.mermaid-node-container')!);
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 4200');
  });

  it('falls back to the largest-area svg when no panzoom wrapper exists', () => {
    const doc = parse(
      `<div class="mermaid-node-container">
         <svg id="icon" viewBox="0 0 24 24"></svg>
         <svg id="diagram" viewBox="0 0 800 4200"></svg>
       </div>`
    );
    const stubRect = (id: string, w: number, h: number) => {
      const el = doc.querySelector(`#${id}`) as unknown as SVGGraphicsElement;
      (el as any).getBoundingClientRect = () => ({
        x: 0, y: 0, width: w, height: h, top: 0, left: 0, right: w, bottom: h,
        toJSON: () => {},
      });
    };
    stubRect('icon', 24, 24);
    stubRect('diagram', 800, 400);
    const svg = resolveMermaidExportSvg(doc.querySelector('.mermaid-node-container')!);
    expect(svg?.getAttribute('id')).toBe('diagram');
  });

  it('returns null when only unmeasurable svgs exist', () => {
    const doc = parse(
      `<div class="mermaid-node-container"><svg id="icon"></svg></div>`
    );
    // jsdom rects are 0-area and there is no viewBox: nothing measurable.
    expect(resolveMermaidExportSvg(doc.querySelector('.mermaid-node-container')!)).toBeNull();
  });

  it('reads export size from viewBox, even on detached clones', () => {
    const doc = parse(`<div><svg viewBox="0 0 5301 56268"></svg></div>`);
    expect(getMermaidExportSize(doc.querySelector('svg')!)).toEqual({
      width: 5301,
      height: 56268,
    });
  });

  it('returns null size when the diagram has not rendered yet', () => {
    const doc = parse(`<div><svg></svg></div>`);
    expect(getMermaidExportSize(doc.querySelector('svg')!)).toBeNull();
  });
});

describe('mermaid export readiness gate', () => {
  const parse = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html');

  it('is ready when every diagram rendered, or settled with an error banner', () => {
    const doc = parse(
      `<div>
         <div class="mermaid-node-container"><div class="panzoom-wrapper"><svg viewBox="0 0 10 20"></svg></div></div>
         <div class="mermaid-node-container"></div>
       </div>`
    );
    expect(areMermaidDiagramsReady(doc)).toBe(false);
    doc.querySelectorAll('.mermaid-node-container')[1].innerHTML =
      '<div data-testid="mermaid-error-banner"></div>';
    expect(areMermaidDiagramsReady(doc)).toBe(true);
  });

  it('is vacuously ready with no diagrams', () => {
    expect(areMermaidDiagramsReady(parse(`<div><p>text only</p></div>`))).toBe(true);
  });

  it('waitForMermaidDiagramsReady resolves true immediately when ready', async () => {
    const doc = parse(
      `<div class="mermaid-node-container"><div class="panzoom-wrapper"><svg viewBox="0 0 10 20"></svg></div></div>`
    );
    await expect(waitForMermaidDiagramsReady(doc, 500, 10)).resolves.toBe(true);
  });

  it('waitForMermaidDiagramsReady resolves false on timeout when a diagram never renders', async () => {
    const doc = parse(`<div class="mermaid-node-container"><p>still rendering…</p></div>`);
    await expect(waitForMermaidDiagramsReady(doc, 120, 10)).resolves.toBe(false);
  }, 10000);
});
