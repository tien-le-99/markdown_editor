import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EChartsComponent } from '@/components/editor/extensions/EChartsNode';

describe('ECharts Node & Parser Resilience', () => {
  it('handles valid chart JSON specification without error', () => {
    const validJson = JSON.stringify({
      title: { text: 'Valid Test Chart' },
      xAxis: { type: 'category', data: ['A', 'B', 'C'] },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: [10, 20, 30] }]
    });

    const mockUpdateAttributes = vi.fn();
    const mockDeleteNode = vi.fn();

    render(
      <EChartsComponent
        node={{ attrs: { code: validJson } } as any}
        updateAttributes={mockUpdateAttributes}
        deleteNode={mockDeleteNode}
        extension={{} as any}
        editor={{} as any}
        getPos={() => 0}
        decorations={[]}
        selected={false}
      />
    );

    // Should not render error banner
    expect(screen.queryByTestId('echarts-error-banner')).toBeNull();
    expect(screen.getByTestId('echarts-canvas-container')).toBeInTheDocument();
  });

  it('fails gracefully with inline error boundary when JSON is malformed', () => {
    const brokenJson = '{\n  title: "Missing quotes around key",,\n}';

    const mockUpdateAttributes = vi.fn();
    const mockDeleteNode = vi.fn();

    render(
      <EChartsComponent
        node={{ attrs: { code: brokenJson } } as any}
        updateAttributes={mockUpdateAttributes}
        deleteNode={mockDeleteNode}
        extension={{} as any}
        editor={{} as any}
        getPos={() => 0}
        decorations={[]}
        selected={false}
      />
    );

    // Must show error boundary
    const errorBanner = screen.getByTestId('echarts-error-banner');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent('Chart Specification Error');
    expect(screen.getByText('Repair JSON Syntax')).toBeInTheDocument();
    expect(screen.getByText('Reset to Default Preset')).toBeInTheDocument();
  });

  it('allows user to reset to default preset when chart is broken', () => {
    const brokenJson = 'not valid json at all';
    const mockUpdateAttributes = vi.fn();

    render(
      <EChartsComponent
        node={{ attrs: { code: brokenJson } } as any}
        updateAttributes={mockUpdateAttributes}
        deleteNode={vi.fn()}
        extension={{} as any}
        editor={{} as any}
        getPos={() => 0}
        decorations={[]}
        selected={false}
      />
    );

    const resetButton = screen.getByText('Reset to Default Preset');
    fireEvent.click(resetButton);

    expect(mockUpdateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringContaining('"Monthly Performance"')
      })
    );
  });
});
