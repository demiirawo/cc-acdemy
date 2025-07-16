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
import { LogOut, Settings as SettingsIcon, Shield } from "lucide-react";

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
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();

  // Show auth form if not logged in
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-hero">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-primary/20 rounded-lg mx-auto mb-4"></div>
          <div className="h-4 bg-primary/20 rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
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
        const { data, error } = await supabase
          .from('pages')
          .select(`
            id,
            title,
            content,
            updated_at,
            view_count,
            created_by
          `)
          .eq('id', item.id)
          .single();

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
          await supabase
            .from('pages')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', data.id);
        }
      } catch (error) {
        console.error('Error fetching page:', error);
        toast({
          title: "Error loading page",
          description: "Failed to load page content.",
          variant: "destructive",
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

  const handleCreateFolder = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('spaces')
        .insert({
          name: 'New Folder',
          description: '',
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Folder created",
        description: `"${data.name}" has been created successfully.`,
      });

      // Refresh sidebar to show new folder
      window.location.reload();
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error creating folder",
        description: "Failed to create folder. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreatePageInEditor = async (parentId?: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('pages')
        .insert({
          title: 'Untitled Page',
          content: '',
          created_by: user.id,
          parent_page_id: parentId || null
        })
        .select()
        .single();

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
        description: "New page created. Start editing!",
      });
    } catch (error) {
      console.error('Error creating page:', error);
      toast({
        title: "Error creating page",
        description: "Failed to create page. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePageCreated = (pageId: string) => {
    // Navigate to the newly created page
    handleItemSelect({ id: pageId, title: '', type: 'page' });
  };

  const handleEditPage = () => {
    setIsEditing(true);
    setCurrentView('editor');
  };

  const handleSavePage = async (title: string, content: string) => {
    if (!currentPage || !user) return;

    try {
      if (currentPage.id === 'new') {
        // Create new page
        const { data, error } = await supabase
          .from('pages')
          .insert({
            title,
            content,
            created_by: user.id
          })
          .select()
          .single();

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
        const { error } = await supabase
          .from('pages')
          .update({
            title,
            content,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentPage.id);

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
        description: `"${title}" has been saved successfully.`,
      });
    } catch (error) {
      console.error('Error saving page:', error);
      toast({
        title: "Error saving page",
        description: "Failed to save page. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePreview = () => {
    setIsEditing(false);
    setCurrentView('page');
  };

  const handlePageSelect = (pageId: string) => {
    handleItemSelect({ id: pageId, title: '', type: 'page' });
  };

  return (
    <div className="flex h-screen bg-background">
      <ResizableSidebar
        onItemSelect={handleItemSelect}
        selectedId={selectedItemId}
        onCreatePage={handleCreatePage}
        onCreateSubPage={handleCreateSubPage}
        onCreateFolder={handleCreateFolder}
        onCreatePageInEditor={handleCreatePageInEditor}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header with user info */}
        <div className="border-b border-border p-4 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {currentView === 'dashboard' ? 'CC Learn' : 
               currentView === 'editor' ? 'Editor' : 
               currentView === 'recent' ? 'Recently Updated' :
               currentView === 'tags' ? 'Tags' :
               currentView === 'people' ? 'People' :
               currentView === 'settings' ? 'Settings' :
               currentView === 'whiteboard' ? 'Whiteboard' :
               currentPage?.title || 'Page'}
            </h2>
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

        {currentView === 'dashboard' && (
          <RealDashboard
            onCreatePage={handleCreatePage}
            onPageSelect={handlePageSelect}
          />
        )}

        {currentView === 'recent' && (
          <RecentlyUpdatedPage onPageSelect={handlePageSelect} />
        )}

        {currentView === 'tags' && (
          <TagsPage onPageSelect={handlePageSelect} />
        )}

        {currentView === 'people' && (
          <PeoplePage onPageSelect={handlePageSelect} />
        )}

        {currentView === 'settings' && (
          <SettingsPage onClose={() => setCurrentView('dashboard')} />
        )}

        {currentView === 'whiteboard' && (
          <WhiteboardPage />
        )}
        
        {currentView === 'editor' && currentPage && (
          <EnhancedContentEditor
            title={currentPage.title}
            content={currentPage.content}
            onSave={handleSavePage}
            onPreview={handlePreview}
            isEditing={isEditing}
            pageId={currentPage.id}
          />
        )}
        
        {currentView === 'page' && currentPage && (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-4xl font-bold text-foreground">{currentPage.title}</h1>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPermissionsDialogOpen(true)}
                      className="flex items-center gap-2"
                    >
                      <Shield className="h-4 w-4" />
                      Permissions
                    </Button>
                    <Button
                      onClick={handleEditPage}
                      className="bg-gradient-primary"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Last updated {new Date(currentPage.lastUpdated).toLocaleDateString()} by {currentPage.author}
                </div>
              </div>
              
              <div className="prose prose-lg max-w-none">
                <div 
                  className="whitespace-pre-wrap text-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: currentPage.content.replace(/\n/g, '<br>') }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Page Dialog */}
      <CreatePageDialog
        open={createPageDialogOpen}
        onOpenChange={setCreatePageDialogOpen}
        onPageCreated={handlePageCreated}
        initialParentId={createPageParentId}
      />

      {/* Page Permissions Dialog */}
      {currentPage && (
        <PagePermissionsDialog
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
          pageId={currentPage.id}
          pageTitle={currentPage.title}
        />
      )}
    </div>
  );
}