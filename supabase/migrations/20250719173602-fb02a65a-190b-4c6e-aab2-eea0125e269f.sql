-- Enhanced project functionality tables

-- Table for project files (documents, references, etc.)
CREATE TABLE public.project_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.chat_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for project instructions/context
CREATE TABLE public.project_instructions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.chat_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'instruction', -- 'instruction', 'context', 'goal'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for project research sessions
CREATE TABLE public.project_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.chat_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  results JSONB,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enhanced chat_folders table with additional project features
ALTER TABLE public.chat_folders 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'general', -- 'general', 'research', 'content', 'analysis'
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Enable Row Level Security
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_research ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_files
CREATE POLICY "Users can manage their own project files"
ON public.project_files
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for project_instructions  
CREATE POLICY "Users can manage their own project instructions"
ON public.project_instructions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for project_research
CREATE POLICY "Users can manage their own project research"
ON public.project_research
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Function to update project memory based on conversations
CREATE OR REPLACE FUNCTION public.update_project_memory(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_summary JSONB;
  conversation_count INTEGER;
  recent_topics TEXT[];
BEGIN
  -- Count conversations in project
  SELECT COUNT(*) INTO conversation_count
  FROM public.conversations
  WHERE folder_id = p_project_id;
  
  -- Get recent conversation topics (simplified)
  SELECT ARRAY_AGG(title) INTO recent_topics
  FROM (
    SELECT title 
    FROM public.conversations 
    WHERE folder_id = p_project_id 
    ORDER BY last_message_at DESC 
    LIMIT 10
  ) recent;
  
  -- Build project memory summary
  project_summary := jsonb_build_object(
    'conversation_count', conversation_count,
    'recent_topics', recent_topics,
    'last_updated', now()
  );
  
  -- Update project settings with memory data
  UPDATE public.chat_folders
  SET settings = settings || jsonb_build_object('memory', project_summary)
  WHERE id = p_project_id;
  
  RETURN project_summary;
END;
$$;

-- Trigger to update project memory when conversations change
CREATE OR REPLACE FUNCTION public.trigger_update_project_memory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update memory for the affected project
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.folder_id IS NOT NULL THEN
      PERFORM public.update_project_memory(NEW.folder_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.folder_id IS NOT NULL THEN
      PERFORM public.update_project_memory(OLD.folder_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger for project memory updates
DROP TRIGGER IF EXISTS conversation_project_memory_trigger ON public.conversations;
CREATE TRIGGER conversation_project_memory_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_project_memory();

-- Create indexes for performance
CREATE INDEX idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX idx_project_instructions_project_id ON public.project_instructions(project_id);
CREATE INDEX idx_project_research_project_id ON public.project_research(project_id);
CREATE INDEX idx_project_research_status ON public.project_research(status);
CREATE INDEX idx_conversations_folder_memory ON public.conversations(folder_id, last_message_at DESC) WHERE folder_id IS NOT NULL;