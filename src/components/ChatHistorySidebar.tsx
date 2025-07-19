import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Folder, MessageSquare, MoreHorizontal, Trash2, FolderPlus, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ChatFolder {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface Conversation {
  id: string;
  title: string;
  folder_id: string | null;
  thread_id: string | null;
  last_message_at: string;
  created_at: string;
}

interface ChatHistorySidebarProps {
  currentConversationId: string | null;
  onConversationSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  className?: string;
}

// Draggable conversation component
interface DraggableConversationProps {
  conversation: Conversation;
  currentConversationId: string | null;
  onConversationSelect: (conversation: Conversation) => void;
  formatDate: (dateString: string) => string;
  folders: ChatFolder[];
  moveConversationToFolder: (conversationId: string, folderId: string | null) => void;
  deleteConversation: (conversationId: string) => void;
}

const DraggableConversation = ({ 
  conversation, 
  currentConversationId, 
  onConversationSelect, 
  formatDate, 
  folders,
  moveConversationToFolder,
  deleteConversation 
}: DraggableConversationProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: conversation.id,
    data: {
      type: 'conversation',
      conversation,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
        currentConversationId === conversation.id ? 'bg-muted' : ''
      } ${isDragging ? 'z-50' : ''}`}
      onClick={() => onConversationSelect(conversation)}
    >
      <MessageSquare className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{conversation.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(conversation.last_message_at)}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={(e) => {
                e.stopPropagation();
                moveConversationToFolder(conversation.id, folder.id);
              }}
            >
              <Folder className="h-4 w-4 mr-2" style={{ color: folder.color }} />
              Move to {folder.name}
            </DropdownMenuItem>
          ))}
          {conversation.folder_id && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                moveConversationToFolder(conversation.id, null);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Move to root
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              deleteConversation(conversation.id);
            }}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// Droppable folder component
interface DroppableFolderProps {
  folder: ChatFolder;
  isActive: boolean;
  folderConversations: Conversation[];
  currentConversationId: string | null;
  onConversationSelect: (conversation: Conversation) => void;
  formatDate: (dateString: string) => string;
  folders: ChatFolder[];
  moveConversationToFolder: (conversationId: string, folderId: string | null) => void;
  deleteConversation: (conversationId: string) => void;
  setFolders: React.Dispatch<React.SetStateAction<ChatFolder[]>>;
  toast: any;
}

const DroppableFolder = ({
  folder,
  isActive,
  folderConversations,
  currentConversationId,
  onConversationSelect,
  formatDate,
  folders,
  moveConversationToFolder,
  deleteConversation,
  setFolders,
  toast
}: DroppableFolderProps) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const navigate = useNavigate();
  const { isOver, setNodeRef } = useDroppable({
    id: folder.id,
    data: {
      type: 'folder',
      folder,
    },
  });

  return (
    <div 
      ref={setNodeRef}
      className={`border rounded-lg p-3 transition-all ${
        isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
      } ${isOver ? 'border-primary bg-primary/10 shadow-lg' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => navigate(`/project/${folder.id}`)}
        >
          <Folder 
            className="h-4 w-4 flex-shrink-0" 
            style={{ color: folder.color }} 
          />
          <span className="font-medium text-sm">{folder.name}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={async () => {
                setIsRenaming(true);
                setNewName(folder.name);
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Rename Project
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const { error } = await supabase
                    .from('chat_folders')
                    .delete()
                    .eq('id', folder.id);

                  if (error) throw error;

                  // Move conversations back to root
                  await supabase
                    .from('conversations')
                    .update({ folder_id: null })
                    .eq('folder_id', folder.id);

                  setFolders(prev => prev.filter(f => f.id !== folder.id));
                  
                  toast({
                    title: "Project deleted",
                    description: "Project deleted and chats moved to root.",
                  });
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to delete project",
                    variant: "destructive",
                  });
                }
              }}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Rename input */}
      {isRenaming && (
        <div className="mb-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={async (e) => {
              if (e.key === 'Enter') {
                try {
                  const { error } = await supabase
                    .from('chat_folders')
                    .update({ name: newName.trim() })
                    .eq('id', folder.id);

                  if (error) throw error;

                  setFolders(prev => prev.map(f => 
                    f.id === folder.id ? { ...f, name: newName.trim() } : f
                  ));
                  setIsRenaming(false);
                  
                  toast({
                    title: "Project renamed",
                    description: `Project renamed to "${newName.trim()}".`,
                  });
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to rename project",
                    variant: "destructive",
                  });
                }
              }
              if (e.key === 'Escape') {
                setIsRenaming(false);
                setNewName(folder.name);
              }
            }}
            onBlur={() => {
              setIsRenaming(false);
              setNewName(folder.name);
            }}
            className="text-sm"
            autoFocus
          />
        </div>
      )}
      
      {/* Project Stats */}
      <div className="text-xs text-muted-foreground mb-3">
        {folderConversations.length} chat{folderConversations.length !== 1 ? 's' : ''}
        {isOver && <span className="ml-2 text-primary">Drop here to add to project</span>}
      </div>

      {/* Recent chats in project - hidden for simplified view */}
    </div>
  );
};

export const ChatHistorySidebar = ({ 
  currentConversationId, 
  onConversationSelect, 
  onNewConversation,
  className = ""
}: ChatHistorySidebarProps) => {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const draggedConversation = active.data.current?.conversation;
    const droppedOnFolder = over.data.current?.folder;

    if (draggedConversation && droppedOnFolder) {
      moveConversationToFolder(draggedConversation.id, droppedOnFolder.id);
    } else if (draggedConversation && over.id === 'root-conversations') {
      moveConversationToFolder(draggedConversation.id, null);
    }
  };

  useEffect(() => {
    loadFoldersAndConversations();
  }, []);

  const loadFoldersAndConversations = async () => {
    try {
      setLoading(true);
      
      // Load folders
      const { data: foldersData, error: foldersError } = await supabase
        .from('chat_folders')
        .select('*')
        .order('sort_order', { ascending: true });

      if (foldersError) throw foldersError;

      // Load conversations
      const { data: conversationsData, error: conversationsError } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (conversationsError) throw conversationsError;

      setFolders(foldersData || []);
      setConversations(conversationsData || []);
    } catch (error) {
      console.error('Error loading chat data:', error);
      toast({
        title: "Error",
        description: "Failed to load chat history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('chat_folders')
        .insert([{
          user_id: user.id,
          name: newFolderName.trim(),
          color: '#6366f1',
          sort_order: folders.length
        }])
        .select()
        .single();

      if (error) throw error;

      // Immediately update local state
      setFolders(prev => [...prev, data]);
      setNewFolderName("");
      setIsNewFolderDialogOpen(false);
      
      toast({
        title: "Folder created",
        description: `Folder "${newFolderName}" has been created.`,
      });

      // Force a refresh to ensure UI is updated
      setTimeout(() => {
        loadFoldersAndConversations();
      }, 100);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      });
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      toast({
        title: "Conversation deleted",
        description: "The conversation has been deleted.",
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
    }
  };

  const moveConversationToFolder = async (conversationId: string, folderId: string | null) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ folder_id: folderId })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId 
            ? { ...c, folder_id: folderId }
            : c
        )
      );

      toast({
        title: "Conversation moved",
        description: folderId ? "Conversation moved to folder." : "Conversation moved to root.",
      });
    } catch (error) {
      console.error('Error moving conversation:', error);
      toast({
        title: "Error",
        description: "Failed to move conversation",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 7 * 24) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getConversationsInFolder = (folderId: string | null) => {
    return conversations.filter(c => c.folder_id === folderId);
  };

  const renderConversations = (folderConversations: Conversation[]) => {
    return folderConversations.map((conversation) => (
      <div
        key={conversation.id}
        className={`group relative flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
          currentConversationId === conversation.id ? 'bg-muted' : ''
        }`}
        onClick={() => onConversationSelect(conversation)}
      >
        <MessageSquare className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{conversation.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(conversation.last_message_at)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onClick={(e) => {
                  e.stopPropagation();
                  moveConversationToFolder(conversation.id, folder.id);
                }}
              >
                <Folder className="h-4 w-4 mr-2" style={{ color: folder.color }} />
                Move to {folder.name}
              </DropdownMenuItem>
            ))}
            {conversation.folder_id && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  moveConversationToFolder(conversation.id, null);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Move to root
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(conversation.id);
              }}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ));
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chat Projects
            </CardTitle>
            <div className="flex gap-1">
              <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Project name (e.g., B2C Tenders, Care Plans)"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsNewFolderDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={createFolder} disabled={!newFolderName.trim()}>
                        Create Project
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onNewConversation}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="p-3 space-y-2">
              {/* Enhanced Projects (Folders) - ChatGPT Style with Drop Zones */}
              {folders.map((folder) => {
                const folderConversations = getConversationsInFolder(folder.id);
                const isActive = folderConversations.some(c => c.id === currentConversationId);

                return (
                  <DroppableFolder 
                    key={folder.id} 
                    folder={folder} 
                    isActive={isActive}
                    folderConversations={folderConversations}
                    currentConversationId={currentConversationId}
                    onConversationSelect={onConversationSelect}
                    formatDate={formatDate}
                    folders={folders}
                    moveConversationToFolder={moveConversationToFolder}
                    deleteConversation={deleteConversation}
                    setFolders={setFolders}
                    toast={toast}
                  />
                );
              })}

              {/* Recent Conversations (Root level) with Drag functionality */}
              {getConversationsInFolder(null).length > 0 && (
                <div 
                  id="root-conversations"
                  className="space-y-1 border-2 border-dashed border-transparent p-2 rounded-lg transition-colors hover:border-muted-foreground/20"
                >
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 mt-4">Recent Chats</h4>
                  <SortableContext
                    items={getConversationsInFolder(null).map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {getConversationsInFolder(null).slice(0, 5).map((conversation) => (
                      <DraggableConversation
                        key={conversation.id}
                        conversation={conversation}
                        currentConversationId={currentConversationId}
                        onConversationSelect={onConversationSelect}
                        formatDate={formatDate}
                        folders={folders}
                        moveConversationToFolder={moveConversationToFolder}
                        deleteConversation={deleteConversation}
                      />
                    ))}
                  </SortableContext>
                </div>
              )}

              {conversations.length === 0 && folders.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground">Start a new chat or create a project</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </DndContext>
  );
};