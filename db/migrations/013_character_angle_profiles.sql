CREATE TABLE character_profile_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  sheet_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE character_profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_set_id UUID NOT NULL REFERENCES character_profile_sets(id) ON DELETE CASCADE,
  angle SMALLINT NOT NULL CHECK (angle IN (0, 45, 90, 135, 180)),
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  prompt TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (profile_set_id, angle)
);

CREATE INDEX idx_character_profile_sets_character_id
  ON character_profile_sets(character_id, created_at DESC);

CREATE UNIQUE INDEX idx_character_profile_sets_one_active
  ON character_profile_sets(character_id)
  WHERE is_active = true;

CREATE INDEX idx_character_profile_views_profile_set_id
  ON character_profile_views(profile_set_id, angle);
