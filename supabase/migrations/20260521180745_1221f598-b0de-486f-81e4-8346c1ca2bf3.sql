CREATE TABLE public.whiteboard_boards (
  user_id UUID NOT NULL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whiteboard_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own whiteboard"
  ON public.whiteboard_boards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own whiteboard"
  ON public.whiteboard_boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own whiteboard"
  ON public.whiteboard_boards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own whiteboard"
  ON public.whiteboard_boards FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_whiteboard_boards_updated_at
  BEFORE UPDATE ON public.whiteboard_boards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();