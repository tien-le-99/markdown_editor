import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Table as TableIcon,
  Plus,
  Minus,
  Trash2,
  Columns,
  Rows,
  BarChart3,
  GitFork,
  FileDown,
  Code2,
  Undo2,
  Redo2,
  Eye,
  Columns as ColumnsIcon,
  Copy,
  Check,
  Sparkles,
  Loader2,
  FolderOpen,
  Compass,
  Sigma,
  Layers,
  ChevronDown,
  SlidersHorizontal,
  RotateCw,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';

export type MermaidPdfLayout = 'enlarge' | 'landscape' | 'rotate' | 'fit' | 'paginate';

interface ToolbarProps {
  editor: Editor | null;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  onExportPdf: (overrideLayout?: MermaidPdfLayout) => void;
  isExportingPdf: boolean;
  mermaidLayout: MermaidPdfLayout;
  onMermaidLayoutChange: (mode: MermaidPdfLayout) => void;
  onInsertECharts: () => void;
  onInsertMermaid: () => void;
  onInsertMath?: () => void;
  onLoadSample: () => void;
  onOpenFile: (content: string, filename: string) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  editor,
  drawerOpen,
  onToggleDrawer,
  outlineOpen,
  onToggleOutline,
  onExportPdf,
  isExportingPdf,
  mermaidLayout,
  onMermaidLayoutChange,
  onInsertECharts,
  onInsertMermaid,
  onInsertMath,
  onLoadSample,
  onOpenFile,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!editor) return null;

  const handleCopyMarkdown = () => {
    // Trigger copy
    const event = new CustomEvent('copy-markdown-request');
    window.dispatchEvent(event);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm no-print">
      {/* Left: Formatting tools */}
      <div className="flex flex-wrap items-center gap-1">
        {/* Undo / Redo */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-40 rounded hover:bg-white transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-40 rounded hover:bg-white transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Headings */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('heading', { level: 1 })
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('heading', { level: 2 })
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('heading', { level: 3 })
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>
        </div>

        {/* Inline Marks */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('bold')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('italic')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('code')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Inline Code"
          >
            <Code className="w-4 h-4" />
          </button>
        </div>

        {/* Lists & Quotes */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('bulletList')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('orderedList')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('taskList')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Task List (Checkboxes)"
          >
            <ListTodo className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive('blockquote')
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
            title="Blockquote"
          >
            <Quote className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Table Controls Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTableMenu(!showTableMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              editor.isActive('table') || showTableMenu
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Table Tools"
            data-testid="toolbar-table-menu"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>

          {showTableMenu && (
            <div 
              className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
              onMouseLeave={() => setShowTableMenu(false)}
            >
              <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Insert & Modify</div>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  setShowTableMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md"
                data-testid="toolbar-insert-table"
              >
                <Plus className="w-3.5 h-3.5 text-brand-600" /> Insert 3x3 Table
              </button>
              
              <div className="border-t border-slate-100 my-1" />
              
              <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Columns</div>
              <button
                type="button"
                onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }}
                disabled={!editor.can().addColumnAfter()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-40"
              >
                <Columns className="w-3.5 h-3.5 text-emerald-600" /> Add Column Right
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }}
                disabled={!editor.can().deleteColumn()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" /> Delete Column
              </button>

              <div className="border-t border-slate-100 my-1" />

              <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Rows</div>
              <button
                type="button"
                onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }}
                disabled={!editor.can().addRowAfter()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-40"
              >
                <Rows className="w-3.5 h-3.5 text-emerald-600" /> Add Row Below
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }}
                disabled={!editor.can().deleteRow()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" /> Delete Row
              </button>

              <div className="border-t border-slate-100 my-1" />

              <button
                type="button"
                onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }}
                disabled={!editor.can().deleteTable()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Entire Table
              </button>
            </div>
          )}
        </div>

        {/* Visual Blocks Insertions */}
        <button
          type="button"
          onClick={onInsertECharts}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg transition-colors"
          title="Insert Apache ECharts interactive block"
          data-testid="toolbar-insert-echarts"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Insert Chart</span>
        </button>

        <button
          type="button"
          onClick={onInsertMermaid}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
          title="Insert Mermaid.js dynamic diagram"
          data-testid="toolbar-insert-mermaid"
        >
          <GitFork className="w-3.5 h-3.5" />
          <span>Insert Diagram</span>
        </button>

        <button
          type="button"
          onClick={onInsertMath}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors"
          title="Insert LaTeX Math Formula"
          data-testid="toolbar-insert-math"
        >
          <Sigma className="w-3.5 h-3.5" />
          <span>Insert Math</span>
        </button>
      </div>

      {/* Right: Actions (Open File, Outline, Drawer Toggle, PDF Export, Presets) */}
      <div className="flex items-center gap-2">
        {/* Hidden File Input for Open File */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
              const content = event.target?.result as string;
              if (content) onOpenFile(content, file.name);
            };
            reader.readAsText(file);
            e.target.value = '';
          }}
          accept=".md,.markdown,text/plain"
          className="hidden"
          data-testid="toolbar-file-input"
        />

        {/* Open File Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
          title="Open local Markdown file (.md)"
          data-testid="toolbar-open-file"
        >
          <FolderOpen className="w-3.5 h-3.5 text-brand-600" />
          <span className="hidden md:inline">Open File</span>
        </button>

        {/* Outline Button */}
        <button
          type="button"
          onClick={onToggleOutline}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
            outlineOpen
              ? 'bg-brand-50 text-brand-700 border-brand-300 shadow-2xs font-semibold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Toggle Document Outline & Headings Navigation"
          data-testid="toolbar-toggle-outline"
        >
          <Compass className="w-3.5 h-3.5 text-brand-600" />
          <span className="hidden sm:inline">Outline</span>
        </button>

        {/* Sample Document Button */}
        <button
          type="button"
          onClick={onLoadSample}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
          title="Reset to sample document"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Sample</span>
        </button>

        {/* Markdown Split Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleDrawer}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
            drawerOpen
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Toggle Raw Markdown Split View"
          data-testid="toolbar-toggle-drawer"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Markdown Split</span>
        </button>

        {/* Export PDF Split Group with Settings Popover */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => onExportPdf()}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 rounded-l-lg shadow-sm transition-all border-r border-brand-500/50"
            title="Export high-fidelity PDF with active Mermaid layout"
            data-testid="toolbar-export-pdf"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            <span>{isExportingPdf ? 'Generating...' : 'Export PDF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPdfSettings(!showPdfSettings)}
            disabled={isExportingPdf}
            className="p-1.5 text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 rounded-r-lg shadow-sm transition-all flex items-center justify-center"
            title="Configure PDF Export & Mermaid diagram layout"
            data-testid="toolbar-pdf-settings-toggle"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showPdfSettings ? 'rotate-180' : ''}`} />
          </button>

          {/* Export Settings Popover */}
          {showPdfSettings && (
            <div 
              className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 text-slate-800 animate-in fade-in zoom-in-95 duration-150"
              data-testid="toolbar-pdf-settings-popover"
            >
              <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600" />
                  <span className="text-xs font-semibold text-slate-800">PDF Export Settings</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPdfSettings(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                  title="Close Settings"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Mermaid Diagram PDF Layout
                </span>

                {/* Option 1: Enlarge Page (User's request) */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="mermaidLayout"
                    value="enlarge"
                    checked={mermaidLayout === 'enlarge'}
                    onChange={() => onMermaidLayoutChange('enlarge')}
                    className="mt-0.5 text-brand-600 focus:ring-brand-500"
                    data-testid="radio-mermaid-enlarge"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Enlarge Page to Fit</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">Recommended</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Keeps diagram upright. Page widens dynamically so text is large and easy to read on screen.
                    </p>
                  </div>
                </label>

                {/* Option 2: Landscape A4 */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="mermaidLayout"
                    value="landscape"
                    checked={mermaidLayout === 'landscape'}
                    onChange={() => onMermaidLayoutChange('landscape')}
                    className="mt-0.5 text-brand-600 focus:ring-brand-500"
                    data-testid="radio-mermaid-landscape"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <ColumnsIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>A4 Landscape Page</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Places diagram upright on a dedicated horizontal A4 page (297 × 210 mm).
                    </p>
                  </div>
                </label>

                {/* Option 3: Rotate 90° */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="mermaidLayout"
                    value="rotate"
                    checked={mermaidLayout === 'rotate'}
                    onChange={() => onMermaidLayoutChange('rotate')}
                    className="mt-0.5 text-brand-600 focus:ring-brand-500"
                    data-testid="radio-mermaid-rotate"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <RotateCw className="w-3.5 h-3.5 text-amber-600" />
                      <span>Rotate 90° (Strict A4 Portrait)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Rotates diagram sideways to maintain strictly uniform portrait pages for paper binding.
                    </p>
                  </div>
                </label>

                {/* Option 4: Fit Inline */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="mermaidLayout"
                    value="fit"
                    checked={mermaidLayout === 'fit'}
                    onChange={() => onMermaidLayoutChange('fit')}
                    className="mt-0.5 text-brand-600 focus:ring-brand-500"
                    data-testid="radio-mermaid-fit"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                      <span>Fit within Margins</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Scales diagram down inline within standard portrait margins without extra page breaks.
                    </p>
                  </div>
                </label>

                {/* Option 5: Paginate Tall */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="mermaidLayout"
                    value="paginate"
                    checked={mermaidLayout === 'paginate'}
                    onChange={() => onMermaidLayoutChange('paginate')}
                    className="mt-0.5 text-brand-600 focus:ring-brand-500"
                    data-testid="radio-mermaid-paginate"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-teal-600" />
                      <span>Paginate Tall Diagram</span>
                      <span className="text-[9px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded font-semibold">Strict A4</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Slices very tall diagrams across portrait A4 pages. Text stays upright and legible.
                    </p>
                  </div>
                </label>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowPdfSettings(false);
                    onExportPdf();
                  }}
                  className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-medium flex items-center gap-1 shadow-xs"
                >
                  <FileDown className="w-3 h-3" />
                  <span>Export Now</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
