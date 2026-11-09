import { Mark, mergeAttributes } from '@tiptap/react';

export const CustomLink = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: element => element.getAttribute('href'),
        renderHTML: attributes => {
          if (!attributes.href) return {};
          return { href: attributes.href };
        },
      },
      target: {
        default: null,
        parseHTML: element => element.getAttribute('target'),
        renderHTML: attributes => {
          if (!attributes.target) return {};
          return { target: attributes.target };
        },
      },
      class: {
        default: 'text-brand-600 hover:text-brand-700 underline underline-offset-2 transition-colors cursor-pointer font-medium',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[href]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes), 0];
  },
});
