-- Create storage bucket for chat documents
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-documents', 'chat-documents', false);

-- Create policies for chat documents bucket
CREATE POLICY "Users can upload their own chat documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'chat-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own chat documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'chat-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own chat documents" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'chat-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create table to store chat document metadata
CREATE TABLE public.chat_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on chat_documents table
ALTER TABLE public.chat_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_documents table
CREATE POLICY "Users can manage their own chat documents" 
ON public.chat_documents 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);