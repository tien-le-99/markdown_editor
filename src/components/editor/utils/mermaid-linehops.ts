// Line-hop bridges for Mermaid flowchart connectors.
//
// Dagre routes edges without any crossing avoidance, so on dense diagrams
// two connectors can cross in a plain X that hides which line goes where.
// This module post-processes the RENDERED svg markup (not the source):
// every crossing between two edge paths gains a small semicircular hop on
// one of them, circuit-diagram style, so crossings stay readable at any zoom.
//
// Design notes:
// - Flowchart edges with `curve: 'linear'` render as pure M/L polylines, so
//   crossings are exact segment intersections (no sampling needed). Paths
//   containing any other command are left untouched.
// - Hops are baked into the svg markup string before it reaches React state,
//   so the editor, pan/zoom, and the PDF export clone all share them.
// - Edge connector paths are excluded from the paginate ink model, so hops
//   never affect slice boundaries.

export interface HopPoint {
  x: number;
  y: number;
}

/**
 * Radius of the hop semicircle, in SVG user units. Kept at most half the
 * bundle lane (OVERLAP_LANE = 20): diameter 16 leaves a clear gap to the
 * next parallel line, so stacked hops on a bundle crossing read as
 * individual bridges instead of one merged knot.
 */
export const LINE_HOP_RADIUS = 8;
/** Crossings this close (arclength) to a path end are skipped: protects arrowheads. */
export const LINE_HOP_END_MARGIN = 25;
/** Crossings this close (arclength) to a path start are skipped: protects origin box joins. */
export const LINE_HOP_START_MARGIN = 10;
/** Crossings between near-parallel segments are skipped (shared routes). */
export const LINE_HOP_MIN_ANGLE_DEG = 12;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse an absolute M/L/H/V polyline `d` into points.
 * Returns null when the path uses any other command (curves, relative
 * moves, closes) — those paths are left untouched.
 */
export function parsePolylinePoints(d: string | null): HopPoint[] | null {
  if (!d) return null;
  const tokens = d.match(/[MLHVmlhv]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return null;
  // Every non-separator character must be consumed: silently dropping an
  // unknown command (e.g. trailing Z, curves) would corrupt geometry.
  const leftover = d.replace(/[MLHVmlhv]|-?\d*\.?\d+(?:e[-+]?\d+)?|[\s,]/g, '');
  if (leftover.length > 0) return null;
  const pts: HopPoint[] = [];
  let cx = 0;
  let cy = 0;
  let started = false;
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      if (i + 1 >= tokens.length) return null;
      cx = Number(tokens[i++]);
      cy = Number(tokens[i++]);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      pts.push({ x: cx, y: cy });
      started = true;
    } else if (cmd === 'L') {
      if (!started || i + 1 >= tokens.length) return null;
      cx = Number(tokens[i++]);
      cy = Number(tokens[i++]);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      pts.push({ x: cx, y: cy });
    } else if (cmd === 'H') {
      if (!started || i >= tokens.length) return null;
      cx = Number(tokens[i++]);
      if (!Number.isFinite(cx)) return null;
      pts.push({ x: cx, y: cy });
    } else if (cmd === 'V') {
      if (!started || i >= tokens.length) return null;
      cy = Number(tokens[i++]);
      if (!Number.isFinite(cy)) return null;
      pts.push({ x: cx, y: cy });
    } else {
      // Relative commands, curves, arcs, close: unsupported.
      return null;
    }
  }
  return pts.length >= 2 ? pts : null;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Proper intersection of segments p1-p2 and p3-p4. Returns the crossing
 * point, or null when parallel/collinear/non-overlapping. Endpoint touches
 * count as crossings here (callers filter by end margin).
 */
export function segmentIntersection(
  p1: HopPoint,
  p2: HopPoint,
  p3: HopPoint,
  p4: HopPoint
): HopPoint | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = cross(d1x, d1y, d2x, d2y);
  if (denom === 0) return null; // parallel or collinear
  const t = cross(p3.x - p1.x, p3.y - p1.y, d2x, d2y) / denom;
  const u = cross(p3.x - p1.x, p3.y - p1.y, d1x, d1y) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/** Angle in degrees between segment directions (0 = parallel). */
export function segmentAngleDeg(
  a1: HopPoint,
  a2: HopPoint,
  b1: HopPoint,
  b2: HopPoint
): number {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const len1 = Math.hypot(d1x, d1y);
  const len2 = Math.hypot(d2x, d2y);
  if (!(len1 > 0) || !(len2 > 0)) return 0;
  const cos = Math.min(1, Math.max(-1, (d1x * d2x + d1y * d2y) / (len1 * len2)));
  const deg = (Math.acos(cos) * 180) / Math.PI;
  return Math.min(deg, 180 - deg);
}

export interface PathCrossing {
  /** Index of the path that keeps going straight. */
  straight: number;
  /** Index of the path that hops over it. */
  hopper: number;
  /** Crossing point in SVG user units. */
  point: HopPoint;
  /** Segment index on the hopping path where the arc lands. */
  hopperSeg: number;
}

function polylineLengths(pts: HopPoint[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return cum;
}

/**
 * Find all crossings between distinct polylines that deserve a hop:
 * proper (non-parallel) intersections away from both paths' ends.
 * Later paths hop over earlier ones (deterministic).
 */
export function findHopCrossings(
  polylines: HopPoint[][],
  radius: number = LINE_HOP_RADIUS,
  endMargin: number = LINE_HOP_END_MARGIN,
  minAngleDeg: number = LINE_HOP_MIN_ANGLE_DEG,
  startMargin: number = LINE_HOP_START_MARGIN
): PathCrossing[] {
  const out: PathCrossing[] = [];
  const lengths = polylines.map(polylineLengths);
  for (let j = 1; j < polylines.length; j++) {
    const b = polylines[j];
    for (let i = 0; i < j; i++) {
      const a = polylines[i];
      for (let sa = 0; sa < a.length - 1; sa++) {
        for (let sb = 0; sb < b.length - 1; sb++) {
          const p = segmentIntersection(a[sa], a[sa + 1], b[sb], b[sb + 1]);
          if (!p) continue;
          if (segmentAngleDeg(a[sa], a[sa + 1], b[sb], b[sb + 1]) < minAngleDeg) continue;
          // Arclength of the crossing along each path (approx: segment start + projection).
          const segBLen = Math.hypot(b[sb + 1].x - b[sb].x, b[sb + 1].y - b[sb].y);
          const segALen = Math.hypot(a[sa + 1].x - a[sa].x, a[sa + 1].y - a[sa].y);
          if (!(segBLen > 0) || !(segALen > 0)) continue;
          const sB = lengths[j][sb] + Math.hypot(p.x - b[sb].x, p.y - b[sb].y);
          const sA = lengths[i][sa] + Math.hypot(p.x - a[sa].x, p.y - a[sa].y);
          const totalB = lengths[j][lengths[j].length - 1];
          const totalA = lengths[i][lengths[i].length - 1];
          if (sB < startMargin || totalB - sB < endMargin) continue;
          if (sA < startMargin || totalA - sA < endMargin) continue;
          // The hop arc must fit on one straight hopper segment.
          const distEnds = Math.min(
            Math.hypot(p.x - b[sb].x, p.y - b[sb].y),
            Math.hypot(p.x - b[sb + 1].x, p.y - b[sb + 1].y)
          );
          if (distEnds < radius + 2) continue;
          out.push({ straight: i, hopper: j, point: p, hopperSeg: sb });
        }
      }
    }
  }
  return out;
}

/**
 * Rebuild a polyline `d` with semicircle hops at the given crossings
 * (each: segment index + point, sorted along the path). Arc bulges to the
 * clockwise side of travel for a consistent look.
 */
export function insertHopArcs(
  pts: HopPoint[],
  crossings: { seg: number; point: HopPoint }[],
  radius: number = LINE_HOP_RADIUS
): string {
  const bySeg = new Map<number, HopPoint[]>();
  for (const c of crossings) {
    const list = bySeg.get(c.seg) ?? [];
    list.push(c.point);
    bySeg.set(c.seg, list);
  }
  // Order multiple hops on one segment along travel direction, merging
  // near-coincident crossings (two edges crossing at the same spot would
  // otherwise emit a doubled bump with a backtracking line between arcs).
  for (const [seg, list] of bySeg) {
    const a = pts[seg];
    list.sort(
      (p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)
    );
    for (let k = list.length - 1; k > 0; k--) {
      const prev = list[k - 1];
      const cur = list[k];
      if (Math.hypot(cur.x - prev.x, cur.y - prev.y) < radius * 2) {
        list.splice(k, 1);
      }
    }
  }
  let d = `M${round2(pts[0].x)},${round2(pts[0].y)}`;
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const hops = bySeg.get(s) ?? [];
    if (len <= 0 || hops.length === 0) {
      d += `L${round2(b.x)},${round2(b.y)}`;
      continue;
    }
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const emitLineTo = (p: HopPoint) => {
      d += `L${round2(p.x)},${round2(p.y)}`;
    };
    for (const p of hops) {
      const p1 = { x: p.x - tx * radius, y: p.y - ty * radius };
      const p2 = { x: p.x + tx * radius, y: p.y + ty * radius };
      emitLineTo(p1);
      d += `A${round2(radius)} ${round2(radius)} 0 0 1 ${round2(p2.x)},${round2(p2.y)}`;
    }
    d += `L${round2(b.x)},${round2(b.y)}`;
  }
  return d;
}

/**
 * Make flowchart connectors legible at small print scales: edge strokes
 * render at 1 user unit, which becomes a hairline once a wide diagram is
 * fitted to the page. This appends an override rule (2.5 units, round joins
 * so hop arcs and detour corners render smoothly) to the SVG's own styles.
 * Thick edges keep their width; markers use userSpaceOnUse sizing, so
 * arrowheads are unaffected. Idempotent via a data-attribute marker.
 * Never throws: any failure returns the input unchanged.
 */
export const CONNECTOR_STROKE_WIDTH = 2.5;

export function applyConnectorStylingToSvgMarkup(
  svgMarkup: string,
  strokeWidth: number = CONNECTOR_STROKE_WIDTH
): string {
  try {
    if (!svgMarkup || svgMarkup.indexOf('edgePaths') === -1) return svgMarkup;
    if (typeof DOMParser === 'undefined') return svgMarkup;
    const doc = new DOMParser().parseFromString(`<div>${svgMarkup}</div>`, 'text/html');
    const svg = doc.querySelector('svg');
    if (!svg) return svgMarkup;
    if (svg.querySelector('style[data-connector-styling]')) return svgMarkup;
    if (svg.querySelectorAll('g.edgePaths path').length === 0) return svgMarkup;
    const style = doc.createElement('style');
    style.setAttribute('data-connector-styling', '1');
    style.textContent =
      `g.edgePaths path.flowchart-link{stroke-linejoin:round !important;}` +
      `g.edgePaths path.edge-thickness-normal{stroke-width:${strokeWidth}px !important;}`;
    svg.insertBefore(style, svg.firstChild);
    return svg.outerHTML;
  } catch {
    return svgMarkup;
  }
}

/**
 * Make subgraph (cluster) backgrounds transparent so overlapping cluster
 * frames can never hide node boxes, edge labels, or other cluster titles
 * underneath an opaque wash. Mermaid paints per-cluster accent fills as
 * INLINE !important styles, which beat any stylesheet rule, so the fill is
 * neutralized inline per rect (borders keep their colors and widths, so
 * grouping stays readable). Idempotent (re-setting the same value), shared
 * style-tag marker with the connector styling.
 * Never throws: any failure returns the input unchanged.
 */
export function applyClusterTransparencyToSvgMarkup(svgMarkup: string): string {
  try {
    if (!svgMarkup || svgMarkup.indexOf('cluster') === -1) return svgMarkup;
    if (typeof DOMParser === 'undefined') return svgMarkup;
    const doc = new DOMParser().parseFromString(`<div>${svgMarkup}</div>`, 'text/html');
    const svg = doc.querySelector('svg');
    if (!svg) return svgMarkup;
    const rects = Array.from(svg.querySelectorAll('g.cluster > rect'));
    if (rects.length === 0) return svgMarkup;
    const existing = svg.querySelector('style[data-connector-styling]');
    const alreadyMarked =
      !!existing &&
      !!existing.textContent &&
      existing.textContent.indexOf('cluster-transparency-applied') !== -1;
    const needsFill = rects.some((rect) => {
      try {
        return (rect as unknown as HTMLElement).style.getPropertyValue('fill') !== 'none';
      } catch {
        return false;
      }
    });
    if (alreadyMarked && !needsFill) return svgMarkup;
    let style = svg.querySelector('style[data-connector-styling]');
    if (!style) {
      style = doc.createElement('style');
      style.setAttribute('data-connector-styling', '1');
      svg.insertBefore(style, svg.firstChild);
    }
    rects.forEach((rect) => {
      try {
        (rect as unknown as HTMLElement).style.setProperty('fill', 'none', 'important');
      } catch {
        /* keep original fill for this rect */
      }
    });
    if (!alreadyMarked) {
      style.textContent =
        (style.textContent || '') +
        `g.cluster > rect{fill:none !important;}/*cluster-transparency-applied*/`;
    }
    return svg.outerHTML;
  } catch {
    return svgMarkup;
  }
}

/**
 * Add line-hop bridges to every edge crossing in a rendered flowchart SVG
 * markup string. Touches only `g.edgePaths path` polylines (sequence
 * diagrams and other node types have none, so they pass through byte-
 * identical). Never throws: any failure returns the input unchanged.
 */
export function applyLineHopsToSvgMarkup(
  svgMarkup: string,
  radius: number = LINE_HOP_RADIUS
): string {
  try {
    if (!svgMarkup || svgMarkup.indexOf('edgePaths') === -1) return svgMarkup;
    if (typeof DOMParser === 'undefined') return svgMarkup;
    const doc = new DOMParser().parseFromString(`<div>${svgMarkup}</div>`, 'text/html');
    const svg = doc.querySelector('svg');
    if (!svg) return svgMarkup;
    const els = Array.from(svg.querySelectorAll('g.edgePaths path'));
    if (els.length < 2) return svgMarkup;
    const parsed: { el: Element; pts: HopPoint[] }[] = [];
    for (const el of els) {
      const pts = parsePolylinePoints(el.getAttribute('d'));
      if (pts) parsed.push({ el, pts });
    }
    if (parsed.length < 2) return svgMarkup;
    const crossings = findHopCrossings(parsed.map((p) => p.pts), radius);
    if (crossings.length === 0) return svgMarkup;
    const hopsByPath = new Map<number, { seg: number; point: HopPoint }[]>();
    for (const c of crossings) {
      const list = hopsByPath.get(c.hopper) ?? [];
      list.push({ seg: c.hopperSeg, point: c.point });
      hopsByPath.set(c.hopper, list);
    }
    for (const [idx, list] of hopsByPath) {
      parsed[idx].el.setAttribute('d', insertHopArcs(parsed[idx].pts, list, radius));
    }
    return svg.outerHTML;
  } catch {
    return svgMarkup;
  }
}
