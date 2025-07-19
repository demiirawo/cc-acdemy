import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Send, MessageSquare, Bot, User, Paperclip, X, FileText } from "lucide-react";
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
  content?: string; // Text content for processing
}

export const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
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

  const sendMessage = async () => {
    if ((!inputMessage.trim() && attachedFiles.length === 0) || isLoading) return;

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
      
      if (data.threadId && !threadId) {
        setThreadId(data.threadId);
      }

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

  return (
    <div className="flex flex-col h-full w-full p-6" style={{ userSelect: 'text' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Chat with your personal AI assistant
          </p>
        </div>
      </div>

      {/* Chat Messages */}
      <Card className="flex-1 mb-4 min-h-0">
        <CardContent className="p-0 h-full">
          <ScrollArea className="h-[calc(100vh-250px)] p-4" ref={scrollAreaRef}>
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
  );
};