
import { useState, useEffect, useRef, useCallback } from "react";
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
import { RecommendedReadingManager } from "./RecommendedReadingManager";
import { useToast } from "@/hooks/use-toast";

interface ContentEditorProps {
  title?: string;
  content?: string;
  pageId?: string;
  onSave: (title: string, content: string, recommendedReading?: Array<{
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
    type?: string;
    category?: string;
  }>, orderedCategories?: string[], tags?: string[]) => Promise<void>;
  onPreview?: () => void;
  onPageSaved?: () => void;
  isEditing?: boolean;
  initialRecommendedReading?: Array<{
    id?: string;
    title: string;
    description: string;
    type: 'link' | 'file' | 'document' | 'guide' | 'reference';
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
  }>;
  initialCategoryOrder?: string[];
}

export function EnhancedContentEditor({ 
  title = "", 
  content = "", 
  pageId,
  onSave, 
  onPreview,
  onPageSaved,
  isEditing = true,
  initialRecommendedReading = [],
  initialCategoryOrder = []
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [recommendedReading, setRecommendedReading] = useState(initialRecommendedReading);
  const [orderedCategories, setOrderedCategories] = useState<string[]>(initialCategoryOrder);
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  // Simple auto-save system rebuilt from scratch
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef({ title, content });
  const isCurrentlySaving = useRef(false);

  // Single centralized save function
  const doSave = useCallback(async (titleToSave: string, contentToSave: string, showSuccessToast = false) => {
    // Prevent concurrent saves
    if (isCurrentlySaving.current) return;
    
    console.log('Saving:', { titleToSave, contentToSave, showSuccessToast });
    
    try {
      isCurrentlySaving.current = true;
      setIsSaving(true);
      
      await onSave(titleToSave, contentToSave, recommendedReading, orderedCategories, tags);
      
      // Update what we consider "saved"
      lastSavedRef.current = { title: titleToSave, content: contentToSave };
      
      if (showSuccessToast) {
        toast({
          title: "Saved",
          description: "Changes saved successfully.",
        });
      }
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save failed", 
        description: "Could not save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      isCurrentlySaving.current = false;
      setIsSaving(false);
    }
  }, [onSave, recommendedReading, orderedCategories, tags, toast]);

  // Check if content has changed since last save
  const hasUnsavedChanges = useCallback(() => {
    return currentTitle !== lastSavedRef.current.title || currentContent !== lastSavedRef.current.content;
  }, [currentTitle, currentContent]);

  // Immediate save (for navigation events)
  const saveNow = useCallback(() => {
    // Cancel any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    if (hasUnsavedChanges()) {
      doSave(currentTitle, currentContent);
    }
  }, [currentTitle, currentContent, hasUnsavedChanges, doSave]);

  // Auto-save with 5-second delay
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (hasUnsavedChanges()) {
        doSave(currentTitle, currentContent);
      }
    }, 5000); // 5 seconds to avoid race conditions
  }, [currentTitle, currentContent, hasUnsavedChanges, doSave]);

  // Auto-save when content changes
  useEffect(() => {
    scheduleAutoSave();
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [currentTitle, currentContent, scheduleAutoSave]);

  // Save on navigation events
  useEffect(() => {
    const beforeUnload = () => saveNow();
    const visibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveNow();
      }
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', visibilityChange);

    return () => {
      // Save on component unmount
      saveNow();
      
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', visibilityChange);
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [saveNow]);

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

  const handleManualSave = async () => {
    await doSave(currentTitle, currentContent, true);
    // Call onPageSaved callback after successful save instead of reloading
    if (onPageSaved) {
      onPageSaved();
    }
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{currentTitle}</h1>
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
            <Button 
              onClick={handleManualSave} 
              className="bg-gradient-primary"
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
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

      {/* Recommended Reading Section */}
      <div className="border-t border-border p-4">
        <RecommendedReadingManager
          pageId={pageId}
          items={recommendedReading}
          onItemsChange={setRecommendedReading}
          orderedCategories={orderedCategories}
          onCategoryOrderChange={setOrderedCategories}
        />
      </div>
    </div>
  );
}
