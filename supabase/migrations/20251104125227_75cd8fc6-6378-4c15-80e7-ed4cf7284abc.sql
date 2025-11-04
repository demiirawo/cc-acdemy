-- Create RLS policies for page-images storage bucket

-- Allow anyone to view images in the page-images bucket
CREATE POLICY "Anyone can view page images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'page-images');

-- Allow authenticated users to upload images to page-images bucket
CREATE POLICY "Authenticated users can upload page images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'page-images');

-- Allow users to update their own images
CREATE POLICY "Users can update their own page images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'page-images' AND auth.uid() = owner::uuid)
WITH CHECK (bucket_id = 'page-images');

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own page images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'page-images' AND auth.uid() = owner::uuid);