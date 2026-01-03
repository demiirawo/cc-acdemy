import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  variations: string[];
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
        .select('id, term, definition, variations')
        .order('term', { ascending: true });

      if (error) throw error;
      setTerms((data || []).map(t => ({
        ...t,
        variations: Array.isArray(t.variations) ? t.variations : []
      })));
    } catch (error) {
      console.error('Error fetching glossary terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefinition = (searchTerm: string): string | undefined => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Check main term and variations
    const found = terms.find(t => 
      t.term.toLowerCase() === lowerSearchTerm ||
      t.variations.some(v => v.toLowerCase() === lowerSearchTerm)
    );
    return found?.definition;
  };

  // Get all matchable terms (main terms + variations) for highlighting
  const getAllMatchableTerms = (): Array<{ term: string; definition: string; mainTerm: string }> => {
    const matchable: Array<{ term: string; definition: string; mainTerm: string }> = [];
    
    terms.forEach(t => {
      // Add main term
      matchable.push({ term: t.term, definition: t.definition, mainTerm: t.term });
      
      // Add variations
      t.variations.forEach(v => {
        if (v.trim()) {
          matchable.push({ term: v, definition: t.definition, mainTerm: t.term });
        }
      });
    });
    
    return matchable;
  };

  return {
    terms,
    loading,
    getDefinition,
    getAllMatchableTerms,
    refetch: fetchTerms,
  };
};
