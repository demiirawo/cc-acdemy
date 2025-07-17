import { useState, useEffect } from "react";
import { ResizableSidebar } from "./ResizableSidebar";
import { RealDashboard } from "./RealDashboard";
import { RecentlyUpdatedPage } from "./RecentlyUpdatedPage";
import { TagsPage } from "./TagsPage";
import { PeoplePage } from "./PeoplePage";
import { EnhancedContentEditor } from "./EnhancedContentEditor";
import { CreatePageDialog } from "./CreatePageDialog";
import { PagePermissionsDialog } from "./PagePermissionsDialog";
import { SettingsPage } from "./SettingsPage";
import { WhiteboardCanvas } from "./WhiteboardCanvas";
import { AuthForm } from "./AuthForm";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LogOut, Settings as SettingsIcon, Shield, Globe, Lock, Copy, FileText } from "lucide-react";
import { UserManagement } from "./UserManagement";
import { RecommendedReadingList } from "./RecommendedReadingList";

// Page view component
function PageView({
  currentPage,
  onEditPage,
  setPermissionsDialogOpen,
  onPageSelect
}: {
  currentPage: Page;
  onEditPage: () => void;
  setPermissionsDialogOpen: (open: boolean) => void;
  onPageSelect: (pageId: string) => void;
}) {
  const [isPublic, setIsPublic] = useState(false);
  const [publicToken, setPublicToken] = useState('');
  const [relatedPages, setRelatedPages] = useState<Array<{
    id: string;
    title: string;
    content: string;
  }>>([]);
  const [recommendedReading, setRecommendedReading] = useState<Array<{
    id?: string;
    title: string;
    description: string;
    type: string;
  }>>([]);
  const { toast } = useToast();
  useEffect(() => {
    const fetchPageSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('is_public, public_token')
          .eq('id', currentPage.id)
          .single();
        
        if (error) throw error;
        if (data) {
          setIsPublic(data.is_public || false);
          setPublicToken(data.public_token || '');
        }

        // Fetch related pages (limit to 2)
        const { data: related, error: relatedError } = await supabase
          .from('pages')
          .select('id, title, content')
          .neq('id', currentPage.id)
          .limit(2);

        if (!relatedError && related) {
          setRelatedPages(related);
        }

        // Fetch recommended reading from the page's recommended_reading field
        if (currentPage.recommended_reading && Array.isArray(currentPage.recommended_reading)) {
          setRecommendedReading(currentPage.recommended_reading as Array<{
            id?: string;
            title: string;
            description: string;
            type: string;
          }>);
        } else {
          setRecommendedReading([]);
        }
      } catch (error) {
        console.error('Error fetching page settings:', error);
      }
    };
    
    fetchPageSettings();
  }, [currentPage.id]);
  const togglePublicAccess = async () => {
    try {
      const newIsPublic = !isPublic;
      const {
        error
      } = await supabase.from('pages').update({
        is_public: newIsPublic
      }).eq('id', currentPage.id);
      if (error) throw error;
      setIsPublic(newIsPublic);
      toast({
        title: newIsPublic ? "Page made public" : "Page made private",
        description: newIsPublic ? "Anyone can view this page" : "Only authorized users can view this page"
      });
    } catch (error) {
      console.error('Error updating public access:', error);
      toast({
        title: "Error",
        description: "Failed to update page visibility",
        variant: "destructive"
      });
    }
  };
  const copyPublicLink = () => {
    if (!publicToken) return;
    const publicUrl = `${window.location.origin}/public/${publicToken}`;
    navigator.clipboard.writeText(publicUrl);
    toast({
      title: "Link copied",
      description: "Public link copied to clipboard"
    });
  };
  
  const cleanContent = currentPage.content;
  return <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-bold text-foreground">{currentPage.title}</h1>
                {isPublic}
              </div>
              <div className="flex gap-2 items-center">
                
                
                {isPublic && publicToken && <Button variant="outline" size="sm" onClick={copyPublicLink}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Public Link
                  </Button>}
                
                <Button variant="outline" size="sm" onClick={() => setPermissionsDialogOpen(true)} className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Permissions
                </Button>
                <Button onClick={onEditPage} className="bg-gradient-primary">
                  Edit
                </Button>
              </div>
            </div>
          <div className="text-sm text-muted-foreground">
            Last updated {new Date(currentPage.lastUpdated).toLocaleDateString()} by {currentPage.author}
          </div>
        </div>
        
        <div className="prose prose-lg max-w-none">
          <div className="text-foreground leading-relaxed" dangerouslySetInnerHTML={{
          __html: cleanContent
        }} />
        </div>

        {/* Recommended Reading Section */}
        {recommendedReading.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border">
            <h3 className="text-xl font-semibold mb-6 text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recommended Reading
            </h3>
            <div className="space-y-4">
              {recommendedReading.map((item, index) => (
                <div 
                  key={item.id || index} 
                  className="group relative p-4 bg-gradient-to-r from-muted/30 to-muted/10 rounded-lg border border-border/50 hover:border-primary/30 transition-all duration-200 cursor-pointer hover:shadow-md"
                  onClick={() => item.id && onPageSelect(item.id)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground text-base mb-2 group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {item.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Content Section */}
        {relatedPages.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-foreground">Related content</h3>
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground font-medium">i</span>
              </div>
            </div>
            <div className="space-y-3">
              {relatedPages.map((page) => (
                <div key={page.id} className="flex items-center gap-3 p-4 border border-border rounded-lg bg-card hover:bg-muted/20 transition-colors cursor-pointer">
                  <div className="flex-shrink-0">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{page.title}</h4>
                    <p className="text-sm text-muted-foreground truncate">
                      {page.content.replace(/<[^>]*>/g, '').substring(0, 100)}...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>;
}
type ViewMode = 'dashboard' | 'editor' | 'page' | 'recent' | 'tags' | 'people' | 'settings' | 'whiteboard' | 'user-management';
interface SidebarItem {
  id: string;
  title: string;
  type: 'space' | 'page' | 'folder';
  icon?: any;
  children?: SidebarItem[];
  href?: string;
}
interface Page {
  id: string;
  title: string;
  content: string;
  lastUpdated: string;
  author: string;
  recommended_reading?: Array<{
    id?: string;
    title: string;
    description: string;
    type: string;
  }>;
}
export function KnowledgeBaseApp() {
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [selectedItemId, setSelectedItemId] = useState<string>('home');
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
  const [createPageParentId, setCreatePageParentId] = useState<string | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const {
    user,
    loading,
    signOut
  } = useAuth();
  const {
    toast
  } = useToast();

  // Show auth form if not logged in
  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gradient-hero">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-primary/20 rounded-lg mx-auto mb-4"></div>
          <div className="h-4 bg-primary/20 rounded w-32 mx-auto"></div>
        </div>
      </div>;
  }
  if (!user) {
    return <AuthForm onAuthStateChange={() => window.location.reload()} />;
  }
  const handleItemSelect = async (item: SidebarItem) => {
    setSelectedItemId(item.id);
    if (item.id === 'home') {
      setCurrentView('dashboard');
      setCurrentPage(null);
    } else if (item.id === 'recent') {
      setCurrentView('recent');
      setCurrentPage(null);
    } else if (item.id === 'tags') {
      setCurrentView('tags');
      setCurrentPage(null);
    } else if (item.id === 'people') {
      setCurrentView('people');
      setCurrentPage(null);
    } else if (item.id === 'settings') {
      setCurrentView('settings');
      setCurrentPage(null);
    } else if (item.id === 'whiteboard') {
      setCurrentView('whiteboard');
      setCurrentPage(null);
    } else if (item.id === 'user-management') {
      setCurrentView('user-management');
      setCurrentPage(null);
    } else if (item.type === 'page') {
      try {
        // Fetch real page data from Supabase
        const {
          data,
          error
        } = await supabase.from('pages').select(`
            id,
            title,
            content,
            updated_at,
            view_count,
            created_by,
            recommended_reading
          `).eq('id', item.id).single();
        if (error) throw error;
        if (data) {
          setCurrentPage({
            id: data.id,
            title: data.title,
            content: data.content,
            lastUpdated: data.updated_at,
            author: 'User',
            recommended_reading: (data.recommended_reading as any) || []
          });
          setCurrentView('page');
          setIsEditing(false);

          // Increment view count
          await supabase.from('pages').update({
            view_count: (data.view_count || 0) + 1
          }).eq('id', data.id);
        }
      } catch (error) {
        console.error('Error fetching page:', error);
        toast({
          title: "Error loading page",
          description: "Failed to load page content.",
          variant: "destructive"
        });
      }
    } else if (item.type === 'space') {
      setCurrentView('dashboard');
      setCurrentPage(null);
    }
  };
  const handleCreatePage = () => {
    handleCreatePageInEditor();
  };
  const handleCreateSubPage = (parentId: string) => {
    handleCreatePageInEditor(parentId);
  };
  const handleCreatePageInEditor = async (parentId?: string) => {
    if (!user) return;
    try {
      // Validate parentId if provided
      if (parentId) {
        const {
          data: parentExists
        } = await supabase.from('pages').select('id').eq('id', parentId).single();
        if (!parentExists) {
          parentId = null; // Reset if parent doesn't exist
        }
      }
      const {
        data,
        error
      } = await supabase.from('pages').insert({
        title: 'Untitled Page',
        content: '',
        created_by: user.id,
        parent_page_id: parentId || null
      }).select().single();
      if (error) throw error;

      // Navigate directly to editor
      setCurrentPage({
        id: data.id,
        title: data.title,
        content: data.content,
        lastUpdated: data.updated_at,
        author: 'User'
      });
      setIsEditing(true);
      setCurrentView('editor');
      setSelectedItemId(data.id);
      toast({
        title: "Page created",
        description: "New page created. Start editing!"
      });
    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: "Error creating page",
        description: "Failed to create page. Please try again.",
        variant: "destructive"
      });
    }
  };
  const handlePageCreated = (pageId: string) => {
    // Navigate to the newly created page
    handleItemSelect({
      id: pageId,
      title: '',
      type: 'page'
    });
  };
  const handleEditPage = () => {
    setIsEditing(true);
    setCurrentView('editor');
  };
  const handleSavePage = async (title: string, content: string, recommendedReading?: Array<{
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
  }>) => {
    if (!currentPage || !user) return;
    try {
      if (currentPage.id === 'new') {
        // Create new page
        const {
          data,
          error
        } = await supabase.from('pages').insert({
          title,
          content,
          created_by: user.id
        }).select().single();
        if (error) throw error;
        setCurrentPage({
          ...currentPage,
          id: data.id,
          title,
          content,
          lastUpdated: data.updated_at
        });
      } else {
        // Update existing page
        const {
          error
        } = await supabase.from('pages').update({
          title,
          content,
          updated_at: new Date().toISOString()
        }).eq('id', currentPage.id);
        if (error) throw error;
        setCurrentPage({
          ...currentPage,
          title,
          content,
          lastUpdated: new Date().toISOString()
        });
      }
      setIsEditing(false);
      setCurrentView('page');
      toast({
        title: "Page saved",
        description: `"${title}" has been saved successfully.`
      });
    } catch (error) {
      console.error('Error saving page:', error);
      toast({
        title: "Error saving page",
        description: "Failed to save page. Please try again.",
        variant: "destructive"
      });
    }
  };
  const handlePreview = () => {
    setIsEditing(false);
    setCurrentView('page');
  };
  const handlePageSelect = (pageId: string) => {
    handleItemSelect({
      id: pageId,
      title: '',
      type: 'page'
    });
  };
  return <div className="flex h-screen bg-background">
      <ResizableSidebar onItemSelect={handleItemSelect} selectedId={selectedItemId} onCreatePage={handleCreatePage} onCreateSubPage={handleCreateSubPage} onCreatePageInEditor={handleCreatePageInEditor} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header with user info */}
        <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">CC Learn</h2>
              {(currentView === 'page' || currentView === 'editor') && currentPage && <span className="text-muted-foreground">
                  / {currentPage.title}
                </span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {user?.user_metadata?.display_name || user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {currentView === 'dashboard' && <RealDashboard onCreatePage={handleCreatePage} onPageSelect={handlePageSelect} />}

        {currentView === 'recent' && <RecentlyUpdatedPage onPageSelect={handlePageSelect} />}

        {currentView === 'tags' && <TagsPage onPageSelect={handlePageSelect} />}

        {currentView === 'people' && <PeoplePage onPageSelect={handlePageSelect} />}

        {currentView === 'settings' && <SettingsPage onClose={() => setCurrentView('dashboard')} />}

        {currentView === 'whiteboard' && <WhiteboardCanvas />}
        {currentView === 'user-management' && <UserManagement />}
        
        {currentView === 'editor' && currentPage && <EnhancedContentEditor title={currentPage.title} content={currentPage.content} onSave={handleSavePage} onPreview={handlePreview} isEditing={isEditing} pageId={currentPage.id} />}
        
        {currentView === 'page' && currentPage && <PageView currentPage={currentPage} onEditPage={handleEditPage} setPermissionsDialogOpen={setPermissionsDialogOpen} onPageSelect={handlePageSelect} />}
      </div>

      {/* Create Page Dialog */}
      <CreatePageDialog open={createPageDialogOpen} onOpenChange={setCreatePageDialogOpen} onPageCreated={handlePageCreated} initialParentId={createPageParentId} />

      {/* Page Permissions Dialog */}
      {currentPage && <PagePermissionsDialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen} pageId={currentPage.id} pageTitle={currentPage.title} />}
    </div>;
}