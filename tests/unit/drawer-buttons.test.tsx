import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MarkdownDrawer } from '@/components/editor/MarkdownDrawer';

describe('MarkdownDrawer Component Buttons', () => {
  const defaultProps = {
    markdown: '# Hello World\n\nThis is a sample markdown test.',
    onChange: vi.fn(),
    onClose: vi.fn(),
    isOpen: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<MarkdownDrawer {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('copies markdown to clipboard and toggles Copied state on Copy button click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<MarkdownDrawer {...defaultProps} />);

    const copyBtn = screen.getByTestId('drawer-copy-button');
    expect(copyBtn).toHaveTextContent('Copy');

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith(defaultProps.markdown);
    expect(copyBtn).toHaveTextContent('Copied');

    // Advance timer by 2 seconds to ensure it reverts back to "Copy"
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(copyBtn).toHaveTextContent('Copy');
  });

  it('creates blob and triggers download on Download button click', () => {
    // Mock URL object methods
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost:3000/mock-uuid');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    // Spy on document.createElement to check anchor tag
    const linkClickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = linkClickMock;
      }
      return element;
    });

    render(<MarkdownDrawer {...defaultProps} />);

    const downloadBtn = screen.getByTitle('Download .md File');
    fireEvent.click(downloadBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(linkClickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost:3000/mock-uuid');
  });

  it('triggers onClose when Close Drawer button is clicked', () => {
    render(<MarkdownDrawer {...defaultProps} />);

    const closeBtn = screen.getByTestId('drawer-close-button');
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onChange when typing into the raw markdown textarea', () => {
    render(<MarkdownDrawer {...defaultProps} />);

    const textarea = screen.getByTestId('raw-markdown-textarea');
    fireEvent.change(textarea, { target: { value: '# New Content' } });

    expect(defaultProps.onChange).toHaveBeenCalledWith('# New Content');
  });
});
