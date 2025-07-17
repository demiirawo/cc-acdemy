import { useState, useEffect } from "react";
import { Clock, FileText, User, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/security";

interface Page {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  view_count: number;
  created_by: string;
  profiles?: {
    display_name?: string;
  };
}

interface RecentlyUpdatedPageProps {
  onPageSelect: (pageId: string) => void;
}

export function RecentlyUpdatedPage({ onPageSelect }: RecentlyUpdatedPageProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [filteredPages, setFilteredPages] = useState<Page[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchRecentlyUpdatedPages();
  }, []);

  useEffect(() => {
    // Filter pages based on search query
    const filtered = pages.filter(page =>
      page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredPages(filtered);
  }, [pages, searchQuery]);

  const fetchRecentlyUpdatedPages = async () => {
    try {
      // Fetch pages ordered by updated_at
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('id, title, content, updated_at, view_count, created_by')
        .order('updated_at', { ascending: false })
        .limit(50);

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
      const enrichedData = pagesData?.map(page => ({
        ...page,
        profiles: profilesMap.get(page.created_by) || { display_name: 'Unknown User' }
      })) || [];

      setPages(enrichedData);
    } catch (error) {
      console.error('Error fetching recently updated pages:', error);
      toast({
        title: "Error loading pages",
        description: "Failed to load recently updated pages.",
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
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const stripHtmlAndTruncate = (html: string, maxLength = 150) => {
    // Sanitize HTML first to prevent XSS
    const sanitized = sanitizeHtml(html);
    
    // Remove HTML tags and decode entities
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitized;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    
    // Remove multiple spaces/newlines
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    // Truncate and add ellipsis if needed
    if (cleanText.length > maxLength) {
      return cleanText.substring(0, maxLength) + '...';
    }
    return cleanText;
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gradient-subtle">
        <div className="max-w-5xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-12 bg-muted rounded"></div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
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
            <Clock className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Recently Updated</h1>
          </div>
          <p className="text-muted-foreground mb-6">
            Pages that have been updated recently, showing the latest changes first
          </p>

          {/* Search */}
          <div className="relative max-w-xl">
            <Input
              placeholder="Search recently updated pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-4"
            />
          </div>
        </div>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{filteredPages.length} Recent Updates</span>
              <Button variant="outline" size="sm" onClick={fetchRecentlyUpdatedPages}>
                Refresh
              </Button>
            </CardTitle>
            <CardDescription>
              Showing pages ordered by most recent updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredPages.length > 0 ? (
              <div className="space-y-3">
                {filteredPages.map((page) => (
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
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {page.title}
                          </h3>
                          <Badge variant="secondary">Page</Badge>
                        </div>
                        
                           <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                             {stripHtmlAndTruncate(page.content)}
                           </p>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{page.profiles?.display_name}</span>
                          </div>
                          <span>Updated {formatTimeAgo(page.updated_at)}</span>
                          <span>{page.view_count || 0} views</span>
                        </div>
                      </div>
                    </div>
                    
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors ml-4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No pages match your search" : "No recently updated pages"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}