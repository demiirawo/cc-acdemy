import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Send, MessageSquare, Bot, User, Paperclip, X, FileText, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  url: string;
}

interface ChatFolder {
  id: string;
  name: string;
  color: string;
  description?: string;
  project_type: string;
  settings: any;
}

interface ProjectChatPageProps {
  conversationId: string;
  onBack: () => void;
  projectContext: ChatFolder;
}

export const ProjectChatPage = ({ conversationId, onBack, projectContext }: ProjectChatPageProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (conversationId) {
      loadConversation();
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = async () => {
    try {
      // Load conversation details
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (convError) throw convError;

      setThreadId(conversation.thread_id);

      // Load messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      const formattedMessages = messagesData.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at),
        attachedFiles: Array.isArray(msg.attached_files) && msg.attached_files.length > 0 
          ? (msg.attached_files as unknown as AttachedFile[]) 
          : undefined
      }));

      setMessages(formattedMessages);
    } catch (error: any) {
      console.error('Error loading conversation:', error);
      toast({
        title: "Error",
        description: "Failed to load conversation",
        variant: "destructive",
      });
    }
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() && attachedFiles.length === 0) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
      attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setAttachedFiles([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);

    try {
      // Save user message to database
      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        content: inputMessage,
        role: 'user',
        attached_files: attachedFiles.length > 0 ? JSON.parse(JSON.stringify(attachedFiles)) : null
      });

      // Call the chat assistant function with project context
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: inputMessage,
          threadId: threadId,
          conversationId: conversationId,
          attachedFiles: attachedFiles,
          projectContext: projectContext
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to database
      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        content: data.response,
        role: 'assistant'
      });

      // Update thread ID if returned
      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        await supabase
          .from('conversations')
          .update({ thread_id: data.threadId })
          .eq('id', conversationId);
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      
      // Remove the user message on error
      setMessages(prev => prev.slice(0, -1));
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    
    // Auto-resize functionality
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const handleFileUpload = async (files: FileList) => {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['text/plain', 'application/pdf', 'image/jpeg', 'image/png', 'image/gif'];

    for (const file of Array.from(files)) {
      if (file.size > maxFileSize) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB`,
          variant: "destructive",
        });
        continue;
      }

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a supported file type`,
          variant: "destructive",
        });
        continue;
      }

      try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) throw new Error('Not authenticated');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.data.user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-documents')
          .getPublicUrl(filePath);

        // Save file metadata to database
        const { data: fileRecord, error: dbError } = await supabase
          .from('chat_documents')
          .insert({
            user_id: user.data.user.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type
          })
          .select()
          .single();

        if (dbError) throw dbError;

        const attachedFile: AttachedFile = {
          id: fileRecord.id,
          name: file.name,
          size: file.size,
          type: file.type,
          url: publicUrl
        };

        setAttachedFiles(prev => [...prev, attachedFile]);

        toast({
          title: "File uploaded",
          description: `${file.name} has been uploaded successfully`,
        });

      } catch (error: any) {
        console.error('Error uploading file:', error);
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive",
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {projectContext.name}
          </Button>
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
            style={{ backgroundColor: projectContext.color }}
          >
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Project Chat</h1>
            <p className="text-sm text-muted-foreground">{projectContext.name}</p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        className={`flex-1 flex flex-col transition-colors ${isDragOver ? 'bg-muted/50' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-4 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                
                <Card className={`max-w-[70%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}`}>
                  <CardContent className="p-4">
                    {message.attachedFiles && message.attachedFiles.length > 0 && (
                      <div className="mb-3 space-y-2">
                        {message.attachedFiles.map((file) => (
                          <div key={file.id} className="flex items-center space-x-2 p-2 border rounded bg-muted/50">
                            <FileText className="w-4 h-4" />
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </CardContent>
                </Card>

                {message.role === 'user' && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex items-start space-x-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Attached Files */}
        {attachedFiles.length > 0 && (
          <div className="border-t bg-muted/50 p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file) => (
                  <div key={file.id} className="flex items-center space-x-2 bg-background border rounded-lg p-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachedFile(file.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              
              <div className="flex-1">
                <Textarea
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message ${projectContext.name}...`}
                  disabled={isLoading}
                  className="min-h-[44px] max-h-[200px] resize-none"
                  ref={textareaRef}
                />
              </div>
              
              <Button 
                onClick={sendMessage} 
                disabled={isLoading || (!inputMessage.trim() && attachedFiles.length === 0)}
                size="sm"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.pdf,.jpg,.jpeg,.png,.gif"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          className="hidden"
        />

        {isDragOver && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary/50 flex items-center justify-center">
            <div className="text-center">
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-lg font-medium text-primary">Drop files here to upload</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};