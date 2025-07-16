import { useState } from "react";
import { KnowledgeBaseSidebar } from "./KnowledgeBaseSidebar";
import { Dashboard } from "./Dashboard";
import { ContentEditor } from "./ContentEditor";
import { useToast } from "@/hooks/use-toast";

type ViewMode = 'dashboard' | 'editor' | 'page';

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
  const { toast } = useToast();

  const handleItemSelect = (item: SidebarItem) => {
    setSelectedItemId(item.id);
    
    if (item.id === 'home') {
      setCurrentView('dashboard');
      setCurrentPage(null);
    } else if (item.type === 'page') {
      // In a real app, this would fetch the page data
      setCurrentPage({
        id: item.id,
        title: item.title,
        content: `# ${item.title}\n\nThis is a sample page content for ${item.title}. In a real application, this would be loaded from your database.\n\n## Overview\n\nThis page demonstrates the knowledge base functionality with:\n\n- Rich text editing capabilities\n- Hierarchical organization\n- Search functionality\n- Collaborative features\n\n## Getting Started\n\nTo begin using this knowledge base:\n\n1. Create your first page\n2. Organize content into spaces\n3. Invite team members\n4. Start collaborating!\n\n> **Note**: This is a demo page. Connect to Supabase to enable full functionality.`,
        lastUpdated: new Date().toISOString(),
        author: 'Demo User'
      });
      setCurrentView('page');
      setIsEditing(false);
    } else if (item.type === 'space') {
      setCurrentView('dashboard');
      setCurrentPage(null);
    }
  };

  const handleCreatePage = () => {
    setCurrentPage({
      id: 'new',
      title: 'Untitled Page',
      content: '',
      lastUpdated: new Date().toISOString(),
      author: 'Current User'
    });
    setCurrentView('editor');
    setIsEditing(true);
  };

  const handleEditPage = () => {
    setIsEditing(true);
    setCurrentView('editor');
  };

  const handleSavePage = (title: string, content: string) => {
    if (currentPage) {
      setCurrentPage({
        ...currentPage,
        title,
        content,
        lastUpdated: new Date().toISOString()
      });
      setIsEditing(false);
      setCurrentView('page');
      
      toast({
        title: "Page saved",
        description: `"${title}" has been saved successfully.`,
      });
    }
  };

  const handlePreview = () => {
    setIsEditing(false);
    setCurrentView('page');
  };

  const handlePageSelect = (pageId: string) => {
    // This would typically fetch the page data
    handleItemSelect({ id: pageId, title: `Page ${pageId}`, type: 'page' });
  };

  return (
    <div className="flex h-screen bg-background">
      <KnowledgeBaseSidebar
        onItemSelect={handleItemSelect}
        selectedId={selectedItemId}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentView === 'dashboard' && (
          <Dashboard
            onCreatePage={handleCreatePage}
            onPageSelect={handlePageSelect}
          />
        )}
        
        {currentView === 'editor' && currentPage && (
          <ContentEditor
            title={currentPage.title}
            content={currentPage.content}
            onSave={handleSavePage}
            onPreview={handlePreview}
            isEditing={isEditing}
          />
        )}
        
        {currentView === 'page' && currentPage && (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-4xl font-bold text-foreground">{currentPage.title}</h1>
                  <div className="flex gap-2">
                    <button
                      onClick={handleEditPage}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Last updated {new Date(currentPage.lastUpdated).toLocaleDateString()} by {currentPage.author}
                </div>
              </div>
              
              <div className="prose prose-lg max-w-none">
                <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                  {currentPage.content}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}