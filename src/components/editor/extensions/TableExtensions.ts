import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { mergeAttributes } from '@tiptap/core';

export const CustomTable = Table.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      resizable: true,
      handleWidth: 6,
      cellMinWidth: 80,
      lastColumnResizable: true,
      allowTableNodeSelection: true,
      HTMLAttributes: {
        class: 'gfm-table border-collapse w-full my-6 text-sm text-left shadow-sm rounded-lg overflow-hidden',
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'table',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'gfm-table',
        'data-testid': 'gfm-table',
      }),
      ['tbody', 0],
    ];
  },
});

export const CustomTableRow = TableRow.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'border-b border-slate-200 hover:bg-slate-50/50 transition-colors',
      },
    };
  },
});

export const CustomTableHeader = TableHeader.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'border border-slate-300 bg-slate-100 font-semibold text-slate-800 px-4 py-3 align-top',
      },
    };
  },
});

export const CustomTableCell = TableCell.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'border border-slate-300 px-4 py-3 align-top relative',
      },
    };
  },
});

export const TableExtensions = [
  CustomTable,
  CustomTableRow,
  CustomTableHeader,
  CustomTableCell,
];

export { Table, TableRow, TableCell, TableHeader };
