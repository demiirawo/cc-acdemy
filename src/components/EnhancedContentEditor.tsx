
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  MoreHorizontal,
  Upload,
  FileText,
  ExternalLink
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
}

export function EnhancedContentEditor({ 
  title = "", 
  content = "", 
  onSave, 
  onPreview,
  isEditing = true,
  pageId = ""
}: EnhancedContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [tags, setTags] = useState<string[]>(['engineering', 'documentation']);
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
  const { toast } = useToast();
  
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSaveDataRef = useRef<string>('');

  // Update state when props change
  useEffect(() => {
    console.log('EnhancedContentEditor: Props changed', { title, content: content.substring(0, 50) + '...', pageId });
    setCurrentTitle(title);
    setCurrentContent(content);
    lastSaveDataRef.current = JSON.stringify({ title, content });
  }, [title, content, pageId]);

  // Load page data when pageId changes
  useEffect(() => {
    if (pageId && pageId !== 'new') {
      loadPageData();
    }
  }, [pageId]);

  const loadPageData = async () => {
    if (!pageId || pageId === 'new') return;
    
    try {
      console.log('Loading fresh page data for:', pageId);
      const { data, error } = await supabase
        .from('pages')
        .select('title, content, recommended_reading, category_order')
        .eq('id', pageId)
        .single();

      if (error) throw error;

      console.log('Fresh page data loaded:', {
        id: pageId,
        title: data.title,
        contentLength: data.content?.length || 0,
        lastUpdated: new Date().toISOString()
      });

      setCurrentTitle(data.title);
      setCurrentContent(data.content);
      setRecommendedReading(data.recommended_reading || []);
      setOrderedCategories(data.category_order || []);
      lastSaveDataRef.current = JSON.stringify({ 
        title: data.title, 
        content: data.content 
      });
    } catch (error) {
      console.error('Error loading page data:', error);
      toast({
        title: "Error loading page",
        description: "Failed to load the latest page content.",
        variant: "destructive"
      });
    }
  };

  // Auto-save functionality
  const autoSave = useCallback(async () => {
    if (!pageId || pageId === 'new') return;
    
    const currentData = JSON.stringify({ 
      title: currentTitle, 
      content: currentContent 
    });
    
    // Only save if content has actually changed
    if (currentData === lastSaveDataRef.current) {
      return;
    }

    try {
      setIsSaving(true);
      
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

      if (error) throw error;

      lastSaveDataRef.current = currentData;
      setLastSaved(new Date());
      
      console.log('Auto-saved page:', pageId);
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentTitle, currentContent, recommendedReading, orderedCategories, pageId]);

  // Set up auto-save
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (currentTitle || currentContent) {
      autoSaveTimeoutRef.current = setTimeout(autoSave, 3000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [currentTitle, currentContent, autoSave]);

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
      await onSave(currentTitle, currentContent, recommendedReading, orderedCategories);
      setLastSaved(new Date());
      lastSaveDataRef.current = JSON.stringify({ 
        title: currentTitle, 
        content: currentContent 
      });
      toast({
        title: "Page saved",
        description: "Your changes have been saved successfully."
      });
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Save failed",
        description: "Failed to save your changes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-none mx-8 p-6">
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
              <div 
                className="text-foreground leading-relaxed" 
                dangerouslySetInnerHTML={{ __html: currentContent }} 
              />
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
            {isSaving && (
              <span className="text-sm text-muted-foreground">Saving...</span>
            )}
            {lastSaved && !isSaving && (
              <span className="text-sm text-muted-foreground">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
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

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
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

        {/* Recommended Reading Sidebar */}
        <div className="w-80 border-l border-border p-4 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recommended Reading
          </h3>
          
          <RecommendedReadingManager
            items={recommendedReading}
            onChange={(newReading, newOrderedCategories) => {
              setRecommendedReading(newReading);
              setOrderedCategories(newOrderedCategories);
            }}
            pageId={pageId}
          />
        </div>
      </div>
    </div>
  );
}
