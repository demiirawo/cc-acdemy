
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Table } from 'lucide-react';

interface TableGridSelectorProps {
  onInsertTable: (rows: number, cols: number) => void;
}

export const TableGridSelector: React.FC<TableGridSelectorProps> = ({ onInsertTable }) => {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const maxRows = 8;
  const maxCols = 10;

  const handleCellHover = (row: number, col: number) => {
    setHoveredCell({ row, col });
  };

  const handleCellClick = (row: number, col: number) => {
    onInsertTable(row + 1, col + 1);
    setIsOpen(false);
    setHoveredCell(null);
  };

  const renderGrid = () => {
    const cells = [];
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < maxCols; col++) {
        const isHighlighted = hoveredCell && row <= hoveredCell.row && col <= hoveredCell.col;
        cells.push(
          <div
            key={`${row}-${col}`}
            className={`w-4 h-4 border border-border cursor-pointer transition-colors ${
              isHighlighted ? 'bg-primary' : 'bg-background hover:bg-muted'
            }`}
            onMouseEnter={() => handleCellHover(row, col)}
            onClick={() => handleCellClick(row, col)}
          />
        );
      }
    }
    return cells;
  };

  const getDimensions = () => {
    if (!hoveredCell) return '1 x 1';
    return `${hoveredCell.col + 1} x ${hoveredCell.row + 1}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Insert table">
          <Table className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4">
        <div className="space-y-3">
          <div
            className="grid grid-cols-10 gap-0.5 p-2 border border-border rounded"
            onMouseLeave={() => setHoveredCell(null)}
          >
            {renderGrid()}
          </div>
          <div className="text-center text-sm text-muted-foreground">
            {getDimensions()}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
