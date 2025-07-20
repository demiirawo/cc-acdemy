
import { useCallback, useRef, useEffect } from 'react';
import { useSaveStatus } from './useSaveStatus';

interface AutoSaveOptions {
  onSave: (data: any) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave({ onSave, delay = 2000, enabled = true }: AutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();
  const pendingDataRef = useRef<any>(null);
  const isSavingRef = useRef(false);

  const clearPendingAutoSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingDataRef.current = null;
  }, []);

  const triggerAutoSave = useCallback(async (data: any) => {
    if (!enabled || isSavingRef.current) return;

    // Clear any existing timeout
    clearPendingAutoSave();

    // Store the data to be saved
    pendingDataRef.current = data;

    // Set up new timeout
    timeoutRef.current = setTimeout(async () => {
      if (!pendingDataRef.current || isSavingRef.current) return;

      try {
        isSavingRef.current = true;
        setSaving();
        await onSave(pendingDataRef.current);
        setSaved();
        pendingDataRef.current = null;
      } catch (error) {
        console.error('Auto-save failed:', error);
        setError();
      } finally {
        isSavingRef.current = false;
      }
    }, delay);
  }, [enabled, delay, onSave, clearPendingAutoSave, setSaving, setSaved, setError]);

  const saveImmediately = useCallback(async (data: any) => {
    clearPendingAutoSave();
    
    if (isSavingRef.current) return;

    try {
      isSavingRef.current = true;
      setSaving();
      await onSave(data);
      setSaved();
    } catch (error) {
      console.error('Manual save failed:', error);
      setError();
      throw error;
    } finally {
      isSavingRef.current = false;
    }
  }, [onSave, clearPendingAutoSave, setSaving, setSaved, setError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPendingAutoSave();
    };
  }, [clearPendingAutoSave]);

  return {
    triggerAutoSave,
    saveImmediately,
    clearPendingAutoSave,
    saveStatus,
    isSaving: isSavingRef.current
  };
}
