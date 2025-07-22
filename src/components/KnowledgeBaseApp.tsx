import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResizableSidebar } from "./ResizableSidebar";
import { RealDashboard } from "./RealDashboard";
import { RecentlyUpdatedPage } from "./RecentlyUpdatedPage";
import { TagsPage } from "./TagsPage";
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
import { ChatPage } from "./ChatPage";
import { RecommendedReadingSection } from "./RecommendedReadingSection";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

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
  const [recommendedReading, setRecommendedReading] = useState<Array<{
    id?: string;
    title: string;
    description: string;
    type: 'link' | 'file' | 'document' | 'guide' | 'reference';
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
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
        } = await supabase.from('pages').select('is_public, public_token').eq('id', currentPage.id).single();
        if (error) throw error;
        if (data) {
          setIsPublic(data.is_public || false);
          setPublicToken(data.public_token || '');
        }

        // Fetch recommended reading from the page's recommended_reading field
        if (currentPage.recommended_reading && Array.isArray(currentPage.recommended_reading)) {
          const validReading = currentPage.recommended_reading.map((item: any) => ({
            ...item,
            // Default to 'link' if type is not one of the expected values
            type: ['link', 'file', 'document', 'guide', 'reference'].includes(item.type) ? item.type : 'link',
            // Ensure category is included
            category: item.category || 'General'
          }));
          setRecommendedReading(validReading);
        } else {
          setRecommendedReading([]);
        }
      } catch (error) {
        console.error('Error fetching page settings:', error);
      }
    };
    fetchPageSettings();
  }, [currentPage.id, currentPage.recommended_reading, currentPage.lastUpdated]);
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
      <div className="max-w-none mx-8 p-6">
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
          __html: cleanContent.split('RECOMMENDED_READING:')[0]
        }} />
        </div>

        {/* Recommended Reading Section */}
        <RecommendedReadingSection items={recommendedReading} orderedCategories={currentPage.category_order} onItemClick={item => {
        console.log('Recommended reading item clicked:', item);
      }} />
      </div>
    </div>;
}
type ViewMode = 'dashboard' | 'editor' | 'page' | 'recent' | 'tags' | 'settings' | 'whiteboard' | 'user-management' | 'chat';
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
  parent_page_id?: string | null;
  space_id?: string | null;
  recommended_reading?: Array<{
    id?: string;
    title: string;
    description: string;
    type: string;
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
  }>;
  category_order?: string[];
}
interface BreadcrumbData {
  id: string;
  title: string;
  type: 'space' | 'page';
}
export function KnowledgeBaseApp() {
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [selectedItemId, setSelectedItemId] = useState<string>('home');
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
  const [createPageParentId, setCreatePageParentId] = useState<string | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbData[]>([]);
  const navigate = useNavigate();
  const { pageId, viewName } = useParams();
  const {
    user,
    loading,
    signOut
  } = useAuth();
  const {
    toast
  } = useToast();

  // Handle URL parameters for email confirmation and password reset on component mount
  useEffect(() => {
    const handleUrlParams = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlHash = window.location.hash;
      
      // Check for password reset first
      if (urlHash.includes('type=recovery') || urlParams.get('type') === 'recovery') {
        console.log('Password reset detected - redirecting to reset page');
        navigate('/reset-password');
        return;
      }
      
      // Check for confirmation error
      if (urlParams.get('error') === 'access_denied' || urlParams.get('error_description')) {
        toast({
          title: "Confirmation failed",
          description: urlParams.get('error_description') || "Email confirmation failed. Please try again.",
          variant: "destructive",
        });
        
        // Clean up URL
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return;
      }
      
      // Check for successful email confirmation
      if (urlParams.get('type') === 'signup' || urlHash.includes('type=signup')) {
        // The auth hook will handle the success message
        console.log('Email confirmation process detected');
      }
    };

    handleUrlParams();
  }, [toast, navigate]);

  // Handle URL parameters for page and view routing
  useEffect(() => {
    const initializeFromUrl = async () => {
      if (!user) return; // Wait for authentication
      
      if (pageId) {
        // Navigate to specific page
        await handleItemSelect({
          id: pageId,
          title: '',
          type: 'page'
        });
      } else if (viewName) {
        // Navigate to specific view
        const viewMap: Record<string, ViewMode> = {
          'dashboard': 'dashboard',
          'recent': 'recent',
          'tags': 'tags',
          'settings': 'settings',
          'whiteboard': 'whiteboard',
          'user-management': 'user-management',
          'chat': 'chat'
        };
        
        if (viewMap[viewName]) {
          setCurrentView(viewMap[viewName]);
          setSelectedItemId(viewName === 'dashboard' ? 'home' : viewName);
          setCurrentPage(null);
          setBreadcrumbs([]);
        }
      } else if (currentView === 'dashboard' && !pageId && !viewName) {
        // Default to dashboard if no URL parameters
        setCurrentView('dashboard');
        setSelectedItemId('home');
        setCurrentPage(null);
        setBreadcrumbs([]);
      }
    };

    initializeFromUrl();
  }, [pageId, viewName, user]);

  // Build breadcrumb hierarchy
  const buildBreadcrumbs = async (page: Page): Promise<BreadcrumbData[]> => {
    const breadcrumbPath: BreadcrumbData[] = [];
    let currentPageData = page;
    try {
      // Build path by following parent relationships
      while (currentPageData.parent_page_id || currentPageData.space_id) {
        if (currentPageData.parent_page_id) {
          // Get parent page
          const {
            data: parentPage,
            error
          } = await supabase.from('pages').select('id, title, parent_page_id, space_id').eq('id', currentPageData.parent_page_id).single();
          if (error) break;
          if (parentPage) {
            breadcrumbPath.unshift({
              id: parentPage.id,
              title: parentPage.title,
              type: 'page'
            });
            currentPageData = {
              ...currentPageData,
              parent_page_id: parentPage.parent_page_id,
              space_id: parentPage.space_id
            };
          }
        } else if (currentPageData.space_id) {
          // Get space
          const {
            data: space,
            error
          } = await supabase.from('spaces').select('id, name').eq('id', currentPageData.space_id).single();
          if (error) break;
          if (space) {
            breadcrumbPath.unshift({
              id: space.id,
              title: space.name,
              type: 'space'
            });
          }
          break; // Spaces are root level
        }
      }
    } catch (error) {
      console.error('Error building breadcrumbs:', error);
    }
    return breadcrumbPath;
  };

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
      setBreadcrumbs([]);
      navigate('/');
    } else if (item.id === 'recent') {
      setCurrentView('recent');
      setCurrentPage(null);
      setBreadcrumbs([]);
      navigate('/view/recent');
    } else if (item.id === 'tags') {
      setCurrentView('tags');
      setCurrentPage(null);
      setBreadcrumbs([]);
      navigate('/view/tags');
    } else if (item.id === 'settings') {
      setCurrentView('settings');
      setCurrentPage(null);
      setBreadcrumbs([]);
      navigate('/view/settings');
    } else if (item.id === 'whiteboard') {
      setCurrentView('whiteboard');
      setCurrentPage(null);
      setBreadcrumbs([]);
      navigate('/view/whiteboard');
    } else if (item.id === 'user-management') {
      setCurrentView('user-management');
      setCurrentPage(null);
      setBreadcrumbs([]);
      navigate('/view/user-management');
    } else if (item.id === 'chat') {
      setCurrentView('chat');
      setCurrentPage(null);
      setBreadcrumbs([]);
      navigate('/view/chat');
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
            recommended_reading,
            category_order,
            parent_page_id,
            space_id
          `).eq('id', item.id).single();
        if (error) throw error;
        if (data) {
          const pageData = {
            id: data.id,
            title: data.title,
            content: data.content,
            lastUpdated: data.updated_at,
            author: 'User',
            parent_page_id: data.parent_page_id,
            space_id: data.space_id,
            recommended_reading: data.recommended_reading as any || [],
            category_order: data.category_order as string[] || []
          };
          setCurrentPage(pageData);
          setCurrentView('page');
          setIsEditing(false);

          // Build breadcrumbs for this page
          const breadcrumbPath = await buildBreadcrumbs(pageData);
          setBreadcrumbs(breadcrumbPath);

          // Increment view count
          await supabase.from('pages').update({
            view_count: (data.view_count || 0) + 1
          }).eq('id', data.id);

          // Update URL
          navigate(`/page/${data.id}`);
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
    if (!user) {
      console.error('No user found when trying to create page');
      toast({
        title: "Authentication required",
        description: "Please log in to create pages.",
        variant: "destructive"
      });
      return;
    }
    
    console.log('Creating page for user:', user.id);
    
    // Check current session and refresh if needed
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    console.log('Current session:', {
      session: session.session ? 'exists' : 'null',
      error: sessionError
    });
    
    if (!session?.session || sessionError) {
      console.error('No valid session found', sessionError);
      
      // Try to refresh the session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      console.log('Refresh attempt:', { refreshData, refreshError });
      
      if (refreshError || !refreshData.session) {
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive"
        });
        return;
      }
    }
    
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
      
      // Test if we can insert into pages table first
      console.log('Testing page creation with:', {
        title: 'Untitled Page',
        content: '',
        tags: [],
        created_by: user.id,
        parent_page_id: parentId || null
      });
      
      const {
        data,
        error
      } = await supabase.from('pages').insert({
        title: 'Untitled Page',
        content: '',
        tags: [],
        created_by: user.id,
        parent_page_id: parentId || null
      }).select().single();
      
      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Page created successfully:', data);

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
      navigate(`/page/${data.id}`);
      toast({
        title: "Page created",
        description: "New page created. Start editing!"
      });
    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: "Error creating page",
        description: `Failed to create page: ${error.message || 'Unknown error'}`,
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
    type?: string;
    category?: string;
  }>, orderedCategories?: string[], tags?: string[]) => {
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
          recommended_reading: recommendedReading || [],
          category_order: orderedCategories || [],
          tags: tags || [],
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
        toast({
          title: "Page created and saved",
          description: `"${title}" has been created with all content, tags, and recommended reading saved.`
        });
      } else {
        // Update existing page
        const {
          error
        } = await supabase.from('pages').update({
          title,
          content,
          recommended_reading: recommendedReading || [],
          category_order: orderedCategories || [],
          tags: tags || [],
          updated_at: new Date().toISOString()
        }).eq('id', currentPage.id);
        if (error) throw error;
        
        // Update the current page state with the new data
        setCurrentPage({
          ...currentPage,
          title,
          content,
          lastUpdated: new Date().toISOString(),
          recommended_reading: (recommendedReading || []).map(item => ({
            ...item,
            type: item.type || (item.url ? 'link' : 'file'),
            category: item.category || 'General'
          })),
          category_order: orderedCategories || []
        });
        
        toast({
          title: "Page saved",
          description: `"${title}" has been saved with all content, tags, and recommended reading preserved.`
        });
      }
      
      // Force a refresh of the page hierarchy and navigate to view mode
      setIsEditing(false);
      setCurrentView('page');
      
      // Trigger a window event to refresh the sidebar
      window.dispatchEvent(new CustomEvent('pagesChanged'));
      
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
  
  const handlePageSaved = async () => {
    if (!currentPage) return;
    
    // Fetch the latest page data from the database
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('id', currentPage.id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        // Update the current page with fresh data
        setCurrentPage({
          id: data.id,
          title: data.title,
          content: data.content,
          lastUpdated: data.updated_at,
          author: 'User',
          parent_page_id: data.parent_page_id,
          space_id: data.space_id,
          recommended_reading: (data.recommended_reading as any[] || []).map((item: any) => ({
            id: item.id,
            title: item.title || '',
            description: item.description || '',
            type: item.type || 'link',
            url: item.url,
            fileUrl: item.fileUrl,
            fileName: item.fileName,
            category: item.category || 'General'
          })),
          category_order: data.category_order || []
        });
      }
      
      // Switch to view mode
      setIsEditing(false);
      setCurrentView('page');
      
    } catch (error) {
      console.error('Error refreshing page data:', error);
      // Fall back to preview mode even if refresh fails
      setIsEditing(false);
      setCurrentView('page');
    }
  };
  return <div className="flex h-screen bg-background">
      <ResizableSidebar onItemSelect={handleItemSelect} selectedId={selectedItemId} onCreatePage={handleCreatePage} onCreateSubPage={handleCreateSubPage} onCreatePageInEditor={handleCreatePageInEditor} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header with user info */}
        <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(currentView === 'page' || currentView === 'editor') && currentPage && breadcrumbs.length > 0 ? <Breadcrumb>
                  <BreadcrumbList>
                    {breadcrumbs.map((crumb, index) => <div key={crumb.id} className="flex items-center">
                        <BreadcrumbItem>
                          <BreadcrumbLink 
                            className="cursor-pointer text-muted-foreground hover:text-foreground" 
                            onClick={() => handleItemSelect({
                              id: crumb.id,
                              title: crumb.title,
                              type: crumb.type === 'space' ? 'space' : 'page'
                            })}
                          >
                            {crumb.title}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                      </div>)}
                    {breadcrumbs.length > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-semibold text-foreground">
                        {currentPage.title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb> : <h2 className="text-lg font-semibold text-black/0">
                  {currentView === 'dashboard' ? 'Dashboard' : currentView === 'recent' ? 'Recently Updated' : currentView === 'tags' ? 'Tags' : currentView === 'settings' ? 'Settings' : currentView === 'whiteboard' ? 'Whiteboard' : currentView === 'user-management' ? 'User Management' : currentView === 'chat' ? 'Care Cuddle AI' : 'Care Cuddle Academy'}
                </h2>}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-sm text-muted-foreground hover:text-foreground px-2"
                onClick={() => setCurrentView('settings')}
              >
                {user?.user_metadata?.display_name || user?.email}
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {currentView === 'dashboard' && <RealDashboard onCreatePage={handleCreatePage} onPageSelect={handlePageSelect} />}

        {currentView === 'recent' && <RecentlyUpdatedPage onPageSelect={handlePageSelect} />}

        {currentView === 'tags' && <TagsPage onPageSelect={handlePageSelect} />}

        

        {currentView === 'settings' && <SettingsPage onClose={() => setCurrentView('dashboard')} />}

        {currentView === 'whiteboard' && <WhiteboardCanvas />}
        {currentView === 'user-management' && <UserManagement />}
        {currentView === 'chat' && <ChatPage />}
        
        {currentView === 'editor' && currentPage && <EnhancedContentEditor title={currentPage.title} content={currentPage.content} onSave={handleSavePage} onPreview={handlePreview} isEditing={isEditing} pageId={currentPage.id} onPageSaved={handlePageSaved} />}
        
        {currentView === 'page' && currentPage && <PageView currentPage={currentPage} onEditPage={handleEditPage} setPermissionsDialogOpen={setPermissionsDialogOpen} onPageSelect={handlePageSelect} />}
      </div>

      {/* Create Page Dialog */}
      <CreatePageDialog open={createPageDialogOpen} onOpenChange={setCreatePageDialogOpen} onPageCreated={handlePageCreated} initialParentId={createPageParentId} />

      {/* Page Permissions Dialog */}
      {currentPage && <PagePermissionsDialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen} pageId={currentPage.id} pageTitle={currentPage.title} />}
    </div>;
}
