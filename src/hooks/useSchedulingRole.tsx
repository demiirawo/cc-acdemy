import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useSchedulingRole = () => {
  const { user } = useAuth();
  const [isSchedulingEditor, setIsSchedulingEditor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedulingRole = async () => {
      if (!user) {
        setIsSchedulingEditor(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // Check if user is admin from profiles
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile role:', profileError);
        }

        const userIsAdmin = profileData?.role === 'admin';
        setIsAdmin(userIsAdmin);

        // Check if user is a scheduling editor from hr_profiles
        const { data: hrData, error: hrError } = await supabase
          .from('hr_profiles')
          .select('scheduling_role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (hrError) {
          console.error('Error fetching HR profile:', hrError);
        }

        const userIsSchedulingEditor = hrData?.scheduling_role === 'editor';
        setIsSchedulingEditor(userIsSchedulingEditor);
      } catch (error) {
        console.error('Error fetching scheduling role:', error);
        setIsSchedulingEditor(false);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedulingRole();
  }, [user]);

  // Can edit = admin OR scheduling editor
  const canEditSchedule = isAdmin || isSchedulingEditor;

  return {
    isAdmin,
    isSchedulingEditor,
    canEditSchedule,
    loading
  };
};
