'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { EChartsNode } from './extensions/EChartsNode';
import { MermaidNode } from './extensions/MermaidNode';
import { TableExtensions } from './extensions/TableExtensions';
import { CustomLink } from './extensions/CustomLink';
import { CustomHeading } from './extensions/CustomHeading';
import { MathBlockNode } from './extensions/MathBlockNode';
import { MathInlineNode } from './extensions/MathInlineNode';
import { Toolbar, type MermaidPdfLayout } from './Toolbar';
import { MarkdownDrawer } from './MarkdownDrawer';
import { DocumentOutline } from './DocumentOutline';
import { DEFAULT_MARKDOWN } from './utils/default-content';
import { markdownToHtml, htmlToMarkdown, slugifyHeading } from './utils/markdown-serializer';
import { isTallMermaidDiagram, computeMermaidPaginatePlan, planSliceBoundaries, inkSpansFromCloneSvg, inkSpansFromRects, resolveMermaidExportSvg, getMermaidExportSize, waitForMermaidDiagramsReady, type MermaidInkSpan } from './utils/mermaid-paginate';
import { AlertTriangle, CheckCircle2, FileText, Sparkles, UploadCloud } from 'lucide-react';

export const Editor: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [rawMarkdown, setRawMarkdown] = useState<string>(DEFAULT_MARKDOWN);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [mermaidLayout, setMermaidLayout] = useState<MermaidPdfLayout>('enlarge');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load saved Mermaid PDF export preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('markdown_pdf_mermaid_layout');
      if (saved && ['enlarge', 'landscape', 'rotate', 'fit', 'paginate'].includes(saved)) {
        setMermaidLayout(saved as any);
      }
    } catch {}
  }, []);

  const handleMermaidLayoutChange = (mode: MermaidPdfLayout) => {
    setMermaidLayout(mode);
    try {
      localStorage.setItem('markdown_pdf_mermaid_layout', mode);
    } catch {}
  };

  const mainRef = useRef<HTMLElement>(null);
  const isUpdatingRef = useRef(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Smoothly scroll to heading element with intelligent fallback & visual pulse feedback
  const scrollToHeading = useCallback((targetId: string) => {
    if (!mainRef.current) return;
    const container = mainRef.current;

    // 1. Direct ID lookup in document/container
    let targetEl: HTMLElement | null =
      document.getElementById(targetId) ||
      container.querySelector(`[id="${CSS.escape(targetId)}"]`);

    // 2. Fallback: Search headings by matching slug or normalized text
    if (!targetEl) {
      const normalizedTarget = targetId.toLowerCase().replace(/[^\w-]/g, '');
      const headings = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
      targetEl = headings.find((h) => {
        const hId = (h.getAttribute('id') || '').toLowerCase().replace(/[^\w-]/g, '');
        const hSlug = slugifyHeading(h.textContent || '').toLowerCase().replace(/[^\w-]/g, '');
        if (hId === normalizedTarget || hSlug === normalizedTarget) return true;
        const strippedH = hSlug.replace(/^[\d.-]+/, '');
        const strippedTarget = normalizedTarget.replace(/^[\d.-]+/, '');
        return strippedH && strippedH === strippedTarget;
      }) || null;
    }

    if (targetEl) {
      if (!targetEl.id) {
        targetEl.id = targetId;
      }
      const containerRect = container.getBoundingClientRect();
      const elRect = targetEl.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - 24;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });

      // Pulse visual highlight feedback
      targetEl.classList.remove('heading-anchor-pulse');
      void targetEl.offsetWidth; // force browser reflow
      targetEl.classList.add('heading-anchor-pulse');
      setTimeout(() => {
        targetEl?.classList.remove('heading-anchor-pulse');
      }, 2000);
    }
  }, []);

  // Initialize Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-sm border border-slate-800 my-4 overflow-x-auto selection:bg-brand-600/40',
          },
        },
        code: {
          HTMLAttributes: {
            class: 'bg-slate-100 text-slate-800 border border-slate-200/80 rounded-md px-1.5 py-0.5 font-mono text-[0.875em] font-medium',
          },
        },
        heading: false,
      }),
      CustomHeading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      EChartsNode,
      MermaidNode,
      MathBlockNode,
      MathInlineNode,
      ...TableExtensions,
      CustomLink,
    ],
    content: markdownToHtml(DEFAULT_MARKDOWN),
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none min-h-[600px] text-slate-800',
        'data-testid': 'wysiwyg-editor',
      },
      handleClick: (_view, _pos, event) => {
        const target = (event.target as HTMLElement).closest('a');
        if (target) {
          const href = target.getAttribute('href');
          if (href && href.startsWith('#') && href.length > 1) {
            const targetId = decodeURIComponent(href.slice(1));
            scrollToHeading(targetId);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      try {
        const currentHtml = editor.getHTML();
        const md = htmlToMarkdown(currentHtml);
        setRawMarkdown(md);
      } finally {
        isUpdatingRef.current = false;
      }
    },
  });

  // Handle bidirectional edits from the raw markdown drawer
  const handleMarkdownChange = useCallback((newMarkdown: string) => {
    setRawMarkdown(newMarkdown);
    if (!editor || isUpdatingRef.current) return;

    isUpdatingRef.current = true;
    try {
      const html = markdownToHtml(newMarkdown);
      editor.commands.setContent(html, false, {
        preserveWhitespace: 'full',
      });
    } finally {
      isUpdatingRef.current = false;
    }
  }, [editor]);

  // Insert default ECharts block
  const handleInsertECharts = () => {
    if (!editor) return;
    const defaultChartCode = JSON.stringify({
      title: { text: 'New Interactive Chart', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] },
      yAxis: { type: 'value' },
      dataZoom: [{ type: 'inside' }, { type: 'slider' }],
      series: [{ type: 'bar', data: [120, 200, 150, 80], color: '#0284c7' }]
    }, null, 2);

    editor.chain().focus().insertContent({
      type: 'echarts',
      attrs: { code: defaultChartCode },
    }).run();
  };

  // Insert default Mermaid diagram block
  const handleInsertMermaid = () => {
    if (!editor) return;
    const defaultDiagramCode = `graph TD
  Start([Start Process]) --> Action[Execute Task]
  Action --> Decision{Status OK?}
  Decision -- Yes --> Success([Complete])
  Decision -- No --> Retry[Retry Strategy]
  Retry --> Action`;

    editor.chain().focus().insertContent({
      type: 'mermaid',
      attrs: { code: defaultDiagramCode },
    }).run();
  };

  // Insert default Math formula block
  const handleInsertMath = () => {
    if (!editor) return;
    const defaultMathCode = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

    editor.chain().focus().insertContent({
      type: 'mathBlock',
      attrs: { code: defaultMathCode },
    }).run();
  };

  // Load sample template document
  const handleLoadSample = () => {
    if (!editor) return;
    isUpdatingRef.current = true;
    try {
      setRawMarkdown(DEFAULT_MARKDOWN);
      const html = markdownToHtml(DEFAULT_MARKDOWN);
      editor.commands.setContent(html, false);
      showToast('Loaded sample document with ECharts, Mermaid & GFM Table');
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // Open local Markdown file
  const handleOpenFile = (content: string, filename: string) => {
    if (!editor) return;
    isUpdatingRef.current = true;
    try {
      setRawMarkdown(content);
      const html = markdownToHtml(content);
      editor.commands.setContent(html, false);
      showToast(`Successfully opened "${filename}"`);
      if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Failed to open file:', err);
      showToast('Failed to open markdown file', 'error');
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // High-Fidelity PDF Export Handler
  const handleExportPdf = async (overrideLayout?: MermaidPdfLayout) => {
    if (!editor) return;
    setIsExportingPdf(true);
    const effectiveMermaidLayout = overrideLayout || mermaidLayout;

    try {
      // Capture live DOM with fully rendered SVGs, KaTeX vector formulas, and chart images
      const editorDom = document.querySelector('.ProseMirror');
      if (!editorDom) throw new Error('Editor element not found');

      // Never slice/export half-rendered diagrams: wait for Mermaid to finish
      // laying out (or fail with its error banner) before snapshotting.
      // Exporting mid-render yields empty or duplicated slice windows that
      // read as overlapped content in the PDF.
      const diagramsReady = await waitForMermaidDiagramsReady(editorDom, 2500);
      if (!diagramsReady) {
        throw new Error('Diagrams are still rendering — please wait a moment and try exporting again.');
      }

      const clone = editorDom.cloneNode(true) as HTMLElement;

      // 1. Remove non-printable interactive controls, toolbars, and buttons
      clone.querySelectorAll('button, .no-print, [data-testid$="-editor"], .panzoom-controls').forEach((el) => {
        el.remove();
      });

      const dynamicStyles: string[] = [];

      // Live rendered SVGs (same order as the clone) for measuring node ink
      // geometry when gap-snapping paginated slices. resolveMermaidExportSvg
      // targets the diagram SVG inside .panzoom-wrapper — the container header
      // holds small Lucide icon SVGs and querySelector('svg') would grab one
      // of those (24x24), yielding zero ink spans and silent uniform cuts.
      const liveMermaidSvgs = Array.from(editorDom.querySelectorAll('.mermaid-node-container')).map(
        (c) => resolveMermaidExportSvg(c)
      );

      // 2. Normalize Mermaid diagrams: strip edit header & hidden pre, unclamp height, apply configured layout
      clone.querySelectorAll('.mermaid-node-container').forEach((container, idx) => {
        const header = container.querySelector('[class*="border-b"]');
        if (header) header.remove();
        container.querySelectorAll('pre.hidden, pre[class*="hidden"]').forEach((p) => p.remove());
        
        // Remove interactive fixed-height constraints so diagrams expand naturally
        const viewport = (container.querySelector('.mermaid-canvas-viewport') || container.querySelector('.panzoom-wrapper')?.parentElement) as HTMLElement | null;
        if (viewport) {
          viewport.style.height = 'auto';
          viewport.style.minHeight = '0';
          viewport.style.maxHeight = 'none';
          viewport.style.overflow = 'visible';
          viewport.style.background = 'transparent';
          viewport.style.padding = '8px 0';
        }

        const panzoomWrapper = container.querySelector('.panzoom-wrapper') as HTMLElement | null;
        if (panzoomWrapper) {
          panzoomWrapper.style.transform = 'none';
          panzoomWrapper.style.width = '100%';
          panzoomWrapper.style.maxWidth = '100%';
          panzoomWrapper.style.display = 'flex';
          panzoomWrapper.style.justifyContent = 'center';
        }

        // Resolve the DIAGRAM svg (never a 24px Lucide chrome icon) and its
        // measurable size. When nothing rendered yet, skip layout handling and
        // export the node as-is instead of planning slices from garbage size.
        const svg = resolveMermaidExportSvg(container);
        const exportSize = svg ? getMermaidExportSize(svg) : null;
        if (svg && exportSize) {
          svg.style.transform = 'none';
          svg.style.maxWidth = '100%';
          svg.style.height = 'auto';
          svg.style.display = 'block';
          svg.style.margin = '0 auto';
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

          // Diagram dimensions from the viewBox (also valid on the detached
          // export clone, where layout rects read 0).
          const svgWidth = exportSize.width;
          const svgHeight = exportSize.height;

          const aspectRatio = svgWidth / (svgHeight || 1);
          const isWide = svgWidth > 700 || aspectRatio > 1.25;

          // Determine effective mode: per-diagram override or global selection
          let effectiveMode = container.getAttribute('data-pdf-layout') || 'auto';
          const perDiagramMode = effectiveMode;
          if (effectiveMode === 'auto') {
            effectiveMode = effectiveMermaidLayout;
          }

          // Auto-route very tall diagrams to paginate (strict A4 slices) when no
          // explicit wide-layout was chosen: single-page modes clip tall flowcharts
          // or shrink them to unreadable sizes.
          if (
            perDiagramMode === 'auto' &&
            (effectiveMermaidLayout === 'enlarge' || effectiveMermaidLayout === 'fit') &&
            isTallMermaidDiagram(svgWidth, svgHeight)
          ) {
            effectiveMode = 'paginate';
          }

          // If not wide and mode was not explicitly set, standard inline fit is appropriate
          if (!isWide && effectiveMode !== 'rotate' && effectiveMode !== 'landscape' && effectiveMode !== 'enlarge' && effectiveMode !== 'paginate') {
            effectiveMode = 'fit';
          }

          if (effectiveMode === 'enlarge') {
            // Dynamic enlarged page: unrotated, custom width tailored to diagram
            const widthMm = Math.max(210, Math.ceil(svgWidth / 3.78) + 36);
            const heightMm = Math.max(180, Math.ceil(svgHeight / 3.78) + 36);
            const pageName = `mermaid-enlarge-${idx}`;

            dynamicStyles.push(`
              @page ${pageName} {
                size: ${widthMm}mm ${heightMm}mm;
                margin: 16mm 18mm;
              }
              .${pageName} {
                page: ${pageName} !important;
              }
            `);

            container.classList.add('mermaid-enlarge-page', pageName);
            if (viewport) {
              viewport.style.height = '100%';
              viewport.style.padding = '0';
            }
            if (panzoomWrapper) {
              panzoomWrapper.style.width = '100%';
              panzoomWrapper.style.height = '100%';
              panzoomWrapper.style.maxWidth = '100%';
              panzoomWrapper.style.maxHeight = '100%';
            }
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.maxWidth = '100%';
            svg.style.maxHeight = '100%';
          } else if (effectiveMode === 'landscape') {
            // Standard A4 landscape page: unrotated
            container.classList.add('mermaid-landscape-page');
            if (viewport) {
              viewport.style.height = '100%';
              viewport.style.padding = '0';
            }
            if (panzoomWrapper) {
              panzoomWrapper.style.width = '100%';
              panzoomWrapper.style.height = '100%';
              panzoomWrapper.style.maxWidth = '100%';
              panzoomWrapper.style.maxHeight = '100%';
            }
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.maxWidth = '100%';
            svg.style.maxHeight = '100%';
          } else if (effectiveMode === 'rotate') {
            // Rotated 90 degrees on dedicated A4 portrait page
            container.classList.add('mermaid-rotated-page');
            if (viewport) {
              viewport.style.height = '100%';
              viewport.style.padding = '0';
            }
            if (panzoomWrapper) {
              panzoomWrapper.style.width = '100%';
              panzoomWrapper.style.height = '100%';
              panzoomWrapper.style.maxWidth = '100%';
              panzoomWrapper.style.maxHeight = '100%';
            }
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.maxWidth = '100%';
            svg.style.maxHeight = '100%';

            const rotatedInner = document.createElement('div');
            rotatedInner.className = 'mermaid-rotated-inner';

            if (panzoomWrapper && panzoomWrapper.parentElement) {
              panzoomWrapper.parentElement.insertBefore(rotatedInner, panzoomWrapper);
              rotatedInner.appendChild(panzoomWrapper);
            } else if (svg && svg.parentElement) {
              svg.parentElement.insertBefore(rotatedInner, svg);
              rotatedInner.appendChild(svg);
            }
          } else if (effectiveMode === 'paginate') {
            // Strict A4 portrait pagination: slice the tall SVG across one page
            // per slice so text stays upright and legible without editing source.
            // Cut boundaries snap backward into whitespace gaps between nodes so
            // slices never bisect a node box or label mid-shape.
            const plan = computeMermaidPaginatePlan(svgWidth, svgHeight);
            if (!plan) {
              // Fits on a single page after all: standard inline fit.
              svg.style.maxWidth = '100%';
              svg.style.height = 'auto';
            } else {
              // Collect node/label ink spans in SVG user units, preferring the
              // deterministic clone markup (exact geometry being exported:
              // immune to fonts, zoom, scroll and stray icon SVGs). Live
              // rendered rects are only a fallback when markup yields nothing.
              // Edge connector paths and subgraph backgrounds are excluded on
              // purpose: an edge crossing a break reads naturally, a bisected
              // node box or label does not. On any failure we fall back to
              // uniform cuts.
              let inkSpans: MermaidInkSpan[] = [];
              try {
                inkSpans = inkSpansFromCloneSvg(svg);
              } catch { /* fall through to live measurement */ }
              if (inkSpans.length === 0) {
                try {
                  const liveSvg = liveMermaidSvgs[idx];
                  const svgBox = liveSvg?.getBoundingClientRect();
                  if (liveSvg && svgBox && svgBox.height > 0) {
                    const inkNodes = liveSvg.querySelectorAll('g.node, g.edgeLabel, g.cluster-label');
                    const rects: { top: number; height: number }[] = [];
                    inkNodes?.forEach((g) => {
                      try {
                        const r = (g as SVGGraphicsElement).getBoundingClientRect();
                        rects.push({ top: r.top, height: r.height });
                      } catch { /* ignore unmeasurable nodes */ }
                    });
                    inkSpans = inkSpansFromRects(svgBox.top, svgBox.height, svgHeight, rects);
                  }
                } catch { /* fall back to uniform slicing */ }
              }
              const sliceUnits = plan.sliceHeightPx / plan.scale;
              const boundsPx = planSliceBoundaries(svgHeight, sliceUnits, inkSpans).map(
                (b) => b * plan.scale
              );
              const pageCount = boundsPx.length - 1;
              const svgMarkup = svg.outerHTML;
              const pages: HTMLElement[] = [];
              for (let k = 0; k < pageCount; k++) {
                const topPx = boundsPx[k];
                const slicePx = boundsPx[k + 1] - topPx;
                const slicePage = document.createElement('div');
                slicePage.className = 'mermaid-paginate-page';
                slicePage.setAttribute('data-slice', `${k + 1}/${pageCount}`);
                if (k > 0) {
                  slicePage.style.breakBefore = 'page';
                  slicePage.style.pageBreakBefore = 'always';
                }
                const sliceViewport = document.createElement('div');
                sliceViewport.className = 'mermaid-slice-viewport';
                sliceViewport.style.height = `${slicePx}px`;
                sliceViewport.style.overflow = 'hidden';
                const inner = document.createElement('div');
                inner.className = 'mermaid-slice-inner';
                inner.style.width = `${plan.scaledWidthPx}px`;
                inner.style.height = `${plan.scaledHeightPx}px`;
                inner.style.transform = `translateY(${-topPx}px)`;
                inner.innerHTML = svgMarkup;
                const svgClone = inner.querySelector('svg');
                if (svgClone) {
                  const cloneEl = svgClone as unknown as HTMLElement;
                  cloneEl.style.width = `${plan.scaledWidthPx}px`;
                  cloneEl.style.height = `${plan.scaledHeightPx}px`;
                  cloneEl.style.maxWidth = 'none';
                  cloneEl.style.transform = 'none';
                  cloneEl.style.margin = '0';
                  svgClone.setAttribute('width', `${plan.scaledWidthPx}`);
                  svgClone.setAttribute('height', `${plan.scaledHeightPx}`);
                }
                sliceViewport.appendChild(inner);
                slicePage.appendChild(sliceViewport);
                pages.push(slicePage);
              }
              container.replaceWith(...pages);
            }
          } else {
            // Fit inline: standard portrait width
            svg.style.maxWidth = '100%';
            svg.style.height = 'auto';
          }
        }
      });

      if (dynamicStyles.length > 0) {
        const styleEl = document.createElement('style');
        styleEl.textContent = dynamicStyles.join('\n');
        clone.insertBefore(styleEl, clone.firstChild);
      }

      // 3. For Math Block: remove edit/action headers
      clone.querySelectorAll('.math-block-container').forEach((container) => {
        const header = container.querySelector('[class*="border-b"]');
        if (header) header.remove();
      });

      // 4. For ECharts: convert live canvas to high-res PNG image
      const originalContainers = Array.from(editorDom.querySelectorAll('.echarts-node-container'));
      clone.querySelectorAll('.echarts-node-container').forEach((container, idx) => {
        const orig = originalContainers[idx];
        const canvas = orig?.querySelector('canvas');
        if (canvas) {
          const img = document.createElement('img');
          img.src = canvas.toDataURL('image/png');
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.display = 'block';
          img.style.margin = '0 auto';
          container.innerHTML = '';
          container.appendChild(img);
        }
      });

      // 5. For Task Lists: preserve checkbox states in cloned DOM
      const origInputs = editorDom.querySelectorAll('input[type="checkbox"]');
      const cloneInputs = clone.querySelectorAll('input[type="checkbox"]');
      origInputs.forEach((input, idx) => {
        if ((input as HTMLInputElement).checked) {
          cloneInputs[idx]?.setAttribute('checked', 'checked');
        } else {
          cloneInputs[idx]?.removeAttribute('checked');
        }
      });

      // 6. For Headings & TOC anchors: guarantee all headings have an id attribute and dot-based anchor support
      clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
        if (!heading.id) {
          heading.id = slugifyHeading(heading.textContent || '');
        }
        const rawText = heading.textContent || '';
        // Only generate dot-based alias for hierarchical numbers (e.g. 2.1, 2.2.1), not trailing dot like "1."
        const match = rawText.match(/^(\d+(\.\d+)+)\s+(.*)$/);
        if (match) {
          const dottedSlug = `${match[1].toLowerCase()}-${slugifyHeading(match[3])}`;
          if (dottedSlug !== heading.id && !clone.querySelector(`[id="${CSS.escape(dottedSlug)}"]`)) {
            const anchor = document.createElement('a');
            anchor.id = dottedSlug;
            anchor.setAttribute('name', dottedSlug);
            anchor.className = 'anchor-point';
            anchor.style.position = 'absolute';
            anchor.style.width = '0';
            anchor.style.height = '0';
            anchor.style.overflow = 'hidden';
            anchor.style.textDecoration = 'none';
            heading.insertBefore(anchor, heading.firstChild);
          }
        }
      });

      const liveHtml = clone.innerHTML;
      const docTitle = clone.querySelector('h1')?.textContent?.trim() || 'Markdown Document';

      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: liveHtml,
          title: docTitle,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast('PDF successfully generated and downloaded!');
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      showToast(err.message || 'Failed to generate PDF export', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Listen to in-page anchor links (e.g. Table of Contents #anchors)
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (href && href.startsWith('#') && href.length > 1) {
        e.preventDefault();
        const targetId = decodeURIComponent(href.slice(1));
        scrollToHeading(targetId);
      }
    };

    const container = mainRef.current;
    if (container) {
      container.addEventListener('click', handleAnchorClick);
      return () => container.removeEventListener('click', handleAnchorClick);
    }
  }, [scrollToHeading]);

  // Listen to drag-and-drop file imports
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.type.includes('text');
      if (!isMarkdown) {
        showToast('Please drop a Markdown (.md) file', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) handleOpenFile(content, file.name);
      };
      reader.readAsText(file);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [editor]);

  // Listen to external copy requests
  useEffect(() => {
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(rawMarkdown);
        showToast('Raw markdown copied to clipboard');
      } catch (err) {
        console.error('Clipboard copy failed', err);
      }
    };
    window.addEventListener('copy-markdown-request', handleCopy);
    return () => window.removeEventListener('copy-markdown-request', handleCopy);
  }, [rawMarkdown]);

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden relative">
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-brand-600/20 backdrop-blur-xs border-4 border-dashed border-brand-500 rounded-2xl m-4 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <UploadCloud className="w-16 h-16 text-brand-600 animate-bounce mb-3" />
          <h2 className="text-xl font-bold text-slate-800">Drop Markdown File Here</h2>
          <p className="text-sm text-slate-600 mt-1">Load file into WYSIWYG & GFM workspace</p>
        </div>
      )}

      {/* Top Application Bar & Toolbar */}
      <Toolbar
        editor={editor}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen(!outlineOpen)}
        onExportPdf={handleExportPdf}
        isExportingPdf={isExportingPdf}
        mermaidLayout={mermaidLayout}
        onMermaidLayoutChange={handleMermaidLayoutChange}
        onInsertECharts={handleInsertECharts}
        onInsertMermaid={handleInsertMermaid}
        onInsertMath={handleInsertMath}
        onLoadSample={handleLoadSample}
        onOpenFile={handleOpenFile}
      />

      {/* Main Workspace: Split View (WYSIWYG Canvas + Outline + Optional Raw Drawer) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* WYSIWYG Document Canvas */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 flex justify-center items-start">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 md:p-14 min-h-[850px] h-fit mb-12 transition-all">
            <div className="pdf-export-container">
              <EditorContent editor={editor} />
            </div>
          </div>
        </main>

        {/* Document Outline & Section Navigation */}
        <DocumentOutline
          markdown={rawMarkdown}
          isOpen={outlineOpen}
          onClose={() => setOutlineOpen(false)}
          scrollContainerRef={mainRef}
        />

        {/* Real-time Bidirectional Markdown Drawer */}
        <MarkdownDrawer
          markdown={rawMarkdown}
          onChange={handleMarkdownChange}
          onClose={() => setDrawerOpen(false)}
          isOpen={drawerOpen}
        />
      </div>

      {/* Toast Notification */}
      {toast && (
        <div 
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
          data-testid="app-toast"
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
