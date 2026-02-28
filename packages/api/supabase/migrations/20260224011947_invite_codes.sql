-- Invite codes for gated user registration
-- Admin code "Chloe14" seeded by default
-- Users can create up to 3 invite codes each

CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default admin invite code
INSERT INTO invite_codes (code, created_by) VALUES ('Chloe14', NULL);

CREATE INDEX idx_invite_codes_code ON invite_codes (code);
CREATE INDEX idx_invite_codes_created_by ON invite_codes (created_by);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check invite codes" ON invite_codes
  FOR SELECT USING (true);
CREATE POLICY "Users can create invite codes" ON invite_codes
  FOR INSERT WITH CHECK (auth.uid() = created_by);
