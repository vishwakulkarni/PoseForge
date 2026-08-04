CREATE TYPE pose_tag_status AS ENUM ('pending', 'tagged', 'skipped');

CREATE TABLE pose_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New pose',
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  tag_status pose_tag_status NOT NULL DEFAULT 'pending',
  file_path TEXT,
  source_url TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pose_references_has_source CHECK (file_path IS NOT NULL OR source_url IS NOT NULL)
);
CREATE INDEX idx_pose_references_category ON pose_references(category);
CREATE INDEX idx_pose_references_created_at ON pose_references(created_at DESC);

-- A pose_reference a generation actually used — kept so a pose stays
-- resolvable/reusable even if the generation that first introduced it is
-- later deleted (generations.pose_photo_path already stores its own
-- normalized copy independently).
ALTER TABLE generations ADD COLUMN pose_reference_id UUID REFERENCES pose_references(id) ON DELETE SET NULL;
CREATE INDEX idx_generations_pose_reference_id ON generations(pose_reference_id);
