import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Eye, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RecommendedReadingSection } from "@/components/RecommendedReadingSection";

interface PublicPage {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  view_count: number;
  recommended_reading?: any[] | null;
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
        .select('id, title, content, updated_at, view_count, created_by, recommended_reading')
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

      const enrichedPage: PublicPage = {
        ...data,
        recommended_reading: Array.isArray(data.recommended_reading) ? data.recommended_reading : null,
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#5E18EB' }}>
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-white/20 rounded-lg mx-auto mb-4"></div>
          <div className="h-4 bg-white/20 rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#5E18EB' }}>
        <Card className="max-w-md w-full mx-4 bg-white">
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
    <div className="min-h-screen" style={{ backgroundColor: '#5E18EB' }}>
      {/* Header */}
      <div className="border-b border-white/20 bg-white/10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6 text-white/80" />
              <div>
                <div className="text-sm text-white/70">Public Page</div>
                <div className="font-medium text-white">Care Cuddle Academy</div>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.location.href = '/'}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Visit Care Cuddle Academy
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Card className="shadow-lg bg-white">
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
                className="text-foreground leading-relaxed [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-lg [&_iframe]:border [&_iframe]:border-border [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:mb-4 [&_ol]:mb-4 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:mb-4 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-4"
                dangerouslySetInnerHTML={{ 
                  __html: page.content
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Recommended Reading Section */}
        {page?.recommended_reading && page.recommended_reading.length > 0 && (
          <RecommendedReadingSection
            items={page.recommended_reading}
            onItemClick={(item) => {
              console.log('Recommended reading item clicked:', item);
            }}
          />
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-white/70">
          <p>
            This page is publicly shared from Care Cuddle Academy.{' '}
            <button 
              onClick={() => window.location.href = '/'}
              className="underline hover:text-white transition-colors"
            >
              Visit the full Care Cuddle Academy
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
