import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Download, 
  FileText, 
  X, 
  Split, 
  Terminal,
  RefreshCw
} from 'lucide-react';

interface MarkdownDrawerProps {
  markdown: string;
  onChange: (value: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const MarkdownDrawer: React.FC<MarkdownDrawerProps> = ({
  markdown,
  onChange,
  onClose,
  isOpen,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `document-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const lineCount = markdown.split('\n').length;

  return (
    <aside 
      className="markdown-drawer flex flex-col w-full md:w-[45%] lg:w-[40%] bg-slate-900 border-l border-slate-800 text-slate-100 flex-shrink-0 z-20 shadow-2xl transition-all duration-200 no-print"
      data-testid="markdown-drawer"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-brand-400" />
          <span className="font-semibold text-xs tracking-wide uppercase text-slate-300">Raw GFM Source</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {wordCount} words &bull; {lineCount} lines
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded border border-slate-700 transition-colors"
            title="Copy Raw Markdown"
            data-testid="drawer-copy-button"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Download .md File"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ml-1"
            title="Close Drawer"
            data-testid="drawer-close-button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Textarea with Real-time Two-way Binding */}
      <div className="relative flex-1 p-0 flex">
        <textarea
          value={markdown}
          onChange={(e) => onChange(e.target.value)}
          placeholder="# Type Markdown here..."
          className="w-full h-full p-4 font-mono text-xs leading-relaxed bg-slate-900 text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500/50 selection:bg-brand-600/40"
          spellCheck={false}
          data-testid="raw-markdown-textarea"
        />
      </div>

      {/* Status Bar */}
      <div className="px-4 py-1.5 bg-slate-950 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Real-time Bidirectional AST Synchronization</span>
        </div>
        <span>UTF-8 GFM</span>
      </div>
    </aside>
  );
};
