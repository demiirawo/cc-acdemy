import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
}

export const useGlossary = () => {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      const { data, error } = await supabase
        .from('glossary')
        .select('id, term, definition')
        .order('term', { ascending: true });

      if (error) throw error;
      setTerms(data || []);
    } catch (error) {
      console.error('Error fetching glossary terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefinition = (term: string): string | undefined => {
    const found = terms.find(t => 
      t.term.toLowerCase() === term.toLowerCase()
    );
    return found?.definition;
  };

  return {
    terms,
    loading,
    getDefinition,
    refetch: fetchTerms,
  };
};