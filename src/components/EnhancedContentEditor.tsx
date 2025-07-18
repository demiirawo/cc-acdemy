
import React, { useRef } from 'react';
import { EditorToolbar } from './EditorToolbar';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
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
import Link from '@tiptap/extension-link';
import { cn } from "@/lib/utils";

interface EnhancedContentEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
  onSave?: (title: string, content: string, recommendedReading?: any[]) => Promise<void>;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
}

export const EnhancedContentEditor: React.FC<EnhancedContentEditorProps> = ({
  content,
  onChange,
  placeholder = "Start writing...",
  className,
  title,
  onSave,
  onPreview,
  isEditing,
  pageId
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Create editor instance with properly configured extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable conflicting extensions that we'll configure separately
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
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
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-4',
        },
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
        width: 640,
        height: 480,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editable: true,
    immediatelyRender: false,
  });

  // Handle save functionality
  const handleSave = () => {
    if (onSave && title) {
      onSave(title, content);
    }
  };

  if (!editor) {
    return <div className="h-64 bg-muted animate-pulse rounded-md" />;
  }

  return (
    <div ref={editorRef} className={cn("enhanced-content-editor border border-border rounded-md", className)}>
      <EditorToolbar editor={editor} />
      <div className="relative min-h-[300px]">
        <EditorContent 
          editor={editor} 
          className="min-h-[300px] p-4 prose prose-sm max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[250px]"
        />
        {placeholder && editor.isEmpty && (
          <div className="absolute top-4 left-4 text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
};
