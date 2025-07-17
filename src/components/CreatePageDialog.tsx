import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Folder, BookOpen, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Space {
  id: string;
  name: string;
  description: string | null;
}

interface Page {
  id: string;
  title: string;
  space_id: string | null;
  parent_page_id: string | null;
}

interface CreatePageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPageCreated: (pageId: string) => void;
  initialParentId?: string | null;
  initialSpaceId?: string | null;
}

export function CreatePageDialog({ 
  open, 
  onOpenChange, 
  onPageCreated, 
  initialParentId = null,
  initialSpaceId = null 
}: CreatePageDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(initialSpaceId);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(initialParentId);
  const [isPublic, setIsPublic] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchData();
      setSelectedSpaceId(initialSpaceId);
      setSelectedParentId(initialParentId);
    }
  }, [open, initialSpaceId, initialParentId]);

  const fetchData = async () => {
    try {
      setLoadingData(true);
      
      // Fetch spaces
      const { data: spacesData, error: spacesError } = await supabase
        .from('spaces')
        .select('id, name, description')
        .order('name');

      if (spacesError) throw spacesError;

      // Fetch pages for parent selection
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('id, title, space_id, parent_page_id')
        .order('title');

      if (pagesError) throw pagesError;

      setSpaces(spacesData || []);
      setPages(pagesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load spaces and pages.",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a page title.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a page.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('pages')
        .insert({
          title: title.trim(),
          content: content.trim() || '',
          space_id: selectedSpaceId,
          parent_page_id: selectedParentId,
          is_public: isPublic,
          tags: tags.length > 0 ? tags : null,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Page created",
        description: `"${title}" has been created successfully.`,
      });

      // Reset form
      setTitle("");
      setContent("");
      setSelectedSpaceId(null);
      setSelectedParentId(null);
      setIsPublic(false);
      setTags([]);
      setNewTag("");
      
      onPageCreated(data.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: "Error",
        description: "Failed to create page. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter pages based on selected space for parent selection
  const availableParentPages = pages.filter(page => {
    if (selectedSpaceId) {
      return page.space_id === selectedSpaceId;
    }
    return !page.space_id; // Only show orphaned pages if no space is selected
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Page</DialogTitle>
          <DialogDescription>
            Create a new page in your knowledge base. You can organize it within a space and set a parent page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Page Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter page title..."
              required
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Initial Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter initial content (optional)..."
              rows={4}
            />
          </div>

          {/* Organization */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Space Selection */}
            <div className="space-y-2">
              <Label>Space</Label>
              <Select 
                value={selectedSpaceId || "none"} 
                onValueChange={(value) => {
                  setSelectedSpaceId(value === "none" ? null : value);
                  setSelectedParentId(null); // Reset parent when space changes
                }}
                disabled={loadingData}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a space (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No space</SelectItem>
                  {spaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        {space.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parent Page Selection */}
            <div className="space-y-2">
              <Label>Parent Page</Label>
              <Select 
                value={selectedParentId || "none"} 
                onValueChange={(value) => setSelectedParentId(value === "none" ? null : value)}
                disabled={loadingData}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select parent page (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent page</SelectItem>
                  {availableParentPages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        {page.title}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add tag..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={!newTag.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Public Switch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Public Page</Label>
              <p className="text-sm text-muted-foreground">
                Make this page accessible to anyone with the link
              </p>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? "Creating..." : "Create Page"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}