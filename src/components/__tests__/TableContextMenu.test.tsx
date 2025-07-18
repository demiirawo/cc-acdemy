
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TableContextMenu } from '../TableContextMenu';
import { Editor } from '@tiptap/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock editor
const mockEditor = {
  isActive: vi.fn((type) => type === 'table'),
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      addRowBefore: vi.fn(() => ({ run: vi.fn() })),
      addRowAfter: vi.fn(() => ({ run: vi.fn() })),
      addColumnBefore: vi.fn(() => ({ run: vi.fn() })),
      addColumnAfter: vi.fn(() => ({ run: vi.fn() })),
      deleteRow: vi.fn(() => ({ run: vi.fn() })),
      deleteColumn: vi.fn(() => ({ run: vi.fn() })),
      deleteTable: vi.fn(() => ({ run: vi.fn() })),
      mergeCells: vi.fn(() => ({ run: vi.fn() })),
      splitCell: vi.fn(() => ({ run: vi.fn() })),
      setCellAttribute: vi.fn(() => ({ run: vi.fn() })),
      toggleHeaderRow: vi.fn(() => ({ run: vi.fn() })),
      toggleHeaderColumn: vi.fn(() => ({ run: vi.fn() })),
    }))
  })),
  can: vi.fn(() => ({
    deleteRow: vi.fn(() => true),
    deleteColumn: vi.fn(() => true),
    deleteTable: vi.fn(() => true),
    mergeCells: vi.fn(() => true),
    splitCell: vi.fn(() => true),
  })),
  on: vi.fn(),
  off: vi.fn(),
} as unknown as Editor;

describe('TableContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when not in table', () => {
    const notInTableEditor = {
      ...mockEditor,
      isActive: vi.fn(() => false),
    } as unknown as Editor;

    render(
      <TableContextMenu editor={notInTableEditor}>
        <div>Test content</div>
      </TableContextMenu>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('shows context menu when in table', () => {
    render(
      <TableContextMenu editor={mockEditor}>
        <div data-testid="table-content">Table content</div>
      </TableContextMenu>
    );

    const content = screen.getByTestId('table-content');
    fireEvent.contextMenu(content);

    expect(screen.getByText('Insert Row')).toBeInTheDocument();
    expect(screen.getByText('Insert Column')).toBeInTheDocument();
    expect(screen.getByText('Delete Row')).toBeInTheDocument();
    expect(screen.getByText('Merge Cells')).toBeInTheDocument();
  });

  it('executes table commands when menu items are clicked', () => {
    render(
      <TableContextMenu editor={mockEditor}>
        <div data-testid="table-content">Table content</div>
      </TableContextMenu>
    );

    const content = screen.getByTestId('table-content');
    fireEvent.contextMenu(content);

    const deleteRowItem = screen.getByText('Delete Row');
    fireEvent.click(deleteRowItem);

    expect(mockEditor.chain).toHaveBeenCalled();
  });
});
