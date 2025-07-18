
import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface UseSaveManagerProps {
  onSave?: (title: string, content: string) => Promise<void>;
  title?: string;
  initialContent?: string;
  autoSaveDelay?: number;
}

export const useSaveManager = ({
  onSave,
  title,
  initialContent = '',
  autoSaveDelay = 3000,
}: UseSaveManagerProps) => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState(initialContent);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  // Auto-save function
  const handleAutoSave = useCallback(async (contentToSave: string) => {
    if (!onSave || !title || contentToSave === lastSavedContent) return;

    try {
      setSaveStatus('saving');
      await onSave(title, contentToSave);
      setSaveStatus('saved');
      setHasUnsavedChanges(false);
      setLastSavedContent(contentToSave);
    } catch (error) {
      setSaveStatus('error');
      console.error('Auto-save failed:', error);
    }
  }, [onSave, title, lastSavedContent]);

  // Manual save function
  const handleSave = useCallback(async (currentContent: string) => {
    if (!onSave || !title) {
      toast({
        title: "Cannot save",
        description: "Save function not available",
        variant: "destructive",
      });
      return;
    }

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
  }, [onSave, title, toast]);

  // Content change handler
  const handleContentChange = useCallback((newContent: string) => {
    const hasChanges = newContent !== lastSavedContent;
    setHasUnsavedChanges(hasChanges);
    
    if (hasChanges) {
      // Clear existing timeout and set new one
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleAutoSave(newContent);
      }, autoSaveDelay);
    }
  }, [lastSavedContent, handleAutoSave, autoSaveDelay]);

  // Update initial content when prop changes
  useEffect(() => {
    if (initialContent !== lastSavedContent) {
      setLastSavedContent(initialContent);
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
    }
  }, [initialContent, lastSavedContent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveStatus,
    hasUnsavedChanges,
    handleSave,
    handleContentChange,
  };
};
