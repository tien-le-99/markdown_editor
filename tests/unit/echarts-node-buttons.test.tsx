import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EChartsComponent } from '@/components/editor/extensions/EChartsNode';

describe('ECharts Component Buttons & Actions', () => {
  const validJson = JSON.stringify({
    title: { text: 'Monthly Performance' },
    xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
    yAxis: { type: 'value' },
    series: [{ data: [150, 230, 224], type: 'line' }]
  }, null, 2);

  const createProps = (overrides?: any) => ({
    node: { attrs: { code: validJson } } as any,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    extension: {} as any,
    editor: {} as any,
    getPos: () => 0,
    decorations: [],
    selected: false,
    ...overrides,
  });

  it('toggles code editor when Edit Chart button is clicked', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    const editBtn = screen.getByTestId('echarts-edit-button');
    expect(screen.queryByTestId('echarts-code-editor')).toBeNull();

    // Click to open editor
    fireEvent.click(editBtn);
    expect(screen.getByTestId('echarts-code-editor')).toBeInTheDocument();
    expect(editBtn).toHaveTextContent('Close Editor');

    // Click to close editor
    fireEvent.click(editBtn);
    expect(screen.queryByTestId('echarts-code-editor')).toBeNull();
  });

  it('toggles fullscreen container state when Fullscreen button is clicked', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    const expandBtn = screen.getByTitle('Expand View');
    const container = screen.getByTestId('echarts-node-view');

    expect(container.className).not.toContain('fixed inset-4');

    // Click to expand
    fireEvent.click(expandBtn);
    expect(container.className).toContain('fixed inset-4');
    expect(screen.getByTitle('Exit Fullscreen')).toBeInTheDocument();

    // Click to minimize
    fireEvent.click(screen.getByTitle('Exit Fullscreen'));
    expect(container.className).not.toContain('fixed inset-4');
  });

  it('triggers deleteNode when Delete Chart button is clicked', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    const deleteBtn = screen.getByTitle('Delete Chart');
    fireEvent.click(deleteBtn);

    expect(props.deleteNode).toHaveBeenCalledTimes(1);
  });

  it('triggers Repair JSON Syntax button in error banner to open editor', () => {
    const props = createProps({
      node: { attrs: { code: '{ invalid json here' } },
    });
    render(<EChartsComponent {...props} />);

    expect(screen.getByTestId('echarts-error-banner')).toBeInTheDocument();

    const repairBtn = screen.getByText('Repair JSON Syntax');
    fireEvent.click(repairBtn);

    expect(screen.getByTestId('echarts-code-editor')).toBeInTheDocument();
  });

  it('applies Line, Bar, and Pie presets inside editor', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    // Open editor
    fireEvent.click(screen.getByTestId('echarts-edit-button'));

    const textarea = screen.getByTestId('echarts-textarea') as HTMLTextAreaElement;

    // Apply Bar preset
    const barBtn = screen.getByRole('button', { name: /Bar/i });
    fireEvent.click(barBtn);
    expect(textarea.value).toContain('Quarterly Sales by Segment');

    // Apply Pie preset
    const pieBtn = screen.getByRole('button', { name: /Pie/i });
    fireEvent.click(pieBtn);
    expect(textarea.value).toContain('Revenue Distribution');

    // Apply Line preset
    const lineBtn = screen.getByRole('button', { name: /Line/i });
    fireEvent.click(lineBtn);
    expect(textarea.value).toContain('Monthly Performance');
  });

  it('formats unformatted JSON on Format JSON button click', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    fireEvent.click(screen.getByTestId('echarts-edit-button'));

    const textarea = screen.getByTestId('echarts-textarea') as HTMLTextAreaElement;
    // Type unformatted JSON
    fireEvent.change(textarea, { target: { value: '{"title":{"text":"Test"},"series":[]}' } });

    const formatBtn = screen.getByText('Format JSON');
    fireEvent.click(formatBtn);

    expect(textarea.value).toContain('{\n  "title": {\n    "text": "Test"\n  }');
  });

  it('saves valid JSON and closes editor on Apply & Save click', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    fireEvent.click(screen.getByTestId('echarts-edit-button'));

    const textarea = screen.getByTestId('echarts-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          title: { text: 'Updated Title' },
          xAxis: { type: 'category', data: ['X', 'Y'] },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: [1, 2] }]
        })
      }
    });

    const saveBtn = screen.getByTestId('echarts-save-button');
    fireEvent.click(saveBtn);

    expect(props.updateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringContaining('"Updated Title"'),
      })
    );
    expect(screen.queryByTestId('echarts-code-editor')).toBeNull();
  });

  it('shows error banner when attempting to save invalid JSON', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    fireEvent.click(screen.getByTestId('echarts-edit-button'));

    const textarea = screen.getByTestId('echarts-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{ "unclosed": json ' } });

    const saveBtn = screen.getByTestId('echarts-save-button');
    fireEvent.click(saveBtn);

    expect(props.updateAttributes).not.toHaveBeenCalled();
    expect(screen.getByTestId('echarts-error-banner')).toBeInTheDocument();
  });

  it('reverts edits and closes editor when close (X) button is clicked', () => {
    const props = createProps();
    render(<EChartsComponent {...props} />);

    fireEvent.click(screen.getByTestId('echarts-edit-button'));

    const textarea = screen.getByTestId('echarts-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"temporary":"change"}' } });

    // Click close (X) button inside editor
    const editorDiv = screen.getByTestId('echarts-code-editor');
    const closeBtn = editorDiv.querySelector('button:has(svg.lucide-x)') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('echarts-code-editor')).toBeNull();

    // Reopen editor, rawCode should have reverted to original code
    fireEvent.click(screen.getByTestId('echarts-edit-button'));
    const reopenedTextarea = screen.getByTestId('echarts-textarea') as HTMLTextAreaElement;
    expect(reopenedTextarea.value).toBe(validJson);
  });
});
