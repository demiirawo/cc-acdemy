
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TableManager } from './TableManager';
import { Button } from "@/components/ui/button";
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Quote, Code, Undo, Redo } from "lucide-react";
import { cn } from "@/lib/utils";

interface EnhancedContentEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

export const EnhancedContentEditor: React.FC<EnhancedContentEditorProps> = ({
  content,
  onChange,
  placeholder = "Start writing...",
  className
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
        cellMinWidth: 100,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      TextStyle,
      Color,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-[300px] p-4',
        style: 'direction: ltr; unicode-bidi: normal;'
      },
      handlePaste: (view, event, slice) => {
        // Enhanced paste handling for tables and general content
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const htmlData = clipboardData.getData('text/html');
        const textData = clipboardData.getData('text/plain');

        // Handle table data from Excel/Google Sheets
        if (textData.includes('\t') && textData.includes('\n')) {
          const rows = textData.split('\n').filter(row => row.trim());
          const tableData = rows.map(row => row.split('\t'));
          
          if (tableData.length > 1 && tableData[0].length > 1) {
            // Create a new table with the pasted data
            const { selection } = view.state;
            const { $from } = selection;
            
            // Insert table
            const table = view.state.schema.nodes.table.create();
            const transaction = view.state.tr.replaceSelectionWith(table);
            view.dispatch(transaction);
            
            // Populate table with data
            setTimeout(() => {
              const tables = editorRef.current?.querySelectorAll('table');
              const latestTable = tables?.[tables.length - 1];
              if (latestTable) {
                populateTableWithData(latestTable, tableData);
              }
            }, 100);
            
            return true;
          }
        }

        return false;
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
    onCreate: ({ editor }) => {
      // Apply consistent styling to any existing tables
      setTimeout(() => {
        const tables = editorRef.current?.querySelectorAll('table');
        tables?.forEach(table => applyTableStyling(table as HTMLTableElement));
      }, 100);
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  // Apply consistent table styling
  const applyTableStyling = useCallback((table: HTMLTableElement) => {
    if (!table) return;

    // Reset problematic styles and apply consistent styling
    table.style.direction = 'ltr';
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.margin = '16px 0';
    table.style.backgroundColor = 'transparent';

    // Style all cells
    const cells = table.querySelectorAll('td, th');
    cells.forEach((cell: any) => {
      cell.style.border = '1px solid hsl(var(--border))';
      cell.style.padding = '8px 12px';
      cell.style.textAlign = 'left';
      cell.style.verticalAlign = 'top';
      cell.style.minWidth = '100px';
      cell.style.maxWidth = '300px';
      cell.style.direction = 'ltr';
      cell.style.unicodeBidi = 'normal';
      cell.style.wordBreak = 'break-word';
      cell.style.position = 'relative';
      
      // Ensure text cursor positioning works correctly
      cell.style.caretColor = 'currentColor';
    });

    // Style header cells
    const headerCells = table.querySelectorAll('th');
    headerCells.forEach((cell: any) => {
      cell.style.backgroundColor = 'hsl(var(--muted))';
      cell.style.fontWeight = '600';
      cell.style.color = 'hsl(var(--foreground))';
    });
  }, []);

  // Populate table with pasted data
  const populateTableWithData = useCallback((table: HTMLTableElement, data: string[][]) => {
    const rows = table.querySelectorAll('tr');
    
    data.forEach((rowData, rowIndex) => {
      if (rowIndex < rows.length) {
        const cells = rows[rowIndex].querySelectorAll('td, th');
        rowData.forEach((cellData, cellIndex) => {
          if (cellIndex < cells.length) {
            cells[cellIndex].textContent = cellData.trim();
          }
        });
      }
    });
  }, []);

  // Set up mutation observer to handle dynamically created tables
  useEffect(() => {
    if (!editorRef.current || !editor) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const tables = element.querySelectorAll('table');
            tables.forEach((table) => applyTableStyling(table as HTMLTableElement));
            
            // Also check if the added node itself is a table
            if (element.tagName === 'TABLE') {
              applyTableStyling(element as HTMLTableElement);
            }
          }
        });
      });
    });

    observer.observe(editorRef.current, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, [editor, applyTableStyling]);

  // Keyboard shortcuts for better UX
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to save (if implemented)
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        // Trigger save functionality if available
      }
      
      // Tab key handling in tables
      if (event.key === 'Tab' && editor.isActive('table')) {
        event.preventDefault();
        if (event.shiftKey) {
          editor.commands.goToPreviousCell();
        } else {
          editor.commands.goToNextCell();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  if (!editor) {
    return <div className="h-64 bg-muted animate-pulse rounded-md" />;
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", isFocused && "ring-2 ring-ring ring-offset-2", className)}>
      {/* Toolbar */}
      <div className="border-b bg-muted/50 p-2">
        <div className="flex flex-wrap items-center gap-1">
          {/* Basic Formatting */}
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant={editor.isActive('bold') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className="h-8 w-8 p-0"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('italic') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className="h-8 w-8 p-0"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('strike') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className="h-8 w-8 p-0"
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-border mr-2" />

          {/* Text Alignment */}
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              className="h-8 w-8 p-0"
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              className="h-8 w-8 p-0"
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              className="h-8 w-8 p-0"
            >
              <AlignRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-border mr-2" />

          {/* Lists */}
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className="h-8 w-8 p-0"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
              size="sm"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className="h-8 w-8 p-0"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-border mr-2" />

          {/* Table Management */}
          <TableManager editor={editor} />

          <div className="h-6 w-px bg-border mr-2" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="h-8 w-8 p-0"
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="h-8 w-8 p-0"
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Editor Content */}
      <div ref={editorRef} className="min-h-[300px] max-h-[80vh] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
