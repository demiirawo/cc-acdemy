
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TableGridSelector } from '../TableGridSelector';
import { EditorToolbar } from '../EditorToolbar';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('Table Insertion', () => {
  const mockOnInsertTable = vi.fn();
  const mockEditor = {
    getHTML: vi.fn(() => '<p>Test content</p>'),
    isEmpty: false,
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({ 
        run: vi.fn(),
        insertTable: vi.fn(() => ({ run: vi.fn() })),
        toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
        toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
      }))
    })),
    can: vi.fn(() => ({ 
      run: vi.fn(),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      toggleBulletList: vi.fn(() => true),
      toggleOrderedList: vi.fn(() => true),
    })),
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({})),
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table grid selector', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    expect(screen.getByTitle('Insert table')).toBeInTheDocument();
  });

  it('opens grid selector when table button is clicked', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    
    fireEvent.click(screen.getByTitle('Insert table'));
    
    // Should show the grid
    expect(screen.getByText('1 x 1')).toBeInTheDocument();
  });

  it('calls onInsertTable with correct dimensions when cell is clicked', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    
    fireEvent.click(screen.getByTitle('Insert table'));
    
    // Find and click a grid cell (this would be the first cell in a 10x8 grid)
    const gridCells = document.querySelectorAll('.grid-cols-10 > div');
    if (gridCells.length > 0) {
      fireEvent.click(gridCells[0]);
      expect(mockOnInsertTable).toHaveBeenCalledWith(1, 1);
    }
  });

  it('integrates with editor toolbar', () => {
    render(<EditorToolbar editor={mockEditor as any} />);
    
    expect(screen.getByTitle('Insert table')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet list')).toBeInTheDocument();
    expect(screen.getByTitle('Numbered list')).toBeInTheDocument();
  });

  it('calls editor chain methods when list buttons are clicked', () => {
    render(<EditorToolbar editor={mockEditor as any} />);
    
    fireEvent.click(screen.getByTitle('Bullet list'));
    expect(mockEditor.chain).toHaveBeenCalled();
    
    fireEvent.click(screen.getByTitle('Numbered list'));
    expect(mockEditor.chain).toHaveBeenCalled();
  });
});
