import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DocumentOutline } from '@/components/editor/DocumentOutline';

describe('DocumentOutline Component Buttons', () => {
  const sampleMarkdown = `
# Main Document Title
Some text under main title.
## Section 1: Introduction
Details about section 1.
### Sub-item 1.1: Architecture
Deep dive details.
`;

  const defaultProps = {
    markdown: sampleMarkdown,
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false and scroll is at top', () => {
    const { queryByTestId } = render(<DocumentOutline {...defaultProps} isOpen={false} />);
    expect(queryByTestId('document-outline')).toBeNull();
    expect(queryByTestId('back-to-top-button')).toBeNull();
  });

  it('triggers onClose when Close Outline button is clicked', () => {
    render(<DocumentOutline {...defaultProps} />);

    const closeBtn = screen.getByTestId('outline-close-button');
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders buttons for each parsed heading and triggers scroll on click', () => {
    // Create mock elements in the DOM matching the headings
    const h1El = document.createElement('h1');
    h1El.id = 'main-document-title';
    document.body.appendChild(h1El);

    const h2El = document.createElement('h2');
    h2El.id = 'section-1-introduction';
    document.body.appendChild(h2El);

    const scrollContainer = document.createElement('main');
    scrollContainer.scrollTo = vi.fn();
    document.body.appendChild(scrollContainer);

    const scrollRef = { current: scrollContainer } as React.RefObject<HTMLElement>;

    render(
      <DocumentOutline
        {...defaultProps}
        scrollContainerRef={scrollRef}
      />
    );

    const titleBtn = screen.getByRole('button', { name: /Main Document Title/i });
    const section1Btn = screen.getByRole('button', { name: /Section 1: Introduction/i });

    expect(titleBtn).toBeInTheDocument();
    expect(section1Btn).toBeInTheDocument();

    fireEvent.click(section1Btn);

    expect(scrollContainer.scrollTo).toHaveBeenCalled();

    // Clean up DOM elements
    document.body.removeChild(h1El);
    document.body.removeChild(h2El);
    document.body.removeChild(scrollContainer);
  });

  it('detects headings nested inside blockquotes and ignores quoted code fences', () => {
    const quotedMarkdown = `> Intro line
>
> ### 1. Connection Parameters
> Some text.
>
> \`\`\`bash
> # this is a shell comment, not a heading
> ping 10.0.3.181
> \`\`\`
>
> ## Verification Step`;

    // Files opened on Windows usually use CRLF line endings.
    render(<DocumentOutline markdown={quotedMarkdown.replace(/\n/g, '\r\n')} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /1\. Connection Parameters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verification Step/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shell comment/i })).toBeNull();
  });

  it('shows floating back-to-top button when container is scrolled > 400 and handles click', () => {
    const scrollContainer = document.createElement('main');
    scrollContainer.scrollTo = vi.fn();
    scrollContainer.scrollTop = 0;
    document.body.appendChild(scrollContainer);

    const scrollRef = { current: scrollContainer } as React.RefObject<HTMLElement>;

    const { queryByTestId } = render(
      <DocumentOutline
        {...defaultProps}
        scrollContainerRef={scrollRef}
      />
    );

    // Initially at top (scrollTop: 0), back-to-top should not be visible
    expect(queryByTestId('back-to-top-button')).toBeNull();

    // Scroll down > 400
    scrollContainer.scrollTop = 500;
    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    const backToTopBtn = screen.getByTestId('back-to-top-button');
    expect(backToTopBtn).toBeInTheDocument();

    // Click back to top
    fireEvent.click(backToTopBtn);

    expect(scrollContainer.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });

    document.body.removeChild(scrollContainer);
  });
});
