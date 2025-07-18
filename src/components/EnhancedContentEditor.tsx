
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { EditorToolbar } from './EditorToolbar';
import { TableContextMenu } from './TableContextMenu';
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
import { Button } from '@/components/ui/button';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState(content);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  // Create editor instance with properly configured extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure list extensions properly
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: {
            class: 'bullet-list',
          },
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: {
            class: 'ordered-list',
          },
        },
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
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
        HTMLAttributes: {
          class: 'enhanced-table',
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'table-row',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'table-header',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'table-cell',
        },
      }),
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
      const newContent = editor.getHTML();
      onChange(newContent);
      setHasUnsavedChanges(newContent !== lastSavedContent);
      
      // Auto-save after 3 seconds of inactivity
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleAutoSave(newContent);
      }, 3000);
    },
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'enhanced-editor-content',
      },
      handleKeyDown: (view, event) => {
        // Handle Ctrl+S / Cmd+S for save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          handleSave();
          return true;
        }
        return false;
      },
    },
  });

  // Auto-save function
  const handleAutoSave = useCallback(async (contentToSave?: string) => {
    if (!onSave || !title || !hasUnsavedChanges) return;
    
    const currentContent = contentToSave || editor?.getHTML() || '';
    if (currentContent === lastSavedContent) return;

    try {
      setSaveStatus('saving');
      await onSave(title, currentContent);
      setSaveStatus('saved');
      setHasUnsavedChanges(false);
      setLastSavedContent(currentContent);
    } catch (error) {
      setSaveStatus('error');
      console.error('Auto-save failed:', error);
    }
  }, [onSave, title, hasUnsavedChanges, lastSavedContent, editor]);

  // Manual save function
  const handleSave = useCallback(async () => {
    if (!onSave || !title) {
      toast({
        title: "Cannot save",
        description: "Save function not available",
        variant: "destructive",
      });
      return;
    }

    const currentContent = editor?.getHTML() || '';
    
    try {
      setSaveStatus('saving');
      await onSave(title, currentContent);
      setSaveStatus('saved');
      setHasUnsavedChanges(false);
      setLastSavedContent(currentContent);
      toast({
        title: "Saved",
        description: "Your changes have been saved successfully",
      });
    } catch (error) {
      setSaveStatus('error');
      setHasUnsavedChanges(true);
      toast({
        title: "Save failed",
        description: "Failed to save your changes. Please try again.",
        variant: "destructive",
      });
      console.error('Save failed:', error);
    }
  }, [onSave, title, editor, toast]);

  // Warn user about unsaved changes when leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
      setLastSavedContent(content);
      setHasUnsavedChanges(false);
    }
  }, [content, editor]);

  // Cleanup auto-save timeout
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  if (!editor) {
    return <div className="h-64 bg-muted animate-pulse rounded-md" />;
  }

  const getSaveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      case 'saved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Save className="w-4 h-4" />;
    }
  };

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved';
      case 'error':
        return 'Save failed';
      default:
        return hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved';
    }
  };

  return (
    <div ref={editorRef} className={cn("enhanced-content-editor border border-border rounded-md", className)}>
      <div className="flex items-center justify-between p-2 border-b border-border bg-muted/50">
        <EditorToolbar editor={editor} />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {getSaveStatusIcon()}
            <span>{getSaveStatusText()}</span>
          </div>
          {onSave && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saveStatus === 'saving' || !hasUnsavedChanges}
              className="h-8"
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          )}
        </div>
      </div>
      
      <TableContextMenu editor={editor}>
        <div className="relative min-h-[300px] enhanced-editor-content">
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
      </TableContextMenu>
    </div>
  );
};
