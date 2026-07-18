import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user role:', error);
          setRole('viewer'); // Default role
        } else {
          setRole(data?.role || 'viewer');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setRole('viewer');
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  const isAdmin = role === 'admin';
  const isEditor = role === 'editor' || role === 'admin';
  const isViewer = role === 'viewer' || role === 'editor' || role === 'admin';
  const isHumanResources = role === 'human_resources';
  // HR can manage everything on the HR tab except staff salaries; admins can do everything.
  const canManageHR = isAdmin || isHumanResources;
  // Who may view & edit the training matrix.
  const canManageTraining = isAdmin || isHumanResources;

  return {
    role,
    loading,
    isAdmin,
    isEditor,
    isViewer,
    isHumanResources,
    canManageHR,
    // Back-compat alias (training_manager was renamed to human_resources).
    isTrainingManager: isHumanResources,
    canManageTraining
  };
};