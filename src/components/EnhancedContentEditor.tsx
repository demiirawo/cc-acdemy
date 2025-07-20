import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Save, 
  Eye, 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Code, 
  Link, 
  Image,
  Heading1,
  Heading2,
  Heading3,
  Type,
  FileText,
  Strikethrough,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  X
} from "lucide-react";
import { RecommendedReadingManager } from "./RecommendedReadingManager";

interface EnhancedContentEditorProps {
  title?: string;
  content?: string;
  onSave: (
    title: string, 
    content: string, 
    recommendedReading?: Array<{
      title: string;
      url?: string;
      description: string;
      fileUrl?: string;
      fileName?: string;
      type?: string;
      category?: string;
    }>,
    orderedCategories?: string[]
  ) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
  onContentChange?: () => void;
}

export function EnhancedContentEditor({ 
  title = "", 
  content = "", 
  onSave, 
  onPreview,
  isEditing = true,
  pageId,
  onContentChange
}: EnhancedContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [tags, setTags] = useState<string[]>(['engineering', 'documentation']);
  const [newTag, setNewTag] = useState('');
  const [recommendedReading, setRecommendedReading] = useState<Array<{
    id?: string;
    title: string;
    description: string;
    type: 'link' | 'file' | 'document' | 'guide' | 'reference';
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
  }>>([]);
  const [orderedCategories, setOrderedCategories] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize data when props change
  useEffect(() => {
    console.log('EnhancedContentEditor: Props changed', { title, content, pageId });
    setCurrentTitle(title);
    setCurrentContent(content);
    setHasUnsavedChanges(false);
  }, [title, content, pageId]);

  // Load recommended reading data
  useEffect(() => {
    const loadRecommendedReading = async () => {
      if (!pageId || pageId === 'new') return;

      try {
        const { data, error } = await supabase
          .from('pages')
          .select('recommended_reading, category_order')
          .eq('id', pageId)
          .single();

        if (error) throw error;

        if (data) {
          const reading = data.recommended_reading as any[] || [];
          const validReading = reading.map((item: any) => ({
            ...item,
            type: ['link', 'file', 'document', 'guide', 'reference'].includes(item.type) ? item.type : 'link',
            category: item.category || 'General'
          }));
          
          setRecommendedReading(validReading);
          setOrderedCategories(data.category_order as string[] || []);
        }
      } catch (error) {
        console.error('Error loading recommended reading:', error);
      }
    };

    loadRecommendedReading();
  }, [pageId]);

  // Auto-save functionality with improved error handling
  const autoSave = useCallback(async () => {
    if (!pageId || pageId === 'new' || !hasUnsavedChanges) return;

    setIsSaving(true);
    
    try {
      console.log('Auto-saving page:', { pageId, title: currentTitle, contentLength: currentContent.length });
      
      const { error } = await supabase
        .from('pages')
        .update({ 
          title: currentTitle,
          content: currentContent,
          recommended_reading: recommendedReading,
          category_order: orderedCategories,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId);

      if (error) {
        console.error('Auto-save error:', error);
        throw error;
      }

      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      
      // Call onContentChange to notify parent component
      if (onContentChange) {
        onContentChange();
      }
      
      console.log('Auto-save successful');
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast({
        title: "Auto-save failed",
        description: "Your changes couldn't be saved automatically. Please save manually.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  }, [pageId, currentTitle, currentContent, recommendedReading, orderedCategories, hasUnsavedChanges, onContentChange, toast]);

  // Auto-save trigger
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (hasUnsavedChanges && pageId && pageId !== 'new') {
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSave();
      }, 3000); // Auto-save after 3 seconds of inactivity
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, autoSave, pageId]);

  // Track changes
  const handleTitleChange = (value: string) => {
    setCurrentTitle(value);
    setHasUnsavedChanges(true);
  };

  const handleContentChange = (value: string) => {
    setCurrentContent(value);
    setHasUnsavedChanges(true);
  };

  const toolbarItems = [
    { icon: Heading1, action: () => insertText('# '), label: 'Heading 1' },
    { icon: Heading2, action: () => insertText('## '), label: 'Heading 2' },
    { icon: Heading3, action: () => insertText('### '), label: 'Heading 3' },
    { type: 'separator' },
    { icon: Bold, action: () => wrapText('**', '**'), label: 'Bold' },
    { icon: Italic, action: () => wrapText('*', '*'), label: 'Italic' },
    { icon: UnderlineIcon, action: () => wrapText('<u>', '</u>'), label: 'Underline' },
    { icon: Strikethrough, action: () => wrapText('~~', '~~'), label: 'Strikethrough' },
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
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = currentContent.substring(0, start) + text + currentContent.substring(end);
    
    handleContentChange(newContent);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.setSelectionRange(start + text.length, start + text.length);
      textarea.focus();
    }, 0);
  };

  const wrapText = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = currentContent.substring(start, end);
    const newText = prefix + selectedText + suffix;
    const newContent = currentContent.substring(0, start) + newText + currentContent.substring(end);
    
    handleContentChange(newContent);
    
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log('Manual save triggered');
      await onSave(currentTitle, currentContent, recommendedReading, orderedCategories);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Manual save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleRecommendedReadingChange = (
    newReading: Array<{
      id?: string;
      title: string;
      description: string;
      type: 'link' | 'file' | 'document' | 'guide' | 'reference';
      url?: string;
      fileUrl?: string;
      fileName?: string;
      category?: string;
    }>,
    newOrderedCategories: string[]
  ) => {
    setRecommendedReading(newReading);
    setOrderedCategories(newOrderedCategories);
    setHasUnsavedChanges(true);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 max-w-2xl">
            <Input
              placeholder="Page title..."
              value={currentTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-2xl font-bold border-none p-0 h-auto shadow-none focus-visible:ring-0"
            />
          </div>
          
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-sm text-amber-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse"></div>
                Unsaved changes
              </span>
            )}
            
            {isSaving && (
              <span className="text-sm text-blue-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                Saving...
              </span>
            )}
            
            {lastSaved && !hasUnsavedChanges && !isSaving && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}

            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} className="bg-gradient-primary" disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
              {tag}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-red-500" 
                onClick={() => removeTag(tag)}
              />
            </Badge>
          ))}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Add tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTag()}
              className="h-6 text-xs w-24"
            />
            <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={addTag}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 p-2 bg-muted rounded-lg flex-wrap">
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
      <div className="flex-1 flex overflow-hidden">
        {/* Main Editor */}
        <div className="flex-1 p-4 overflow-hidden">
          <Card className="h-full">
            <Textarea
              ref={textareaRef}
              placeholder="Start writing your content here..."
              value={currentContent}
              onChange={(e) => handleContentChange(e.target.value)}
              className="h-full resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
            />
          </Card>
        </div>

        {/* Recommended Reading Panel */}
        <div className="w-96 border-l border-border">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recommended Reading
            </h3>
          </div>
          <ScrollArea className="h-[calc(100vh-12rem)]">
            <div className="p-4">
              <RecommendedReadingManager
                items={recommendedReading}
                orderedCategories={orderedCategories}
                onChange={handleRecommendedReadingChange}
                pageId={pageId}
              />
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
