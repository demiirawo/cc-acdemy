
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TableGridSelector } from '../TableGridSelector';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('TableGridSelector', () => {
  const mockOnInsertTable = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table button', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    
    const tableButton = screen.getByTitle('Insert table');
    expect(tableButton).toBeInTheDocument();
  });

  it('opens grid selector when button is clicked', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    
    const tableButton = screen.getByTitle('Insert table');
    fireEvent.click(tableButton);
    
    expect(screen.getByText('1 x 1')).toBeInTheDocument();
  });

  it('updates dimensions on hover', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    
    const tableButton = screen.getByTitle('Insert table');
    fireEvent.click(tableButton);
    
    // Find the grid container and simulate hover on a cell
    const gridContainer = screen.getByText('1 x 1').parentElement?.querySelector('.grid');
    const cells = gridContainer?.children;
    
    if (cells && cells[12]) { // Second row, third column (1-indexed: 3x2)
      fireEvent.mouseEnter(cells[12]);
      expect(screen.getByText('3 x 2')).toBeInTheDocument();
    }
  });

  it('calls onInsertTable with correct dimensions when cell is clicked', () => {
    render(<TableGridSelector onInsertTable={mockOnInsertTable} />);
    
    const tableButton = screen.getByTitle('Insert table');
    fireEvent.click(tableButton);
    
    const gridContainer = screen.getByText('1 x 1').parentElement?.querySelector('.grid');
    const cells = gridContainer?.children;
    
    if (cells && cells[23]) { // Third row, fourth column
      fireEvent.click(cells[23]);
      expect(mockOnInsertTable).toHaveBeenCalledWith(3, 4);
    }
  });
});
