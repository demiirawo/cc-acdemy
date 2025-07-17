import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Eye, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PublicPage {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  view_count: number;
  profiles?: {
    display_name?: string;
  };
}

export function PublicPageView() {
  const { token } = useParams<{ token: string }>();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (token) {
      fetchPublicPage();
    }
  }, [token]);

  const fetchPublicPage = async () => {
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, content, updated_at, view_count, created_by')
        .eq('public_token', token)
        .eq('is_public', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setNotFound(true);
        } else {
          throw error;
        }
        return;
      }

      // Fetch profile data separately
      const { data: profileData } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', data.created_by)
        .single();

      const enrichedPage = {
        ...data,
        profiles: profileData
      };

      setPage(enrichedPage);

      // Increment view count
      await supabase
        .from('pages')
        .update({ view_count: (data.view_count || 0) + 1 })
        .eq('id', data.id);

    } catch (error) {
      console.error('Error fetching public page:', error);
      toast({
        title: "Error",
        description: "Failed to load page content.",
        variant: "destructive",
      });
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-primary/20 rounded-lg mx-auto mb-4"></div>
          <div className="h-4 bg-primary/20 rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Page Not Found</CardTitle>
            <CardDescription>
              This page doesn't exist, is no longer public, or the link is invalid.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/'}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Public Page</div>
                <div className="font-medium">Knowledge Base</div>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.location.href = '/'}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Visit Knowledge Base
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-3xl mb-2">{page.title}</CardTitle>
                <CardDescription className="flex items-center gap-4">
                  <span>
                    by {page.profiles?.display_name || 'Unknown Author'}
                  </span>
                  <span>
                    Updated {new Date(page.updated_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {page.view_count || 0} views
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span>Public</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-lg max-w-none">
              <div 
                className="whitespace-pre-wrap text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ 
                  __html: page.content.replace(/\n/g, '<br>') 
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            This page is publicly shared from the Knowledge Base.{' '}
            <button 
              onClick={() => window.location.href = '/'}
              className="underline hover:text-foreground transition-colors"
            >
              Visit the full Knowledge Base
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}