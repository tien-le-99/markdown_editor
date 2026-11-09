import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from '@/components/editor/Toolbar';

describe('Toolbar Component Buttons', () => {
  // Helper to create a comprehensive mock Tiptap Editor
  const createMockEditor = (overrides?: {
    canUndo?: boolean;
    canRedo?: boolean;
    canAddColumn?: boolean;
    canDeleteColumn?: boolean;
    canAddRow?: boolean;
    canDeleteRow?: boolean;
    canDeleteTable?: boolean;
    activeMarks?: Record<string, boolean>;
  }) => {
    const chainMock: any = {};
    const chainMethods = [
      'focus',
      'undo',
      'redo',
      'toggleHeading',
      'toggleBold',
      'toggleItalic',
      'toggleCode',
      'toggleBulletList',
      'toggleOrderedList',
      'toggleTaskList',
      'toggleBlockquote',
      'insertTable',
      'addColumnAfter',
      'deleteColumn',
      'addRowAfter',
      'deleteRow',
      'deleteTable',
      'run',
    ];

    chainMethods.forEach((method) => {
      chainMock[method] = vi.fn().mockImplementation(() => chainMock);
    });

    const canMock = {
      undo: vi.fn().mockReturnValue(overrides?.canUndo ?? true),
      redo: vi.fn().mockReturnValue(overrides?.canRedo ?? true),
      addColumnAfter: vi.fn().mockReturnValue(overrides?.canAddColumn ?? true),
      deleteColumn: vi.fn().mockReturnValue(overrides?.canDeleteColumn ?? true),
      addRowAfter: vi.fn().mockReturnValue(overrides?.canAddRow ?? true),
      deleteRow: vi.fn().mockReturnValue(overrides?.canDeleteRow ?? true),
      deleteTable: vi.fn().mockReturnValue(overrides?.canDeleteTable ?? true),
    };

    const isActiveMock = vi.fn().mockImplementation((name: string, attrs?: any) => {
      if (name === 'heading' && attrs?.level) {
        return !!overrides?.activeMarks?.[`heading-${attrs.level}`];
      }
      return !!overrides?.activeMarks?.[name];
    });

    return {
      chain: vi.fn().mockReturnValue(chainMock),
      can: vi.fn().mockReturnValue(canMock),
      isActive: isActiveMock,
      chainMock,
      canMock,
    };
  };

  const defaultProps = {
    drawerOpen: false,
    onToggleDrawer: vi.fn(),
    outlineOpen: true,
    onToggleOutline: vi.fn(),
    onExportPdf: vi.fn(),
    isExportingPdf: false,
    mermaidLayout: 'enlarge' as const,
    onMermaidLayoutChange: vi.fn(),
    onInsertECharts: vi.fn(),
    onInsertMermaid: vi.fn(),
    onInsertMath: vi.fn(),
    onLoadSample: vi.fn(),
    onOpenFile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing if editor is null', () => {
    const { container } = render(<Toolbar {...defaultProps} editor={null} />);
    expect(container.firstChild).toBeNull();
  });

  describe('Undo & Redo Buttons', () => {
    it('executes undo when Undo button is clicked and enabled', () => {
      const mockEditor = createMockEditor({ canUndo: true });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
      expect(undoBtn).not.toBeDisabled();
      fireEvent.click(undoBtn);

      expect(mockEditor.chain).toHaveBeenCalled();
      expect(mockEditor.chainMock.focus).toHaveBeenCalled();
      expect(mockEditor.chainMock.undo).toHaveBeenCalled();
      expect(mockEditor.chainMock.run).toHaveBeenCalled();
    });

    it('disables undo button when can.undo() returns false', () => {
      const mockEditor = createMockEditor({ canUndo: false });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
      expect(undoBtn).toBeDisabled();
    });

    it('executes redo when Redo button is clicked and enabled', () => {
      const mockEditor = createMockEditor({ canRedo: true });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
      expect(redoBtn).not.toBeDisabled();
      fireEvent.click(redoBtn);

      expect(mockEditor.chain).toHaveBeenCalled();
      expect(mockEditor.chainMock.focus).toHaveBeenCalled();
      expect(mockEditor.chainMock.redo).toHaveBeenCalled();
      expect(mockEditor.chainMock.run).toHaveBeenCalled();
    });

    it('disables redo button when can.redo() returns false', () => {
      const mockEditor = createMockEditor({ canRedo: false });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
      expect(redoBtn).toBeDisabled();
    });
  });

  describe('Heading Buttons', () => {
    it('triggers toggleHeading level 1, 2, and 3', () => {
      const mockEditor = createMockEditor({
        activeMarks: { 'heading-1': true },
      });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const h1Btn = screen.getByTitle('Heading 1');
      const h2Btn = screen.getByTitle('Heading 2');
      const h3Btn = screen.getByTitle('Heading 3');

      // H1 has active styling
      expect(h1Btn.className).toContain('bg-brand-600');
      expect(h2Btn.className).not.toContain('bg-brand-600');

      fireEvent.click(h1Btn);
      expect(mockEditor.chainMock.toggleHeading).toHaveBeenCalledWith({ level: 1 });

      fireEvent.click(h2Btn);
      expect(mockEditor.chainMock.toggleHeading).toHaveBeenCalledWith({ level: 2 });

      fireEvent.click(h3Btn);
      expect(mockEditor.chainMock.toggleHeading).toHaveBeenCalledWith({ level: 3 });
    });
  });

  describe('Inline Marks (Bold, Italic, Code)', () => {
    it('triggers toggleBold, toggleItalic, and toggleCode', () => {
      const mockEditor = createMockEditor({
        activeMarks: { bold: true },
      });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const boldBtn = screen.getByTitle('Bold (Ctrl+B)');
      const italicBtn = screen.getByTitle('Italic (Ctrl+I)');
      const codeBtn = screen.getByTitle('Inline Code');

      expect(boldBtn.className).toContain('bg-brand-600');
      expect(italicBtn.className).not.toContain('bg-brand-600');

      fireEvent.click(boldBtn);
      expect(mockEditor.chainMock.toggleBold).toHaveBeenCalled();

      fireEvent.click(italicBtn);
      expect(mockEditor.chainMock.toggleItalic).toHaveBeenCalled();

      fireEvent.click(codeBtn);
      expect(mockEditor.chainMock.toggleCode).toHaveBeenCalled();
    });
  });

  describe('Lists and Blockquote Buttons', () => {
    it('triggers bulletList, orderedList, taskList, and blockquote', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const bulletBtn = screen.getByTitle('Bullet List');
      const orderedBtn = screen.getByTitle('Numbered List');
      const taskBtn = screen.getByTitle('Task List (Checkboxes)');
      const quoteBtn = screen.getByTitle('Blockquote');

      fireEvent.click(bulletBtn);
      expect(mockEditor.chainMock.toggleBulletList).toHaveBeenCalled();

      fireEvent.click(orderedBtn);
      expect(mockEditor.chainMock.toggleOrderedList).toHaveBeenCalled();

      fireEvent.click(taskBtn);
      expect(mockEditor.chainMock.toggleTaskList).toHaveBeenCalled();

      fireEvent.click(quoteBtn);
      expect(mockEditor.chainMock.toggleBlockquote).toHaveBeenCalled();
    });
  });

  describe('Table Menu Dropdown and Table Operations', () => {
    it('opens table dropdown when Table menu button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const tableMenuBtn = screen.getByTestId('toolbar-table-menu');
      expect(screen.queryByTestId('toolbar-insert-table')).toBeNull();

      fireEvent.click(tableMenuBtn);
      expect(screen.getByTestId('toolbar-insert-table')).toBeInTheDocument();
    });

    it('inserts 3x3 table and closes menu', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      fireEvent.click(screen.getByTestId('toolbar-table-menu'));
      const insertTableBtn = screen.getByTestId('toolbar-insert-table');
      fireEvent.click(insertTableBtn);

      expect(mockEditor.chainMock.insertTable).toHaveBeenCalledWith({
        rows: 3,
        cols: 3,
        withHeaderRow: true,
      });
      // Menu should close
      expect(screen.queryByTestId('toolbar-insert-table')).toBeNull();
    });

    it('triggers Add Column Right, Delete Column, Add Row Below, Delete Row, and Delete Entire Table', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      // Add Column
      fireEvent.click(screen.getByTestId('toolbar-table-menu'));
      fireEvent.click(screen.getByText('Add Column Right'));
      expect(mockEditor.chainMock.addColumnAfter).toHaveBeenCalled();

      // Delete Column
      fireEvent.click(screen.getByTestId('toolbar-table-menu'));
      fireEvent.click(screen.getByText('Delete Column'));
      expect(mockEditor.chainMock.deleteColumn).toHaveBeenCalled();

      // Add Row Below
      fireEvent.click(screen.getByTestId('toolbar-table-menu'));
      fireEvent.click(screen.getByText('Add Row Below'));
      expect(mockEditor.chainMock.addRowAfter).toHaveBeenCalled();

      // Delete Row
      fireEvent.click(screen.getByTestId('toolbar-table-menu'));
      fireEvent.click(screen.getByText('Delete Row'));
      expect(mockEditor.chainMock.deleteRow).toHaveBeenCalled();

      // Delete Entire Table
      fireEvent.click(screen.getByTestId('toolbar-table-menu'));
      fireEvent.click(screen.getByText('Delete Entire Table'));
      expect(mockEditor.chainMock.deleteTable).toHaveBeenCalled();
    });

    it('disables table manipulation buttons when editor.can() returns false', () => {
      const mockEditor = createMockEditor({
        canAddColumn: false,
        canDeleteColumn: false,
        canAddRow: false,
        canDeleteRow: false,
        canDeleteTable: false,
      });
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      fireEvent.click(screen.getByTestId('toolbar-table-menu'));

      expect(screen.getByText('Add Column Right').closest('button')).toBeDisabled();
      expect(screen.getByText('Delete Column').closest('button')).toBeDisabled();
      expect(screen.getByText('Add Row Below').closest('button')).toBeDisabled();
      expect(screen.getByText('Delete Row').closest('button')).toBeDisabled();
      expect(screen.getByText('Delete Entire Table').closest('button')).toBeDisabled();
    });
  });

  describe('Insert Visual Blocks (ECharts, Mermaid, Math)', () => {
    it('triggers onInsertECharts when Insert Chart button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const insertChartBtn = screen.getByTestId('toolbar-insert-echarts');
      fireEvent.click(insertChartBtn);
      expect(defaultProps.onInsertECharts).toHaveBeenCalledTimes(1);
    });

    it('triggers onInsertMermaid when Insert Diagram button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const insertDiagramBtn = screen.getByTestId('toolbar-insert-mermaid');
      fireEvent.click(insertDiagramBtn);
      expect(defaultProps.onInsertMermaid).toHaveBeenCalledTimes(1);
    });

    it('triggers onInsertMath when Insert Math button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const insertMathBtn = screen.getByTestId('toolbar-insert-math');
      fireEvent.click(insertMathBtn);
      expect(defaultProps.onInsertMath).toHaveBeenCalledTimes(1);
    });
  });

  describe('Workspace Actions (Open File, Outline, Sample, Drawer)', () => {
    it('triggers file input click when Open File button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const fileInput = screen.getByTestId('toolbar-file-input') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      const openFileBtn = screen.getByTestId('toolbar-open-file');
      fireEvent.click(openFileBtn);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('handles file input onChange and calls onOpenFile with content', async () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const fileInput = screen.getByTestId('toolbar-file-input') as HTMLInputElement;
      const testFile = new File(['# Uploaded Test Markdown'], 'test.md', { type: 'text/markdown' });

      // Mock FileReader
      const readAsTextMock = vi.fn().mockImplementation(function (this: FileReader) {
        Object.defineProperty(this, 'result', { value: '# Uploaded Test Markdown' });
        this.onload?.({ target: this } as any);
      });
      vi.spyOn(window, 'FileReader').mockImplementation(() => ({
        readAsText: readAsTextMock,
        onload: null,
      } as any));

      fireEvent.change(fileInput, { target: { files: [testFile] } });

      expect(defaultProps.onOpenFile).toHaveBeenCalledWith('# Uploaded Test Markdown', 'test.md');
    });

    it('triggers onToggleOutline when Outline button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} outlineOpen={false} />);

      const outlineBtn = screen.getByTestId('toolbar-toggle-outline');
      fireEvent.click(outlineBtn);
      expect(defaultProps.onToggleOutline).toHaveBeenCalledTimes(1);
    });

    it('triggers onLoadSample when Sample button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const sampleBtn = screen.getByTitle('Reset to sample document');
      fireEvent.click(sampleBtn);
      expect(defaultProps.onLoadSample).toHaveBeenCalledTimes(1);
    });

    it('triggers onToggleDrawer when Markdown Split button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} drawerOpen={false} />);

      const splitBtn = screen.getByTestId('toolbar-toggle-drawer');
      fireEvent.click(splitBtn);
      expect(defaultProps.onToggleDrawer).toHaveBeenCalledTimes(1);
    });
  });

  describe('PDF Export & Settings Popover Buttons', () => {
    it('triggers onExportPdf when main Export PDF button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const exportPdfBtn = screen.getByTestId('toolbar-export-pdf');
      expect(exportPdfBtn).not.toBeDisabled();
      fireEvent.click(exportPdfBtn);

      expect(defaultProps.onExportPdf).toHaveBeenCalledTimes(1);
    });

    it('disables Export PDF button and shows Generating... when isExportingPdf is true', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} isExportingPdf={true} />);

      const exportPdfBtn = screen.getByTestId('toolbar-export-pdf');
      expect(exportPdfBtn).toBeDisabled();
      expect(exportPdfBtn).toHaveTextContent('Generating...');
    });

    it('toggles PDF settings popover and configures Mermaid layout options', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      const settingsToggleBtn = screen.getByTestId('toolbar-pdf-settings-toggle');
      expect(screen.queryByTestId('toolbar-pdf-settings-popover')).toBeNull();

      // Open popover
      fireEvent.click(settingsToggleBtn);
      expect(screen.getByTestId('toolbar-pdf-settings-popover')).toBeInTheDocument();

      // Check radio buttons
      const radioEnlarge = screen.getByTestId('radio-mermaid-enlarge');
      const radioLandscape = screen.getByTestId('radio-mermaid-landscape');
      const radioRotate = screen.getByTestId('radio-mermaid-rotate');
      const radioFit = screen.getByTestId('radio-mermaid-fit');

      expect(radioEnlarge).toBeChecked();
      expect(radioLandscape).not.toBeChecked();

      fireEvent.click(radioLandscape);
      expect(defaultProps.onMermaidLayoutChange).toHaveBeenCalledWith('landscape');

      fireEvent.click(radioRotate);
      expect(defaultProps.onMermaidLayoutChange).toHaveBeenCalledWith('rotate');

      fireEvent.click(radioFit);
      expect(defaultProps.onMermaidLayoutChange).toHaveBeenCalledWith('fit');

      // Export Now button inside popover
      const exportNowBtn = screen.getByText('Export Now');
      fireEvent.click(exportNowBtn);
      expect(defaultProps.onExportPdf).toHaveBeenCalled();
      expect(screen.queryByTestId('toolbar-pdf-settings-popover')).toBeNull();
    });

    it('closes PDF settings popover when Close (X) button is clicked', () => {
      const mockEditor = createMockEditor();
      render(<Toolbar {...defaultProps} editor={mockEditor as any} />);

      fireEvent.click(screen.getByTestId('toolbar-pdf-settings-toggle'));
      expect(screen.getByTestId('toolbar-pdf-settings-popover')).toBeInTheDocument();

      const closeBtn = screen.getByTitle('Close Settings');
      fireEvent.click(closeBtn);
      expect(screen.queryByTestId('toolbar-pdf-settings-popover')).toBeNull();
    });
  });
});
