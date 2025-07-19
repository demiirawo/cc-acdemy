import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Eye, Save, FileText, Plus, Trash2, Edit3 } from "lucide-react";
import { RecommendedReadingForm } from "./RecommendedReadingForm";
import { RecommendedReadingList } from "./RecommendedReadingList";

interface EnhancedContentEditorProps {
  title: string;
  content: string;
  onSave: (title: string, content: string, recommendedReading?: Array<{
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
    type?: string;
    category?: string;
  }>, orderedCategories?: string[]) => void;
  onPreview: () => void;
  isEditing: boolean;
  pageId: string;
}

export function EnhancedContentEditor({ 
  title, 
  content, 
  onSave, 
  onPreview, 
  isEditing, 
  pageId 
}: EnhancedContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
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
  const [showRecommendedForm, setShowRecommendedForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState({ title, content });
  
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Initialize content only once when component mounts or pageId changes
  useEffect(() => {
    console.log('Initializing editor with:', { title, content, pageId });
    setCurrentTitle(title);
    setCurrentContent(content);
    setLastSavedContent({ title, content });
    setHasUnsavedChanges(false);
  }, [pageId]); // Only depend on pageId, not title/content to avoid overwrites

  // Track changes for auto-save
  useEffect(() => {
    const titleChanged = currentTitle !== lastSavedContent.title;
    const contentChanged = currentContent !== lastSavedContent.content;
    const hasChanges = titleChanged || contentChanged;
    
    setHasUnsavedChanges(hasChanges);

    if (hasChanges) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Set new auto-save timeout
      autoSaveTimeoutRef.current = setTimeout(() => {
        if (currentTitle.trim() && (titleChanged || contentChanged)) {
          handleAutoSave();
        }
      }, 2000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [currentTitle, currentContent, lastSavedContent]);

  const handleAutoSave = useCallback(async () => {
    if (isAutoSaving) return;
    
    setIsAutoSaving(true);
    try {
      console.log('Auto-saving with content:', currentContent);
      await onSave(currentTitle, currentContent, recommendedReading, orderedCategories);
      setLastSavedContent({ title: currentTitle, content: currentContent });
      setHasUnsavedChanges(false);
      console.log('Auto-saved successfully');
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [currentTitle, currentContent, recommendedReading, orderedCategories, onSave, isAutoSaving]);

  const handleManualSave = async () => {
    try {
      console.log('Manual save with content:', currentContent);
      await onSave(currentTitle, currentContent, recommendedReading, orderedCategories);
      setLastSavedContent({ title: currentTitle, content: currentContent });
      setHasUnsavedChanges(false);
      toast({
        title: "Page saved",
        description: "Your changes have been saved successfully."
      });
    } catch (error) {
      console.error('Manual save failed:', error);
      toast({
        title: "Save failed",
        description: "There was an error saving your changes.",
        variant: "destructive"
      });
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    console.log('Content changed to:', newContent);
    setCurrentContent(newContent);
  };

  const addRecommendedReading = (item: {
    title: string;
    description: string;
    type: 'link' | 'file' | 'document' | 'guide' | 'reference';
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
  }) => {
    const newItem = {
      ...item,
      id: Date.now().toString(),
      category: item.category || 'General'
    };
    
    setRecommendedReading(prev => [...prev, newItem]);
    
    // Add category to ordered list if it's new
    if (item.category && !orderedCategories.includes(item.category)) {
      setOrderedCategories(prev => [...prev, item.category!]);
    }
    
    setShowRecommendedForm(false);
    setEditingItem(null);
  };

  const updateRecommendedReading = (id: string, updatedItem: {
    title: string;
    description: string;
    type: 'link' | 'file' | 'document' | 'guide' | 'reference';
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
  }) => {
    setRecommendedReading(prev => 
      prev.map(item => 
        item.id === id 
          ? { ...updatedItem, id, category: updatedItem.category || 'General' }
          : item
      )
    );
    
    // Add category to ordered list if it's new
    if (updatedItem.category && !orderedCategories.includes(updatedItem.category)) {
      setOrderedCategories(prev => [...prev, updatedItem.category!]);
    }
    
    setShowRecommendedForm(false);
    setEditingItem(null);
  };

  const removeRecommendedReading = (id: string) => {
    setRecommendedReading(prev => prev.filter(item => item.id !== id));
  };

  const editRecommendedReading = (item: any) => {
    setEditingItem(item);
    setShowRecommendedForm(true);
  };

  const reorderCategories = (categories: string[]) => {
    setOrderedCategories(categories);
  };

  if (!isEditing) {
    return null;
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-none mx-8 p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Input
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              className="text-2xl font-bold bg-transparent border-none px-0 focus:ring-0 focus:border-none"
              placeholder="Page title..."
            />
            <div className="flex gap-2 items-center">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600 flex items-center gap-1">
                  {isAutoSaving ? (
                    <>
                      <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse"></div>
                      Auto-saving...
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-amber-600 rounded-full"></div>
                      Unsaved changes
                    </>
                  )}
                </span>
              )}
              <Button onClick={handleManualSave} className="bg-gradient-primary">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={onPreview}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Content</label>
                <textarea
                  ref={contentRef}
                  value={currentContent}
                  onChange={handleContentChange}
                  className="w-full h-96 p-4 border border-border rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Start writing your page content..."
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recommended Reading
                </h3>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setEditingItem(null);
                    setShowRecommendedForm(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              
              {showRecommendedForm && (
                <div className="mb-4">
                  <RecommendedReadingForm
                    onSubmit={editingItem ? 
                      (item) => updateRecommendedReading(editingItem.id, item) : 
                      addRecommendedReading
                    }
                    initialData={editingItem}
                    onCancel={() => {
                      setShowRecommendedForm(false);
                      setEditingItem(null);
                    }}
                  />
                </div>
              )}
              
              <RecommendedReadingList
                items={recommendedReading}
                orderedCategories={orderedCategories}
                onEdit={editRecommendedReading}
                onDelete={removeRecommendedReading}
                onReorderCategories={reorderCategories}
                isEditing={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
