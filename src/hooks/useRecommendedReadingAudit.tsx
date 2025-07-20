import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RecommendedReadingItem {
  id?: string;
  title: string;
  description: string;
  type: 'link' | 'file' | 'document' | 'guide' | 'reference';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category?: string;
}

export interface AuditLogEntry {
  id: string;
  operation_type: string;
  old_data: any;
  new_data: any;
  change_details: any;
  created_at: string;
  user_id: string;
}

export interface ContentSnapshot {
  id: string;
  snapshot_type: string;
  title: string;
  content: string;
  recommended_reading: any; // JSON from database
  created_at: string;
  user_id: string;
}

export const useRecommendedReadingAudit = (pageId: string) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Create automatic snapshot before major changes
  const createSnapshot = useCallback(async (snapshotType = 'auto') => {
    try {
      const { data, error } = await supabase.rpc('create_page_snapshot', {
        p_page_id: pageId,
        p_snapshot_type: snapshotType
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating snapshot:', error);
      throw error;
    }
  }, [pageId]);

  // Log recommended reading changes with detailed information
  const logChange = useCallback(async (
    operationType: string,
    oldData: any = null,
    newData: any = null,
    changeDetails: any = null
  ) => {
    try {
      const { data, error } = await supabase.rpc('log_recommended_reading_change', {
        p_page_id: pageId,
        p_operation_type: operationType,
        p_old_data: oldData,
        p_new_data: newData,
        p_change_details: changeDetails
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error logging change:', error);
      // Don't throw here - audit logging shouldn't break the main flow
    }
  }, [pageId]);

  // Get audit logs for the page
  const getAuditLogs = useCallback(async (): Promise<AuditLogEntry[]> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('recommended_reading_audit')
        .select('*')
        .eq('page_id', pageId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: "Error",
        description: "Failed to load audit logs",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [pageId, toast]);

  // Get content snapshots for recovery
  const getSnapshots = useCallback(async (): Promise<ContentSnapshot[]> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('page_content_snapshots')
        .select('*')
        .eq('page_id', pageId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        recommended_reading: Array.isArray(item.recommended_reading) 
          ? item.recommended_reading 
          : []
      }));
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      toast({
        title: "Error",
        description: "Failed to load content snapshots",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [pageId, toast]);

  // Restore recommended reading from a snapshot
  const restoreFromSnapshot = useCallback(async (snapshotId: string) => {
    try {
      setIsLoading(true);
      
      // Get the snapshot data
      const { data: snapshot, error: snapshotError } = await supabase
        .from('page_content_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (snapshotError) throw snapshotError;

      // Create a pre-restore snapshot
      await createSnapshot('pre_restore');

      // Get current page data for audit
      const { data: currentPage, error: pageError } = await supabase
        .from('pages')
        .select('recommended_reading')
        .eq('id', pageId)
        .single();

      if (pageError) throw pageError;

      // Update the page with snapshot data
      const { error: updateError } = await supabase
        .from('pages')
        .update({
          title: snapshot.title,
          content: snapshot.content,
          recommended_reading: snapshot.recommended_reading,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId);

      if (updateError) throw updateError;

      // Log the restore operation
      await logChange('restore', currentPage.recommended_reading, snapshot.recommended_reading, {
        snapshot_id: snapshotId,
        snapshot_date: snapshot.created_at,
        restored_items_count: Array.isArray(snapshot.recommended_reading) 
          ? snapshot.recommended_reading.length 
          : 0
      });

      toast({
        title: "Content Restored",
        description: `Content has been restored from ${new Date(snapshot.created_at).toLocaleString()}`,
      });

      return snapshot.recommended_reading;
    } catch (error) {
      console.error('Error restoring from snapshot:', error);
      toast({
        title: "Restore Failed",
        description: "Failed to restore content from snapshot",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [pageId, toast, createSnapshot, logChange]);

  return {
    createSnapshot,
    logChange,
    getAuditLogs,
    getSnapshots,
    restoreFromSnapshot,
    isLoading
  };
};