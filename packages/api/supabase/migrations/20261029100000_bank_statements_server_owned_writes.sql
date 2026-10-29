-- bank_statements rows are written only by the API with the service role
-- (upload, reprocess, remove, and the AI pipeline). Clients keep read access
-- to their own rows through RLS, but must not be able to change server-owned
-- columns such as file_path, status or parsed_data (pipeline state) directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bank_statements FROM anon, authenticated;
