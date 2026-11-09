import Heading from '@tiptap/extension-heading';
import { mergeAttributes } from '@tiptap/core';
import { slugifyHeading } from '../utils/markdown-serializer';

export const CustomHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { id: attributes.id };
        },
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    const textSlug = slugifyHeading(node.textContent || '');
    const id = HTMLAttributes.id || (textSlug ? textSlug : undefined);

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, id ? { id } : {}),
      0,
    ];
  },
});
