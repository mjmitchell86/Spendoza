-- Create storage bucket for bank statements
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bank-statements', 'bank-statements', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users can upload own statements"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bank-statements' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read their own files
CREATE POLICY "Users can read own statements"
ON storage.objects FOR SELECT
USING (bucket_id = 'bank-statements' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete their own files
CREATE POLICY "Users can delete own statements"
ON storage.objects FOR DELETE
USING (bucket_id = 'bank-statements' AND (storage.foldername(name))[1] = auth.uid()::text);
