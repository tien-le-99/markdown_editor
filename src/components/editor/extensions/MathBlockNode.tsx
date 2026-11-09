import React, { useState, useEffect, useMemo } from 'react';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';
import {
  Sigma,
  Code2,
  Check,
  X,
  Trash2,
  Copy,
  AlertCircle,
  Sparkles
} from 'lucide-react';

export const MATH_PRESETS: Record<string, { label: string; code: string }> = {
  quadratic: {
    label: 'Quadratic Formula',
    code: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  },
  euler: {
    label: "Euler's Identity",
    code: 'e^{i\\pi} + 1 = 0',
  },
  gaussian: {
    label: 'Gaussian Integral',
    code: '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}',
  },
  matrix: {
    label: '2x2 Matrix',
    code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
  },
  normal: {
    label: 'Normal Distribution',
    code: 'f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}',
  },
  fourier: {
    label: 'Fourier Transform',
    code: '\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx',
  },
};

export const MathBlockComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rawCode, setRawCode] = useState(node.attrs.code || MATH_PRESETS.quadratic.code);
  const [copied, setCopied] = useState(false);

  // Sync external changes (e.g. from drawer)
  useEffect(() => {
    setRawCode(node.attrs.code || MATH_PRESETS.quadratic.code);
  }, [node.attrs.code]);

  // Compute KaTeX rendered HTML or catch syntax error
  const { renderedHtml, error } = useMemo(() => {
    const code = node.attrs.code || MATH_PRESETS.quadratic.code;
    try {
      const html = katex.renderToString(code, {
        displayMode: true,
        throwOnError: true,
      });
      return { renderedHtml: html, error: null };
    } catch (err: any) {
      return { renderedHtml: '', error: err.message || 'LaTeX syntax error' };
    }
  }, [node.attrs.code]);

  const handleApply = () => {
    updateAttributes({ code: rawCode });
    setIsEditing(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.attrs.code || rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy LaTeX:', err);
    }
  };

  return (
    <NodeViewWrapper className="my-6 not-prose select-none">
      <div
        className="math-block-container relative bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
        data-testid="math-block-view"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Sigma className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-slate-700">LaTeX Math Formula</span>
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
              KaTeX Display
            </span>
          </div>

          <div className="flex items-center gap-1.5 no-print">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 border border-slate-200 flex items-center gap-1 px-2 text-[11px]"
              title="Copy LaTeX formula"
              data-testid="math-copy-button"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy LaTeX'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`px-2.5 py-1 flex items-center gap-1 rounded-md text-xs font-medium border transition-colors ${
                isEditing
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Edit LaTeX Syntax"
              data-testid="math-edit-button"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Close Editor' : 'Edit Formula'}</span>
            </button>

            <button
              type="button"
              onClick={deleteNode}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md border border-red-200"
              title="Delete Formula"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error Boundary Banner */}
        {error && (
          <div
            className="p-4 bg-red-50/80 border-b border-red-200 flex items-start gap-3 text-red-800 text-xs"
            data-testid="math-error-banner"
          >
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <strong className="font-semibold block">KaTeX Formula Syntax Error:</strong>
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
                    updateAttributes({ code: MATH_PRESETS.quadratic.code });
                    setRawCode(MATH_PRESETS.quadratic.code);
                  }}
                  className="px-2 py-1 bg-white border border-red-300 hover:bg-red-50 text-red-700 rounded text-xs font-medium"
                >
                  Reset to Quadratic Formula
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rendered Math Formula Display */}
        <div
          className="relative w-full min-h-[90px] py-6 px-4 bg-slate-50/40 flex items-center justify-center overflow-x-auto cursor-pointer"
          onDoubleClick={() => setIsEditing(true)}
          title="Double-click to edit LaTeX formula"
          data-testid="math-display-container"
        >
          {renderedHtml ? (
            <div
              className="text-slate-900 text-lg md:text-xl"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <div className="text-sm text-slate-400 italic">Empty Formula</div>
          )}
        </div>

        {/* Edit Modal / Drawer */}
        {isEditing && (
          <div
            className="border-t border-slate-200 bg-slate-50/95 p-4 no-print animate-in fade-in duration-150"
            data-testid="math-code-editor"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700 mr-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-600" /> Presets:
                </span>
                {Object.entries(MATH_PRESETS).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRawCode(item.code)}
                    className="px-2 py-0.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-sans"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium flex items-center gap-1 shadow-xs"
                  data-testid="math-save-button"
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
              className="w-full h-28 font-mono text-xs p-3 bg-slate-900 text-indigo-200 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              spellCheck={false}
              placeholder="Enter LaTeX formula, e.g. x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
              data-testid="math-textarea"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const MathBlockNode = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: MATH_PRESETS.quadratic.code,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const raw = el.getAttribute('data-code') || el.innerText || '';
          let code = raw;
          try {
            code = decodeURIComponent(raw);
          } catch {
            // keep raw
          }
          return { code };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const encoded = encodeURIComponent(node.attrs.code || '');
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-block',
        'data-code': encoded,
      }),
      ['pre', { class: 'hidden' }, node.attrs.code || ''],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockComponent);
  },
});
