import React, { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Mention from '@tiptap/extension-mention';
import { common, createLowlight } from 'lowlight';

import { ConfluenceToolbar } from './ConfluenceToolbar';
import { MacroBrowser } from './MacroBrowser';
import { LayoutExtension } from './extensions/LayoutExtension';
import { PanelExtension } from './extensions/PanelExtension';
import { SmartLinkExtension } from './extensions/SmartLinkExtension';
import { CommentExtension } from './extensions/CommentExtension';
import { MentionList } from './MentionList';

const lowlight = createLowlight(common);

export interface ConfluenceEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  onSave?: () => void;
  placeholder?: string;
  editable?: boolean;
  showToolbar?: boolean;
  enableCollaboration?: boolean;
  collaborationConfig?: {
    document: any;
    user: { name: string; color: string };
  };
  className?: string;
  mentions?: Array<{ id: string; label: string; avatar?: string }>;
  onMention?: (query: string) => Promise<Array<{ id: string; label: string; avatar?: string }>>;
  macros?: Array<{ id: string; name: string; icon?: string; insertHtml: string }>;
}

export const ConfluenceEditor: React.FC<ConfluenceEditorProps> = ({
  content = '',
  onChange,
  onSave,
  placeholder = 'Start typing...',
  editable = true,
  showToolbar = true,
  enableCollaboration = false,
  collaborationConfig,
  className = '',
  mentions = [],
  onMention,
  macros = [],
}) => {
  const [isMacroBrowserOpen, setIsMacroBrowserOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState(mentions);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Disabled in favor of CodeBlockLowlight
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Table.configure({
        resizable: true,
        cellMinWidth: 100,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Youtube.configure({
        controls: false,
        nocookie: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }) => {
            if (onMention) {
              onMention(query).then(setMentionResults);
            }
            return mentionResults.filter(item =>
              item.label.toLowerCase().includes(query.toLowerCase())
            );
          },
          render: () => {
            let component: any;
            return {
              onStart: (props: any) => {
                component = new MentionList({
                  props,
                  items: mentionResults,
                });
              },
              onUpdate(props: any) {
                component.updateProps(props);
              },
              onKeyDown(props: any) {
                return component.onKeyDown(props);
              },
              onExit() {
                component.destroy();
              },
            };
          },
        },
      }),
      LayoutExtension,
      PanelExtension,
      SmartLinkExtension,
      CommentExtension,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);
    },
    onCreate: ({ editor }) => {
      // Apply initial table styling
      const tables = editor.view.dom.querySelectorAll('table');
      tables.forEach((table) => {
        applyTableStyling(table as HTMLTableElement);
      });
    },
    editorProps: {
      attributes: {
        class: 'confluence-editor-content prose max-w-none focus:outline-none',
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData('text/plain');
        const isTabSeparated = text.includes('\t') && text.includes('\n');

        if (isTabSeparated) {
          event.preventDefault();
          const rows = text.trim().split('\n');
          const data = rows.map(row => row.split('\t'));
          
          if (data.length > 1 && data[0].length > 1) {
            const { tr } = view.state;
            const tableNode = view.state.schema.nodes.table.create(
              {},
              [
                view.state.schema.nodes.tableRow.create(
                  {},
                  data[0].map(() =>
                    view.state.schema.nodes.tableHeader.create(
                      {},
                      view.state.schema.text('')
                    )
                  )
                ),
                ...data.slice(1).map(row =>
                  view.state.schema.nodes.tableRow.create(
                    {},
                    row.map(cell =>
                      view.state.schema.nodes.tableCell.create(
                        {},
                        view.state.schema.text(cell.trim())
                      )
                    )
                  )
                ),
              ]
            );
            
            view.dispatch(tr.replaceSelectionWith(tableNode));
            
            setTimeout(() => {
              const table = view.dom.querySelector('table:last-of-type') as HTMLTableElement;
              if (table) {
                applyTableStyling(table);
                populateTableWithData(table, data);
              }
            }, 0);
            
            return true;
          }
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        // Save shortcut
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          onSave?.();
          return true;
        }
        
        // Slash commands
        if (event.key === '/') {
          const { selection } = view.state;
          const { from } = selection;
          const textBefore = view.state.doc.textBetween(from - 20, from, '\n', '\0');
          
          if (textBefore.endsWith('\n') || textBefore === '' || from === 0) {
            // Show slash command menu
            setTimeout(() => {
              setIsMacroBrowserOpen(true);
            }, 0);
          }
        }
        
        return false;
      },
    },
  });

  const applyTableStyling = (table: HTMLTableElement) => {
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.border = '1px solid hsl(var(--border))';
    table.style.backgroundColor = 'hsl(var(--background))';

    const cells = table.querySelectorAll('th, td');
    cells.forEach((cell: Element) => {
      const htmlCell = cell as HTMLElement;
      htmlCell.style.border = '1px solid hsl(var(--border))';
      htmlCell.style.padding = '8px 12px';
      htmlCell.style.textAlign = 'left';
      htmlCell.style.verticalAlign = 'top';
      
      if (cell.tagName === 'TH') {
        htmlCell.style.backgroundColor = 'hsl(var(--muted))';
        htmlCell.style.fontWeight = '600';
      }
    });
  };

  const populateTableWithData = (table: HTMLTableElement, data: string[][]) => {
    const rows = table.querySelectorAll('tr');
    data.forEach((rowData, rowIndex) => {
      if (rows[rowIndex]) {
        const cells = rows[rowIndex].querySelectorAll('th, td');
        rowData.forEach((cellData, cellIndex) => {
          if (cells[cellIndex]) {
            cells[cellIndex].textContent = cellData.trim();
          }
        });
      }
    });
  };

  const insertMacro = useCallback((macro: any) => {
    if (editor) {
      editor.chain().focus().insertContent(macro.insertHtml).run();
    }
    setIsMacroBrowserOpen(false);
  }, [editor]);

  useEffect(() => {
    if (editor) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const tables = element.querySelectorAll?.('table') || 
                           (element.tagName === 'TABLE' ? [element] : []);
              tables.forEach((table) => {
                applyTableStyling(table as HTMLTableElement);
              });
            }
          });
        });
      });

      observer.observe(editor.view.dom, {
        childList: true,
        subtree: true,
      });

      return () => observer.disconnect();
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`confluence-editor ${className}`}>
      {showToolbar && (
        <ConfluenceToolbar 
          editor={editor} 
          onMacroBrowser={() => setIsMacroBrowserOpen(true)}
        />
      )}
      
      <div className="confluence-editor-wrapper relative">
        <EditorContent 
          editor={editor} 
          className="min-h-[400px] p-4 border border-border rounded-b-md focus-within:ring-2 focus-within:ring-ring"
        />
        
        {placeholder && editor.isEmpty && (
          <div className="absolute top-4 left-4 text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>

      <MacroBrowser
        isOpen={isMacroBrowserOpen}
        onClose={() => setIsMacroBrowserOpen(false)}
        onInsert={insertMacro}
        macros={macros}
      />
    </div>
  );
};