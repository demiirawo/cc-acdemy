
import React, { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Plus,
  Minus,
  Merge,
  Split,
  Palette,
} from 'lucide-react';

interface TableContextMenuProps {
  editor: Editor;
  children: React.ReactNode;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({ editor, children }) => {
  const [isInTable, setIsInTable] = useState(false);

  useEffect(() => {
    const updateTableState = () => {
      setIsInTable(editor.isActive('table'));
    };

    editor.on('selectionUpdate', updateTableState);
    editor.on('transaction', updateTableState);

    return () => {
      editor.off('selectionUpdate', updateTableState);
      editor.off('transaction', updateTableState);
    };
  }, [editor]);

  const insertRowAbove = () => {
    editor.chain().focus().addRowBefore().run();
  };

  const insertRowBelow = () => {
    editor.chain().focus().addRowAfter().run();
  };

  const insertColumnLeft = () => {
    editor.chain().focus().addColumnBefore().run();
  };

  const insertColumnRight = () => {
    editor.chain().focus().addColumnAfter().run();
  };

  const deleteRow = () => {
    editor.chain().focus().deleteRow().run();
  };

  const deleteColumn = () => {
    editor.chain().focus().deleteColumn().run();
  };

  const deleteTable = () => {
    editor.chain().focus().deleteTable().run();
  };

  const mergeCells = () => {
    editor.chain().focus().mergeCells().run();
  };

  const splitCell = () => {
    editor.chain().focus().splitCell().run();
  };

  const setCellBackground = (color: string) => {
    editor.chain().focus().setCellAttribute('backgroundColor', color).run();
  };

  const toggleHeaderRow = () => {
    editor.chain().focus().toggleHeaderRow().run();
  };

  const toggleHeaderColumn = () => {
    editor.chain().focus().toggleHeaderColumn().run();
  };

  if (!isInTable) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="h-4 w-4 mr-2" />
            Insert Row
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={insertRowAbove}>
              Insert Row Above
            </ContextMenuItem>
            <ContextMenuItem onClick={insertRowBelow}>
              Insert Row Below
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="h-4 w-4 mr-2" />
            Insert Column
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={insertColumnLeft}>
              Insert Column Left
            </ContextMenuItem>
            <ContextMenuItem onClick={insertColumnRight}>
              Insert Column Right
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem 
          onClick={deleteRow}
          disabled={!editor.can().deleteRow()}
        >
          <Minus className="h-4 w-4 mr-2" />
          Delete Row
        </ContextMenuItem>

        <ContextMenuItem 
          onClick={deleteColumn}
          disabled={!editor.can().deleteColumn()}
        >
          <Minus className="h-4 w-4 mr-2" />
          Delete Column
        </ContextMenuItem>

        <ContextMenuItem 
          onClick={deleteTable}
          disabled={!editor.can().deleteTable()}
        >
          <Minus className="h-4 w-4 mr-2" />
          Delete Table
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem 
          onClick={mergeCells}
          disabled={!editor.can().mergeCells()}
        >
          <Merge className="h-4 w-4 mr-2" />
          Merge Cells
        </ContextMenuItem>

        <ContextMenuItem 
          onClick={splitCell}
          disabled={!editor.can().splitCell()}
        >
          <Split className="h-4 w-4 mr-2" />
          Split Cell
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Palette className="h-4 w-4 mr-2" />
            Cell Background
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => setCellBackground('')}>
              Default
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setCellBackground('#f3f4f6')}>
              Light Gray
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setCellBackground('#dbeafe')}>
              Light Blue
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setCellBackground('#dcfce7')}>
              Light Green
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setCellBackground('#fef3c7')}>
              Light Yellow
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setCellBackground('#fecaca')}>
              Light Red
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={toggleHeaderRow}>
          Toggle Header Row
        </ContextMenuItem>

        <ContextMenuItem onClick={toggleHeaderColumn}>
          Toggle Header Column
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
