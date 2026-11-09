// Slicing math for paginating very tall Mermaid diagrams across strict A4
// portrait pages during PDF export — without modifying the diagram source.
//
// The exporter renders one dedicated A4 portrait page per slice. Each slice
// shows a fixed-height window into the full-width SVG via a vertical
// translateY offset, so text stays vector-sharp and upright.

export const MM_TO_PX = 3.7795275591;

// Usable content box of a strict A4 portrait page using the exporter's
// print margins (matches the @page rules in the export template):
// width  = 210mm - 16mm - 16mm, height = 297mm - 18mm - 18mm.
export const A4_PORTRAIT_CONTENT_WIDTH_MM = 178;
export const A4_PORTRAIT_CONTENT_HEIGHT_MM = 261;

// A diagram counts as "tall" when it is absolutely very high or when its
// aspect ratio is portrait-narrow (width / height below this threshold).
export const TALL_DIAGRAM_MIN_HEIGHT_PX = 1400;
export const TALL_DIAGRAM_MAX_ASPECT = 0.72;

export interface MermaidPaginatePlan {
  /** Number of A4 portrait pages the diagram spans. Always >= 2. */
  pages: number;
  /** Uniform scale applied so the SVG fits the page content width (<= 1). */
  scale: number;
  scaledWidthPx: number;
  scaledHeightPx: number;
  /** Height of one page slice (usable A4 portrait content height). */
  sliceHeightPx: number;
  contentWidthPx: number;
}

/** True when a diagram is tall enough that single-page modes clip or shrink it. */
export function isTallMermaidDiagram(svgWidthPx: number, svgHeightPx: number): boolean {
  if (!svgWidthPx || !svgHeightPx || svgWidthPx <= 0 || svgHeightPx <= 0) return false;
  if (svgHeightPx > TALL_DIAGRAM_MIN_HEIGHT_PX) return true;
  return svgWidthPx / svgHeightPx < TALL_DIAGRAM_MAX_ASPECT;
}

/**
 * Compute how a tall SVG slices across strict A4 portrait pages.
 * Returns null when the diagram fits on a single page (no pagination needed).
 */
export function computeMermaidPaginatePlan(
  svgWidthPx: number,
  svgHeightPx: number
): MermaidPaginatePlan | null {
  if (!svgWidthPx || !svgHeightPx || svgWidthPx <= 0 || svgHeightPx <= 0) return null;
  const contentWidthPx = A4_PORTRAIT_CONTENT_WIDTH_MM * MM_TO_PX;
  const sliceHeightPx = A4_PORTRAIT_CONTENT_HEIGHT_MM * MM_TO_PX;
  const scale = Math.min(1, contentWidthPx / svgWidthPx);
  const scaledWidthPx = svgWidthPx * scale;
  const scaledHeightPx = svgHeightPx * scale;
  const pages = Math.ceil(scaledHeightPx / sliceHeightPx);
  if (!Number.isFinite(pages) || pages <= 1) return null;
  return { pages, scale, scaledWidthPx, scaledHeightPx, sliceHeightPx, contentWidthPx };
}

/** Vertical translateY offsets (px) — slice k shows [k*slice, (k+1)*slice]. */
export function paginateSliceOffsets(plan: MermaidPaginatePlan): number[] {
  return Array.from({ length: plan.pages }, (_, k) => k * plan.sliceHeightPx);
}

// --- Gap-snapped pagination ------------------------------------------------
// Fixed-height slicing can cut straight through a node box or label. Instead,
// each cut is snapped backward into the emptiest nearby horizontal band
// (typically the whitespace between flowchart ranks), so slices break in gaps
// rather than through ink. Edge connector paths are intentionally excluded
// from the ink model: an edge crossing a page break reads naturally, while a
// bisected node box or text label does not.

/** Vertical ink span of one diagram node/label, in SVG user units. */
export interface MermaidInkSpan {
  y: number;
  height: number;
}

/**
 * Minimal rendered-rectangle shape (e.g. DOMRect) for ink mapping.
 * getBoundingClientRect() is used instead of getBBox() because getBBox()
 * ignores the element's own transform attribute — and Mermaid positions
 * every node/label with transform="translate(...)", which would pile all
 * spans near y=0 and corrupt the occupancy map.
 */
export interface RenderedRectLike {
  top: number;
  height: number;
}

/**
 * Map rendered node rectangles back to SVG user units. Uniform pan/zoom
 * ancestor transforms cancel out because positions are measured relative to
 * the SVG element's own rendered box. Returns [] when nothing is measurable
 * (caller then falls back to uniform slicing).
 */
export function inkSpansFromRects(
  svgTopPx: number,
  svgHeightPx: number,
  svgHeightUnits: number,
  rects: RenderedRectLike[]
): MermaidInkSpan[] {
  if (!(svgHeightPx > 0) || !(svgHeightUnits > 0)) return [];
  if (!Number.isFinite(svgTopPx)) return [];
  const toUnits = svgHeightUnits / svgHeightPx;
  const spans: MermaidInkSpan[] = [];
  for (const r of rects) {
    if (!r || !(r.height > 0) || !Number.isFinite(r.top) || !Number.isFinite(r.height)) continue;
    spans.push({ y: (r.top - svgTopPx) * toUnits, height: r.height * toUnits });
  }
  return spans;
}

// --- Deterministic clone-markup ink spans ----------------------------------
// Live-rendered rects can disagree with the exported clone across environments
// (fonts, zoom, scroll, stray icon SVGs), silently shifting the occupancy map
// so snaps land mid-box. Markup-derived spans are computed from the exact SVG
// being exported, so measurement and rendering can never diverge. They need
// no layout: node/label shapes carry explicit geometry attributes.

function numAttr(el: Element, name: string): number | null {
  const v = el.getAttribute(name);
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** translateY component of transform="translate(x[, y])"; 0 when absent. */
export function translateYOf(transform: string | null): number {
  if (!transform) return 0;
  const m = /translate\(\s*(-?[\d.]+)(?:\s*,\s*|\s+)(-?[\d.]+)?\s*\)/.exec(transform);
  if (!m) return 0;
  const y = m[2] == null || m[2] === '' ? 0 : Number(m[2]);
  return Number.isFinite(y) ? y : 0;
}

/** Sum of translateY from el up to (excluding) stopAt. */
export function accumulatedTranslateY(el: Element, stopAt: Element): number {
  let y = 0;
  let cur: Element | null = el;
  let guard = 0;
  while (cur && cur !== stopAt && guard++ < 64) {
    y += translateYOf(cur.getAttribute('transform'));
    const parent: Node | null = cur.parentNode;
    cur = parent instanceof Element ? parent : null;
  }
  return y;
}

/** Vertical span of a shape from explicit geometry attributes (no layout). */
export function shapeSpanFromAttrs(el: Element): MermaidInkSpan | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'rect' || tag === 'foreignobject') {
    // SVG default for y is 0 (common for mermaid-emitted foreignObjects
    // which only set width/height). Missing y must not reject the shape.
    const y = numAttr(el, 'y') ?? 0;
    const h = numAttr(el, 'height');
    if (h == null || !(h > 0)) return null;
    return { y, height: h };
  }
  if (tag === 'ellipse') {
    const cy = numAttr(el, 'cy');
    const ry = numAttr(el, 'ry');
    if (cy == null || ry == null || !(ry > 0)) return null;
    return { y: cy - ry, height: 2 * ry };
  }
  if (tag === 'circle') {
    const cy = numAttr(el, 'cy');
    const r = numAttr(el, 'r');
    if (cy == null || r == null || !(r > 0)) return null;
    return { y: cy - r, height: 2 * r };
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = el.getAttribute('points');
    if (!pts) return null;
    const nums = pts.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 4) return null;
    const ys: number[] = [];
    for (let i = 1; i < nums.length; i += 2) ys.push(nums[i]);
    if (ys.length === 0) return null;
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    if (!(hi > lo)) return null;
    return { y: lo, height: hi - lo };
  }
  return null;
}

/**
 * Deterministic ink spans from the export clone's own markup. Node/label
 * shapes contribute explicit-geometry spans offset by accumulated ancestor
 * translates; text-only groups (e.g. cluster titles) use a best-effort
 * measured box where available. Edge paths and subgraph backgrounds are
 * excluded like in the rect-based model.
 */
export function inkSpansFromCloneSvg(svg: Element): MermaidInkSpan[] {
  const spans: MermaidInkSpan[] = [];
  svg.querySelectorAll('g.node, g.edgeLabel, g.cluster-label').forEach((g) => {
    const before = spans.length;
    g.querySelectorAll('rect, polygon, polyline, ellipse, circle, foreignObject').forEach((s) => {
      const span = shapeSpanFromAttrs(s);
      if (!span) return;
      spans.push({ y: accumulatedTranslateY(s, svg) + span.y, height: span.height });
    });
    if (spans.length === before) {
      try {
        const getter = (g as SVGGraphicsElement).getBBox;
        if (typeof getter !== 'function') return;
        const bb = getter.call(g);
        if (bb && bb.height > 0) {
          spans.push({ y: accumulatedTranslateY(g, svg) + bb.y, height: bb.height });
        }
      } catch { /* ignore unmeasurable groups */ }
    }
  });
  return spans;
}

/** How far back (fraction of one slice) a cut searches for a gap. */
export const PAGINATE_GAP_SEARCH_FRACTION = 0.5;
/** Minimum slice height as a fraction of a full slice (avoids sliver pages). */
export const PAGINATE_MIN_SLICE_FRACTION = 0.45;
/** Histogram resolution for the vertical ink occupancy map (~10 svg units per
 * bin on very tall diagrams: fine enough to resolve narrow rank gaps that
 * coarse bins blur into neighboring node ink). */
export const PAGINATE_HISTOGRAM_BINS = 4096;

/** Tuning knobs for the greedy gap search (overridable for experiments). */
export interface PaginateSearchOpts {
  /** How far back (fraction of one slice) a cut searches for a gap. */
  searchFraction?: number;
  /** Minimum slice height as a fraction of a full slice (avoids slivers). */
  minSliceFraction?: number;
  /** Histogram resolution for the vertical ink occupancy map. */
  bins?: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Count, per vertical bin, how many ink spans cover it. */
export function buildInkOccupancy(
  spans: MermaidInkSpan[],
  totalHeight: number,
  binCount: number = PAGINATE_HISTOGRAM_BINS
): number[] {
  const occ = new Array<number>(binCount).fill(0);
  if (!(totalHeight > 0) || binCount <= 0) return occ;
  for (const s of spans) {
    if (!s || !(s.height > 0) || !Number.isFinite(s.y) || !Number.isFinite(s.height)) continue;
    const lo = clampInt(Math.floor((s.y / totalHeight) * binCount), 0, binCount - 1);
    const hi = clampInt(Math.ceil(((s.y + s.height) / totalHeight) * binCount) - 1, 0, binCount - 1);
    for (let b = lo; b <= hi; b++) occ[b]++;
  }
  return occ;
}

/**
 * Snap a cut backward into the emptiest row within the search window.
 * Ties keep the position closest to nominal; an empty map returns nominal.
 */
export function snapCutToGap(
  occupancy: number[],
  nominalCut: number,
  totalHeight: number,
  searchBack: number
): number {
  const n = occupancy.length;
  if (n === 0 || !(totalHeight > 0)) return nominalCut;
  const nominalBin = clampInt(Math.round((nominalCut / totalHeight) * (n - 1)), 0, n - 1);
  const searchBins = Math.max(0, Math.round((searchBack / totalHeight) * (n - 1)));
  let best = nominalBin;
  let bestInk = occupancy[nominalBin] ?? Number.POSITIVE_INFINITY;
  for (let b = nominalBin - 1; b >= Math.max(0, nominalBin - searchBins); b--) {
    const ink = occupancy[b] ?? Number.POSITIVE_INFINITY;
    if (ink < bestInk) {
      bestInk = ink;
      best = b;
      if (ink === 0) break;
    }
  }
  if (best === nominalBin) return nominalCut;
  return ((best + 0.5) / n) * totalHeight;
}

/** Ink coverage at a cut position (same bin mapping snapCutToGap uses). */
function occupancyAt(occupancy: number[], cut: number, totalHeight: number): number {
  const n = occupancy.length;
  if (n === 0 || !(totalHeight > 0)) return 0;
  const bin = clampInt(Math.round((cut / totalHeight) * (n - 1)), 0, n - 1);
  return occupancy[bin] ?? 0;
}

/** Fraction of one slice the escape search may fall back to when the nominal
 * cut is trapped inside a node taller than the normal search window. Keeps
 * result pages substantial while still preferring a short clean page over a
 * bisected box. */
export const PAGINATE_ESCAPE_MIN_FRACTION = 0.15;
/**
 * Last-resort escape: scan backward from the nominal cut for the nearest
 * fully empty bin whose center stays above `floor`. Returns null when no
 * gap exists (node taller than the whole slice — a cut is unavoidable).
 */
function escapeToGap(
  occupancy: number[],
  nominalCut: number,
  totalHeight: number,
  floor: number
): number | null {
  const n = occupancy.length;
  if (n === 0 || !(totalHeight > 0)) return null;
  const nominalBin = clampInt(Math.round((nominalCut / totalHeight) * (n - 1)), 0, n - 1);
  for (let b = nominalBin - 1; b >= 0; b--) {
    if ((occupancy[b] ?? 1) !== 0) continue;
    const cut = ((b + 0.5) / n) * totalHeight;
    if (cut < floor) return null;
    return cut;
  }
  return null;
}

/**
 * Greedy slice boundaries in SVG user units: from each start, aim one full
 * slice ahead, then snap the cut backward into a gap. Every slice is at most
 * one full slice high (so it always fits its A4 page); the count may exceed
 * the uniform estimate when gaps pull cuts early.
 */
export function planSliceBoundaries(
  totalHeight: number,
  sliceHeight: number,
  spans: MermaidInkSpan[],
  opts: PaginateSearchOpts = {}
): number[] {
  if (!(totalHeight > 0) || !(sliceHeight > 0)) return [0, Math.max(totalHeight, 0)];
  const searchFraction = opts.searchFraction ?? PAGINATE_GAP_SEARCH_FRACTION;
  const minSliceFraction = opts.minSliceFraction ?? PAGINATE_MIN_SLICE_FRACTION;
  const bins = opts.bins ?? PAGINATE_HISTOGRAM_BINS;
  const occupancy = buildInkOccupancy(spans, totalHeight, bins);
  const searchBack = sliceHeight * searchFraction;
  const minSlice = sliceHeight * minSliceFraction;
  const cuts = [0];
  let start = 0;
  let guard = 0;
  while (totalHeight - start > sliceHeight && guard++ < 10000) {
    let nominal = start + sliceHeight;
    let lastCut = false;
    const tail = totalHeight - nominal;
    if (tail > 0 && tail < minSlice) {
      // A further full slice would strand a sliver page: bisect the remainder
      // instead so both final slices fit and stay substantial.
      nominal = start + (totalHeight - start) / 2;
      lastCut = true;
    }
    let cut = snapCutToGap(occupancy, nominal, totalHeight, searchBack);
    // Never drift forward, and never emit a sliver page.
    if (!(cut > start + minSlice) || cut > nominal) cut = nominal;
    // The nominal cut can be trapped inside a node taller than the normal
    // backward window (snap finds no emptier bin and keeps nominal). Fall
    // back to the nearest real gap above, allowing a shorter-but-clean page.
    if (occupancyAt(occupancy, cut, totalHeight) > 0) {
      const escape = escapeToGap(
        occupancy,
        nominal,
        totalHeight,
        start + sliceHeight * PAGINATE_ESCAPE_MIN_FRACTION
      );
      if (escape != null && escape > start && escape <= nominal) cut = escape;
    }
    cuts.push(cut);
    start = cut;
    if (lastCut) break;
  }
  cuts.push(totalHeight);
  return cuts;
}

// --- Export-time diagram SVG resolution ------------------------------------
// The paginate exporter must measure the DIAGRAM svg. Node headers also hold
// small Lucide icon SVGs, so a bare querySelector('svg') can grab a 24x24
// icon and corrupt slice geometry (wrong plan, duplicated windows that read
// as "stacked" content). Prefer the diagram svg inside .panzoom-wrapper and
// otherwise fall back to the largest-area svg in the container.

/** Parse an SVG viewBox attribute into width/height. Null when absent/malformed. */
export function parseSvgViewBoxSize(viewBox: string | null | undefined): { width: number; height: number } | null {
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const h = parts[3];
  const w = parts[2];
  if (!(w > 0) || !(h > 0)) return null;
  return { width: w, height: h };
}

function isSvgElement(el: Element | null): el is SVGSVGElement {
  return !!el && el.tagName.toLowerCase() === 'svg';
}

/** Resolve the exportable diagram SVG inside a mermaid node container. */
export function resolveMermaidExportSvg(container: Element): SVGSVGElement | null {
  const inWrapper = container.querySelector('.panzoom-wrapper svg');
  if (isSvgElement(inWrapper)) return inWrapper;
  // Fallback: largest-area svg (a real diagram dwarfs 24px Lucide icons).
  let best: SVGSVGElement | null = null;
  let bestArea = 0;
  container.querySelectorAll('svg').forEach((s) => {
    if (!isSvgElement(s)) return;
    let area = 0;
    try {
      const r = (s as unknown as SVGGraphicsElement).getBoundingClientRect();
      area = r.width * r.height;
    } catch {
      /* unmeasurable svg: area stays 0 */
    }
    if (area > bestArea) {
      bestArea = area;
      best = s;
    }
  });
  return best;
}

/**
 * Measurable size of a diagram SVG for export planning. The viewBox is the
 * source of truth (it also works on the detached export clone, where layout
 * rects read 0); rendered rects are only a fallback for SVGs without one.
 * Returns null when nothing is measurable (not rendered yet).
 */
export function getMermaidExportSize(svg: Element): { width: number; height: number } | null {
  const vb = parseSvgViewBoxSize(svg.getAttribute('viewBox'));
  if (vb) return vb;
  try {
    const r = (svg as unknown as SVGGraphicsElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { width: r.width, height: r.height };
  } catch {
    /* ignore unmeasurable svg */
  }
  return null;
}

/**
 * True when every mermaid node under root has finished rendering its diagram
 * SVG (a rendered error banner also counts as settled). The exporter must
 * wait for this: slicing an unrendered node exports empty or duplicated
 * windows that read as overlapped content.
 */
export function areMermaidDiagramsReady(root: ParentNode): boolean {
  const containers = root.querySelectorAll('.mermaid-node-container');
  for (const c of Array.from(containers)) {
    if (resolveMermaidExportSvg(c) || c.querySelector('[data-testid="mermaid-error-banner"]')) continue;
    return false;
  }
  return true;
}

/** Poll until diagrams settle (or timeout). Resolves true when all are ready. */
export function waitForMermaidDiagramsReady(
  root: ParentNode,
  timeoutMs = 2500,
  intervalMs = 100
): Promise<boolean> {
  return new Promise((resolve) => {
    if (areMermaidDiagramsReady(root)) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      const ready = areMermaidDiagramsReady(root);
      if (ready || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(ready);
      }
    }, intervalMs);
  });
}
