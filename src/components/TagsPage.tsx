import { useState, useEffect } from "react";
import { Tag, FileText, Hash, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Page {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updated_at: string;
  view_count: number;
  created_by: string;
  profiles?: {
    display_name?: string;
  };
}

interface TagData {
  name: string;
  count: number;
  pages: Page[];
}

interface TagsPageProps {
  onPageSelect: (pageId: string) => void;
}

export function TagsPage({ onPageSelect }: TagsPageProps) {
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [filteredTags, setFilteredTags] = useState<TagData[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Utility function to strip HTML tags and get clean text, excluding bold content
  const stripHtmlTags = (html: string): string => {
    if (!html) return '';
    
    // First remove bold content (text inside <b>, <strong> tags)
    let content = html
      .replace(/<(b|strong)[^>]*>.*?<\/(b|strong)>/gi, '') // Remove bold tags and their content
      .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace encoded ampersands
      .replace(/&lt;/g, '<') // Replace encoded less-than
      .replace(/&gt;/g, '>') // Replace encoded greater-than
      .replace(/&quot;/g, '"') // Replace encoded quotes
      .replace(/&#39;/g, "'") // Replace encoded apostrophes
      .trim();
    
    // Clean up extra whitespace
    return content.replace(/\s+/g, ' ').trim();
  };

  useEffect(() => {
    fetchTagsData();
  }, []);

  useEffect(() => {
    // Filter tags based on search query
    const filtered = allTags.filter(tag =>
      tag.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredTags(filtered);
  }, [allTags, searchQuery]);

  const fetchTagsData = async () => {
    try {
      // Fetch all pages with their tags
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('id, title, content, tags, updated_at, view_count, created_by')
        .not('tags', 'is', null);

      if (pagesError) throw pagesError;

      // Fetch user profiles
      const userIds = [...new Set(pagesData?.map(p => p.created_by) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      // Create a map for quick lookup
      const profilesMap = new Map(
        profilesData?.map(p => [p.user_id, p]) || []
      );

      // Add profile data to pages
      const enrichedPages = pagesData?.map(page => ({
        ...page,
        tags: page.tags || [],
        profiles: profilesMap.get(page.created_by) || { display_name: 'Unknown User' }
      })) || [];

      // Process tags
      const tagMap = new Map<string, TagData>();

      enrichedPages.forEach(page => {
        page.tags.forEach(tag => {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, {
              name: tag,
              count: 0,
              pages: []
            });
          }
          const tagData = tagMap.get(tag)!;
          tagData.count += 1;
          tagData.pages.push(page);
        });
      });

      // Sort tags by count (most used first)
      const sortedTags = Array.from(tagMap.values())
        .sort((a, b) => b.count - a.count);

      setAllTags(sortedTags);
    } catch (error) {
      console.error('Error fetching tags data:', error);
      toast({
        title: "Error loading tags",
        description: "Failed to load tags data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 1) return 'Today';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const selectedTagData = selectedTag ? allTags.find(t => t.name === selectedTag) : null;

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gradient-subtle">
        <div className="max-w-5xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-12 bg-muted rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gradient-subtle">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Tag className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Tags</h1>
          </div>
          <p className="text-muted-foreground mb-6">
            Browse content by tags to find related pages and topics
          </p>

          {/* Search */}
          <div className="relative max-w-xl">
            <Input
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-4"
            />
          </div>
        </div>

        {!selectedTag ? (
          /* Tags Overview */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{filteredTags.length} Tags Found</span>
                <Button variant="outline" size="sm" onClick={fetchTagsData}>
                  Refresh
                </Button>
              </CardTitle>
              <CardDescription>
                Click on a tag to see all pages with that tag
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredTags.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTags.map((tag) => (
                    <div
                      key={tag.name}
                      className="p-4 bg-card hover:bg-muted/50 rounded-lg border cursor-pointer transition-colors group"
                      onClick={() => setSelectedTag(tag.name)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Hash className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {tag.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {tag.count} page{tag.count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {tag.pages.slice(0, 3).map((page) => (
                          <Badge key={page.id} variant="outline" className="text-xs">
                            {page.title.length > 20 ? `${page.title.substring(0, 20)}...` : page.title}
                          </Badge>
                        ))}
                        {tag.pages.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{tag.pages.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No tags match your search" : "No tags found"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Tag Details */
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedTag(null)}>
                      ← Back to all tags
                    </Button>
                    <div className="flex items-center gap-2">
                      <Hash className="h-5 w-5 text-primary" />
                      <CardTitle>{selectedTag}</CardTitle>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {selectedTagData?.count} page{selectedTagData?.count !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <CardDescription>
                  All pages tagged with "{selectedTag}"
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedTagData?.pages.length ? (
                  <div className="space-y-3">
                    {selectedTagData.pages.map((page) => (
                      <div
                        key={page.id}
                        className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 rounded-lg border cursor-pointer transition-colors group"
                        onClick={() => onPageSelect(page.id)}
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                              {page.title}
                            </h3>
                            
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                              {stripHtmlTags(page.content).substring(0, 150)}...
                            </p>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                              <span>by {page.profiles?.display_name}</span>
                              <span>Updated {formatTimeAgo(page.updated_at)}</span>
                              <span>{page.view_count || 0} views</span>
                            </div>
                            
                            <div className="flex flex-wrap gap-1">
                              {page.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors ml-4" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No pages found for this tag</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}