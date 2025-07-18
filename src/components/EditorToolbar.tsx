
import React, { useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Code2,
  Link,
  Image,
  Video,
  Table,
  Palette,
  Highlighter,
  Undo,
  Redo,
  Type,
  Heading1,
  Heading2,
  Heading3,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ColorPicker } from '@/components/ColorPicker';

interface EditorToolbarProps {
  editor: Editor | null;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  if (!editor) {
    return null;
  }

  // Command handlers
  const toggleBold = useCallback(() => {
    editor.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    editor.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleUnderline = useCallback(() => {
    editor.chain().focus().toggleUnderline().run();
  }, [editor]);

  const toggleStrike = useCallback(() => {
    editor.chain().focus().toggleStrike().run();
  }, [editor]);

  const setHeading = useCallback((level: 1 | 2 | 3) => {
    editor.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  const setParagraph = useCallback(() => {
    editor.chain().focus().setParagraph().run();
  }, [editor]);

  const setTextAlign = useCallback((alignment: 'left' | 'center' | 'right' | 'justify') => {
    editor.chain().focus().setTextAlign(alignment).run();
  }, [editor]);

  const toggleBulletList = useCallback(() => {
    editor.chain().focus().toggleBulletList().run();
  }, [editor]);

  const toggleOrderedList = useCallback(() => {
    editor.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const toggleTaskList = useCallback(() => {
    editor.chain().focus().toggleTaskList().run();
  }, [editor]);

  const toggleCode = useCallback(() => {
    editor.chain().focus().toggleCode().run();
  }, [editor]);

  const toggleCodeBlock = useCallback(() => {
    editor.chain().focus().toggleCodeBlock().run();
  }, [editor]);

  const toggleBlockquote = useCallback(() => {
    editor.chain().focus().toggleBlockquote().run();
  }, [editor]);

  const insertTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const insertImage = useCallback(() => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertYoutube = useCallback(() => {
    const url = window.prompt('Enter YouTube URL:');
    if (url) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    }
  }, [editor]);

  const insertLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const setTextColor = useCallback((color: string) => {
    editor.chain().focus().setColor(color).run();
  }, [editor]);

  const setHighlight = useCallback((color: string) => {
    editor.chain().focus().setHighlight({ color }).run();
  }, [editor]);

  const undo = useCallback(() => {
    editor.chain().focus().undo().run();
  }, [editor]);

  const redo = useCallback(() => {
    editor.chain().focus().redo().run();
  }, [editor]);

  // Table commands
  const addRowBefore = useCallback(() => {
    editor.chain().focus().addRowBefore().run();
  }, [editor]);

  const addRowAfter = useCallback(() => {
    editor.chain().focus().addRowAfter().run();
  }, [editor]);

  const deleteRow = useCallback(() => {
    editor.chain().focus().deleteRow().run();
  }, [editor]);

  const addColumnBefore = useCallback(() => {
    editor.chain().focus().addColumnBefore().run();
  }, [editor]);

  const addColumnAfter = useCallback(() => {
    editor.chain().focus().addColumnAfter().run();
  }, [editor]);

  const deleteColumn = useCallback(() => {
    editor.chain().focus().deleteColumn().run();
  }, [editor]);

  const deleteTable = useCallback(() => {
    editor.chain().focus().deleteTable().run();
  }, [editor]);

  return (
    <div className="border-b border-border bg-background p-2 flex flex-wrap gap-1 items-center rounded-t-md">
      {/* Undo/Redo */}
      <Button
        variant="ghost"
        size="sm"
        onClick={undo}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={redo}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Text Styles */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Text style">
            <Type className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={setParagraph}>
            Normal text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHeading(1)}>
            <Heading1 className="h-4 w-4 mr-2" /> Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHeading(2)}>
            <Heading2 className="h-4 w-4 mr-2" /> Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHeading(3)}>
            <Heading3 className="h-4 w-4 mr-2" /> Heading 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6" />

      {/* Text Formatting */}
      <Button
        variant={editor.isActive('bold') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleBold}
        disabled={!editor.can().toggleBold()}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('italic') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleItalic}
        disabled={!editor.can().toggleItalic()}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('underline') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleUnderline}
        disabled={!editor.can().toggleUnderline()}
        title="Underline"
      >
        <Underline className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('strike') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleStrike}
        disabled={!editor.can().toggleStrike()}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      {/* Colors */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Text color">
            <Palette className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="p-2">
            <ColorPicker onColorSelect={setTextColor} />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Highlight">
            <Highlighter className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="p-2">
            <ColorPicker onColorSelect={setHighlight} />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6" />

      {/* Alignment */}
      <Button
        variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setTextAlign('left')}
        disabled={!editor.can().setTextAlign('left')}
        title="Align left"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setTextAlign('center')}
        disabled={!editor.can().setTextAlign('center')}
        title="Align center"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setTextAlign('right')}
        disabled={!editor.can().setTextAlign('right')}
        title="Align right"
      >
        <AlignRight className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive({ textAlign: 'justify' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setTextAlign('justify')}
        disabled={!editor.can().setTextAlign('justify')}
        title="Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Lists */}
      <Button
        variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleBulletList}
        disabled={!editor.can().toggleBulletList()}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleOrderedList}
        disabled={!editor.can().toggleOrderedList()}
        title="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('taskList') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleTaskList}
        disabled={!editor.can().toggleTaskList()}
        title="Task list"
      >
        <CheckSquare className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Code & Quote */}
      <Button
        variant={editor.isActive('code') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleCode}
        disabled={!editor.can().toggleCode()}
        title="Inline code"
      >
        <Code className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('codeBlock') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleCodeBlock}
        disabled={!editor.can().toggleCodeBlock()}
        title="Code block"
      >
        <Code2 className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive('blockquote') ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleBlockquote}
        disabled={!editor.can().toggleBlockquote()}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Media & Links */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={insertLink}
        title="Insert link"
      >
        <Link className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={insertImage}
        title="Insert image"
      >
        <Image className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={insertYoutube}
        title="Insert YouTube video"
      >
        <Video className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Table */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Table">
            <Table className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={insertTable}>
            Insert table
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={addRowBefore}
            disabled={!editor.can().addRowBefore()}
          >
            Add row above
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={addRowAfter}
            disabled={!editor.can().addRowAfter()}
          >
            Add row below
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={deleteRow}
            disabled={!editor.can().deleteRow()}
          >
            Delete row
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={addColumnBefore}
            disabled={!editor.can().addColumnBefore()}
          >
            Add column before
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={addColumnAfter}
            disabled={!editor.can().addColumnAfter()}
          >
            Add column after
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={deleteColumn}
            disabled={!editor.can().deleteColumn()}
          >
            Delete column
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={deleteTable}
            disabled={!editor.can().deleteTable()}
          >
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
