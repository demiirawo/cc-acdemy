import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  variations: string[];
  created_at: string;
  updated_at: string;
}

export const GlossaryPage = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<GlossaryTerm | null>(null);
  const [formData, setFormData] = useState({ term: '', definition: '', variations: [] as string[] });
  const [newVariation, setNewVariation] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      const { data, error } = await supabase
        .from('glossary')
        .select('*')
        .order('term', { ascending: true });

      if (error) throw error;
      setTerms((data || []).map(t => ({
        ...t,
        variations: Array.isArray(t.variations) ? t.variations : []
      })));
    } catch (error) {
      console.error('Error fetching glossary terms:', error);
      toast({
        title: "Error",
        description: "Failed to load glossary terms",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.term.trim() || !formData.definition.trim()) return;

    setLoading(true);
    try {
      if (editingTerm) {
        const { error } = await supabase
          .from('glossary')
          .update({
            term: formData.term.trim(),
            definition: formData.definition.trim(),
            variations: formData.variations.filter(v => v.trim()),
          })
          .eq('id', editingTerm.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Term updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('glossary')
          .insert({
            term: formData.term.trim(),
            definition: formData.definition.trim(),
            variations: formData.variations.filter(v => v.trim()),
            created_by: user.id,
          });

        if (error) throw error;
        toast({
          title: "Success",
          description: "Term added successfully",
        });
      }

      setFormData({ term: '', definition: '', variations: [] });
      setNewVariation('');
      setEditingTerm(null);
      setIsDialogOpen(false);
      fetchTerms();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save term",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (term: GlossaryTerm) => {
    setEditingTerm(term);
    setFormData({ 
      term: term.term, 
      definition: term.definition,
      variations: term.variations || []
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this term?')) return;

    try {
      const { error } = await supabase
        .from('glossary')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({
        title: "Success",
        description: "Term deleted successfully",
      });
      fetchTerms();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete term",
        variant: "destructive",
      });
    }
  };

  const addVariation = () => {
    if (!newVariation.trim()) return;
    if (formData.variations.includes(newVariation.trim())) {
      toast({
        title: "Duplicate",
        description: "This variation already exists",
        variant: "destructive",
      });
      return;
    }
    setFormData(prev => ({
      ...prev,
      variations: [...prev.variations, newVariation.trim()]
    }));
    setNewVariation('');
  };

  const removeVariation = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variations: prev.variations.filter((_, i) => i !== index)
    }));
  };

  const filteredTerms = terms.filter(term => {
    const query = searchQuery.toLowerCase();
    return (
      term.term.toLowerCase().includes(query) ||
      term.definition.toLowerCase().includes(query) ||
      term.variations.some(v => v.toLowerCase().includes(query))
    );
  });

  const resetForm = () => {
    setFormData({ term: '', definition: '', variations: [] });
    setNewVariation('');
    setEditingTerm(null);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Glossary</h1>
          <p className="text-muted-foreground">
            A collection of terms and their definitions
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Term
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingTerm ? 'Edit Term' : 'Add New Term'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Term</label>
                  <Input
                    value={formData.term}
                    onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                    placeholder="Enter the term"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Definition</label>
                  <Textarea
                    value={formData.definition}
                    onChange={(e) => setFormData({ ...formData, definition: e.target.value })}
                    placeholder="Enter the definition"
                    rows={4}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Variations</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Add alternate words or spellings that should show this definition (e.g., plurals, abbreviations)
                  </p>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={newVariation}
                      onChange={(e) => setNewVariation(e.target.value)}
                      placeholder="Add a variation..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addVariation();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addVariation}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {formData.variations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.variations.map((variation, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {variation}
                          <button
                            type="button"
                            onClick={() => removeVariation(index)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : editingTerm ? 'Update' : 'Add'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search terms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid gap-4">
        {filteredTerms.map((term) => (
          <Card key={term.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg">{term.term}</CardTitle>
                  {term.variations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {term.variations.map((v, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <CardDescription className="mt-2">
                    {term.definition}
                  </CardDescription>
                </div>
                {isAdmin && (
                  <div className="flex space-x-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(term)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(term.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>
        ))}
        
        {filteredTerms.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">
                {searchQuery ? 'No terms found matching your search.' : 'No terms added yet.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
