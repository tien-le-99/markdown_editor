import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import mermaid from 'mermaid';
import { applyLineHopsToSvgMarkup, applyConnectorStylingToSvgMarkup, applyClusterTransparencyToSvgMarkup, LINE_HOP_RADIUS } from '../utils/mermaid-linehops';
import { applyNodeAvoidanceToSvgMarkup, OVERLAP_LANE, AVOID_CLEARANCE } from '../utils/mermaid-avoidance';
import {
  GitFork,
  Code2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertCircle,
  Check,
  X,
  Trash2,
  Move,
  FileCode2,
  SlidersHorizontal
} from 'lucide-react';

const MERMAID_PRESETS = {
  flowchart: `graph TD
  Start([Start Request]) --> Auth{Authenticated?}
  Auth -- No --> Deny[401 Unauthorized]
  Auth -- Yes --> Process[Execute Business Logic]
  Process --> Cache[(Redis Cache)]
  Process --> DB[(PostgreSQL Database)]
  Process --> Complete([200 OK Response])`,
  sequence: `sequenceDiagram
  autonumber
  actor Client
  participant Gateway as API Gateway
  participant Service as Core Service
  participant DB as Database

  Client->>Gateway: POST /api/v1/resource
  Gateway->>Service: Forward Authenticated Payload
  Service->>DB: Query & Commit Transaction
  DB-->>Service: Acknowledge Write
  Service-->>Gateway: 201 Created
  Gateway-->>Client: JSON Response Body`,
  state: `stateDiagram-v2
  [*] --> Draft
  Draft --> InReview : Submit for Review
  InReview --> Approved : Accept Changes
  InReview --> Draft : Request Revisions
  Approved --> Published : Deploy Live
  Published --> [*]`
};

/**
 * Per-diagram flowchart routing curves (mermaid/d3 curve names).
 * Orthogonal options keep axis-aligned segments, so node avoidance and
 * line-hop post-processing apply. Curvy options render bezier paths that
 * those passes skip gracefully (styling + transparency still apply).
 */
export const MERMAID_CURVE_OPTIONS = [
  { value: 'stepBefore', label: 'Square corners', orthogonal: true },
  { value: 'stepAfter', label: 'Square corners (alt)', orthogonal: true },
  { value: 'linear', label: 'Straight lines', orthogonal: true },
  { value: 'basis', label: 'Soft curves', orthogonal: false },
  { value: 'cardinal', label: 'Rounded curves', orthogonal: false },
  { value: 'monotoneX', label: 'Smooth flow', orthogonal: false },
  { value: 'bumpX', label: 'Rounded flow', orthogonal: false },
  { value: 'natural', label: 'Natural curves', orthogonal: false },
] as const;

export type MermaidCurve = (typeof MERMAID_CURVE_OPTIONS)[number]['value'];

export interface MermaidLayout {
  curve: MermaidCurve;
  nodeSpacing: number;
  rankSpacing: number;
  padding: number;
  /** Connector-to-connector lane width for unbundling shared tracks. */
  lineGap: number;
  /** Moat between box-avoidance detours and the boxes they hug. */
  boxGap: number;
}

/** Defaults match the previous hardcoded flowchart config (no visual change). */
export const MERMAID_LAYOUT_DEFAULTS: MermaidLayout = {
  curve: 'stepBefore',
  nodeSpacing: 60,
  rankSpacing: 80,
  padding: 20,
  lineGap: OVERLAP_LANE,
  boxGap: AVOID_CLEARANCE,
};

/** Slider bounds for the line-gap control. */
export const MERMAID_LINE_GAP_MIN = 8;
export const MERMAID_LINE_GAP_MAX = 48;

/** Slider bounds for the box-gap (detour clearance) control. */
export const MERMAID_BOX_GAP_MIN = 8;
export const MERMAID_BOX_GAP_MAX = 40;

const clampInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Fill + validate layout attrs from a ProseMirror node (pure, unit-tested).
 * Unknown curves fall back to stepBefore; out-of-range numbers clamp.
 */
export function sanitizeMermaidLayout(attrs: {
  curve?: unknown;
  nodeSpacing?: unknown;
  rankSpacing?: unknown;
  padding?: unknown;
  lineGap?: unknown;
  boxGap?: unknown;
}): MermaidLayout {
  const curve = MERMAID_CURVE_OPTIONS.some((o) => o.value === attrs.curve)
    ? (attrs.curve as MermaidCurve)
    : MERMAID_LAYOUT_DEFAULTS.curve;
  return {
    curve,
    nodeSpacing: clampInt(attrs.nodeSpacing, MERMAID_LAYOUT_DEFAULTS.nodeSpacing, 0, 300),
    rankSpacing: clampInt(attrs.rankSpacing, MERMAID_LAYOUT_DEFAULTS.rankSpacing, 0, 300),
    padding: clampInt(attrs.padding, MERMAID_LAYOUT_DEFAULTS.padding, 0, 100),
    lineGap: clampInt(attrs.lineGap, MERMAID_LAYOUT_DEFAULTS.lineGap, MERMAID_LINE_GAP_MIN, MERMAID_LINE_GAP_MAX),
    boxGap: clampInt(attrs.boxGap, MERMAID_LAYOUT_DEFAULTS.boxGap, MERMAID_BOX_GAP_MIN, MERMAID_BOX_GAP_MAX),
  };
}

/**
 * Parse a hand-edited layout JSON blob into a validated MermaidLayout.
 * Accepts the flat layout shape (`{"curve": ..., "nodeSpacing": ...}`) and,
 * for pasted mermaid configs, a nested `flowchart` object with the same
 * keys. Unknown keys are dropped; out-of-range numbers clamp; unknown
 * curves fall back — all via sanitizeMermaidLayout. Throws on malformed
 * JSON or non-object payloads so callers can keep the stored config.
 */
export function parseMermaidLayoutJson(text: string): MermaidLayout {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON: check commas, quotes, and brackets.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config must be a JSON object, e.g. {"curve": "stepBefore", "lineGap": 20}.');
  }
  const o = raw as Record<string, unknown>;
  const fcRaw = o['flowchart'];
  const fc: Record<string, unknown> =
    typeof fcRaw === 'object' && fcRaw !== null && !Array.isArray(fcRaw)
      ? (fcRaw as Record<string, unknown>)
      : {};
  return sanitizeMermaidLayout({
    curve: o['curve'] ?? fc['curve'],
    nodeSpacing: o['nodeSpacing'] ?? fc['nodeSpacing'],
    rankSpacing: o['rankSpacing'] ?? fc['rankSpacing'],
    padding: o['padding'] ?? fc['padding'],
    lineGap: o['lineGap'] ?? fc['lineGap'],
    boxGap: o['boxGap'] ?? fc['boxGap'],
  });
}

/**
 * Hop radius fitted to the bundle lane: the arc diameter must stay under the
 * lane width, or stacked hops touch the neighboring line and knot again.
 * Capped at the default LINE_HOP_RADIUS (wider lanes keep standard hops).
 */
export function hopRadiusForLineGap(lineGap: number): number {
  return Math.max(4, Math.min(LINE_HOP_RADIUS, Math.floor(lineGap / 2) - 2));
}

/**
 * Read a numeric data-attribute, falling back when absent or malformed.
 * NOTE: Number(null) === 0, so a missing attribute must be checked first —
 * otherwise every fresh diagram parses its spacing as 0.
 */
export function numberAttrOr(element: Element, name: string, fallback: number): number {
  const raw = element.getAttribute(name);
  if (raw == null || raw.trim() === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Panzoom limits for the diagram canvas. Vector SVG stays sharp, so the
 * ceiling is generous for inspecting dense connector bundles.
 */
export const MERMAID_MAX_ZOOM = 10;
export const MERMAID_MIN_ZOOM = 0.25;

/**
 * mermaid.initialize is process-global, so per-diagram renders are funneled
 * through this queue: each task applies its own config synchronously before
 * calling render, and tasks never interleave.
 */
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function enqueueMermaidRender(task: () => Promise<void>): void {
  mermaidRenderQueue = mermaidRenderQueue.then(task, task);
}

/** Full mermaid.initialize payload for one diagram's layout settings. */
function buildMermaidConfig(layout: MermaidLayout) {
  return {
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    // Default maxTextSize is 50000 chars — large single-diagram documents
    // (e.g. ~73k-char historical flowcharts) throw
    // "Maximum text size in diagram exceeded". Raise the ceiling generously.
    maxTextSize: 500000,
    maxEdges: 5000,
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 18,
    themeVariables: {
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '18px',
      primaryTextColor: '#0f172a',
      primaryColor: '#f8fafc',
      primaryBorderColor: '#64748b',
      lineColor: '#475569',
      secondaryColor: '#f1f5f9',
      tertiaryColor: '#ffffff',
      // Flowchart typography & spacing
      nodeBorder: '#64748b',
      nodeTextColor: '#0f172a',
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      titleColor: '#0f172a',
      edgeLabelBackground: '#ffffff',
      // Sequence Diagram typography
      actorFontSize: '18px',
      actorFontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      actorTextColor: '#0f172a',
      actorLineColor: '#64748b',
      signalColor: '#334155',
      signalTextColor: '#0f172a',
      labelBoxBkgColor: '#f8fafc',
      labelBoxBorderColor: '#cbd5e1',
      labelTextColor: '#0f172a',
      noteFontSize: '16px',
      messageFontSize: '16px',
    },
    flowchart: {
      htmlLabels: true,
      // Orthogonal connectors: right-angle segments. Node avoidance and
      // line hops are applied as markup post-processing (see render effect).
      curve: layout.curve,
      padding: layout.padding,
      // Generous rank/column gaps: dagre places edge labels at edge
      // midpoints with NO collision avoidance, so in dense multi-column
      // diagrams (parallel branches + long cross-connectors) pills can sit
      // 1 unit from a node box. Tight gaps flip into visible overlaps under
      // small font-metric shifts between browsers; breathing room here keeps
      // exports legible everywhere. Do not tighten without re-auditing.
      nodeSpacing: layout.nodeSpacing,
      rankSpacing: layout.rankSpacing,
      useMaxWidth: true,
    },
    sequence: {
      diagramMarginX: 24,
      diagramMarginY: 20,
      actorMargin: 50,
      width: 150,
      height: 65,
      boxMargin: 10,
      boxTextMargin: 5,
      noteMargin: 10,
      messageMargin: 35,
      mirrorActors: false,
      useMaxWidth: true,
    },
  } as const;
}

export const MermaidComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const panzoomTargetRef = useRef<HTMLDivElement>(null);
  const panzoomInstanceRef = useRef<PanzoomObject | null>(null);

  const [svgContent, setSvgContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  // Hand-edited layout JSON draft (initialized when the popover opens, so
  // typing is never clobbered by live attr updates; Reload re-syncs it).
  const [layoutJsonText, setLayoutJsonText] = useState<string>('');
  const [layoutJsonError, setLayoutJsonError] = useState<string | null>(null);
  const [rawCode, setRawCode] = useState(node.attrs.code || MERMAID_PRESETS.flowchart);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  // Monotonic render sequence: only the latest queued render may commit.
  const renderSeqRef = useRef(0);

  // Initialize mermaid once with high-legibility typography and generous spacing
  useEffect(() => {
    mermaid.initialize(buildMermaidConfig(MERMAID_LAYOUT_DEFAULTS));
  }, []);

  // Sync external code
  useEffect(() => {
    setRawCode(node.attrs.code || MERMAID_PRESETS.flowchart);
  }, [node.attrs.code]);

  // Render SVG when code or layout settings change (layout edits from the
  // popover re-render live via node attrs).
  const layout = sanitizeMermaidLayout(node.attrs);
  useEffect(() => {
    let isCancelled = false;
    const mySeq = ++renderSeqRef.current;
    const code = node.attrs.code || MERMAID_PRESETS.flowchart;
    // Snapshot settings for this render: the global initialize + render pair
    // runs atomically inside the queue, so concurrent diagrams never mix configs.
    const snapshot = sanitizeMermaidLayout(node.attrs);
    const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    enqueueMermaidRender(async () => {
      if (isCancelled || mySeq !== renderSeqRef.current) return;
      // Apply this diagram's own config right before rendering (global API).
      mermaid.initialize(buildMermaidConfig(snapshot));
      try {
        const { svg } = await mermaid.render(uniqueId, code);
        if (isCancelled || mySeq !== renderSeqRef.current) return;
        // Post-process the rendered SVG markup (all steps are pure,
        // never-throw, and return the input unchanged when inapplicable):
        // 1. Reroute axis-aligned segments around foreign node boxes and
        //    shift runs tracing cluster frame borders out to clear lanes,
        //    so connectors never pass through (or behind) nodes or frames.
        //    Curvy routings emit bezier paths these passes skip gracefully.
        // 2. Bridge remaining line crossings with hop arcs (circuit style).
        // 3. Thicken connector strokes + round joins so dense bundles stay
        //    traceable at small print scales (arrowheads use fixed-size
        //    markers, so they are unaffected).
        // 4. Make cluster backgrounds transparent so overlapping frames can
        //    never hide boxes, labels, or titles underneath an opaque wash.
        // Baked into the markup, so pan/zoom and the PDF export clone
        // inherit them automatically.
        let html = svg;
        try {
          html = applyNodeAvoidanceToSvgMarkup(html, { lane: snapshot.lineGap, boxGap: snapshot.boxGap });
          html = applyLineHopsToSvgMarkup(html, hopRadiusForLineGap(snapshot.lineGap));
          html = applyConnectorStylingToSvgMarkup(html);
          html = applyClusterTransparencyToSvgMarkup(html);
        } catch {
          html = svg;
        }
        setSvgContent(html);
        setError(null);
      } catch (err: any) {
        if (isCancelled || mySeq !== renderSeqRef.current) return;
        setError(err.message || 'Syntax error in Mermaid diagram');
        // Clean up leftover error DOM inserted by mermaid if any
        const errorEl = document.getElementById(uniqueId) || document.getElementById(`d${uniqueId}`);
        if (errorEl) errorEl.remove();
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [node.attrs.code, layout.curve, layout.nodeSpacing, layout.rankSpacing, layout.padding, layout.lineGap, layout.boxGap]);

  // Initialize and attach Panzoom to the rendered SVG wrapper
  useEffect(() => {
    if (!panzoomTargetRef.current || !svgContent) return;

    if (panzoomInstanceRef.current) {
      panzoomInstanceRef.current.destroy();
    }

    const instance = Panzoom(panzoomTargetRef.current, {
      // Deep zoom for inspecting dense diagrams (SVG stays vector-sharp).
      maxScale: MERMAID_MAX_ZOOM,
      minScale: MERMAID_MIN_ZOOM,
      canvas: true,
      cursor: 'grab',
    });

    panzoomInstanceRef.current = instance;

    // Handle mousewheel zooming
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      instance.zoomWithWheel(event);
      setZoomLevel(Math.round(instance.getScale() * 100));
    };

    const targetEl = panzoomTargetRef.current.parentElement;
    if (targetEl) {
      targetEl.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (targetEl) {
        targetEl.removeEventListener('wheel', handleWheel);
      }
      instance.destroy();
      panzoomInstanceRef.current = null;
    };
  }, [svgContent]);

  const handleZoomIn = () => {
    if (panzoomInstanceRef.current) {
      panzoomInstanceRef.current.zoomIn();
      setZoomLevel(Math.round(panzoomInstanceRef.current.getScale() * 100));
    }
  };

  const handleZoomOut = () => {
    if (panzoomInstanceRef.current) {
      panzoomInstanceRef.current.zoomOut();
      setZoomLevel(Math.round(panzoomInstanceRef.current.getScale() * 100));
    }
  };

  const handleReset = () => {
    if (panzoomInstanceRef.current) {
      panzoomInstanceRef.current.reset();
      setZoomLevel(100);
    }
  };

  const handleSaveCode = () => {
    updateAttributes({ code: rawCode });
    setIsEditing(false);
  };

  // Full-overwrite apply: the edited JSON replaces the whole stored layout
  // config (validated + clamped); sliders and JSON are two views of the
  // same node attrs. Invalid input keeps the old config and shows an error.
  const handleApplyLayoutJson = () => {
    try {
      const next = parseMermaidLayoutJson(layoutJsonText);
      updateAttributes({ ...next });
      setLayoutJsonText(JSON.stringify(next, null, 2));
      setLayoutJsonError(null);
    } catch (err: any) {
      setLayoutJsonError(err?.message || 'Invalid JSON config.');
    }
  };

  return (
    <NodeViewWrapper className="my-6 not-prose select-none">
      <div 
        ref={containerRef}
        className="mermaid-node-container relative bg-white border border-slate-200 rounded-xl shadow-sm overflow-visible"
        data-testid="mermaid-node-view"
        data-pdf-layout={node.attrs.pdfLayout || 'auto'}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 rounded-t-xl text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-700">Mermaid Diagram</span>
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded border border-emerald-200 flex items-center gap-1">
              <Move className="w-2.5 h-2.5" /> Panzoom Enabled
            </span>
          </div>

          <div className="flex items-center gap-1.5 no-print">
            {/* Per-Diagram PDF Layout Selector */}
            <div className="flex items-center mr-1">
              <select
                value={node.attrs.pdfLayout || 'auto'}
                onChange={(e) => updateAttributes({ pdfLayout: e.target.value })}
                className="text-[11px] font-medium bg-white text-slate-700 border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer hover:bg-slate-50 transition-colors"
                title="Choose PDF export layout for this diagram"
                data-testid="mermaid-pdf-layout-select"
              >
                <option value="auto">PDF: Auto (Global)</option>
                <option value="enlarge">PDF: Enlarge Page</option>
                <option value="landscape">PDF: Landscape A4</option>
                <option value="rotate">PDF: Rotate 90°</option>
                <option value="fit">PDF: Fit Inline</option>
                <option value="paginate">PDF: Paginate (Tall)</option>
              </select>
            </div>

            {/* Per-Diagram Layout Popover (routing curve + spacing, live re-render) */}
            <div className="flex items-center mr-1 relative">
              <button
                type="button"
                onClick={() => {
                  if (!showLayout) {
                    setLayoutJsonText(JSON.stringify(sanitizeMermaidLayout(node.attrs), null, 2));
                    setLayoutJsonError(null);
                  }
                  setShowLayout(!showLayout);
                }}
                className={`p-1.5 rounded-md border transition-colors ${
                  showLayout
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title="Diagram layout: line style and spacing"
                data-testid="mermaid-layout-button"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              {showLayout && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-64 max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin] bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 text-slate-800 animate-in fade-in zoom-in-95 duration-150"
                  data-testid="mermaid-layout-popover"
                >
                  <div className="text-xs font-semibold text-slate-700 mb-2">Line style</div>
                  <select
                    value={layout.curve}
                    onChange={(e) => updateAttributes({ curve: e.target.value })}
                    className="w-full text-xs font-medium bg-white text-slate-700 border border-slate-200 rounded px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer hover:bg-slate-50 transition-colors"
                    title="Connector routing style"
                    data-testid="mermaid-curve-select"
                  >
                    {MERMAID_CURVE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {!MERMAID_CURVE_OPTIONS.some((o) => o.value === layout.curve && o.orthogonal) && (
                    <p className="mt-1.5 text-[11px] leading-snug text-amber-700">
                      Curvy lines skip crossing bridges &amp; node avoidance (they need square lines).
                    </p>
                  )}
                  <div className="text-xs font-semibold text-slate-700 mt-3 mb-1">Spacing</div>
                  {(
                    [
                      { key: 'nodeSpacing', label: 'Node gap', min: 0, max: 200, testid: 'mermaid-spacing-node' },
                      { key: 'rankSpacing', label: 'Rank gap', min: 0, max: 200, testid: 'mermaid-spacing-rank' },
                      { key: 'padding', label: 'Padding', min: 0, max: 100, testid: 'mermaid-spacing-padding' },
                      { key: 'lineGap', label: 'Line gap', min: MERMAID_LINE_GAP_MIN, max: MERMAID_LINE_GAP_MAX, testid: 'mermaid-spacing-line' },
                      { key: 'boxGap', label: 'Box gap', min: MERMAID_BOX_GAP_MIN, max: MERMAID_BOX_GAP_MAX, testid: 'mermaid-spacing-box' },
                    ] as const
                  ).map((s) => (
                    <label key={s.key} className="flex items-center gap-2 mt-1.5 text-xs text-slate-600">
                      <span className="w-20 shrink-0">{s.label}</span>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={layout[s.key]}
                        onChange={(e) => updateAttributes({ [s.key]: Number(e.target.value) })}
                        className="flex-1 min-w-0 accent-emerald-600"
                        data-testid={s.testid}
                      />
                      <span className="w-8 text-right tabular-nums text-slate-700">{layout[s.key]}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateAttributes({ ...MERMAID_LAYOUT_DEFAULTS })}
                    className="mt-3 w-full px-2 py-1 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium"
                    data-testid="mermaid-layout-reset"
                  >
                    Reset to defaults
                  </button>
                  <div className="text-xs font-semibold text-slate-700 mt-3 mb-1">Config JSON</div>
                  <textarea
                    value={layoutJsonText}
                    onChange={(e) => {
                      setLayoutJsonText(e.target.value);
                      setLayoutJsonError(null);
                    }}
                    className="w-full h-36 font-mono text-[11px] leading-snug p-2 bg-slate-900 text-emerald-300 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    spellCheck={false}
                    title="Edit the full layout config as JSON, then Apply"
                    data-testid="mermaid-layout-json"
                  />
                  {layoutJsonError && (
                    <p
                      className="mt-1.5 text-[11px] leading-snug text-red-700"
                      data-testid="mermaid-layout-json-error"
                    >
                      {layoutJsonError}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleApplyLayoutJson}
                      className="flex-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium"
                      data-testid="mermaid-layout-json-apply"
                    >
                      Apply JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutJsonText(JSON.stringify(sanitizeMermaidLayout(node.attrs), null, 2));
                        setLayoutJsonError(null);
                      }}
                      className="flex-1 px-2 py-1 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium"
                      data-testid="mermaid-layout-json-reload"
                    >
                      Reload current
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Panzoom Controls */}
            <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 mr-1 panzoom-controls">
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900"
                title="Zoom In"
                data-testid="mermaid-zoom-in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900"
                title="Zoom Out"
                data-testid="mermaid-zoom-out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 flex items-center gap-1 px-1.5 text-[11px]"
                title="Reset View"
                data-testid="mermaid-reset-zoom"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{zoomLevel}%</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`px-2.5 py-1 flex items-center gap-1 rounded-md text-xs font-medium border transition-colors ${
                isEditing 
                  ? 'bg-emerald-600 text-white border-emerald-600' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Edit Diagram Syntax"
              data-testid="mermaid-edit-button"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Close Editor' : 'Edit Diagram'}</span>
            </button>

            <button
              type="button"
              onClick={deleteNode}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md border border-red-200"
              title="Delete Diagram"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error Boundary Banner */}
        {error && (
          <div 
            className="p-4 bg-red-50/80 border-b border-red-200 flex items-start gap-3 text-red-800 text-xs"
            data-testid="mermaid-error-banner"
          >
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <strong className="font-semibold block">Mermaid Syntax Error:</strong>
              <code className="text-[11px] font-mono mt-0.5 block bg-red-100/70 p-1.5 rounded text-red-900 break-all">
                {error}
              </code>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                >
                  Edit Syntax
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateAttributes({ code: MERMAID_PRESETS.sequence });
                    setRawCode(MERMAID_PRESETS.sequence);
                    setError(null);
                  }}
                  className="px-2 py-1 bg-white border border-red-300 hover:bg-red-50 text-red-700 rounded text-xs font-medium"
                >
                  Reset to Sequence Preset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagram Canvas with Panzoom Wrapper */}
        <div 
          className={`mermaid-canvas-viewport relative w-full h-[360px] bg-slate-50/50 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center p-4 ${isEditing ? '' : 'rounded-b-xl'}`}
          onDoubleClick={() => setIsEditing(true)}
          title="Double-click to edit diagram syntax, drag to pan"
        >
          <div 
            ref={panzoomTargetRef} 
            className="panzoom-wrapper inline-block max-w-full transition-transform"
            dangerouslySetInnerHTML={{ __html: svgContent }}
            data-testid="mermaid-svg-target"
          />
        </div>

        {/* Edit Modal / Drawer */}
        {isEditing && (
          <div 
            className="border-t border-slate-200 bg-slate-50/95 p-4 rounded-b-xl no-print animate-in fade-in duration-150"
            data-testid="mermaid-code-editor"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Presets:</span>
                <button
                  type="button"
                  onClick={() => setRawCode(MERMAID_PRESETS.flowchart)}
                  className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                >
                  Flowchart
                </button>
                <button
                  type="button"
                  onClick={() => setRawCode(MERMAID_PRESETS.sequence)}
                  className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                >
                  Sequence
                </button>
                <button
                  type="button"
                  onClick={() => setRawCode(MERMAID_PRESETS.state)}
                  className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                >
                  State
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCode}
                  className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium flex items-center gap-1 shadow-sm"
                  data-testid="mermaid-save-button"
                >
                  <Check className="w-3.5 h-3.5" /> Apply & Render
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRawCode(node.attrs.code || '');
                    setIsEditing(false);
                  }}
                  className="p-1 text-slate-500 hover:text-slate-800 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <textarea
              value={rawCode}
              onChange={(e) => setRawCode(e.target.value)}
              className="w-full h-44 font-mono text-xs p-3 bg-slate-900 text-emerald-300 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              spellCheck={false}
              data-testid="mermaid-textarea"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: MERMAID_PRESETS.flowchart,
      },
      pdfLayout: {
        default: 'auto',
        parseHTML: (element) => element.getAttribute('data-pdf-layout') || 'auto',
        renderHTML: (attributes) => ({
          'data-pdf-layout': attributes.pdfLayout || 'auto',
        }),
      },
      // Per-diagram flowchart layout (live-tuned via the header popover).
      // Session-only like pdfLayout: the Markdown fence keeps code alone.
      curve: {
        default: MERMAID_LAYOUT_DEFAULTS.curve,
        parseHTML: (element) => element.getAttribute('data-curve') || MERMAID_LAYOUT_DEFAULTS.curve,
        renderHTML: (attributes) => ({
          'data-curve': attributes.curve || MERMAID_LAYOUT_DEFAULTS.curve,
        }),
      },
      nodeSpacing: {
        default: MERMAID_LAYOUT_DEFAULTS.nodeSpacing,
        parseHTML: (element) => numberAttrOr(element, 'data-node-spacing', MERMAID_LAYOUT_DEFAULTS.nodeSpacing),
        renderHTML: (attributes) => ({
          'data-node-spacing': attributes.nodeSpacing ?? MERMAID_LAYOUT_DEFAULTS.nodeSpacing,
        }),
      },
      rankSpacing: {
        default: MERMAID_LAYOUT_DEFAULTS.rankSpacing,
        parseHTML: (element) => numberAttrOr(element, 'data-rank-spacing', MERMAID_LAYOUT_DEFAULTS.rankSpacing),
        renderHTML: (attributes) => ({
          'data-rank-spacing': attributes.rankSpacing ?? MERMAID_LAYOUT_DEFAULTS.rankSpacing,
        }),
      },
      padding: {
        default: MERMAID_LAYOUT_DEFAULTS.padding,
        parseHTML: (element) => numberAttrOr(element, 'data-padding', MERMAID_LAYOUT_DEFAULTS.padding),
        renderHTML: (attributes) => ({
          'data-padding': attributes.padding ?? MERMAID_LAYOUT_DEFAULTS.padding,
        }),
      },
      lineGap: {
        default: MERMAID_LAYOUT_DEFAULTS.lineGap,
        parseHTML: (element) => numberAttrOr(element, 'data-line-gap', MERMAID_LAYOUT_DEFAULTS.lineGap),
        renderHTML: (attributes) => ({
          'data-line-gap': attributes.lineGap ?? MERMAID_LAYOUT_DEFAULTS.lineGap,
        }),
      },
      boxGap: {
        default: MERMAID_LAYOUT_DEFAULTS.boxGap,
        parseHTML: (element) => numberAttrOr(element, 'data-box-gap', MERMAID_LAYOUT_DEFAULTS.boxGap),
        renderHTML: (attributes) => ({
          'data-box-gap': attributes.boxGap ?? MERMAID_LAYOUT_DEFAULTS.boxGap,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const raw = el.getAttribute('data-code') || el.innerText || '';
          let code = raw;
          try { code = decodeURIComponent(raw); } catch {}
          const pdfLayout = el.getAttribute('data-pdf-layout') || 'auto';
          return { code, pdfLayout };
        },
      },
      {
        tag: 'pre[data-language="mermaid"]',
        getAttrs: (element) => ({
          code: (element as HTMLElement).innerText || '',
          pdfLayout: 'auto',
        }),
      },
      {
        tag: 'pre',
        getAttrs: (element) => {
          const codeEl = (element as HTMLElement).querySelector('code.language-mermaid');
          if (codeEl) {
            return { code: codeEl.textContent || '', pdfLayout: 'auto' };
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'mermaid',
        'data-code': HTMLAttributes.code,
        'data-pdf-layout': HTMLAttributes.pdfLayout || 'auto',
        class: 'mermaid-node-container',
      }),
      ['pre', { class: 'hidden' }, HTMLAttributes.code || ''],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidComponent);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write('```mermaid\n');
          state.text(node.attrs.code || '', false);
          state.ensureNewLine();
          state.write('```');
          state.closeBlock(node);
        },
        parse: {
          // Handled via custom parser in markdown-serializer
        },
      },
    };
  },
});
