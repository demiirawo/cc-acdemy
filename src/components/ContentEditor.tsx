
import { useState, useEffect } from "react";
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Heading1,
  Heading2,
  Heading3,
  Save,
  Eye,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ContentEditorProps {
  title?: string;
  content?: string;
  onSave: (title: string, content: string) => void;
  onPreview?: () => void;
  isEditing?: boolean;
}

export function ContentEditor({ 
  title = "", 
  content = "", 
  onSave, 
  onPreview,
  isEditing = true 
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [tags, setTags] = useState<string[]>(['engineering', 'documentation']);

  // Auto-save when leaving the page
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Save the current state before leaving
      onSave(currentTitle, currentContent);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Save when tab becomes hidden (user switches tabs or minimizes)
        onSave(currentTitle, currentContent);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup event listeners on component unmount
    return () => {
      // Save one final time when component unmounts
      onSave(currentTitle, currentContent);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentTitle, currentContent, onSave]);

  const toolbarItems = [
    { icon: Heading1, action: () => insertText('# '), label: 'Heading 1' },
    { icon: Heading2, action: () => insertText('## '), label: 'Heading 2' },
    { icon: Heading3, action: () => insertText('### '), label: 'Heading 3' },
    { type: 'separator' },
    { icon: Bold, action: () => wrapText('**', '**'), label: 'Bold' },
    { icon: Italic, action: () => wrapText('*', '*'), label: 'Italic' },
    { icon: Underline, action: () => wrapText('<u>', '</u>'), label: 'Underline' },
    { type: 'separator' },
    { icon: List, action: () => insertText('- '), label: 'Bullet List' },
    { icon: ListOrdered, action: () => insertText('1. '), label: 'Numbered List' },
    { icon: Quote, action: () => insertText('> '), label: 'Quote' },
    { icon: Code, action: () => wrapText('`', '`'), label: 'Inline Code' },
    { type: 'separator' },
    { icon: Link, action: () => insertLink(), label: 'Link' },
    { icon: Image, action: () => insertImage(), label: 'Image' },
  ];

  const insertText = (text: string) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = currentContent.substring(0, start) + text + currentContent.substring(end);
    setCurrentContent(newContent);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.setSelectionRange(start + text.length, start + text.length);
      textarea.focus();
    }, 0);
  };

  const wrapText = (prefix: string, suffix: string) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = currentContent.substring(start, end);
    const newText = prefix + selectedText + suffix;
    const newContent = currentContent.substring(0, start) + newText + currentContent.substring(end);
    setCurrentContent(newContent);
    
    // Reset cursor position
    setTimeout(() => {
      if (selectedText) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
      textarea.focus();
    }, 0);
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    const text = prompt('Enter link text:') || url;
    if (url) {
      insertText(`[${text}](${url})`);
    }
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    const alt = prompt('Enter alt text:') || 'Image';
    if (url) {
      insertText(`![${alt}](${url})`);
    }
  };

  const handleSave = () => {
    onSave(currentTitle, currentContent);
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{currentTitle}</h1>
            <div className="flex gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </div>
          
          <Card className="p-6">
            <div className="prose prose-lg max-w-none">
              <pre className="whitespace-pre-wrap text-foreground">{currentContent}</pre>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 max-w-2xl">
            <Input
              placeholder="Page title..."
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              className="text-2xl font-bold border-none p-0 h-auto shadow-none focus-visible:ring-0"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex gap-2 mb-4">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
          <Button variant="outline" size="sm" className="h-6 text-xs">
            + Add tag
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 p-2 bg-muted rounded-lg">
          {toolbarItems.map((item, index) => {
            if (item.type === 'separator') {
              return <Separator key={index} orientation="vertical" className="h-6 mx-1" />;
            }
            
            const Icon = item.icon!;
            return (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                onClick={item.action}
                className="h-8 w-8 p-0"
                title={item.label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 p-4 overflow-hidden">
        <Card className="h-full">
          <Textarea
            placeholder="Start writing your content here..."
            value={currentContent}
            onChange={(e) => setCurrentContent(e.target.value)}
            className="h-full resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
          />
        </Card>
      </div>
    </div>
  );
}
