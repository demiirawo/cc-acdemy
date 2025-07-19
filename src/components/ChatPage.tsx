import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Send, MessageSquare, Bot, User, Paperclip, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChatHistorySidebar } from "./ChatHistorySidebar";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachedFiles?: AttachedFile[];
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string; // Text content for processing
}

interface Conversation {
  id: string;
  title: string;
  folder_id: string | null;
  thread_id: string | null;
  last_message_at: string;
  created_at: string;
}

export const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-cleanup old conversations
  useEffect(() => {
    const cleanupOldConversations = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get all conversations for the user, ordered by last_message_at
        const { data: conversations, error } = await supabase
          .from('conversations')
          .select('id, last_message_at')
          .eq('user_id', user.id)
          .is('folder_id', null) // Only cleanup conversations not in folders
          .order('last_message_at', { ascending: false });

        if (error) throw error;

        // If we have more than 30 conversations, delete the oldest ones
        if (conversations && conversations.length > 30) {
          const conversationsToDelete = conversations.slice(30);
          const idsToDelete = conversationsToDelete.map(c => c.id);
          
          // Delete messages first
          await supabase
            .from('chat_messages')
            .delete()
            .in('conversation_id', idsToDelete);
          
          // Then delete conversations
          await supabase
            .from('conversations')
            .delete()
            .in('id', idsToDelete);

          console.log(`Cleaned up ${conversationsToDelete.length} old conversations`);
        }
      } catch (error) {
        console.error('Error cleaning up old conversations:', error);
      }
    };

    // Run cleanup when component mounts
    cleanupOldConversations();
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} is not a supported file type. Please upload text, CSV, PDF, or Office documents.`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB. Please upload a smaller file.`,
          variant: "destructive",
        });
        continue;
      }

      try {
        let content = '';
        if (file.type === 'text/plain' || file.type === 'text/csv') {
          content = await file.text();
        }
        
        const attachedFile: AttachedFile = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          content: content || undefined
        };

        setAttachedFiles(prev => [...prev, attachedFile]);
        
        toast({
          title: "File attached",
          description: `${file.name} has been attached to your message.`,
        });
      } catch (error) {
        console.error('Error reading file:', error);
        toast({
          title: "Error reading file",
          description: `Could not read ${file.name}. Please try again.`,
          variant: "destructive",
        });
      }
    }
    
    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Conversation management functions
  const createNewConversation = async (firstMessage?: string): Promise<Conversation | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const title = firstMessage ? 
        (firstMessage.length > 50 ? firstMessage.substring(0, 50) + '...' : firstMessage) : 
        'New Conversation';

      const { data, error } = await supabase
        .from('conversations')
        .insert([{
          user_id: user.id,
          title,
          folder_id: null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
      return null;
    }
  };

  const saveMessageToDb = async (conversationId: string, message: Message) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          conversation_id: conversationId,
          role: message.role,
          content: message.content,
          attached_files: JSON.stringify(message.attachedFiles || [])
        }]);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const loadConversationMessages = async (conversation: Conversation) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const loadedMessages: Message[] = (data || []).map(msg => {
        let attachedFiles: AttachedFile[] | undefined = undefined;
        if (msg.attached_files) {
          try {
            const parsed = typeof msg.attached_files === 'string' 
              ? JSON.parse(msg.attached_files) 
              : msg.attached_files;
            if (Array.isArray(parsed) && parsed.length > 0) {
              attachedFiles = parsed;
            }
          } catch (error) {
            console.error('Error parsing attached files:', error);
          }
        }

        return {
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.created_at),
          attachedFiles
        };
      });

      setMessages(loadedMessages);
      setCurrentConversation(conversation);
      setThreadId(conversation.thread_id);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: "Error",
        description: "Failed to load conversation",
        variant: "destructive",
      });
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversation(null);
    setThreadId(null);
    setAttachedFiles([]);
    setInputMessage('');
  };

  const handleConversationSelect = (conversation: Conversation) => {
    loadConversationMessages(conversation);
  };

  const sendMessage = async () => {
    if ((!inputMessage.trim() && attachedFiles.length === 0) || isLoading) return;

    // Create conversation if this is the first message
    let conversation = currentConversation;
    if (!conversation) {
      conversation = await createNewConversation(inputMessage);
      if (!conversation) return;
      setCurrentConversation(conversation);
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
      attachedFiles: attachedFiles.length > 0 ? [...attachedFiles] : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    const currentAttachedFiles = [...attachedFiles];
    setAttachedFiles([]);
    setIsLoading(true);

    // Save user message to database
    await saveMessageToDb(conversation.id, userMessage);

    try {
      // Prepare the message with file content if available
      let messageToSend = inputMessage;
      if (currentAttachedFiles.length > 0) {
        const fileContents = currentAttachedFiles
          .filter(file => file.content)
          .map(file => `**File: ${file.name}**\n${file.content}`)
          .join('\n\n');
        
        if (fileContents) {
          messageToSend = `${inputMessage}\n\n${fileContents}`;
        }
      }

      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: messageToSend,
          threadId: threadId,
          attachedFiles: currentAttachedFiles.length > 0 ? currentAttachedFiles : undefined
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Update thread ID if new
      if (data.threadId && !threadId) {
        setThreadId(data.threadId);
        // Update conversation with thread ID
        await supabase
          .from('conversations')
          .update({ thread_id: data.threadId })
          .eq('id', conversation.id);
      }

      // Save assistant message to database
      await saveMessageToDb(conversation.id, assistantMessage);

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Drag and drop functionality
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    
    // Process files directly instead of creating mock event
    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} is not a supported file type. Please upload text, CSV, PDF, or Office documents.`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB. Please upload a smaller file.`,
          variant: "destructive",
        });
        continue;
      }

      try {
        let content = '';
        if (file.type === 'text/plain' || file.type === 'text/csv') {
          content = await file.text();
        }
        
        const attachedFile: AttachedFile = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          content: content || undefined
        };

        setAttachedFiles(prev => [...prev, attachedFile]);
        
        toast({
          title: "File attached",
          description: `${file.name} has been attached to your message.`,
        });
      } catch (error) {
        console.error('Error reading file:', error);
        toast({
          title: "Error reading file",
          description: `Could not read ${file.name}. Please try again.`,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="flex h-full w-full p-6 gap-6" style={{ userSelect: 'text' }}>
      {/* Main Chat Area */}
      <div 
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-50">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-2 text-primary" />
              <p className="text-lg font-semibold text-primary">Drop files here</p>
              <p className="text-sm text-muted-foreground">Supports text, CSV, PDF, and Office documents</p>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Care Cuddle AI</h1>
            <p className="text-sm text-muted-foreground">
              {currentConversation ? currentConversation.title : 'Chat with Care Cuddle AI assistant'}
            </p>
          </div>
        </div>

        {/* Chat Messages */}
        <Card className="flex-1 mb-4 min-h-0">
          <CardContent className="p-0 h-full">
            <ScrollArea className="h-[calc(100vh-300px)] p-4" ref={scrollAreaRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
                  <p className="text-muted-foreground">
                    Ask me anything! I'm here to help you.
                  </p>
                </div>
              ) : (
                <div className="space-y-4" style={{ userSelect: 'text' }}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex items-start gap-3 ${
                        message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                        message.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        {message.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div className={`flex-1 space-y-1 ${
                        message.role === 'user' ? 'text-right' : 'text-left'
                      }`}>
                         <div className={`inline-block p-3 rounded-lg max-w-[80%] ${
                           message.role === 'user'
                             ? 'bg-primary text-primary-foreground'
                             : 'bg-muted'
                         }`}>
                           <p 
                             className="whitespace-pre-wrap" 
                             style={{ 
                               userSelect: 'text', 
                               WebkitUserSelect: 'text',
                               MozUserSelect: 'text',
                               msUserSelect: 'text'
                             }}
                           >
                             {message.content}
                           </p>
                           {message.attachedFiles && message.attachedFiles.length > 0 && (
                             <div className="mt-2 space-y-1">
                               {message.attachedFiles.map((file) => (
                                 <div key={file.id} className="flex items-center gap-2 text-sm opacity-75">
                                   <FileText className="h-3 w-3" />
                                   <span>{file.name}</span>
                                   <span>({formatFileSize(file.size)})</span>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                        <p className="text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="inline-block p-3 rounded-lg bg-muted">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Attached Files */}
        {attachedFiles.length > 0 && (
          <div className="mb-4">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="h-4 w-4" />
                  <span className="text-sm font-medium">Attached Files</span>
                </div>
                <div className="space-y-2">
                  {attachedFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachedFile(file.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Input Area */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1"
              style={{ 
                userSelect: 'text', 
                WebkitUserSelect: 'text',
                MozUserSelect: 'text',
                msUserSelect: 'text'
              }}
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept=".txt,.csv,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button 
              onClick={sendMessage} 
              disabled={(!inputMessage.trim() && attachedFiles.length === 0) || isLoading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Chat History */}
      <ChatHistorySidebar
        className="w-80 flex-shrink-0"
        currentConversationId={currentConversation?.id || null}
        onConversationSelect={handleConversationSelect}
        onNewConversation={handleNewConversation}
      />
    </div>
  );
};