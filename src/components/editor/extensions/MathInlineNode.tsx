import React, { useMemo } from 'react';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';

export const MathInlineComponent: React.FC<NodeViewProps> = ({ node }) => {
  const code = node.attrs.code || '';

  const html = useMemo(() => {
    try {
      return katex.renderToString(code, {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="text-red-500 font-mono text-xs">${code}</span>`;
    }
  }, [code]);

  return (
    <NodeViewWrapper
      as="span"
      className="math-inline select-none inline-flex items-baseline"
      data-testid="math-inline-view"
      title={`LaTeX: $${code}$`}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
};

export const MathInlineNode = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const raw = el.getAttribute('data-code') || el.innerText || '';
          let code = raw;
          try {
            code = decodeURIComponent(raw);
          } catch {
            // keep raw
          }
          return { code };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const encoded = encodeURIComponent(node.attrs.code || '');
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-inline',
        'data-code': encoded,
        class: 'math-inline',
      }),
      node.attrs.code || '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineComponent);
  },
});
