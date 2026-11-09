// Orthogonal node avoidance for Mermaid flowchart connectors.
//
// Dagre routes long edges straight through foreign node boxes (they then
// paint UNDER the boxes since edgePaths precedes nodes), parks runs exactly
// on cluster frame borders, and merges parallel edges into shared tracks.
// This module post-processes the rendered SVG markup in three passes:
//   1. U-detours around foreign node boxes (15-unit clearance lanes),
//   2. lateral shifts off cluster frame borders,
//   3. lane separation for collinear edge bundles (later paths move around
//      earlier ones; candidate lanes must also clear nodes, pills, and
//      cluster frames so fixes never trade one overlap for another; shift
//      windows trim inward past end-grazing blockers so a hairline graze
//      cannot veto separating a long merged run).
// so connectors never pass through (or behind) nodes.
//
// Design notes:
// - Only axis-aligned (H/V) segments are rerouted; diagonal segments are
//   left untouched (use an orthogonal curve so there are few of those).
// - Boxes come from the markup itself (explicit shape geometry + accumulated
//   ancestor translates); cluster backgrounds are excluded on purpose.
// - A detour is skipped when its disturbed zone reaches a nearby edge-label
//   pill (rect-based proximity, so long clips far from any pill still route),
//   comes too close to a path end (arrowheads), or collides with another box.
//   Better to leave one crossing than to corrupt the diagram: every skip path
//   is unit-tested.
// - Detours add axis-aligned segments, so the line-hop pass runs AFTER this
//   one and bridges any crossing a detour introduces.
// - Never throws: any failure returns the input unchanged.

import { parsePolylinePoints } from './mermaid-linehops';

export interface AvoidBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One axis-aligned side of a cluster (subgraph) frame, in SVG user units. */
export interface ClusterBorder {
  /** 'H' for top/bottom sides, 'V' for left/right sides. */
  dir: 'H' | 'V';
  /** Fixed coordinate (y for H, x for V). */
  at: number;
  /** Span along the side. */
  from: number;
  /** Span along the side. */
  to: number;
}

/** Shift runs closer than this to a cluster border out to a clear lane. */
export const BORDER_HUG_LATERAL = 12;
/** Only hug spans longer than this are shifted (short touches are corners). */
export const BORDER_HUG_MIN_OVERLAP = 40;
/** Target clearance between a shifted run and the border. */
export const BORDER_SHIFT_LANE = 15;
/** Shift collinear edge runs closer than this to each other apart. */
export const OVERLAP_LATERAL = 8;
/** Only separate shared runs longer than this (short touches are corners). */
export const OVERLAP_MIN_LENGTH = 50;
/**
 * Target separation between unbundled parallel runs. Must stay clearly
 * larger than the hop diameter (2 * LINE_HOP_RADIUS = 16): with the old
 * 12-unit lane, hop arcs bulged a full lane sideways and touched the very
 * neighbor line they were bridging over, turning every bundle crossing
 * into an unreadable 3-way/4-way knot. At 20, adjacent-lane hops keep a
 * ~4-unit clear gap on each side.
 */
export const OVERLAP_LANE = 20;
/** Separated runs must keep this lateral clearance from placed runs. */
export const OVERLAP_PLACED_CLEAR = 12;
/** Lane multipliers tried in order (deterministic side preference). */
const OVERLAP_LANE_STEPS: (1 | -1 | 2 | -2)[] = [1, -1, 2, -2];

export interface AvoidPoint {
  x: number;
  y: number;
}

/** Clearance between a detour and the box it avoids, in SVG user units. */
export const AVOID_CLEARANCE = 15;
/** Clips nearer than this (arclength) to a path end are left alone. */
export const AVOID_END_MARGIN = 25;
/** Candidate detours must clear other boxes by at least this much. */
export const AVOID_BOX_PADDING = 8;

function numAttr(el: Element, name: string): number | null {
  const v = el.getAttribute(name);
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pointsToD(pts: AvoidPoint[]): string {
  return pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${round2(p.x)},${round2(p.y)}`).join('');
}

/** translateX component of transform="translate(x[, y])"; 0 when absent. */
export function translateXOf(transform: string | null): number {
  if (!transform) return 0;
  const m = /translate\(\s*(-?[\d.]+)(?:(?:\s*,\s*|\s+)(-?[\d.]+))?\s*\)/.exec(transform);
  if (!m) return 0;
  const x = Number(m[1]);
  return Number.isFinite(x) ? x : 0;
}

/** translateY component of transform="translate(x[, y])"; 0 when absent/single-arg. */
export function translateYOf(transform: string | null): number {
  if (!transform) return 0;
  const m = /translate\(\s*(-?[\d.]+)(?:(?:\s*,\s*|\s+)(-?[\d.]+))?\s*\)/.exec(transform);
  if (!m) return 0;
  if (m[2] == null || m[2] === '') return 0;
  const y = Number(m[2]);
  return Number.isFinite(y) ? y : 0;
}

/** Sum of translateX/Y from el up to (excluding) stopAt. */
export function accumulatedTranslate(
  el: Element,
  stopAt: Element
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur: Element | null = el;
  let guard = 0;
  while (cur && cur !== stopAt && guard++ < 64) {
    x += translateXOf(cur.getAttribute('transform'));
    y += translateYOf(cur.getAttribute('transform'));
    const parent: Node | null = cur.parentNode;
    cur = parent instanceof Element ? parent : null;
  }
  return { x, y };
}

/** Bounding box of a shape from explicit geometry attributes (no layout). */
export function shapeBoxFromAttrs(el: Element): AvoidBox | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'rect' || tag === 'foreignobject') {
    const x = numAttr(el, 'x') ?? 0;
    const y = numAttr(el, 'y') ?? 0;
    const w = numAttr(el, 'width');
    const h = numAttr(el, 'height');
    if (w == null || h == null || !(w > 0) || !(h > 0)) return null;
    return { x, y, width: w, height: h };
  }
  if (tag === 'ellipse') {
    const cx = numAttr(el, 'cx');
    const cy = numAttr(el, 'cy');
    const rx = numAttr(el, 'rx');
    const ry = numAttr(el, 'ry');
    if (cx == null || cy == null || rx == null || ry == null || !(rx > 0) || !(ry > 0)) return null;
    return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
  }
  if (tag === 'circle') {
    const cx = numAttr(el, 'cx');
    const cy = numAttr(el, 'cy');
    const r = numAttr(el, 'r');
    if (cx == null || cy == null || r == null || !(r > 0)) return null;
    return { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = el.getAttribute('points');
    if (!pts) return null;
    const nums = pts.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 4) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k + 1 < nums.length; k += 2) {
      xs.push(nums[k]);
      ys.push(nums[k + 1]);
    }
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    if (!(x1 > x0) || !(y1 > y0)) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  return null;
}

/**
 * Node boxes in SVG user units from the export clone's own markup.
 * Uses direct shape children (not label descendants) so boxes match the
 * drawn rectangles dagre measured.
 */
export function nodeBoxesFromMarkup(svg: Element): AvoidBox[] {
  const boxes: AvoidBox[] = [];
  svg.querySelectorAll('g.node').forEach((g) => {
    const direct = Array.from(
      g.querySelectorAll(':scope > rect, :scope > polygon, :scope > polyline, :scope > ellipse, :scope > circle, :scope > foreignObject')
    );
    const shapes = direct.length > 0
      ? direct
      : Array.from(g.querySelectorAll('rect, polygon, polyline, ellipse, circle, foreignObject'));
    for (const s of shapes) {
      const box = shapeBoxFromAttrs(s);
      if (!box) continue;
      const t = accumulatedTranslate(s, svg);
      boxes.push({ x: box.x + t.x, y: box.y + t.y, width: box.width, height: box.height });
      break;
    }
  });
  return boxes;
}

/** Edge-label anchor points (group origins) in SVG user units. */
export function labelAnchorsFromMarkup(svg: Element): AvoidPoint[] {
  return labelRectsFromMarkup(svg).map((r) => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  }));
}

/**
 * Edge-label rectangles in SVG user units, from the label group's translate
 * plus its foreignObject size. Used to keep detours from disturbing pills.
 */
export function labelRectsFromMarkup(svg: Element): AvoidBox[] {
  const rects: AvoidBox[] = [];
  svg.querySelectorAll('g.edgeLabel').forEach((g) => {
    const t = accumulatedTranslate(g, svg);
    const fo = g.querySelector('foreignObject');
    const w = fo ? (numAttr(fo, 'width') ?? 0) : 0;
    const h = fo ? (numAttr(fo, 'height') ?? 0) : 0;
    if (!(w > 0) || !(h > 0)) {
      rects.push({ x: t.x, y: t.y, width: 0, height: 0 });
      return;
    }
    // The inner label group offsets the box around the anchor; approximate
    // the pill as centered on the anchor with the FO dimensions.
    rects.push({ x: t.x - w / 2, y: t.y - h / 2, width: w, height: h });
  });
  return rects;
}

function boxesOverlap(a: AvoidBox, b: AvoidBox, pad: number): boolean {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

/** True when segment AB passes through the box interior (endpoints treated as connections). */
export function segmentClipsBox(
  a: AvoidPoint,
  b: AvoidPoint,
  box: AvoidBox,
  endPad: number
): boolean {
  const near = (p: AvoidPoint) =>
    p.x >= box.x - endPad &&
    p.x <= box.x + box.width + endPad &&
    p.y >= box.y - endPad &&
    p.y <= box.y + box.height + endPad;
  if (near(a) || near(b)) return false;
  const horiz = Math.abs(a.y - b.y) < 0.5;
  const vert = Math.abs(a.x - b.x) < 0.5;
  if (horiz) {
    if (!(a.y > box.y && a.y < box.y + box.height)) return false;
    return Math.min(Math.max(a.x, b.x), box.x + box.width) > Math.max(Math.min(a.x, b.x), box.x);
  }
  if (vert) {
    if (!(a.x > box.x && a.x < box.x + box.width)) return false;
    return Math.min(Math.max(a.y, b.y), box.y + box.height) > Math.max(Math.min(a.y, b.y), box.y);
  }
  return false;
}

export interface BoxClip {
  boxIndex: number;
  /** Clip interval along travel, ascending. */
  from: number;
  to: number;
}


/**
 * Test whether a segment (p1 -> p2) overlaps collinear with any segment in a polyline
 * within lateralThresh and with overlap >= minOverlap.
 */
export function segmentOverlapsPolyline(
  p1: AvoidPoint,
  p2: AvoidPoint,
  poly: AvoidPoint[],
  lateralThresh: number = 8,
  minOverlap: number = 8
): boolean {
  const horiz = Math.abs(p1.y - p2.y) < 0.5;
  const vert = Math.abs(p1.x - p2.x) < 0.5;
  if (!horiz && !vert) return false;
  const dir = horiz ? 'x' : 'y';
  const fixed = horiz ? p1.y : p1.x;
  const lo = Math.min(p1[dir], p2[dir]);
  const hi = Math.max(p1[dir], p2[dir]);
  for (let s = 0; s + 1 < poly.length; s++) {
    const q1 = poly[s];
    const q2 = poly[s + 1];
    const qHoriz = Math.abs(q1.y - q2.y) < 0.5;
    const qVert = Math.abs(q1.x - q2.x) < 0.5;
    if (horiz && !qHoriz) continue;
    if (vert && !qVert) continue;
    const qFixed = horiz ? q1.y : q1.x;
    if (Math.abs(fixed - qFixed) >= lateralThresh) continue;
    const qLo = Math.min(q1[dir], q2[dir]);
    const qHi = Math.max(q1[dir], q2[dir]);
    const overlap = Math.min(hi, qHi) - Math.max(lo, qLo);
    if (overlap >= minOverlap) return true;
  }
  return false;
}

/**
 * Rebuild one axis-aligned segment (a -> b) that clips foreign node boxes
 * into a rectangular U-detour hugging each crossed box. Returns the
 * replacement points (excluding `a`, including `b`), or null when the
 * segment has no box clips to detour.
 */
export function detourAroundBoxes(
  a: AvoidPoint,
  b: AvoidPoint,
  boxes: AvoidBox[],
  labels: AvoidBox[],
  opts: {
    clearance?: number;
    /** Bundle lane width for concentric detours (default OVERLAP_LANE). */
    lane?: number;
    boxPadding?: number;
    /** Arclength at the travel-start of this segment (for end-margin guards). */
    travelBase?: number;
    /** Total arclength of the whole path. */
    travelTotal?: number;
    /** Clips nearer than this to a path end are left alone (arrowheads). */
    endMargin?: number;
    /** Previously placed paths: nested U-detours step outward to avoid overlapping earlier detours. */
    placed?: AvoidPoint[][];
    /** Cluster borders: U-detours avoid hugging cluster frames. */
    borders?: ClusterBorder[];
  } = {}
): AvoidPoint[] | null {
  const baseClearance = opts.clearance ?? AVOID_CLEARANCE;
  const laneWidth = opts.lane ?? OVERLAP_LANE;
  const nestedLayers = opts.placed && opts.placed.length > 0 ? [0, 1, 2] : [0];
  const boxPadding = opts.boxPadding ?? AVOID_BOX_PADDING;
  const travelBase = opts.travelBase ?? 0;
  const travelTotal = opts.travelTotal ?? Number.POSITIVE_INFINITY;
  const endMargin = opts.endMargin ?? AVOID_END_MARGIN;
  const horiz = Math.abs(a.y - b.y) < 0.5;
  const vert = Math.abs(a.x - b.x) < 0.5;
  if (horiz === vert) return null; // diagonal or degenerate
  const dir = horiz ? 'x' : 'y';
  const fixed = horiz ? a.y : a.x;
  const lo = Math.min(a[dir], b[dir]);
  const hi = Math.max(a[dir], b[dir]);
  const forward = b[dir] >= a[dir];

  interface Clip {
    box: AvoidBox;
    from: number;
    to: number;
  }
  const clips: Clip[] = [];
  boxes.forEach((box) => {
    if (horiz) {
      if (!(fixed > box.y && fixed < box.y + box.height)) return;
    } else {
      if (!(fixed > box.x && fixed < box.x + box.width)) return;
    }
    // Endpoints adjacent to the box are connections, not crossings.
    const endNear = (p: AvoidPoint) =>
      p.x >= box.x - 3 && p.x <= box.x + box.width + 3 && p.y >= box.y - 3 && p.y <= box.y + box.height + 3;
    if (endNear(a) || endNear(b)) return;
    const from = Math.max(lo, horiz ? box.x : box.y);
    const to = Math.min(hi, horiz ? box.x + box.width : box.y + box.height);
    if (!(to > from)) return;
    // Keep the arrowhead approach untouched: no detour near a path end.
    const travelFrom = travelBase + (forward ? from - lo : hi - to);
    const travelTo = travelBase + (forward ? to - lo : hi - from);
    if (travelFrom < endMargin || travelTo > travelTotal - endMargin) return;
    // Keep clear of edge labels so detours never detach a pill from its line:
    // skip only when the disturbed zone (clip span plus detour clearance)
    // actually reaches a pill rectangle.
    const pad = baseClearance + boxPadding;
    const zone: AvoidBox = horiz
      ? { x: from - pad, y: fixed - pad, width: to - from + 2 * pad, height: 2 * pad }
      : { x: fixed - pad, y: from - pad, width: 2 * pad, height: to - from + 2 * pad };
    const pillNear = labels.some((l) => boxesOverlap(zone, l, 8));
    if (pillNear) return;
    clips.push({ box, from, to });
  });
  if (clips.length === 0) return null;
  clips.sort((p, q) => (forward ? p.from - q.from : q.to - p.to));

  const out: AvoidPoint[] = [];
  let cursor = forward ? lo : hi;
  const at = (along: number): AvoidPoint => (horiz ? { x: along, y: fixed } : { x: fixed, y: along });

  for (const clip of clips) {
    const cFrom = forward ? clip.from : clip.to;
    const cTo = forward ? clip.to : clip.from;
    const boxLo = horiz ? clip.box.y : clip.box.x;
    const boxHi = horiz ? clip.box.y + clip.box.height : clip.box.x + clip.box.width;

    const negFree = (() => {
      const lane = boxLo - baseClearance;
      const entry = forward ? cFrom - baseClearance : cFrom + baseClearance;
      const exit = forward ? cTo + baseClearance : cTo - baseClearance;
      const rect: AvoidBox = horiz
        ? { x: Math.min(entry, exit), y: lane - boxPadding, width: Math.abs(exit - entry), height: fixed - lane + 2 * boxPadding }
        : { x: lane - boxPadding, y: Math.min(entry, exit), width: fixed - lane + 2 * boxPadding, height: Math.abs(entry - exit) };
      for (const o of boxes) {
        if (o === clip.box) continue;
        if (boxesOverlap(rect, o, 0)) return -1;
      }
      return fixed - lane;
    })();
    const posFree = (() => {
      const lane = boxHi + baseClearance;
      const entry = forward ? cFrom - baseClearance : cFrom + baseClearance;
      const exit = forward ? cTo + baseClearance : cTo - baseClearance;
      const rect: AvoidBox = horiz
        ? { x: Math.min(entry, exit), y: fixed - boxPadding, width: Math.abs(exit - entry), height: lane - fixed + 2 * boxPadding }
        : { x: fixed - boxPadding, y: Math.min(entry, exit), width: lane - fixed + 2 * boxPadding, height: Math.abs(entry - exit) };
      for (const o of boxes) {
        if (o === clip.box) continue;
        if (boxesOverlap(rect, o, 0)) return -1;
      }
      return lane - fixed;
    })();

    const sides: (1 | -1)[] = [];
    if (negFree > 0 && posFree > 0) {
      if (negFree <= posFree) sides.push(-1, 1);
      else sides.push(1, -1);
    } else if (negFree > 0) {
      sides.push(-1);
    } else if (posFree > 0) {
      sides.push(1);
    }
    if (sides.length === 0) continue; // both sides blocked: leave the crossing

    interface Candidate {
      entry: number;
      exit: number;
      lane: number;
      overlapsPlaced: boolean;
    }
    let chosen: Candidate | null = null;
    let fallback: Candidate | null = null;

    for (const side of sides) {
      for (const layer of nestedLayers) {
        const cTravel = baseClearance + layer * 10;
        const cLane = baseClearance + layer * laneWidth;
        const entry = forward ? cFrom - cTravel : cFrom + cTravel;
        const exit = forward ? cTo + cTravel : cTo - cTravel;
        if (forward ? entry <= cursor : entry >= cursor) continue;

        const lane = side < 0 ? boxLo - cLane : boxHi + cLane;
        // Verify corridor clears other boxes
        const rect: AvoidBox = horiz
          ? {
              x: Math.min(entry, exit),
              y: side < 0 ? lane - boxPadding : fixed - boxPadding,
              width: Math.abs(exit - entry),
              height: Math.abs(lane - fixed) + 2 * boxPadding,
            }
          : {
              x: side < 0 ? lane - boxPadding : fixed - boxPadding,
              y: Math.min(entry, exit),
              width: Math.abs(lane - fixed) + 2 * boxPadding,
              height: Math.abs(exit - entry),
            };
        let hitsBox = false;
        for (const o of boxes) {
          if (o === clip.box) continue;
          if (boxesOverlap(rect, o, 0)) {
            hitsBox = true;
            break;
          }
        }
        if (hitsBox) continue;

        // Verify label pills
        const pad = cLane + boxPadding;
        const zone: AvoidBox = horiz
          ? { x: clip.from - pad, y: fixed - pad, width: clip.to - clip.from + 2 * pad, height: 2 * pad }
          : { x: fixed - pad, y: clip.from - pad, width: 2 * pad, height: clip.to - clip.from + 2 * pad };
        if (labels.some((l) => boxesOverlap(zone, l, 8))) continue;

        // Verify cluster borders
        if (opts.borders) {
          let hugsBorder = false;
          for (const bd of opts.borders) {
            if (horiz) {
              if (bd.dir === 'H' && Math.abs(lane - bd.at) < BORDER_HUG_LATERAL) {
                if (Math.min(Math.max(entry, exit), bd.to) - Math.max(Math.min(entry, exit), bd.from) > BORDER_HUG_MIN_OVERLAP) {
                  hugsBorder = true;
                  break;
                }
              }
              if (bd.dir === 'V') {
                if (Math.abs(entry - bd.at) < BORDER_HUG_LATERAL) {
                  if (Math.min(Math.max(fixed, lane), bd.to) - Math.max(Math.min(fixed, lane), bd.from) > BORDER_HUG_MIN_OVERLAP) {
                    hugsBorder = true;
                    break;
                  }
                }
                if (Math.abs(exit - bd.at) < BORDER_HUG_LATERAL) {
                  if (Math.min(Math.max(fixed, lane), bd.to) - Math.max(Math.min(fixed, lane), bd.from) > BORDER_HUG_MIN_OVERLAP) {
                    hugsBorder = true;
                    break;
                  }
                }
              }
            } else {
              if (bd.dir === 'V' && Math.abs(lane - bd.at) < BORDER_HUG_LATERAL) {
                if (Math.min(Math.max(entry, exit), bd.to) - Math.max(Math.min(entry, exit), bd.from) > BORDER_HUG_MIN_OVERLAP) {
                  hugsBorder = true;
                  break;
                }
              }
              if (bd.dir === 'H') {
                if (Math.abs(entry - bd.at) < BORDER_HUG_LATERAL) {
                  if (Math.min(Math.max(fixed, lane), bd.to) - Math.max(Math.min(fixed, lane), bd.from) > BORDER_HUG_MIN_OVERLAP) {
                    hugsBorder = true;
                    break;
                  }
                }
                if (Math.abs(exit - bd.at) < BORDER_HUG_LATERAL) {
                  if (Math.min(Math.max(fixed, lane), bd.to) - Math.max(Math.min(fixed, lane), bd.from) > BORDER_HUG_MIN_OVERLAP) {
                    hugsBorder = true;
                    break;
                  }
                }
              }
            }
          }
          if (hugsBorder) continue;
        }

        // Check overlap with placed paths
        let overlapsPlaced = false;
        if (opts.placed && opts.placed.length > 0) {
          const p0 = at(entry);
          const p1 = horiz ? { x: entry, y: lane } : { x: lane, y: entry };
          const p2 = horiz ? { x: exit, y: lane } : { x: lane, y: exit };
          const p3 = at(exit);
          for (const poly of opts.placed) {
            if (
              segmentOverlapsPolyline(p0, p1, poly) ||
              segmentOverlapsPolyline(p1, p2, poly) ||
              segmentOverlapsPolyline(p2, p3, poly)
            ) {
              overlapsPlaced = true;
              break;
            }
          }
        }

        const candidate: Candidate = { entry, exit, lane, overlapsPlaced };
        if (!fallback) fallback = candidate;

        if (!overlapsPlaced) {
          chosen = candidate;
          break;
        }
      }
      if (chosen) break;
    }

    const sel = chosen ?? fallback;
    if (!sel) continue;

    out.push(at(sel.entry));
    out.push(horiz ? { x: sel.entry, y: sel.lane } : { x: sel.lane, y: sel.entry });
    out.push(horiz ? { x: sel.exit, y: sel.lane } : { x: sel.lane, y: sel.exit });
    out.push(at(sel.exit));
    cursor = sel.exit;
  }
  if (out.length === 0) return null;
  out.push(b);
  return out;
}

/**
 * Cluster frame sides in SVG user units, from each cluster background rect.
 * Only the direct rect child counts (labels live in g.cluster-label).
 */
export function clusterBordersFromMarkup(svg: Element): ClusterBorder[] {
  const borders: ClusterBorder[] = [];
  svg.querySelectorAll('g.cluster').forEach((g) => {
    const rect = g.querySelector(':scope > rect');
    if (!rect) return;
    const box = shapeBoxFromAttrs(rect);
    if (!box) return;
    const t = accumulatedTranslate(rect, svg);
    const x = box.x + t.x;
    const y = box.y + t.y;
    borders.push(
      { dir: 'H', at: y, from: x, to: x + box.width },
      { dir: 'H', at: y + box.height, from: x, to: x + box.width },
      { dir: 'V', at: x, from: y, to: y + box.height },
      { dir: 'V', at: x + box.width, from: y, to: y + box.height }
    );
  });
  return borders;
}

/**
 * Shift the portions of one axis-aligned segment that run on top of (or
 * visibly merged with) a cluster frame border out to a clear lane, so
 * connectors never trace frame lines. Perpendicular border crossings are
 * legitimate and left alone. Returns replacement points (excluding the
 * segment start, including its end), or null when nothing needs shifting.
 */
export function shiftOffClusterBorders(
  a: AvoidPoint,
  b: AvoidPoint,
  borders: ClusterBorder[],
  boxes: AvoidBox[],
  labels: AvoidBox[],
  opts: {
    lateral?: number;
    minOverlap?: number;
    lane?: number;
    boxPadding?: number;
    travelBase?: number;
    travelTotal?: number;
    endMargin?: number;
  } = {}
): AvoidPoint[] | null {
  const lateral = opts.lateral ?? BORDER_HUG_LATERAL;
  const minOverlap = opts.minOverlap ?? BORDER_HUG_MIN_OVERLAP;
  const lane = opts.lane ?? BORDER_SHIFT_LANE;
  const boxPadding = opts.boxPadding ?? AVOID_BOX_PADDING;
  const travelBase = opts.travelBase ?? 0;
  const travelTotal = opts.travelTotal ?? Number.POSITIVE_INFINITY;
  const endMargin = opts.endMargin ?? AVOID_END_MARGIN;
  const horiz = Math.abs(a.y - b.y) < 0.5;
  const vert = Math.abs(a.x - b.x) < 0.5;
  if (horiz === vert) return null;
  const dir = horiz ? 'x' : 'y';
  const fixed = horiz ? a.y : a.x;
  const lo = Math.min(a[dir], b[dir]);
  const hi = Math.max(a[dir], b[dir]);
  const forward = b[dir] >= a[dir];

  interface Hug {
    border: ClusterBorder;
    from: number;
    to: number;
  }
  const hugs: Hug[] = [];
  for (const bd of borders) {
    if ((bd.dir === 'H') !== horiz) continue;
    const lat = fixed - bd.at;
    if (Math.abs(lat) >= lateral) continue;
    const from = Math.max(lo, bd.from);
    const to = Math.min(hi, bd.to);
    if (!(to - from > minOverlap)) continue;
    // NOTE: no endpoint-on-border exemption here. A run that starts or ends
    // on the border is still tracing it; its corner endpoints are preserved
    // by the rebuild, endpoint nodes are protected by the corridor check,
    // and arrowheads by the travel end-margin below.
    // Arrowhead approach stays untouched.
    const t0 = travelBase + (forward ? from - lo : hi - to);
    const t1 = travelBase + (forward ? to - lo : hi - from);
    if (t0 < endMargin || t1 > travelTotal - endMargin) continue;
    // Pills must not be disturbed.
    const pad = lane + boxPadding;
    const zone: AvoidBox = horiz
      ? { x: from - pad, y: fixed - pad, width: to - from + 2 * pad, height: 2 * pad }
      : { x: fixed - pad, y: from - pad, width: 2 * pad, height: to - from + 2 * pad };
    if (labels.some((l) => boxesOverlap(zone, l, 8))) continue;
    hugs.push({ border: bd, from, to });
  }
  if (hugs.length === 0) return null;
  hugs.sort((p, q) => (forward ? p.from - q.from : q.to - p.to));

  const out: AvoidPoint[] = [];
  let cursor = forward ? lo : hi;
  const at = (along: number): AvoidPoint => (horiz ? { x: along, y: fixed } : { x: fixed, y: along });
  const lanePt = (along: number, laneCoord: number): AvoidPoint =>
    horiz ? { x: along, y: laneCoord } : { x: laneCoord, y: along };
  for (const hug of hugs) {
    const j0 = forward ? hug.from : hug.to;
    const j1 = forward ? hug.to : hug.from;
    // Strict inequality: a hug may start exactly at the segment start (a
    // route turning onto the border); its corner is preserved, not skipped.
    if (forward ? j0 < cursor : j0 > cursor) continue;
    const lat = fixed - hug.border.at;
    // Minimal move first (stay on the current side when already off the
    // border), then the far side; each must clear all node boxes.
    const sides: (1 | -1)[] = lat === 0 ? [1, -1] : lat > 0 ? [1, -1] : [-1, 1];
    let laneCoord: number | null = null;
    for (const s of sides) {
      const candidate = hug.border.at + s * lane;
      const corridor: AvoidBox = horiz
        ? {
            x: Math.min(j0, j1) - boxPadding,
            y: Math.min(candidate, fixed) - boxPadding,
            width: Math.abs(j1 - j0) + 2 * boxPadding,
            height: Math.abs(candidate - fixed) + 2 * boxPadding,
          }
        : {
            x: Math.min(candidate, fixed) - boxPadding,
            y: Math.min(j0, j1) - boxPadding,
            width: Math.abs(candidate - fixed) + 2 * boxPadding,
            height: Math.abs(j1 - j0) + 2 * boxPadding,
          };
      if (boxes.some((o) => boxesOverlap(corridor, o, 0))) continue;
      laneCoord = candidate;
      break;
    }
    if (laneCoord == null) continue; // both sides blocked: leave the tracing
    // Corner preservation: skip re-emitting the segment start itself.
    if (j0 !== (forward ? lo : hi)) out.push(at(j0));
    out.push(lanePt(j0, laneCoord));
    out.push(lanePt(j1, laneCoord));
    out.push(at(j1));
    cursor = j1;
  }
  if (out.length === 0) return null;
  out.push(b);
  return out;
}

/**
 * Shrink a bundle-separation window inward past hard blockers that only
 * graze its ends, so a hairline graze (e.g. a node edge exactly at the run
 * start) cannot veto separating a long merged run. Blockers covering the
 * middle of the window still veto the lane. Returns the trimmed window in
 * the same travel order as [k0, k1], or null when trimming cannot clear it,
 * would eat more than a hairline budget (2 * boxPadding + 8) off the ends,
 * or too little span would remain. Pads mirror the corridor/zone/hug checks
 * so a returned window always passes them (callers re-verify anyway).
 */
function trimShiftWindow(
  k0: number,
  k1: number,
  fixed: number,
  candidate: number,
  horiz: boolean,
  boxes: AvoidBox[],
  labels: AvoidBox[],
  borders: ClusterBorder[],
  boxPadding: number,
  minLength: number
): [number, number] | null {
  const asc = k1 >= k0;
  let a = asc ? k0 : k1;
  let c = asc ? k1 : k0;
  const zoneFor = (x0: number, x1: number): AvoidBox => {
    const sweep = Math.abs(candidate - fixed) + boxPadding;
    return horiz
      ? { x: x0 - boxPadding, y: fixed - sweep, width: x1 - x0 + 2 * boxPadding, height: 2 * sweep }
      : { x: fixed - sweep, y: x0 - boxPadding, width: 2 * sweep, height: x1 - x0 + 2 * boxPadding };
  };
  const corridorFor = (x0: number, x1: number): AvoidBox =>
    horiz
      ? {
          x: x0 - boxPadding,
          y: Math.min(candidate, fixed) - boxPadding,
          width: x1 - x0 + 2 * boxPadding,
          height: Math.abs(candidate - fixed) + 2 * boxPadding,
        }
      : {
          x: Math.min(candidate, fixed) - boxPadding,
          y: x0 - boxPadding,
          width: Math.abs(candidate - fixed) + 2 * boxPadding,
          height: x1 - x0 + 2 * boxPadding,
        };
  const travelSpan = (o: AvoidBox): [number, number] =>
    horiz ? [o.x, o.x + o.width] : [o.y, o.y + o.height];
  // First hard blocker for the current window as padded travel clears:
  // trimming the window start to advLo (or end to advHi) skips past it.
  const firstBlocker = (x0: number, x1: number): { advLo: number; advHi: number } | null => {
    const corridor = corridorFor(x0, x1);
    for (const o of boxes) {
      if (!boxesOverlap(corridor, o, 0)) continue;
      const [b0, b1] = travelSpan(o);
      return { advLo: b1 + boxPadding, advHi: b0 - boxPadding };
    }
    const zone = zoneFor(x0, x1);
    for (const l of labels) {
      if (!boxesOverlap(zone, l, 8)) continue;
      const [b0, b1] = travelSpan(l);
      return { advLo: b1 + 8 + boxPadding, advHi: b0 - 8 - boxPadding };
    }
    for (const bd of borders) {
      if ((bd.dir === 'H') !== horiz) continue;
      if (Math.abs(candidate - bd.at) >= BORDER_HUG_LATERAL) continue;
      if (Math.min(x1, bd.to) - Math.max(x0, bd.from) <= BORDER_HUG_MIN_OVERLAP) continue;
      return { advLo: bd.to + boxPadding, advHi: bd.from - boxPadding };
    }
    return null;
  };
  // Trim past end-grazers (cheaper side first, bounded rounds). A blocker
  // spanning the whole window leaves no viable side: the lane stays vetoed.
  let trimmed = false;
  for (let round = 0; round < 3; round++) {
    const blk = firstBlocker(a, c);
    if (!blk) break;
    const okA = blk.advLo > a && c - blk.advLo > minLength;
    const okC = blk.advHi < c && blk.advHi - a > minLength;
    if (!okA && !okC) return null;
    if (okA && (!okC || blk.advLo - a <= c - blk.advHi)) a = blk.advLo;
    else c = blk.advHi;
    trimmed = true;
  }
  // Trim budget: only hairline grazes (blocker edges within pads of the
  // window ends) may shrink the window. Deeper intrusions keep the veto so
  // mid-span pills, walls, and frames still leave the bundle alone.
  const a0 = asc ? k0 : k1;
  const c0 = asc ? k1 : k0;
  if (a - a0 + (c0 - c) > 2 * boxPadding + 8) return null;
  // Authoritative re-verify on the final window (guards classification
  // drift). Skipped when nothing trimmed: the first scan already proved it.
  if (trimmed && firstBlocker(a, c)) return null;
  if (!(c - a > minLength)) return null;
  return asc ? [a, c] : [c, a];
}

/**
 * Separate the portions of one axis-aligned segment that run merged with an
 * already-placed parallel edge (shared dagre channels) out to their own
 * lane, so bundled connectors stay individually traceable. Later paths move;
 * earlier ones never do (deterministic). Perpendicular crossings are left to
 * the line-hop pass. Returns replacement points (excluding the segment
 * start, including its end), or null when nothing needs separating.
 */
export function separateOverlappingRuns(
  a: AvoidPoint,
  b: AvoidPoint,
  placed: AvoidPoint[][],
  boxes: AvoidBox[],
  labels: AvoidBox[],
  opts: {
    lateral?: number;
    minLength?: number;
    lane?: number;
    placedClear?: number;
    boxPadding?: number;
    travelBase?: number;
    travelTotal?: number;
    endMargin?: number;
    /** Point preceding `a` on the polyline, used to prefer lanes on the side the path entered from. */
    prevPt?: AvoidPoint;
    /** Cluster borders: candidate lanes hugging one are rejected. */
    borders?: ClusterBorder[];
  } = {}
): AvoidPoint[] | null {
  const lateral = opts.lateral ?? OVERLAP_LATERAL;
  const minLength = opts.minLength ?? OVERLAP_MIN_LENGTH;
  const lane = opts.lane ?? OVERLAP_LANE;
  const placedClear = opts.placedClear ?? OVERLAP_PLACED_CLEAR;
  const boxPadding = opts.boxPadding ?? AVOID_BOX_PADDING;
  const travelBase = opts.travelBase ?? 0;
  const travelTotal = opts.travelTotal ?? Number.POSITIVE_INFINITY;
  const endMargin = opts.endMargin ?? AVOID_END_MARGIN;
  const borders = opts.borders ?? [];
  const horiz = Math.abs(a.y - b.y) < 0.5;
  const vert = Math.abs(a.x - b.x) < 0.5;
  if (horiz === vert) return null;
  const dir = horiz ? 'x' : 'y';
  const fixed = horiz ? a.y : a.x;
  const lo = Math.min(a[dir], b[dir]);
  const hi = Math.max(a[dir], b[dir]);
  const forward = b[dir] >= a[dir];

  interface Run {
    from: number;
    to: number;
  }
  const runs: Run[] = [];
  // Closest approach of any contributing placed run: exact overlaps
  // (below OVERLAP_LATERAL) qualify for the best-effort fallback below.
  let minLateral = Number.POSITIVE_INFINITY;
  for (const poly of placed) {
    for (let s = 0; s + 1 < poly.length; s++) {
      const p = poly[s];
      const q = poly[s + 1];
      const pHoriz = Math.abs(p.y - q.y) < 0.5;
      const pVert = Math.abs(p.x - q.x) < 0.5;
      if (horiz && !pHoriz) continue;
      if (vert && !pVert) continue;
      if (!pHoriz && !pVert) continue;
      const laneCoord = horiz ? p.y : p.x;
      if (Math.abs(fixed - laneCoord) >= lateral) continue;
      const from = Math.max(lo, Math.min(p[dir], q[dir]));
      const to = Math.min(hi, Math.max(p[dir], q[dir]));
      if (!(to - from > minLength)) continue;
      runs.push({ from, to });
      minLateral = Math.min(minLateral, Math.abs(fixed - laneCoord));
    }
  }
  if (runs.length === 0) return null;
  runs.sort((p, q) => (forward ? p.from - q.from : q.to - p.to));

  const out: AvoidPoint[] = [];
  let cursor = forward ? lo : hi;
  const at = (along: number): AvoidPoint => (horiz ? { x: along, y: fixed } : { x: fixed, y: along });
  const lanePt = (along: number, laneCoord: number): AvoidPoint =>
    horiz ? { x: along, y: laneCoord } : { x: laneCoord, y: along };
  // Lateral distance from a candidate lane to every overlapping placed run.
  const placedClearance = (laneCoord: number, j0: number, j1: number): number => {
    let worst = Number.POSITIVE_INFINITY;
    for (const poly of placed) {
      for (let s = 0; s + 1 < poly.length; s++) {
        const p = poly[s];
        const q = poly[s + 1];
        if (horiz && Math.abs(p.y - q.y) >= 0.5) continue;
        if (vert && Math.abs(p.x - q.x) >= 0.5) continue;
        if (!horiz && !vert) continue;
        const c = horiz ? p.y : p.x;
        const o0 = Math.min(p[dir], q[dir]);
        const o1 = Math.max(p[dir], q[dir]);
        if (o1 <= Math.min(j0, j1) || o0 >= Math.max(j0, j1)) continue;
        worst = Math.min(worst, Math.abs(laneCoord - c));
      }
    }
    return worst;
  };
  for (const run of runs) {
    const j0 = forward ? run.from : run.to;
    const j1 = forward ? run.to : run.from;
    if (forward ? j0 < cursor : j0 > cursor) continue;
    // Inset the shift span away from path ends instead of skipping: only the
    // arrowhead approach itself stays untouched, so fully merged twins still
    // separate across their middle.
    const t0 = travelBase + Math.abs(j0 - (forward ? lo : hi));
    const t1 = travelBase + Math.abs(j1 - (forward ? lo : hi));
    const it0 = Math.max(t0, endMargin);
    const it1 = Math.min(t1, travelTotal - endMargin);
    if (!(it1 - it0 > minLength)) continue;
    const toSeg = (t: number) => (forward ? lo : hi) + (t - travelBase) * (forward ? 1 : -1);
    const k0 = toSeg(it0);
    const k1 = toSeg(it1);
    let laneCoord: number | null = null;
    let laneU0 = k0;
    let laneU1 = k1;
    // Best-effort fallback: closest hard-valid lane if strict clearance fails
    // everywhere (see below). Hard blocks (boxes, pills, frames) still veto.
    let bestCoord: number | null = null;
    let bestU0 = k0;
    let bestU1 = k1;
    let bestClearance = -1;
    const prevLat = opts.prevPt ? (horiz ? opts.prevPt.y - fixed : opts.prevPt.x - fixed) : 0;
    const baseSteps: (1 | -1 | 2 | -2)[] = minLateral < OVERLAP_LATERAL
      ? (prevLat < -0.5 ? [-1, 1, -2, 2] : prevLat > 0.5 ? [1, -1, 2, -2] : OVERLAP_LANE_STEPS)
      : (prevLat < -0.5 ? [-1, 1] : [1, -1]);
    const allowedSteps = baseSteps;
    for (const step of allowedSteps) {
      const candidate = fixed + step * lane;
      // Shrink the window past end-grazing blockers (a hairline graze at one
      // end must not veto separating a long merged run); mid-span blockers
      // still veto the lane via the null return.
      const win = trimShiftWindow(k0, k1, fixed, candidate, horiz, boxes, labels, borders, boxPadding, minLength);
      if (!win) continue;
      const [u0, u1] = win;
      const clearance = placedClearance(candidate, u0, u1);
      if (clearance < placedClear) {
        if (clearance > bestClearance) {
          bestClearance = clearance;
          bestCoord = candidate;
          bestU0 = u0;
          bestU1 = u1;
        }
        continue;
      }
      laneCoord = candidate;
      laneU0 = u0;
      laneU1 = u1;
      break;
    }
    // Best-effort fallback for truly merged runs (below OVERLAP_LATERAL):
    // when every lane is neighbor-crowded, still split onto the roomiest
    // hard-valid lane instead of leaving an unreadable exact overlap — but
    // only if it clears every placed run by OVERLAP_LATERAL. Follow-up
    // passes then take the strict path (or drift further outward until all
    // windows clear), so the walk always settles. Readable-but-tight pairs
    // keep the strict veto and stay straight instead of gaining
    // destructive jogs.
    if (
      laneCoord == null &&
      minLateral < OVERLAP_LATERAL &&
      bestCoord != null &&
      bestClearance >= OVERLAP_LATERAL
    ) {
      laneCoord = bestCoord;
      laneU0 = bestU0;
      laneU1 = bestU1;
    }
    if (laneCoord == null) continue;
    if (laneU0 !== (forward ? lo : hi)) out.push(at(laneU0));
    out.push(lanePt(laneU0, laneCoord));
    out.push(lanePt(laneU1, laneCoord));
    if (laneU1 !== (forward ? hi : lo)) out.push(at(laneU1));
    cursor = j1;
  }
  if (out.length === 0) return null;
  out.push(b);
  return out;
}

/**
 * Simplify an orthogonal polyline:
 * 1. Remove consecutive duplicates (within epsilon).
 * 2. Collapse collinear intermediate points along horizontal or vertical segments:
 *    - Monotonic segments (e.g. (x, 10) -> (x, 20) -> (x, 30)) drop the redundant intermediate vertex (x, 20).
 *    - Backtracking spurs / U-turn needles (e.g. (x, 30) -> (x, 10) -> (x, 50)) drop the retraced spur (x, 10),
 *      connecting (x, 30) directly to (x, 50).
 */
export function simplifyPolyline(pts: AvoidPoint[]): AvoidPoint[] {
  if (!pts || pts.length < 2) return pts;

  const dedup = (arr: AvoidPoint[]): AvoidPoint[] => {
    const res: AvoidPoint[] = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      const p = arr[i];
      const prev = res[res.length - 1];
      if (Math.abs(p.x - prev.x) > 0.01 || Math.abs(p.y - prev.y) > 0.01) {
        res.push(p);
      }
    }
    return res;
  };

  let cur = dedup(pts);

  let changed = true;
  while (changed && cur.length >= 3) {
    changed = false;
    const next: AvoidPoint[] = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      const p0 = next[next.length - 1];
      const p1 = cur[i];
      const p2 = cur[i + 1];

      // Vertical collinearity
      if (Math.abs(p0.x - p1.x) < 0.01 && Math.abs(p1.x - p2.x) < 0.01) {
        changed = true;
        continue;
      }

      // Horizontal collinearity
      if (Math.abs(p0.y - p1.y) < 0.01 && Math.abs(p1.y - p2.y) < 0.01) {
        changed = true;
        continue;
      }

      next.push(p1);
    }
    next.push(cur[cur.length - 1]);
    cur = dedup(next);
  }

  return cur;
}

/**
 * Reroute every node-clipping edge segment in a rendered flowchart SVG
 * markup string around the boxes it crosses, shift runs tracing cluster
 * frame borders out to clear lanes, and separate collinear edge bundles
 * into individual lanes. Only `g.edgePaths` polylines are rewritten
 * (attributes like markers are preserved; only `d` changes).
 * Sequence diagrams and other node types pass through byte-identical.
 * `opts.lane` overrides the bundle lane width (default OVERLAP_LANE);
 * the stacked-run clearance scales proportionally (60% of lane, floored at
 * the detection threshold) so narrow lanes can still stack neighbors.
 * `opts.boxGap` overrides the detour clearance around boxes
 * (default AVOID_CLEARANCE).
 * Never throws: any failure returns the input unchanged.
 */
export function applyNodeAvoidanceToSvgMarkup(
  svgMarkup: string,
  opts: { lane?: number; boxGap?: number } = {}
): string {
  try {
    if (!svgMarkup || svgMarkup.indexOf('edgePaths') === -1) return svgMarkup;
    if (typeof DOMParser === 'undefined') return svgMarkup;
    const doc = new DOMParser().parseFromString(`<div>${svgMarkup}</div>`, 'text/html');
    const svg = doc.querySelector('svg');
    if (!svg) return svgMarkup;
    const boxes = nodeBoxesFromMarkup(svg);
    const labels = labelRectsFromMarkup(svg);
    const borders = clusterBordersFromMarkup(svg);
    if (boxes.length === 0 && borders.length === 0) return svgMarkup;
    const els = Array.from(svg.querySelectorAll('g.edgePaths path'));
    if (els.length === 0) return svgMarkup;
    const lane = opts.lane ?? OVERLAP_LANE;
    const boxGap = opts.boxGap ?? AVOID_CLEARANCE;
    const placedClear = Math.max(OVERLAP_LATERAL, Math.round(lane * 0.6));
    // Detection window equals the lane: dagre-spaced parallels inside one
    // lane read as one tight bundle and normalize out to it, so Line-gap
    // visibly respaces the whole bundle instead of only exact overlaps.
    // Already-separated lanes (gap == lane, `>=` skips) stay untouched, and
    // detour/box corridors still guard every landing spot.
    const detectWindow = Math.max(OVERLAP_LATERAL, lane);
    const rebuildPath = (
      parsed: AvoidPoint[],
      pass: (a: AvoidPoint, b: AvoidPoint, travelBase: number, travelTotal: number, prevPt?: AvoidPoint) => AvoidPoint[] | null
    ): AvoidPoint[] | null => {
      const cum: number[] = [0];
      for (let k = 1; k < parsed.length; k++) {
        cum.push(
          cum[k - 1] + Math.hypot(parsed[k].x - parsed[k - 1].x, parsed[k].y - parsed[k - 1].y)
        );
      }
      const total = cum[cum.length - 1];
      const out: AvoidPoint[] = [{ x: parsed[0].x, y: parsed[0].y }];
      let pathChanged = false;
      for (let s = 0; s + 1 < parsed.length; s++) {
        const rebuilt = pass(parsed[s], parsed[s + 1], cum[s], total, s > 0 ? parsed[s - 1] : undefined);
        if (rebuilt) {
          out.push(...rebuilt);
          pathChanged = true;
        } else {
          out.push({ x: parsed[s + 1].x, y: parsed[s + 1].y });
        }
      }
      return pathChanged ? simplifyPolyline(out) : null;
    };
    let changed = false;
    // Final geometry of earlier paths: the unbundling pass separates later
    // runs from these, so each connector keeps its own lane (deterministic).
    const placed: AvoidPoint[][] = [];
    const pathClipsBox = (el: Element): boolean => {
      const pts = parsePolylinePoints(el.getAttribute('d'));
      if (!pts || pts.length < 2) return false;
      for (let s = 0; s + 1 < pts.length; s++) {
        for (const b of boxes) {
          if (segmentClipsBox(pts[s], pts[s + 1], b, 0)) return true;
        }
      }
      return false;
    };
    const sortedEls = [...els].sort((a, b) => {
      const aClips = pathClipsBox(a) ? 1 : 0;
      const bClips = pathClipsBox(b) ? 1 : 0;
      return aClips - bClips;
    });
    for (const el of sortedEls) {
      const parsed = parsePolylinePoints(el.getAttribute('d'));
      if (!parsed || parsed.length < 2) continue;
      // Pass 1: shift runs tracing cluster frame borders out to clear lanes.
      // Pass 2: reroute node-clipping segments around boxes (sees shifted geometry).
      const shifted =
        rebuildPath(parsed, (a, b, travelBase, travelTotal) =>
          shiftOffClusterBorders(a, b, borders, boxes, labels, { travelBase, travelTotal })
        ) ?? parsed;
      const rerouted =
        rebuildPath(shifted, (a, b, travelBase, travelTotal) =>
          detourAroundBoxes(a, b, boxes, labels, {
            travelBase,
            travelTotal,
            clearance: boxGap,
            lane,
            placed,
            borders,
          })
        ) ?? shifted;
      // Pass 3: separate collinear bundles against earlier paths' geometry.
      const unbundled =
        rebuildPath(rerouted, (a, b, travelBase, travelTotal, prevPt) =>
          separateOverlappingRuns(a, b, placed, boxes, labels, {
            travelBase,
            travelTotal,
            borders,
            lane,
            lateral: detectWindow,
            placedClear,
            prevPt,
          })
        ) ?? rerouted;
      const cleanPath = simplifyPolyline(unbundled);
      placed.push(cleanPath);
      const newD = pointsToD(cleanPath);
      if (newD !== el.getAttribute('d')) {
        el.setAttribute('d', newD);
        changed = true;
      }
    }
    return changed ? svg.outerHTML : svgMarkup;
  } catch {
    return svgMarkup;
  }
}
