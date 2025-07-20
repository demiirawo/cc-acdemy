import { useState, useEffect, useRef, useCallback } from "react";
import { ContentEditor } from "./ContentEditor";
import { RecommendedReadingManager } from "./RecommendedReadingManager";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save, Eye, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RecommendedReadingItem {
  id?: string;
  title: string;
  description: string;
  type: 'link' | 'file' | 'document' | 'guide' | 'reference';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category?: string;
}

interface EnhancedContentEditorProps {
  title?: string;
  content?: string;
  onSave: (
    title: string, 
    content: string, 
    recommendedReading?: RecommendedReadingItem[], 
    orderedCategories?: string[]
  ) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId: string;
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function EnhancedContentEditor({ 
  title = "", 
  content = "", 
  onSave, 
  onPreview,
  isEditing = true,
  pageId
}: EnhancedContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [recommendedReading, setRecommendedReading] = useState<RecommendedReadingItem[]>([]);
  const [orderedCategories, setOrderedCategories] = useState<string[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedStateRef = useRef({ title: "", content: "", recommendedReading: "[]", orderedCategories: "[]" });
  const isMountedRef = useRef(true);

  // Auto-save function that saves all fields
  const autoSave = useCallback(async () => {
    if (!pageId || pageId === 'new') return;

    const currentState = {
      title: currentTitle,
      content: currentContent,
      recommendedReading: JSON.stringify(recommendedReading),
      orderedCategories: JSON.stringify(orderedCategories)
    };

    // Check if anything has actually changed
    if (
      currentState.title === lastSavedStateRef.current.title &&
      currentState.content === lastSavedStateRef.current.content &&
      currentState.recommendedReading === lastSavedStateRef.current.recommendedReading &&
      currentState.orderedCategories === lastSavedStateRef.current.orderedCategories
    ) {
      return;
    }

    setAutoSaveStatus('saving');

    try {
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

      // Update last saved state
      lastSavedStateRef.current = currentState;
      
      if (isMountedRef.current) {
        setAutoSaveStatus('saved');
        // Show saved status briefly, then fade to idle
        setTimeout(() => {
          if (isMountedRef.current) {
            setAutoSaveStatus('idle');
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      if (isMountedRef.current) {
        setAutoSaveStatus('error');
        setTimeout(() => {
          if (isMountedRef.current) {
            setAutoSaveStatus('idle');
          }
        }, 3000);
      }
    }
  }, [currentTitle, currentContent, recommendedReading, orderedCategories, pageId]);

  // Debounced auto-save trigger
  const triggerAutoSave = useCallback(() => {
    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new auto-save timeout (reduced to 1.5 seconds for better responsiveness)
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 1500);
  }, [autoSave]);

  // Set up auto-save triggers
  useEffect(() => {
    if (isEditing && pageId && pageId !== 'new') {
      triggerAutoSave();
    }
  }, [currentTitle, currentContent, recommendedReading, orderedCategories, triggerAutoSave, isEditing, pageId]);

  // Initialize last saved state on mount
  useEffect(() => {
    lastSavedStateRef.current = {
      title,
      content,
      recommendedReading: JSON.stringify(recommendedReading),
      orderedCategories: JSON.stringify(orderedCategories)
    };
  }, [title, content]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Load existing recommended reading when pageId changes
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

        if (data?.recommended_reading) {
          const validReading = (data.recommended_reading as any[]).map((item: any) => ({
            ...item,
            type: ['link', 'file', 'document', 'guide', 'reference'].includes(item.type) 
              ? item.type 
              : 'link' as const,
            category: item.category || 'General'
          }));
          setRecommendedReading(validReading);
        }

        if (data?.category_order) {
          setOrderedCategories(data.category_order as string[]);
        }
      } catch (error) {
        console.error('Error loading recommended reading:', error);
      }
    };

    loadRecommendedReading();
  }, [pageId]);

  const handleManualSave = () => {
    // Clear pending auto-save to prevent race condition
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Call the original onSave function
    onSave(currentTitle, currentContent, recommendedReading, orderedCategories);
    
    // Update last saved state
    lastSavedStateRef.current = {
      title: currentTitle,
      content: currentContent,
      recommendedReading: JSON.stringify(recommendedReading),
      orderedCategories: JSON.stringify(orderedCategories)
    };
  };

  const handlePreview = () => {
    // Clear pending auto-save before preview
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    onPreview?.();
  };

  // Auto-save status indicator
  const getAutoSaveStatusIcon = () => {
    switch (autoSaveStatus) {
      case 'saving':
        return <Clock className="h-4 w-4 text-muted-foreground animate-spin" />;
      case 'saved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getAutoSaveStatusText = () => {
    switch (autoSaveStatus) {
      case 'saving':
        return 'Auto-saving...';
      case 'saved':
        return 'Auto-saved';
      case 'error':
        return 'Auto-save failed';
      default:
        return '';
    }
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{currentTitle}</h1>
            <div className="flex gap-2">
              {/* {tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))} */}
            </div>
          </div>
          
          <Card className="p-6">
            <div className="prose prose-lg max-w-none">
              <div className="text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: currentContent }} />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with auto-save status */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 max-w-2xl">
            <input
              type="text"
              placeholder="Page title..."
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              className="text-2xl font-bold border-none p-0 h-auto shadow-none focus-visible:ring-0 w-full bg-transparent outline-none"
            />
          </div>
          
          <div className="flex items-center gap-3">
            {/* Auto-save status indicator */}
            {autoSaveStatus !== 'idle' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {getAutoSaveStatusIcon()}
                <span>{getAutoSaveStatusText()}</span>
              </div>
            )}
            
            <Button variant="outline" size="sm" onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleManualSave} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Content Editor */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <ContentEditor
            title={currentTitle}
            content={currentContent}
            onSave={(title, content) => {
              setCurrentTitle(title);
              setCurrentContent(content);
            }}
            onPreview={handlePreview}
            isEditing={isEditing}
          />
        </div>

        <div className="w-80 border-l border-border">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">Recommended Reading</h3>
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
  );
}
