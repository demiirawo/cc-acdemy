-- Create storage bucket for recommended reading documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recommended-reading', 'recommended-reading', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for recommended reading documents
CREATE POLICY "Anyone can view recommended reading files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'recommended-reading');

CREATE POLICY "Authenticated users can upload recommended reading files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'recommended-reading' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete their uploaded files" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'recommended-reading' 
  AND auth.role() = 'authenticated'
);