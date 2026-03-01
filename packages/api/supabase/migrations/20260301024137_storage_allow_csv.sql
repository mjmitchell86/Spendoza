-- Allow CSV uploads in the bank-statements storage bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'text/csv', 'text/plain']
WHERE id = 'bank-statements';
