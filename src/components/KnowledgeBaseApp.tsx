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
import { WhiteboardPage } from "./WhiteboardPage";
import { AuthForm } from "./AuthForm";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LogOut, Settings as SettingsIcon, Shield, Globe, Lock, Copy } from "lucide-react";

// Page view component
function PageView({
  currentPage,
  onEditPage,
  setPermissionsDialogOpen
}: {
  currentPage: Page;
  onEditPage: () => void;
  setPermissionsDialogOpen: (open: boolean) => void;
}) {
  const [isPublic, setIsPublic] = useState(false);
  const [publicToken, setPublicToken] = useState('');
  const [recommendedReading, setRecommendedReading] = useState<Array<{
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
  }>>([]);
  const {
    toast
  } = useToast();
  useEffect(() => {
    const fetchPageSettings = async () => {
      try {
        const {
          data,
          error
        } = await supabase.from('pages').select('is_public, public_token, content').eq('id', currentPage.id).single();
        if (error) throw error;
        if (data) {
          setIsPublic(data.is_public || false);
          setPublicToken(data.public_token || '');

          // Extract recommended reading from content
          try {
            if (data.content && data.content.includes('RECOMMENDED_READING:')) {
              const parts = data.content.split('RECOMMENDED_READING:');
              if (parts.length > 1) {
                const readingData = JSON.parse(parts[1]);
                setRecommendedReading(readingData);
              }
            }
          } catch (e) {
            console.log('No recommended reading data found');
          }
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
  const cleanContent = currentPage.content.split('RECOMMENDED_READING:')[0];
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
        {recommendedReading.length > 0 && <div className="mt-8 pt-8 border-t border-border">
            <h3 className="text-xl font-semibold mb-4 text-foreground">Recommended Reading</h3>
            <div className="space-y-3">
              {recommendedReading.map((item, index) => <div key={index} className="p-4 border rounded-lg bg-muted/20">
                  <h4 className="font-medium text-foreground mb-1">{item.title}</h4>
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm block mb-2">
                      {item.url}
                    </a>}
                  {item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm block mb-2">
                      📁 {item.fileName}
                    </a>}
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>)}
            </div>
          </div>}
      </div>
    </div>;
}
type ViewMode = 'dashboard' | 'editor' | 'page' | 'recent' | 'tags' | 'people' | 'settings' | 'whiteboard';
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
            created_by
          `).eq('id', item.id).single();
        if (error) throw error;
        if (data) {
          setCurrentPage({
            id: data.id,
            title: data.title,
            content: data.content,
            lastUpdated: data.updated_at,
            author: 'User'
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

        {currentView === 'whiteboard' && <WhiteboardPage />}
        
        {currentView === 'editor' && currentPage && <EnhancedContentEditor title={currentPage.title} content={currentPage.content} onSave={handleSavePage} onPreview={handlePreview} isEditing={isEditing} pageId={currentPage.id} />}
        
        {currentView === 'page' && currentPage && <PageView currentPage={currentPage} onEditPage={handleEditPage} setPermissionsDialogOpen={setPermissionsDialogOpen} />}
      </div>

      {/* Create Page Dialog */}
      <CreatePageDialog open={createPageDialogOpen} onOpenChange={setCreatePageDialogOpen} onPageCreated={handlePageCreated} initialParentId={createPageParentId} />

      {/* Page Permissions Dialog */}
      {currentPage && <PagePermissionsDialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen} pageId={currentPage.id} pageTitle={currentPage.title} />}
    </div>;
}