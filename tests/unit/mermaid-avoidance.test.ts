import { describe, it, expect } from 'vitest';
import {
  translateXOf,
  translateYOf,
  accumulatedTranslate,
  shapeBoxFromAttrs,
  nodeBoxesFromMarkup,
  labelAnchorsFromMarkup,
  labelRectsFromMarkup,
  clusterBordersFromMarkup,
  segmentClipsBox,
  detourAroundBoxes,
  shiftOffClusterBorders,
  separateOverlappingRuns,
  simplifyPolyline,
  applyNodeAvoidanceToSvgMarkup,
  AVOID_CLEARANCE,
} from '@/components/editor/utils/mermaid-avoidance';

const BOX = { x: 100, y: 100, width: 200, height: 100 };

describe('translate helpers', () => {
  it('parses translate variants', () => {
    expect(translateXOf('translate(30,40)')).toBe(30);
    expect(translateXOf('translate(30)')).toBe(30);
    expect(translateXOf(null)).toBe(0);
    expect(translateYOf('translate(30,40)')).toBe(40);
    expect(translateYOf('translate(30)')).toBe(0);
    expect(translateYOf('scale(2)')).toBe(0);
  });

  it('accumulates ancestor translates up to the svg root', () => {
    const doc = new DOMParser().parseFromString(
      `<svg><g transform="translate(10,20)"><g transform="translate(5,7)"><rect x="1" y="2" width="10" height="10"/></g></g></svg>`,
      'text/html'
    );
    const svg = doc.querySelector('svg')!;
    expect(accumulatedTranslate(svg.querySelector('rect')!, svg)).toEqual({ x: 15, y: 27 });
  });
});

describe('shape boxes from markup', () => {
  const boxOf = (inner: string) => {
    const doc = new DOMParser().parseFromString(`<svg>${inner}</svg>`, 'text/html');
    return shapeBoxFromAttrs(doc.querySelector('svg')!.firstElementChild!);
  };

  it('reads rect, ellipse, circle, polygon and foreignObject geometry', () => {
    expect(boxOf('<rect x="10" y="20" width="200" height="80"/>')).toEqual({ x: 10, y: 20, width: 200, height: 80 });
    expect(boxOf('<ellipse cx="50" cy="60" rx="30" ry="25"/>')).toEqual({ x: 20, y: 35, width: 60, height: 50 });
    expect(boxOf('<circle cx="50" cy="60" r="20"/>')).toEqual({ x: 30, y: 40, width: 40, height: 40 });
    expect(boxOf('<polygon points="0,0 100,0 100,50 0,50"/>')).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(boxOf('<foreignObject width="120" height="40"></foreignObject>')).toEqual({ x: 0, y: 0, width: 120, height: 40 });
    expect(boxOf('<path d="M0 0L10 10"/>')).toBeNull();
    expect(boxOf('<rect width="200"/>')).toBeNull();
  });

  it('resolves node boxes to absolute svg units, ignoring label descendants', () => {
    const doc = new DOMParser().parseFromString(
      `<svg viewBox="0 0 800 600">
        <g class="node" transform="translate(400,100)">
          <rect x="-100" y="-40" width="200" height="80"/>
          <g class="label" transform="translate(-90,-30)"><foreignObject width="180" height="60"></foreignObject></g>
        </g>
      </svg>`,
      'text/html'
    );
    // Direct shape child wins over the nested label foreignObject.
    expect(nodeBoxesFromMarkup(doc.querySelector('svg')!)).toEqual([
      { x: 300, y: 60, width: 200, height: 80 },
    ]);
  });

  it('reads edge label rectangles', () => {
    const doc = new DOMParser().parseFromString(
      `<svg><g class="edgeLabel" transform="translate(300,100)"><g class="label" transform="translate(-100,-36)"><foreignObject width="200" height="72"></foreignObject></g></g></svg>`,
      'text/html'
    );
    // Pill centered on the group anchor with FO dimensions.
    expect(labelRectsFromMarkup(doc.querySelector('svg')!)).toEqual([{ x: 200, y: 64, width: 200, height: 72 }]);
    expect(labelAnchorsFromMarkup(doc.querySelector('svg')!)).toEqual([{ x: 300, y: 100 }]);
  });
});

describe('segmentClipsBox', () => {
  it('detects axis-aligned crossings and ignores connections', () => {
    expect(segmentClipsBox({ x: 0, y: 150 }, { x: 400, y: 150 }, BOX, 3)).toBe(true);
    expect(segmentClipsBox({ x: 200, y: 0 }, { x: 200, y: 300 }, BOX, 3)).toBe(true);
    // Endpoint on the box border is a connection, not a crossing.
    expect(segmentClipsBox({ x: 0, y: 150 }, { x: 100, y: 150 }, BOX, 3)).toBe(false);
    // Passing nearby misses.
    expect(segmentClipsBox({ x: 0, y: 50 }, { x: 400, y: 50 }, BOX, 3)).toBe(false);
    // Diagonals are out of scope.
    expect(segmentClipsBox({ x: 0, y: 0 }, { x: 400, y: 300 }, BOX, 3)).toBe(false);
  });
});

describe('detourAroundBoxes', () => {
  const clearOf = (pts: { x: number; y: number }[], box: typeof BOX) =>
    pts.every((p) => p.x < box.x || p.x > box.x + box.width || p.y < box.y || p.y > box.y + box.height);

  it('rebuilds a horizontal crossing as a clearance U-detour', () => {
    const out = detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX], []);
    expect(out).not.toBeNull();
    expect(out![out!.length - 1]).toEqual({ x: 400, y: 150 });
    expect(clearOf(out!, BOX)).toBe(true);
    // Lane sits exactly one clearance above or below the box.
    // out = [entry, corner1, corner2, reentry, end]; the across pair rides the lane.
    expect(out!.length).toBe(5);
    expect(out![1].y === 100 - AVOID_CLEARANCE || out![1].y === 200 + AVOID_CLEARANCE).toBe(true);
    expect(out![2].y).toBe(out![1].y);
  });

  it('mirrors for vertical segments and backward travel', () => {
    const v = detourAroundBoxes({ x: 200, y: 0 }, { x: 200, y: 300 }, [BOX], []);
    expect(v).not.toBeNull();
    expect(clearOf(v!, BOX)).toBe(true);
    const back = detourAroundBoxes({ x: 400, y: 150 }, { x: 0, y: 150 }, [BOX], []);
    expect(back).not.toBeNull();
    expect(clearOf(back!, BOX)).toBe(true);
    expect(back![back!.length - 1]).toEqual({ x: 0, y: 150 });
  });

  it('leaves diagonal segments and clean segments untouched', () => {
    expect(detourAroundBoxes({ x: 0, y: 0 }, { x: 400, y: 300 }, [BOX], [])).toBeNull();
    expect(detourAroundBoxes({ x: 0, y: 50 }, { x: 400, y: 50 }, [BOX], [])).toBeNull();
  });

  it('skips clips whose disturbed zone reaches a pill, routes the rest', () => {
    // Pill directly over the clip: skip (would detach it from its line).
    const overPill = [{ x: 150, y: 130, width: 100, height: 40 }];
    expect(detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX], overPill)).toBeNull();
    // Same long clip, pill 120 units away along the line: detour proceeds
    // (the old midpoint-based guard skipped this case).
    const farPill = [{ x: 420, y: 130, width: 100, height: 40 }];
    expect(detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX], farPill)).not.toBeNull();
    // No pills at all: detour proceeds.
    expect(detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX], [])).not.toBeNull();
  });

  it('skips clips within the arrowhead end margin', () => {
    // Segment arclength 0..400; clip spans the box [100,300] -> keep.
    expect(
      detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX], [], { travelBase: 0, travelTotal: 400 })
    ).not.toBeNull();
    // Same clip but the path ends at 310: detour would crowd the arrowhead.
    expect(
      detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX], [], { travelBase: 0, travelTotal: 310 })
    ).toBeNull();
  });

  it('leaves the crossing when both sides are blocked by other boxes', () => {
    const wallAbove = { x: 0, y: 0, width: 400, height: 80 };
    const wallBelow = { x: 0, y: 220, width: 400, height: 80 };
    expect(detourAroundBoxes({ x: 0, y: 150 }, { x: 400, y: 150 }, [BOX, wallAbove, wallBelow], [])).toBeNull();
  });

  it('nests concentric detours when multiple paths detour around the same box', () => {
    const out1 = detourAroundBoxes({ x: 0, y: 130 }, { x: 400, y: 130 }, [BOX], []);
    expect(out1).not.toBeNull();
    // Default clearance 15: entry at 100 - 15 = 85, exit at 300 + 15 = 315
    expect(out1![0].x).toBe(85);
    expect(out1![3].x).toBe(315);

    // Second path with placed = [out1]: steps outward to clearance 25
    const out2 = detourAroundBoxes({ x: 0, y: 140 }, { x: 400, y: 140 }, [BOX], [], { placed: [out1!] });
    expect(out2).not.toBeNull();
    expect(out2![0].x).toBe(75); // 100 - 25
    expect(out2![3].x).toBe(325); // 300 + 25
    expect(out2![1].y).not.toBe(out1![1].y);
  });

  it('prefers the closer detour side when crossing off-center', () => {
    // BOX is y in [100, 200]. Crossing at y=120 is 20 from top (100) and 80 from bottom (200).
    const topCloser = detourAroundBoxes({ x: 0, y: 120 }, { x: 400, y: 120 }, [BOX], []);
    expect(topCloser).not.toBeNull();
    // Lane should be above: 100 - 15 = 85
    expect(topCloser![1].y).toBe(100 - AVOID_CLEARANCE);

    // Crossing at y=180 is 80 from top and 20 from bottom.
    const bottomCloser = detourAroundBoxes({ x: 0, y: 180 }, { x: 400, y: 180 }, [BOX], []);
    expect(bottomCloser).not.toBeNull();
    // Lane should be below: 200 + 15 = 215
    expect(bottomCloser![1].y).toBe(200 + AVOID_CLEARANCE);
  });
});

describe('separateOverlappingRuns', () => {
  const placedOf = (d: string): { x: number; y: number }[][] => {
    const nums = d.match(/-?\d*\.?\d+/g)!.map(Number);
    const pts = [];
    for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: nums[k], y: nums[k + 1] });
    return [pts];
  };

  it('shifts a merged run out to its own lane', () => {
    // Earlier path rides y=100 across [0,400]; current path shares it exactly.
    const placed = placedOf('M0,100L400,100');
    const out = separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [], []);
    expect(out).not.toBeNull();
    expect(out![out!.length - 1]).toEqual({ x: 400, y: 100 });
    // First lane tried is +20.
    expect(out!.some((p) => p.y === 120)).toBe(true);
    expect(out!.every((p) => p.y === 100 || p.y === 120)).toBe(true);
  });

  it('stacks a third line on the far side when the first lane is taken', () => {
    const placed = placedOf('M0,100L400,100').concat(placedOf('M0,112L400,112'));
    const out = separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [], []);
    expect(out).not.toBeNull();
    // +20 lands 8 from the placed run at 112 (inside the 12 clearance);
    // falls back to -20 (y=80).
    expect(out!.some((p) => p.y === 80)).toBe(true);
    expect(out!.some((p) => p.y === 120)).toBe(false);
  });

  it('chooses candidate lane matching the path arrival vector to avoid crossing', () => {
    const placed = placedOf('M0,100L400,100');
    // Path arriving from above (prevPt.y = 50 < fixed = 100)
    const fromAbove = separateOverlappingRuns(
      { x: 0, y: 100 },
      { x: 400, y: 100 },
      placed,
      [],
      [],
      { prevPt: { x: 0, y: 50 } }
    );
    expect(fromAbove).not.toBeNull();
    // Candidate chosen is -20 (y=80), not +20 (y=120)
    expect(fromAbove!.some((p) => p.y === 80)).toBe(true);
    expect(fromAbove!.some((p) => p.y === 120)).toBe(false);

    // Path arriving from below (prevPt.y = 150 > fixed = 100)
    const fromBelow = separateOverlappingRuns(
      { x: 0, y: 100 },
      { x: 400, y: 100 },
      placed,
      [],
      [],
      { prevPt: { x: 0, y: 150 } }
    );
    expect(fromBelow).not.toBeNull();
    // Candidate chosen is +20 (y=120), not -20 (y=80)
    expect(fromBelow!.some((p) => p.y === 120)).toBe(true);
    expect(fromBelow!.some((p) => p.y === 80)).toBe(false);
  });

  it('rejects candidate lanes that would trace a cluster frame', () => {
    const placed = placedOf('M0,100L400,100');
    const border = [{ dir: 'H' as const, at: 112, from: 0, to: 400 }];
    // +20 would land 8 from the frame (inside the hug lateral): skip to -20 (y=80).
    const out = separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [], [], { borders: border });
    expect(out).not.toBeNull();
    expect(out!.some((p) => p.y === 80)).toBe(true);
    expect(out!.some((p) => p.y === 120)).toBe(false);
    // Frames on every candidate lane: leave the bundle.
    const both = [
      { dir: 'H' as const, at: 120, from: 0, to: 400 },
      { dir: 'H' as const, at: 80, from: 0, to: 400 },
      { dir: 'H' as const, at: 140, from: 0, to: 400 },
      { dir: 'H' as const, at: 60, from: 0, to: 400 },
    ];
    expect(separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [], [], { borders: both })).toBeNull();
  });

  it('leaves separated, short, diagonal and clean runs alone', () => {
    const placed = placedOf('M0,100L400,100');
    // 8 units apart: stable, no shift.
    expect(separateOverlappingRuns({ x: 0, y: 108 }, { x: 400, y: 108 }, placed, [], [])).toBeNull();
    // 30-unit shared run: below the length threshold.
    expect(separateOverlappingRuns({ x: 0, y: 100 }, { x: 30, y: 100 }, placed, [], [])).toBeNull();
    // Diagonal: out of scope.
    expect(separateOverlappingRuns({ x: 0, y: 0 }, { x: 400, y: 300 }, placed, [], [])).toBeNull();
    // No placed geometry: nothing to separate from.
    expect(separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, [], [], [])).toBeNull();
  });

  it('skips runs near pills, path ends, or blocked corridors', () => {
    const placed = placedOf('M0,100L400,100');
    const pill = [{ x: 150, y: 90, width: 100, height: 40 }];
    expect(separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [], pill)).toBeNull();
    // A shared stub ending at the path end insets to almost nothing (<50).
    expect(
      separateOverlappingRuns({ x: 340, y: 100 }, { x: 400, y: 100 }, placedOf('M340,100L400,100'), [], [], {
        travelBase: 340,
        travelTotal: 400,
      })
    ).toBeNull();
    // Both neighboring lanes occupied by boxes: leave the bundle.
    const wallAbove = { x: 0, y: 100, width: 400, height: 12 };
    const wallBelow = { x: 0, y: 88, width: 400, height: 12 };
    expect(
      separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [wallAbove, wallBelow], [])
    ).toBeNull();
  });

  it('trims the shift window past end-grazing boxes instead of abandoning the run', () => {
    // Twin runs share y=100 across [0,400], but a node box ends exactly at
    // x=25 where the (end-margin-inset) shift window starts: the full-span
    // corridor grazes the box by 8 units. Trimming the window start to x=33
    // clears the graze; abandoning it would leave the twins merged for 400.
    const svg =
      `<svg viewBox="0 0 500 400"><g class="edgePaths">` +
      `<path d="M0,100L400,100"></path><path d="M0,100L400,100"></path></g>` +
      `<g class="nodes"><g class="node" transform="translate(0,100)">` +
      `<rect x="-100" y="-50" width="125" height="100"/></g></g></svg>`;
    const once = applyNodeAvoidanceToSvgMarkup(svg);
    expect(once).not.toBe(svg);
    const ds = [...once.matchAll(/d="([^"]*)"/g)].map((m) => m[1]);
    expect(ds.length).toBe(2);
    // First twin stays; second jogs to the +20 lane starting past the box.
    expect(ds[0]).toBe('M0,100L400,100');
    expect(ds[1]).toContain('L33,120');
    expect(applyNodeAvoidanceToSvgMarkup(once)).toBe(once);
  });

  it('unbundles identical twins at markup level and stays idempotent', () => {
    const svg =
      `<svg viewBox="0 0 500 400"><g class="clusters"><g class="cluster"><rect x="10" y="200" width="300" height="100"/></g></g>` +
      `<g class="edgePaths"><path d="M0,100L500,100"></path><path d="M0,100L500,100"></path></g></svg>`;
    const once = applyNodeAvoidanceToSvgMarkup(svg);
    expect(once).not.toBe(svg);
    // Exactly one of the twins moved (deterministic: the later path).
    const ds = [...once.matchAll(/d="([^"]*)"/g)].map((m) => m[1]);
    expect(ds.length).toBe(2);
    expect(ds[0]).toBe('M0,100L500,100');
    expect(ds[1]).not.toBe('M0,100L500,100');
    expect(applyNodeAvoidanceToSvgMarkup(once)).toBe(once);
  });

  it('honors a custom bundle lane width', () => {
    const svg =
      `<svg viewBox="0 0 500 400"><g class="clusters"><g class="cluster"><rect x="10" y="200" width="300" height="100"/></g></g>` +
      `<g class="edgePaths"><path d="M0,100L500,100"></path><path d="M0,100L500,100"></path></g></svg>`;
    const out = applyNodeAvoidanceToSvgMarkup(svg, { lane: 30 });
    expect(out).not.toBe(svg);
    // Later twin rides 30 units off the shared track (first lane tried is +30).
    expect(out).toContain('130');
    expect(out).not.toContain('120');
  });

  it('lets a pill-free near lane through when only far lanes are pill-blocked', () => {
    // Pills sit where the ±40 sweeps go, but the ±20 sweeps are clear.
    // A coarse whole-span pill zone would veto the entire run (null); the
    // per-candidate sweep must let +20 through. Pill B also vetoes -20.
    const placed = placedOf('M0,100L400,100');
    const pills = [
      { x: 150, y: 145, width: 100, height: 30 },
      { x: 150, y: 30, width: 100, height: 30 },
    ];
    const out = separateOverlappingRuns({ x: 0, y: 100 }, { x: 400, y: 100 }, placed, [], pills);
    expect(out).not.toBeNull();
    expect(out!.some((p) => p.y === 120)).toBe(true);
    expect(out!.every((p) => p.y === 100 || p.y === 120)).toBe(true);
  });

  it('normalizes dagre-spaced parallels inside the detection window', () => {    // Tracks 12 apart are not exact overlaps, but read as one tight bundle
    // at the default lane (window == lane == 20): the later path moves out.
    const svg =
      `<svg viewBox="0 0 500 400"><g class="clusters"><g class="cluster"><rect x="10" y="200" width="300" height="100"/></g></g>` +
      `<g class="edgePaths"><path d="M0,100L500,100"></path><path d="M0,112L500,112"></path></g></svg>`;
    const out = applyNodeAvoidanceToSvgMarkup(svg);
    expect(out).not.toBe(svg);
    // Later path pushed a full lane off its own track: 112 + 20 = 132.
    expect(out).toContain('132');
    expect(applyNodeAvoidanceToSvgMarkup(out)).toBe(out);
  });

  it('best-effort splits exact overlaps even when all lanes are crowded', () => {
    // Twin mate at 100 plus neighbors 9-11 from every ±20/±40 lane, so the
    // strict 12-clearance veto fails on all four candidates. The exact twin
    // must still split onto the roomiest hard-valid lane (120, clr 11), and
    // repeated passes must settle instead of walking.
    const svg =
      `<svg viewBox="0 0 600 400"><g class="clusters"><g class="cluster">` +
      `<rect x="10" y="300" width="100" height="50"/></g></g><g class="edgePaths">` +
      `<path d="M0,100L600,100"></path><path d="M0,109L600,109"></path>` +
      `<path d="M0,91L600,91"></path><path d="M0,140L600,140"></path>` +
      `<path d="M0,60L600,60"></path><path d="M0,100L600,100"></path></g></svg>`;
    const once = applyNodeAvoidanceToSvgMarkup(svg);
    // The twin (last path) moved off the shared track.
    const ds = [...once.matchAll(/d="([^"]*)"/g)].map((m) => m[1]);
    expect(ds.length).toBe(6);
    expect(ds[5]).not.toBe('M0,100L600,100');
    // Settles: two more passes reach a fixed point.
    const twice = applyNodeAvoidanceToSvgMarkup(once);
    expect(applyNodeAvoidanceToSvgMarkup(twice)).toBe(twice);
  });

  it('stays stable when a line runs near another path Detour lane', () => {    // P1 detours around the box (lane above it at y=85); P2 rides y=100,
    // 15 from that detour lane. The box itself blocks every landing lane,
    // so P2 must stay put — and a second full pass must change nothing.
    const svg =
      `<svg viewBox="0 0 500 400"><g class="edgePaths">` +
      `<path d="M0,150L400,150"></path><path d="M0,100L400,100"></path></g>` +
      `<g class="nodes"><g class="node" transform="translate(200,150)">` +
      `<rect x="-100" y="-50" width="200" height="100"/></g></g></svg>`;
    const once = applyNodeAvoidanceToSvgMarkup(svg);
    expect(once).not.toBe(svg);
    // P1 detoured, P2 untouched.
    expect(once).toContain('M0,100L400,100');
    expect(applyNodeAvoidanceToSvgMarkup(once)).toBe(once);
  });
});

describe('applyNodeAvoidanceToSvgMarkup', () => {
  const crossingSvg = `<svg viewBox="0 0 500 400"><g class="edgePaths"><path d="M0,150L400,150"></path></g><g class="nodes"><g class="node" transform="translate(200,150)"><rect x="-100" y="-50" width="200" height="100"/></g></g><g class="edgeLabels"><g class="edgeLabel" transform="translate(10,10)"><foreignObject width="40" height="20"></foreignObject></g></g></svg>`;

  it('reroutes the crossing edge around the box', () => {
    const out = applyNodeAvoidanceToSvgMarkup(crossingSvg);
    expect(out).not.toBe(crossingSvg);
    expect(out).toContain('M0,150');
    expect(out).toContain('L400,150');
    // Detour lane clears the box (y in [100,200]) by the clearance.
    expect(/L\d+,85L/.test(out) || /L\d+,215L/.test(out)).toBe(true);
  });

  it('honors a custom box gap for detour lanes', () => {
    const out = applyNodeAvoidanceToSvgMarkup(crossingSvg, { boxGap: 30 });
    expect(out).not.toBe(crossingSvg);
    // Lane sits one custom clearance above or below the box.
    expect(/L\d+,70L/.test(out) || /L\d+,230L/.test(out)).toBe(true);
    expect(applyNodeAvoidanceToSvgMarkup(out, { boxGap: 30 })).toBe(out);
  });

  it('is idempotent: a second pass changes nothing', () => {
    const once = applyNodeAvoidanceToSvgMarkup(crossingSvg);
    expect(applyNodeAvoidanceToSvgMarkup(once)).toBe(once);
  });

  it('passes through diagrams without crossings or edge paths', () => {
    const clean = `<svg viewBox="0 0 500 400"><g class="edgePaths"><path d="M0,10L400,10"></path></g><g class="nodes"><g class="node" transform="translate(200,300)"><rect x="-100" y="-50" width="200" height="100"/></g></g></svg>`;
    expect(applyNodeAvoidanceToSvgMarkup(clean)).toBe(clean);
    const seq = `<svg viewBox="0 0 200 200"><g class="messageLine"><line x1="0" y1="0" x2="10" y2="10"></line></g></svg>`;
    expect(applyNodeAvoidanceToSvgMarkup(seq)).toBe(seq);
  });

  it('prioritizes direct terminal connectors over through-lines clipping obstacle boxes', () => {
    // Path 1 (index 0) is a through-line clipping the box at y=150: M0,150 L400,150.
    // Path 2 (index 1) is a direct connector ending at the box's left face: M0,150 L95,150 (box.x is 100, unclipped).
    const svg = `<svg viewBox="0 0 500 400">
      <g class="edgePaths">
        <path d="M0,150L400,150"></path>
        <path d="M0,150L95,150"></path>
      </g>
      <g class="nodes">
        <g class="node" transform="translate(200,150)">
          <rect x="-100" y="-50" width="200" height="100"/>
        </g>
      </g>
    </svg>`;
    const out = applyNodeAvoidanceToSvgMarkup(svg);
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const paths = Array.from(doc.querySelectorAll('g.edgePaths path'));
    // Path 2 (direct connector) must keep its straight axis M0,150 L95,150 without being displaced
    expect(paths[1].getAttribute('d')).toBe('M0,150L95,150');
  });
});

describe('cluster border handling', () => {
  const BORDER = { dir: 'H' as const, at: 100, from: 50, to: 350 };

  it('reads cluster frame sides from background rects', () => {
    const doc = new DOMParser().parseFromString(
      `<svg viewBox="0 0 800 600"><g class="clusters"><g class="cluster" id="c1" transform="translate(10,20)"><rect x="0" y="0" width="200" height="100"/><g class="cluster-label" transform="translate(0,0)"><foreignObject width="200" height="24"></foreignObject></g></g></g></svg>`,
      'text/html'
    );
    expect(clusterBordersFromMarkup(doc.querySelector('svg')!)).toEqual([
      { dir: 'H', at: 20, from: 10, to: 210 },
      { dir: 'H', at: 120, from: 10, to: 210 },
      { dir: 'V', at: 10, from: 20, to: 120 },
      { dir: 'V', at: 210, from: 20, to: 120 },
    ]);
  });

  it('shifts a border-tracing run out to a clear lane', () => {
    // Segment rides exactly on the border (lat 0) across its full span.
    const out = shiftOffClusterBorders({ x: 0, y: 100 }, { x: 400, y: 100 }, [BORDER], [], []);
    expect(out).not.toBeNull();
    expect(out![out!.length - 1]).toEqual({ x: 400, y: 100 });
    // Shifted run sits one lane off the border; jogs reconnect at the ends.
    // lat 0 tries +1 first: lane = 100 + 15 = 115.
    const ys = out!.map((p) => p.y);
    expect(ys[0]).toBe(100);
    expect(ys).toContain(115);
    expect(out!.every((p) => p.y === 100 || p.y === 115)).toBe(true);
  });

  it('keeps the current side with a minimal nudge when already close', () => {
    // 8 units above the border: nudged to 15, not thrown across.
    const out = shiftOffClusterBorders({ x: 0, y: 92 }, { x: 400, y: 92 }, [BORDER], [], []);
    expect(out).not.toBeNull();
    expect(out!.some((p) => p.y === 85)).toBe(true);
    expect(out!.some((p) => p.y === 115)).toBe(false);
  });

  it('leaves perpendicular crossings, distant parallels and clean lines alone', () => {
    // Perpendicular crossing is legitimate.
    expect(shiftOffClusterBorders({ x: 200, y: 0 }, { x: 200, y: 300 }, [BORDER], [], [])).toBeNull();
    // 20 units away: already distinguishable.
    expect(shiftOffClusterBorders({ x: 0, y: 80 }, { x: 400, y: 80 }, [BORDER], [], [])).toBeNull();
    // Diagonal: out of scope.
    expect(shiftOffClusterBorders({ x: 0, y: 0 }, { x: 400, y: 300 }, [BORDER], [], [])).toBeNull();
  });

  it('skips shifts near pills, path ends, or when both sides are blocked', () => {
    const pill = [{ x: 150, y: 80, width: 100, height: 40 }];
    expect(shiftOffClusterBorders({ x: 0, y: 100 }, { x: 400, y: 100 }, [BORDER], [], pill)).toBeNull();
    // Path ends 30 units past the shift: arrowhead approach stays untouched.
    expect(
      shiftOffClusterBorders({ x: 0, y: 100 }, { x: 400, y: 100 }, [BORDER], [], [], { travelBase: 0, travelTotal: 330 })
    ).toBeNull();
    const wallAbove = { x: 0, y: 0, width: 400, height: 90 };
    const wallBelow = { x: 0, y: 110, width: 400, height: 92 };
    expect(
      shiftOffClusterBorders({ x: 0, y: 100 }, { x: 400, y: 100 }, [BORDER], [wallAbove, wallBelow], [])
    ).toBeNull();
  });

  it('shifts a hug that starts exactly at the segment start', () => {
    // Routes often turn onto the border at the segment start; the corner is
    // preserved (not re-emitted) and the run still shifts. travelBase puts
    // the clip mid-path so the arrowhead guard does not apply.
    const out = shiftOffClusterBorders({ x: 50, y: 100 }, { x: 400, y: 100 }, [BORDER], [], [], {
      travelBase: 1000,
      travelTotal: 2000,
    });
    expect(out).not.toBeNull();
    // First emitted point is the lane jog (segment start itself not duplicated).
    expect(out![0]).toEqual({ x: 50, y: 115 });
    expect(out![out!.length - 1]).toEqual({ x: 400, y: 100 });
  });

  it('shifts border tracing at markup level and stays idempotent', () => {
    const svg = `<svg viewBox="0 0 500 400"><g class="clusters"><g class="cluster"><rect x="50" y="100" width="300" height="200"/></g></g><g class="edgePaths"><path d="M0,100L500,100"></path></g></svg>`;
    const once = applyNodeAvoidanceToSvgMarkup(svg);
    expect(once).not.toBe(svg);
    // Shifted run rides 15 units off the border (lat 0 tries +1 first).
    expect(once).toContain('L50,115');
    expect(applyNodeAvoidanceToSvgMarkup(once)).toBe(once);
  });
});

describe('simplifyPolyline', () => {
  it('collapses monotonic collinear segments', () => {
    const pts = [
      { x: 100, y: 50 },
      { x: 100, y: 150 },
      { x: 100, y: 250 },
      { x: 300, y: 250 },
      { x: 400, y: 250 },
    ];
    expect(simplifyPolyline(pts)).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 250 },
      { x: 400, y: 250 },
    ]);
  });

  it('eliminates backtracking needles / U-turn spurs', () => {
    // A path running horizontally at y=70, jogging vertically up to y=50,
    // and then immediately going down to y=150.
    const pts = [
      { x: 0, y: 70 },
      { x: 100, y: 70 },
      { x: 100, y: 50 },
      { x: 100, y: 150 },
      { x: 200, y: 150 },
    ];
    expect(simplifyPolyline(pts)).toEqual([
      { x: 0, y: 70 },
      { x: 100, y: 70 },
      { x: 100, y: 150 },
      { x: 200, y: 150 },
    ]);
  });

  it('removes consecutive identical duplicate points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(simplifyPolyline(pts)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });
});
