import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MessageSquare, Folder, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProjectChatPage } from "./ProjectChatPage";

interface ChatFolder {
  id: string;
  name: string;
  color: string;
  description?: string;
  project_type: string;
  settings: any;
}

interface Conversation {
  id: string;
  title: string;
  folder_id: string | null;
  thread_id: string | null;
  last_message_at: string;
  created_at: string;
}

interface ProjectInstructions {
  id: string;
  title: string;
  content: string;
  type: string;
}

const ProjectView = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [project, setProject] = useState<ChatFolder | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [instructions, setInstructions] = useState<ProjectInstructions[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      fetchProjectData();
    }
  }, [projectId]);

  const fetchProjectData = async () => {
    try {
      // Fetch project details
      const { data: projectData, error: projectError } = await supabase
        .from('chat_folders')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Fetch conversations in this project
      const { data: conversationsData, error: conversationsError } = await supabase
        .from('conversations')
        .select('*')
        .eq('folder_id', projectId)
        .order('last_message_at', { ascending: false });

      if (conversationsError) throw conversationsError;
      setConversations(conversationsData || []);

      // Fetch project instructions
      const { data: instructionsData, error: instructionsError } = await supabase
        .from('project_instructions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (instructionsError) throw instructionsError;
      setInstructions(instructionsData || []);

    } catch (error: any) {
      console.error('Error fetching project data:', error);
      toast({
        title: "Error",
        description: "Failed to load project data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createNewProjectConversation = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          title: `New chat in ${project?.name}`,
          folder_id: projectId,
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (error) throw error;

      setConversations(prev => [data, ...prev]);
      setCurrentConversationId(data.id);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create new conversation",
        variant: "destructive",
      });
    }
  };

  const handleConversationSelect = (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-muted-foreground mb-4">Project not found</div>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  if (currentConversationId) {
      return (
        <ProjectChatPage 
          conversationId={currentConversationId}
          onBack={() => setCurrentConversationId(null)}
          projectContext={project}
        />
      );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
            style={{ backgroundColor: project.color }}
          >
            <Folder className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Project Sidebar */}
        <div className="w-80 border-r bg-muted/50 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Project Instructions */}
              {instructions.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Instructions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {instructions.map((instruction) => (
                      <div key={instruction.id} className="text-sm text-muted-foreground">
                        {instruction.content}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Chats in Project */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Chats in this project</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleConversationSelect(conversation)}
                    >
                      <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {conversation.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(conversation.last_message_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div 
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white"
                style={{ backgroundColor: project.color }}
              >
                <Folder className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">{project.name}</h2>
              <p className="text-muted-foreground mb-6">
                {project.description || 'Start a conversation in this project to begin collaborating with AI using your project context.'}
              </p>
              <Button onClick={createNewProjectConversation} className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Start New Chat
              </Button>
            </div>
          </div>

          {/* Message Input */}
          <div className="border-t p-4">
            <div className="max-w-3xl mx-auto">
              <div 
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={createNewProjectConversation}
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Message {project.name}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectView;