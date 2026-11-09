import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MermaidComponent } from '@/components/editor/extensions/MermaidNode';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation((id: string, code: string) => {
      if (code.includes('INVALID_SYNTAX')) {
        return Promise.reject(new Error('Syntax error in graph syntax'));
      }
      return Promise.resolve({
        svg: `<svg id="${id}" data-testid="mock-mermaid-svg"><g><text>Rendered Diagram</text></g></svg>`,
      });
    }),
  },
}));

vi.mock('@panzoom/panzoom', () => {
  return {
    default: vi.fn(() => {
      let scale = 1;
      return {
        zoomIn: vi.fn(() => { scale = 1.25; }),
        zoomOut: vi.fn(() => { scale = 0.8; }),
        reset: vi.fn(() => { scale = 1; }),
        getScale: vi.fn(() => scale),
        zoomWithWheel: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  };
});

describe('Mermaid Component Buttons & Actions', () => {
  const initialCode = `graph TD\n  A[Start] --> B[Finish]`;

  const createProps = (overrides?: any) => ({
    node: { attrs: { code: initialCode, pdfLayout: 'auto' } } as any,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    extension: {} as any,
    editor: {} as any,
    getPos: () => 0,
    decorations: [],
    selected: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SVG and Panzoom controls', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mermaid-zoom-in')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-zoom-out')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-reset-zoom')).toBeInTheDocument();
  });

  it('handles Zoom In, Zoom Out, and Reset Zoom buttons', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    const zoomInBtn = screen.getByTestId('mermaid-zoom-in');
    const zoomOutBtn = screen.getByTestId('mermaid-zoom-out');
    const resetZoomBtn = screen.getByTestId('mermaid-reset-zoom');

    // Initial zoom is 100%
    expect(resetZoomBtn).toHaveTextContent('100%');

    // Zoom In
    fireEvent.click(zoomInBtn);
    expect(resetZoomBtn).toHaveTextContent('125%');

    // Zoom Out
    fireEvent.click(zoomOutBtn);
    expect(resetZoomBtn).toHaveTextContent('80%');

    // Reset Zoom
    fireEvent.click(resetZoomBtn);
    expect(resetZoomBtn).toHaveTextContent('100%');
  });

  it('updates pdfLayout attribute when selector changes', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    const select = screen.getByTestId('mermaid-pdf-layout-select');
    fireEvent.change(select, { target: { value: 'rotate' } });

    expect(props.updateAttributes).toHaveBeenCalledWith({ pdfLayout: 'rotate' });
  });

  it('toggles code editor on Edit Diagram button click', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    const editBtn = screen.getByTestId('mermaid-edit-button');
    expect(screen.queryByTestId('mermaid-code-editor')).toBeNull();

    // Open editor
    fireEvent.click(editBtn);
    expect(screen.getByTestId('mermaid-code-editor')).toBeInTheDocument();
    expect(editBtn).toHaveTextContent('Close Editor');

    // Close editor
    fireEvent.click(editBtn);
    expect(screen.queryByTestId('mermaid-code-editor')).toBeNull();
  });

  it('triggers deleteNode on Delete Diagram button click', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTitle('Delete Diagram');
    fireEvent.click(deleteBtn);

    expect(props.deleteNode).toHaveBeenCalledTimes(1);
  });

  it('switches presets (Flowchart, Sequence, State) inside editor', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mermaid-edit-button'));

    const textarea = screen.getByTestId('mermaid-textarea') as HTMLTextAreaElement;

    // Click Sequence preset
    const seqBtn = screen.getByRole('button', { name: /Sequence/i });
    fireEvent.click(seqBtn);
    expect(textarea.value).toContain('sequenceDiagram');

    // Click State preset
    const stateBtn = screen.getByRole('button', { name: /State/i });
    fireEvent.click(stateBtn);
    expect(textarea.value).toContain('stateDiagram-v2');

    // Click Flowchart preset
    const flowBtn = screen.getByRole('button', { name: /Flowchart/i });
    fireEvent.click(flowBtn);
    expect(textarea.value).toContain('graph TD');
  });

  it('applies code and closes editor on Apply & Render button click', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mermaid-edit-button'));

    const textarea = screen.getByTestId('mermaid-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'graph LR\n  X --> Y' } });

    const saveBtn = screen.getByTestId('mermaid-save-button');
    fireEvent.click(saveBtn);

    expect(props.updateAttributes).toHaveBeenCalledWith({ code: 'graph LR\n  X --> Y' });
    expect(screen.queryByTestId('mermaid-code-editor')).toBeNull();
  });

  it('reverts edits and closes editor on close (X) button click', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mermaid-edit-button'));

    const textarea = screen.getByTestId('mermaid-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'graph LR\n  temporary changes' } });

    const editorDiv = screen.getByTestId('mermaid-code-editor');
    const closeBtn = editorDiv.querySelector('button:has(svg.lucide-x)') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('mermaid-code-editor')).toBeNull();

    // Reopen editor and verify value was not applied
    fireEvent.click(screen.getByTestId('mermaid-edit-button'));
    const reopenedTextarea = screen.getByTestId('mermaid-textarea') as HTMLTextAreaElement;
    expect(reopenedTextarea.value).toBe(initialCode);
  });

  it('layout popover is not clipped: Apply JSON and Reload visible without opening the code editor', async () => {
    const props = createProps();
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    // Regression: the outer card used `overflow-hidden`, which clipped the
    // tall layout popover so Apply JSON / Reload current were cut off until
    // the code editor drawer made the card taller. The card must not clip.
    const card = screen.getByTestId('mermaid-node-view');
    expect(card.className).not.toMatch(/overflow-hidden/);

    fireEvent.click(screen.getByTestId('mermaid-layout-button'));
    const popover = screen.getByTestId('mermaid-layout-popover');

    // Popover scrolls internally on short viewports instead of running off-screen,
    // with a reserved scrollbar gutter so the bar never covers the spacing values.
    expect(popover.className).toMatch(/overflow-y-auto/);
    expect(popover.className).toMatch(/scrollbar-gutter/);

    // Both buttons render while the code editor stays closed.
    expect(screen.getByTestId('mermaid-layout-json-apply')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-layout-json-reload')).toBeInTheDocument();
    expect(screen.queryByTestId('mermaid-code-editor')).toBeNull();
  });

  it('displays error banner on syntax error and allows editing syntax or resetting preset', async () => {    const props = createProps({
      node: { attrs: { code: 'INVALID_SYNTAX', pdfLayout: 'auto' } },
    });
    render(<MermaidComponent {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-error-banner')).toBeInTheDocument();
    });

    // Test "Edit Syntax" button in error banner
    const editSyntaxBtn = screen.getByText('Edit Syntax');
    fireEvent.click(editSyntaxBtn);
    expect(screen.getByTestId('mermaid-code-editor')).toBeInTheDocument();

    // Test "Reset to Sequence Preset" button in error banner
    const resetPresetBtn = screen.getByText('Reset to Sequence Preset');
    fireEvent.click(resetPresetBtn);

    expect(props.updateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringContaining('sequenceDiagram'),
      })
    );
  });
});
