import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import * as echarts from 'echarts';
import { 
  BarChart3, 
  Code2, 
  AlertCircle, 
  Check, 
  X, 
  Trash2, 
  Maximize2, 
  Minimize2,
  PieChart,
  LineChart as LineChartIcon,
  HelpCircle
} from 'lucide-react';

const CHART_PRESETS = {
  line: {
    title: { text: 'Monthly Performance', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    yAxis: { type: 'value' },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    series: [{ data: [150, 230, 224, 218, 135, 147, 260], type: 'line', smooth: true, color: '#0284c7' }]
  },
  bar: {
    title: { text: 'Quarterly Sales by Segment', left: 'center' },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 30 },
    xAxis: { type: 'category', data: ['Direct', 'Channel', 'Online', 'Retail'] },
    yAxis: { type: 'value' },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    series: [
      { name: 'Target', type: 'bar', data: [320, 302, 301, 334], color: '#94a3b8' },
      { name: 'Actual', type: 'bar', data: [360, 340, 330, 380], color: '#10b981' }
    ]
  },
  pie: {
    title: { text: 'Revenue Distribution', left: 'center' },
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [
      {
        name: 'Segment',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        data: [
          { value: 1048, name: 'Enterprise', itemStyle: { color: '#0284c7' } },
          { value: 735, name: 'SaaS Cloud', itemStyle: { color: '#38bdf8' } },
          { value: 580, name: 'Professional Services', itemStyle: { color: '#818cf8' } },
          { value: 484, name: 'Marketplace', itemStyle: { color: '#34d399' } }
        ]
      }
    ]
  }
};

export const EChartsComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rawCode, setRawCode] = useState(node.attrs.code || '');
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync internal rawCode if node.attrs.code changes externally
  useEffect(() => {
    setRawCode(node.attrs.code || '');
  }, [node.attrs.code]);

  // Parse chart options safely with graceful error boundary
  const parsedOption = useMemo(() => {
    const code = node.attrs.code || '{}';
    try {
      const parsed = JSON.parse(code);
      setParseError(null);
      
      // Auto-inject dataZoom for interactive zooming & panning if not already present on cartesian charts
      if (parsed.xAxis && !parsed.dataZoom) {
        parsed.dataZoom = [
          { type: 'inside', start: 0, end: 100 },
          { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
        ];
      }
      return parsed;
    } catch (err: any) {
      setParseError(err.message || 'Invalid JSON syntax');
      return null;
    }
  }, [node.attrs.code]);

  // Initialize or update ECharts instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartContainerRef.current);
    }

    if (parsedOption) {
      try {
        chartInstanceRef.current.setOption(parsedOption, true);
        chartInstanceRef.current.resize();
      } catch (err: any) {
        setParseError(`ECharts runtime render error: ${err.message}`);
      }
    } else {
      chartInstanceRef.current.clear();
    }

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    const observer = new ResizeObserver(handleResize);
    observer.observe(chartContainerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [parsedOption, isFullscreen]);

  // Clean up chart instance on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  const handleSaveCode = () => {
    try {
      const parsed = JSON.parse(rawCode);
      const formatted = JSON.stringify(parsed, null, 2);
      updateAttributes({ code: formatted });
      setRawCode(formatted);
      setParseError(null);
      setIsEditing(false);
    } catch (err: any) {
      setParseError(err.message || 'Cannot save invalid JSON');
    }
  };

  const applyPreset = (presetKey: keyof typeof CHART_PRESETS) => {
    const formatted = JSON.stringify(CHART_PRESETS[presetKey], null, 2);
    setRawCode(formatted);
  };

  const formatCode = () => {
    try {
      const parsed = JSON.parse(rawCode);
      setRawCode(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch (err: any) {
      setParseError(err.message);
    }
  };

  return (
    <NodeViewWrapper className="my-6 not-prose select-none">
      <div 
        className={`echarts-node-container relative bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'fixed inset-4 z-50 shadow-2xl flex flex-col' : ''
        }`}
        data-testid="echarts-node-view"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-600" />
            <span className="font-semibold text-slate-700">Apache ECharts</span>
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-brand-50 text-brand-700 rounded border border-brand-200">
              Interactive Zoom & Pan
            </span>
          </div>

          <div className="flex items-center gap-1.5 no-print">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`px-2.5 py-1 flex items-center gap-1 rounded-md text-xs font-medium border transition-colors ${
                isEditing 
                  ? 'bg-brand-600 text-white border-brand-600' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Edit Chart JSON"
              data-testid="echarts-edit-button"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Close Editor' : 'Edit Chart'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md border border-slate-200"
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand View'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={deleteNode}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md border border-red-200"
              title="Delete Chart"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Inline Error Boundary State */}
        {parseError && (
          <div 
            className="p-4 bg-red-50/80 border-b border-red-200 flex items-start gap-3 text-red-800 text-xs"
            data-testid="echarts-error-banner"
          >
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <strong className="font-semibold block">Chart Specification Error:</strong>
              <code className="text-[11px] font-mono mt-0.5 block bg-red-100/70 p-1.5 rounded text-red-900 break-all">
                {parseError}
              </code>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                >
                  Repair JSON Syntax
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fallback = JSON.stringify(CHART_PRESETS.line, null, 2);
                    updateAttributes({ code: fallback });
                    setRawCode(fallback);
                    setParseError(null);
                  }}
                  className="px-2 py-1 bg-white border border-red-300 hover:bg-red-50 text-red-700 rounded text-xs font-medium"
                >
                  Reset to Default Preset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chart Canvas */}
        <div className={`relative w-full ${isFullscreen ? 'flex-1 min-h-[400px]' : 'h-[380px]'} bg-white`}>
          <div 
            ref={chartContainerRef} 
            className="w-full h-full"
            data-testid="echarts-canvas-container"
          />
        </div>

        {/* Inline JSON Code Editor Drawer / Modal */}
        {isEditing && (
          <div 
            className="border-t border-slate-200 bg-slate-50/90 p-4 animate-in fade-in duration-150 no-print"
            data-testid="echarts-code-editor"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('line')}
                  className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 flex items-center gap-1"
                >
                  <LineChartIcon className="w-3 h-3 text-brand-600" /> Line
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('bar')}
                  className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 flex items-center gap-1"
                >
                  <BarChart3 className="w-3 h-3 text-emerald-600" /> Bar
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('pie')}
                  className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 flex items-center gap-1"
                >
                  <PieChart className="w-3 h-3 text-amber-600" /> Pie
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={formatCode}
                  className="px-2.5 py-1 text-xs bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-medium"
                >
                  Format JSON
                </button>
                <button
                  type="button"
                  onClick={handleSaveCode}
                  className="px-3 py-1 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded font-medium flex items-center gap-1 shadow-sm"
                  data-testid="echarts-save-button"
                >
                  <Check className="w-3.5 h-3.5" /> Apply & Save
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
              className="w-full h-48 font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              spellCheck={false}
              data-testid="echarts-textarea"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const EChartsNode = Node.create({
  name: 'echarts',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: JSON.stringify(CHART_PRESETS.line, null, 2),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="echarts"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const raw = el.getAttribute('data-code') || el.innerText || '';
          let code = raw;
          try { code = decodeURIComponent(raw); } catch {}
          return { code };
        },
      },
      {
        tag: 'pre[data-language="echarts"]',
        getAttrs: (element) => ({
          code: (element as HTMLElement).innerText || '',
        }),
      },
      {
        tag: 'pre',
        getAttrs: (element) => {
          const codeEl = (element as HTMLElement).querySelector('code.language-echarts');
          if (codeEl) {
            return { code: codeEl.textContent || '' };
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
        'data-type': 'echarts',
        'data-code': HTMLAttributes.code,
        class: 'echarts-node-container',
      }),
      ['pre', { class: 'hidden' }, HTMLAttributes.code || ''],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EChartsComponent);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write('```echarts\n');
          state.text(node.attrs.code || '{}', false);
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
