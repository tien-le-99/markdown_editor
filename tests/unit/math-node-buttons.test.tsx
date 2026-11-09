import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MathBlockComponent, MATH_PRESETS } from '@/components/editor/extensions/MathBlockNode';

describe('MathBlock Component Buttons & Actions', () => {
  const initialCode = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

  const createProps = (overrides?: any) => ({
    node: { attrs: { code: initialCode } } as any,
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies LaTeX formula to clipboard and toggles Copied state on Copy button click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const props = createProps();
    render(<MathBlockComponent {...props} />);

    const copyBtn = screen.getByTestId('math-copy-button');
    expect(copyBtn).toHaveTextContent('Copy LaTeX');

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith(initialCode);
    expect(copyBtn).toHaveTextContent('Copied');

    // Advance 2s to revert back to "Copy LaTeX"
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(copyBtn).toHaveTextContent('Copy LaTeX');
  });

  it('toggles editor on Edit Formula button click', () => {
    const props = createProps();
    render(<MathBlockComponent {...props} />);

    const editBtn = screen.getByTestId('math-edit-button');
    expect(screen.queryByTestId('math-code-editor')).toBeNull();

    // Open editor
    fireEvent.click(editBtn);
    expect(screen.getByTestId('math-code-editor')).toBeInTheDocument();
    expect(editBtn).toHaveTextContent('Close Editor');

    // Close editor
    fireEvent.click(editBtn);
    expect(screen.queryByTestId('math-code-editor')).toBeNull();
  });

  it('triggers deleteNode on Delete Formula button click', () => {
    const props = createProps();
    render(<MathBlockComponent {...props} />);

    const deleteBtn = screen.getByTitle('Delete Formula');
    fireEvent.click(deleteBtn);

    expect(props.deleteNode).toHaveBeenCalledTimes(1);
  });

  it('applies all 6 formula presets inside editor', () => {
    const props = createProps();
    render(<MathBlockComponent {...props} />);

    fireEvent.click(screen.getByTestId('math-edit-button'));

    const textarea = screen.getByTestId('math-textarea') as HTMLTextAreaElement;

    // Test each preset
    const presetEntries = Object.values(MATH_PRESETS);
    for (const preset of presetEntries) {
      const presetBtn = screen.getByRole('button', { name: preset.label });
      fireEvent.click(presetBtn);
      expect(textarea.value).toBe(preset.code);
    }
  });

  it('applies formula and closes editor on Apply & Render button click', () => {
    const props = createProps();
    render(<MathBlockComponent {...props} />);

    fireEvent.click(screen.getByTestId('math-edit-button'));

    const textarea = screen.getByTestId('math-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'E = mc^2' } });

    const saveBtn = screen.getByTestId('math-save-button');
    fireEvent.click(saveBtn);

    expect(props.updateAttributes).toHaveBeenCalledWith({ code: 'E = mc^2' });
    expect(screen.queryByTestId('math-code-editor')).toBeNull();
  });

  it('reverts edits and closes editor on close (X) button click', () => {
    const props = createProps();
    render(<MathBlockComponent {...props} />);

    fireEvent.click(screen.getByTestId('math-edit-button'));

    const textarea = screen.getByTestId('math-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'temporary formula' } });

    const editorDiv = screen.getByTestId('math-code-editor');
    const closeBtn = editorDiv.querySelector('button:has(svg.lucide-x)') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('math-code-editor')).toBeNull();

    // Reopen editor and verify value was not changed
    fireEvent.click(screen.getByTestId('math-edit-button'));
    const reopenedTextarea = screen.getByTestId('math-textarea') as HTMLTextAreaElement;
    expect(reopenedTextarea.value).toBe(initialCode);
  });

  it('shows error banner on invalid LaTeX and handles Edit Syntax and Reset buttons', () => {
    const props = createProps({
      node: { attrs: { code: '\\frac{unclosed' } },
    });
    render(<MathBlockComponent {...props} />);

    expect(screen.getByTestId('math-error-banner')).toBeInTheDocument();

    // Click "Edit Syntax" in banner
    const editSyntaxBtn = screen.getByText('Edit Syntax');
    fireEvent.click(editSyntaxBtn);
    expect(screen.getByTestId('math-code-editor')).toBeInTheDocument();

    // Click "Reset to Quadratic Formula" in banner
    const resetBtn = screen.getByText('Reset to Quadratic Formula');
    fireEvent.click(resetBtn);

    expect(props.updateAttributes).toHaveBeenCalledWith({
      code: MATH_PRESETS.quadratic.code,
    });
  });
});
