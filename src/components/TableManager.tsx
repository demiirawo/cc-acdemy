
import React, { useCallback, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Trash2, MoreHorizontal, Palette, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

interface TableManagerProps {
  editor: any;
  onTableCreate?: () => void;
}

export const TableManager: React.FC<TableManagerProps> = ({ editor, onTableCreate }) => {
  const tableManagerRef = useRef<HTMLDivElement>(null);

  // Centralized table creation with consistent structure
  const createTable = useCallback((rows: number = 3, cols: number = 3) => {
    if (!editor) return;

    try {
      editor.chain().focus().insertTable({ 
        rows, 
        cols, 
        withHeaderRow: true 
      }).run();
      
      // Apply consistent styling
      setTimeout(() => {
        const tables = document.querySelectorAll('.ProseMirror table');
        const latestTable = tables[tables.length - 1] as HTMLTableElement;
        if (latestTable) {
          applyTableStyling(latestTable);
        }
      }, 100);
      
      onTableCreate?.();
    } catch (error) {
      console.error('Error creating table:', error);
    }
  }, [editor, onTableCreate]);

  // Apply consistent table styling
  const applyTableStyling = useCallback((table: HTMLTableElement) => {
    if (!table) return;

    // Reset any problematic styles
    table.style.direction = 'ltr';
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.margin = '16px 0';

    // Style cells consistently
    const cells = table.querySelectorAll('td, th');
    cells.forEach((cell: any) => {
      cell.style.border = '1px solid hsl(var(--border))';
      cell.style.padding = '8px 12px';
      cell.style.textAlign = 'left';
      cell.style.verticalAlign = 'top';
      cell.style.minWidth = '100px';
      cell.style.position = 'relative';
      
      // Ensure proper text direction
      cell.style.direction = 'ltr';
      cell.style.unicodeBidi = 'normal';
    });

    // Style header row
    const headerCells = table.querySelectorAll('th');
    headerCells.forEach((cell: any) => {
      cell.style.backgroundColor = 'hsl(var(--muted))';
      cell.style.fontWeight = '600';
    });
  }, []);

  // Enhanced paste handling for tables
  const handlePasteInTable = useCallback((event: ClipboardEvent) => {
    if (!editor) return;

    const selection = editor.state.selection;
    const isInTable = editor.isActive('table');
    
    if (!isInTable) return;

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const htmlData = clipboardData.getData('text/html');
    const textData = clipboardData.getData('text/plain');

    // Handle pasted table data
    if (htmlData.includes('<table') || textData.includes('\t')) {
      event.preventDefault();
      
      try {
        // Parse tabular data
        const rows = textData.split('\n').filter(row => row.trim());
        const tableData = rows.map(row => row.split('\t'));
        
        if (tableData.length > 0 && tableData[0].length > 0) {
          // Clear current selection and insert parsed data
          const currentCell = selection.$anchor;
          let cellIndex = 0;
          
          tableData.forEach((rowData, rowIndex) => {
            rowData.forEach((cellData, colIndex) => {
              if (rowIndex === 0 && colIndex === 0) {
                // Replace current cell content
                editor.chain().focus().deleteSelection().insertContent(cellData.trim()).run();
              } else {
                // Move to next cell and insert data
                if (colIndex > 0) {
                  editor.commands.goToNextCell();
                } else if (rowIndex > 0) {
                  editor.commands.goToNextRow();
                }
                editor.chain().focus().deleteSelection().insertContent(cellData.trim()).run();
              }
            });
          });
        }
      } catch (error) {
        console.error('Error handling table paste:', error);
        // Fallback to default paste behavior
      }
    }
  }, [editor]);

  // Set up event listeners for enhanced table functionality
  useEffect(() => {
    if (!editor) return;

    // Listen for paste events
    const editorElement = editor.view.dom;
    editorElement.addEventListener('paste', handlePasteInTable);

    // Apply styling to existing tables
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const tables = element.querySelectorAll('table');
            tables.forEach((table) => applyTableStyling(table as HTMLTableElement));
          }
        });
      });
    });

    observer.observe(editorElement, {
      childList: true,
      subtree: true
    });

    return () => {
      editorElement.removeEventListener('paste', handlePasteInTable);
      observer.disconnect();
    };
  }, [editor, handlePasteInTable, applyTableStyling]);

  if (!editor) return null;

  return (
    <div ref={tableManagerRef} className="flex items-center gap-2">
      {/* Table Creation Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => createTable(2, 2)}>
            <div className="flex flex-col">
              <span>Small Table</span>
              <span className="text-xs text-muted-foreground">2×2</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => createTable(3, 3)}>
            <div className="flex flex-col">
              <span>Medium Table</span>
              <span className="text-xs text-muted-foreground">3×3</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => createTable(4, 4)}>
            <div className="flex flex-col">
              <span>Large Table</span>
              <span className="text-xs text-muted-foreground">4×4</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => createTable(5, 8)}>
            <div className="flex flex-col">
              <span>Spreadsheet</span>
              <span className="text-xs text-muted-foreground">5×8</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Table Controls - Show when in table */}
      {editor.isActive('table') && (
        <>
          <div className="h-4 w-px bg-border" />
          
          {/* Row Controls */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="Add row above"
            className="h-8 px-2 text-xs"
          >
            Row ↑
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="Add row below"
            className="h-8 px-2 text-xs"
          >
            Row ↓
          </Button>

          {/* Column Controls */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="Add column left"
            className="h-8 px-2 text-xs"
          >
            Col ←
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="Add column right"
            className="h-8 px-2 text-xs"
          >
            Col →
          </Button>

          <div className="h-4 w-px bg-border" />

          {/* Alignment Controls */}
          <Button
            variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'outline'}
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Align left"
            className="h-8 w-8 p-0"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          
          <Button
            variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'outline'}
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Align center"
            className="h-8 w-8 p-0"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          
          <Button
            variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'outline'}
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Align right"
            className="h-8 w-8 p-0"
          >
            <AlignRight className="h-4 w-4" />
          </Button>

          <div className="h-4 w-px bg-border" />

          {/* Destructive Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Row
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
};
