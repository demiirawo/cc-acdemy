
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditableTitle } from "./EditableTitle";
import { RecommendedReadingManager } from "./RecommendedReadingManager";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Eye, Save, Plus, X, Tag } from "lucide-react";

interface EnhancedContentEditorProps {
  title: string;
  content: string;
  tags?: string[];
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
    orderedCategories?: string[],
    tags?: string[]
  ) => void;
  onPreview: () => void;
  isEditing: boolean;
  pageId: string;
}

export function EnhancedContentEditor({
  title,
  content,
  tags = [],
  onSave,
  onPreview,
  isEditing,
  pageId
}: EnhancedContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentTags, setCurrentTags] = useState<string[]>(tags);
  const [newTag, setNewTag] = useState("");
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
  const contentRef = useRef<HTMLDivElement>(null);
  const lastSavedContentRef = useRef<string>(content);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();
  const { user } = useAuth();

  // Initialize content and focus
  useEffect(() => {
    if (contentRef.current && content !== contentRef.current.innerHTML) {
      contentRef.current.innerHTML = content;
      lastSavedContentRef.current = content;
    }
    
    if (contentRef.current && isEditing) {
      contentRef.current.focus();
    }
  }, [content, isEditing]);

  // Initialize tags
  useEffect(() => {
    if (tags && tags.length > 0) {
      setCurrentTags(tags);
    }
  }, [tags]);

  // Auto-save functionality with tags
  const autoSave = useCallback(async () => {
    if (!contentRef.current || !user) return;
    
    const currentContent = contentRef.current.innerHTML;
    const hasContentChanged = currentContent !== lastSavedContentRef.current;
    const hasTitleChanged = currentTitle !== title;
    const haveTagsChanged = JSON.stringify(currentTags.sort()) !== JSON.stringify(tags.sort());
    
    if (hasContentChanged || hasTitleChanged || haveTagsChanged) {
      console.log('Auto-saving page...', { 
        contentChanged: hasContentChanged,
        titleChanged: hasTitleChanged,
        tagsChanged: haveTagsChanged,
        tags: currentTags
      });
      
      try {
        const { error } = await supabase
          .from('pages')
          .update({
            title: currentTitle,
            content: currentContent,
            tags: currentTags,
            updated_at: new Date().toISOString()
          })
          .eq('id', pageId);

        if (error) {
          console.error('Auto-save error:', error);
          return;
        }

        lastSavedContentRef.current = currentContent;
        console.log('Auto-save successful');
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }, [currentTitle, title, currentTags, tags, pageId, user]);

  // Set up auto-save with debouncing
  useEffect(() => {
    const handleInput = () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSave();
      }, 2000);
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener('input', handleInput);
      return () => {
        contentElement.removeEventListener('input', handleInput);
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
      };
    }
  }, [autoSave]);

  // Handle page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      autoSave();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        autoSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoSave]);

  const handleSave = () => {
    const currentContent = contentRef.current?.innerHTML || '';
    console.log('Manual save with tags:', currentTags);
    
    onSave(
      currentTitle,
      currentContent,
      recommendedReading,
      orderedCategories,
      currentTags
    );
  };

  const addTag = () => {
    if (newTag.trim() && !currentTags.includes(newTag.trim())) {
      const updatedTags = [...currentTags, newTag.trim()];
      setCurrentTags(updatedTags);
      setNewTag("");
      console.log('Added tag:', newTag.trim(), 'Total tags:', updatedTags);
    }
  };

  const removeTag = (tagToRemove: string) => {
    const updatedTags = currentTags.filter(tag => tag !== tagToRemove);
    setCurrentTags(updatedTags);
    console.log('Removed tag:', tagToRemove, 'Remaining tags:', updatedTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border p-6 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <EditableTitle
            value={currentTitle}
            onChange={setCurrentTitle}
            placeholder="Untitled Page"
            className="flex-1 mr-4"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        {/* Tags Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Tags</span>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-2">
            {currentTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-destructive" 
                  onClick={() => removeTag(tag)}
                />
              </Badge>
            ))}
          </div>
          
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={addTag}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Main Editor */}
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-6">
                <div
                  ref={contentRef}
                  contentEditable
                  className="min-h-[60vh] prose prose-lg max-w-none focus:outline-none text-foreground leading-relaxed"
                  style={{
                    lineHeight: '1.8',
                    fontSize: '16px',
                  }}
                  suppressContentEditableWarning={true}
                  onFocus={(e) => {
                    // Ensure proper cursor placement
                    if (e.target.innerHTML === '') {
                      e.target.innerHTML = '<p><br></p>';
                    }
                  }}
                />
              </div>
            </ScrollArea>
          </div>

          {/* Recommended Reading Sidebar */}
          <div className="w-80 border-l border-border bg-muted/30">
            <div className="p-4">
              <h3 className="font-semibold mb-4 text-foreground">Recommended Reading</h3>
              <RecommendedReadingManager
                items={recommendedReading}
                onItemsChange={setRecommendedReading}
                orderedCategories={orderedCategories}
                onCategoriesChange={setOrderedCategories}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
