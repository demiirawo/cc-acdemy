import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Folder, MessageSquare, MoreHorizontal, Edit2, Trash2, FolderPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  refreshTrigger?: number; // Add a trigger to refresh the sidebar
  className?: string;
}

export const ChatHistorySidebar = ({ 
  currentConversationId, 
  onConversationSelect, 
  onNewConversation,
  refreshTrigger = 0,
  className = ""
}: ChatHistorySidebarProps) => {
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadFoldersAndConversations();
  }, []);

  // Refresh when the trigger changes (new conversation created)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadFoldersAndConversations();
    }
  }, [refreshTrigger]);

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
      console.log('Creating folder with name:', newFolderName.trim());
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found when creating folder');
        throw new Error('User not authenticated');
      }

      console.log('User found:', user.id);

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

      if (error) {
        console.error('Database error creating folder:', error);
        throw error;
      }

      console.log('Folder created successfully:', data);

      // Add the new folder to the state immediately
      setFolders(prev => {
        const newFolders = [...prev, data];
        console.log('Updated folders state:', newFolders);
        return newFolders;
      });
      setNewFolderName("");
      setIsNewFolderDialogOpen(false);
      
      // Also trigger a full refresh to ensure consistency
      setTimeout(() => {
        loadFoldersAndConversations();
      }, 100);
      
      toast({
        title: "Folder created",
        description: `Folder "${newFolderName.trim()}" has been created.`,
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create folder",
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
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat History
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
                  <DialogTitle>Create New Folder</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Folder name"
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
                      Create
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
          <div className="p-3 space-y-3">
            {/* Root conversations (no folder) */}
            {getConversationsInFolder(null).length > 0 && (
              <div className="space-y-1">
                {renderConversations(getConversationsInFolder(null))}
              </div>
            )}

            {/* Folders with their conversations */}
            {folders.map((folder) => {
              const folderConversations = getConversationsInFolder(folder.id);
              if (folderConversations.length === 0) return null;

              return (
                <div key={folder.id} className="space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Folder 
                      className="h-4 w-4 flex-shrink-0" 
                      style={{ color: folder.color }} 
                    />
                    <span className="text-sm font-medium">{folder.name}</span>
                  </div>
                  <div className="pl-6 space-y-1">
                    {renderConversations(folderConversations)}
                  </div>
                </div>
              );
            })}

            {conversations.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground">Start a new chat to begin</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};