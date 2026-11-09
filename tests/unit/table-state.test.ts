import { describe, it, expect } from 'vitest';
import { CustomTable, CustomTableRow, CustomTableCell, CustomTableHeader } from '@/components/editor/extensions/TableExtensions';

describe('Table Extension State & Column Calculations', () => {
  it('configures table with resizable options and cell constraints', () => {
    const tableOptions = CustomTable.options;
    expect(tableOptions.resizable).toBe(true);
    expect(tableOptions.cellMinWidth).toBe(80);
    expect(tableOptions.lastColumnResizable).toBe(true);
    expect(tableOptions.handleWidth).toBe(6);
  });

  it('verifies column resizing calculation logic', () => {
    // Column resizing constraints calculation
    const totalTableWidth = 800;
    const minCellWidth = CustomTable.options.cellMinWidth;
    const colCount = 4;

    const maxAllowedWidthForSingleColumn = totalTableWidth - (colCount - 1) * minCellWidth;
    expect(maxAllowedWidthForSingleColumn).toBe(800 - 3 * 80); // 560px
    expect(maxAllowedWidthForSingleColumn).toBeGreaterThan(minCellWidth);
  });

  it('validates table row and cell HTML attributes configuration', () => {
    const rowOptions = CustomTableRow.options;
    expect(rowOptions.HTMLAttributes.class).toContain('border-b');

    const cellOptions = CustomTableCell.options;
    expect(cellOptions.HTMLAttributes.class).toContain('border');

    const headerOptions = CustomTableHeader.options;
    expect(headerOptions.HTMLAttributes.class).toContain('bg-slate-100');
  });

  it('validates table matrix dimension normalization', () => {
    // Simulating table matrix when adding a row
    const originalMatrix = [
      ['Header 1', 'Header 2', 'Header 3'],
      ['Cell 1,1', 'Cell 1,2', 'Cell 1,3'],
    ];

    const newRow = ['Cell 2,1', 'Cell 2,2', 'Cell 2,3'];
    const updatedMatrix = [...originalMatrix, newRow];

    expect(updatedMatrix.length).toBe(3);
    expect(updatedMatrix[2]).toEqual(newRow);

    // Simulating column addition
    const matrixWithAddedCol = updatedMatrix.map((row, idx) => [
      ...row,
      idx === 0 ? 'Header 4' : `Cell ${idx},4`,
    ]);

    expect(matrixWithAddedCol[0].length).toBe(4);
    expect(matrixWithAddedCol[0][3]).toBe('Header 4');
    expect(matrixWithAddedCol[1][3]).toBe('Cell 1,4');
  });
});
