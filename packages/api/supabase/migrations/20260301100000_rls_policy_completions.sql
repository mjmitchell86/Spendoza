-- Add missing RLS policies needed for user-scoped Supabase client usage.
-- Previously only SELECT existed on reports; routes need INSERT/UPDATE.
-- Invitees need UPDATE on household_invitations to accept invites.

-- reports: Allow users to insert their own reports (personal or household)
DROP POLICY IF EXISTS "Users can insert own reports" ON reports;
CREATE POLICY "Users can insert own reports" ON reports FOR INSERT
  WITH CHECK (
    (entity_type = 'user' AND entity_id = (select auth.uid())) OR
    (entity_type = 'household' AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = (select auth.uid())
    ))
  );

-- reports: Allow users to update their own reports (personal or household)
DROP POLICY IF EXISTS "Users can update own reports" ON reports;
CREATE POLICY "Users can update own reports" ON reports FOR UPDATE
  USING (
    (entity_type = 'user' AND entity_id = (select auth.uid())) OR
    (entity_type = 'household' AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = (select auth.uid())
    ))
  );

-- household_invitations: Allow invitees to accept their invitations
DROP POLICY IF EXISTS "Invitees can accept their invitations" ON household_invitations;
CREATE POLICY "Invitees can accept their invitations" ON household_invitations FOR UPDATE
  USING (email IN (SELECT email FROM auth.users WHERE id = (select auth.uid())));
