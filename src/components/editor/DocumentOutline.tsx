'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ListTree, 
  ChevronRight, 
  ArrowUp, 
  X, 
  Compass, 
  FileText,
  GitFork,
  Table as TableIcon
} from 'lucide-react';
import { slugifyHeading } from './utils/markdown-serializer';

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

interface DocumentOutlineProps {
  markdown: string;
  isOpen: boolean;
  onClose: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

export const DocumentOutline: React.FC<DocumentOutlineProps> = ({
  markdown,
  isOpen,
  onClose,
  scrollContainerRef,
}) => {
  const [activeId, setActiveId] = useState<string>('');
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);

  // Parse headings from markdown
  const headings = useMemo<HeadingItem[]>(() => {
    if (!markdown) return [];
    // Normalize CRLF (common for files opened on Windows) before splitting:
    // a trailing "\r" makes the anchored heading regex fail silently.
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const items: HeadingItem[] = [];
    let inCode = false;

    for (const rawLine of lines) {
      // Headings may live inside a blockquote (e.g. a pasted email or chat
      // message). Strip one or more quote markers before matching, and keep
      // fenced-code detection working for fences nested in quotes too.
      const line = rawLine.replace(/^\s*(?:>\s?)+/, '');

      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;

      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').trim();
        const id = slugifyHeading(match[2]);
        items.push({ id, text, level });
      }
    }
    return items;
  }, [markdown]);

  // Document stats
  const stats = useMemo(() => {
    const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    const mermaidCount = (markdown.match(/```mermaid/g) || []).length;
    const tableCount = (markdown.match(/\|[\s-:]+\|/g) || []).length;
    return { words, readingTime, mermaidCount, tableCount };
  }, [markdown]);

  // Track active heading and back-to-top visibility based on scroll position
  useEffect(() => {
    const container = scrollContainerRef?.current || document.querySelector('main');
    if (!container) return;

    const handleScroll = () => {
      setShowBackToTop(container.scrollTop > 400);

      // Find heading currently closest to top
      if (headings.length === 0) return;
      
      const headingElements = headings
        .map(h => ({ id: h.id, el: document.getElementById(h.id) }))
        .filter((item): item is { id: string; el: HTMLElement } => item.el !== null);

      if (headingElements.length === 0) return;

      const containerRect = container.getBoundingClientRect();
      let currentActive = headingElements[0].id;

      for (const { id, el } of headingElements) {
        const elRect = el.getBoundingClientRect();
        if (elRect.top - containerRect.top <= 120) {
          currentActive = id;
        } else {
          break;
        }
      }

      setActiveId(currentActive);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [headings, scrollContainerRef]);

  const handleScrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    const container = scrollContainerRef?.current || document.querySelector('main');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - 24;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveId(id);
  };

  const handleBackToTop = () => {
    const container = scrollContainerRef?.current || document.querySelector('main');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button
          type="button"
          onClick={handleBackToTop}
          className="fixed bottom-6 right-6 z-40 p-3 bg-slate-900 text-white rounded-full shadow-xl hover:bg-brand-600 transition-all duration-200 hover:scale-105 active:scale-95 border border-slate-700 flex items-center justify-center no-print"
          title="Back to Top"
          data-testid="back-to-top-button"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* Collapsible Document Outline Panel */}
      {isOpen && (
        <aside 
          className="w-72 lg:w-80 bg-white/95 backdrop-blur-md border-l border-slate-200 flex flex-col flex-shrink-0 z-20 shadow-lg animate-in slide-in-from-right-5 duration-200 no-print"
          data-testid="document-outline"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-brand-600" />
              <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">Document Outline</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
              title="Close Outline"
              data-testid="outline-close-button"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="px-4 py-2.5 bg-slate-100/60 border-b border-slate-200/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-400" /> {stats.words.toLocaleString()} words &bull; ~{stats.readingTime}m read
            </span>
            {stats.mermaidCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <GitFork className="w-3 h-3" /> {stats.mermaidCount} diagrams
              </span>
            )}
          </div>

          {/* Outline Navigation Tree */}
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {headings.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No headings detected in this document.
              </div>
            ) : (
              headings.map((item, idx) => {
                const isActive = activeId === item.id;
                const indentClass = item.level === 1 ? 'pl-2 font-semibold' : item.level === 2 ? 'pl-5 text-xs' : 'pl-8 text-[11px] text-slate-500';
                
                return (
                  <button
                    key={`${item.id}-${idx}`}
                    type="button"
                    onClick={() => handleScrollToHeading(item.id)}
                    className={`w-full text-left py-1.5 px-2 rounded-lg transition-all flex items-start gap-1.5 ${indentClass} ${
                      isActive 
                        ? 'bg-brand-50 text-brand-700 font-medium border-l-2 border-brand-600'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                    title={item.text}
                  >
                    <ChevronRight className={`w-3 h-3 mt-0.5 flex-shrink-0 transition-transform ${isActive ? 'rotate-90 text-brand-600' : 'text-slate-300'}`} />
                    <span className="truncate leading-snug">{item.text}</span>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      )}
    </>
  );
};
