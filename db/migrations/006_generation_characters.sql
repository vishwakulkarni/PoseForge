-- Supports up to 4 people per generation. generations.character_id /
-- character_photo_id are left in place (nullable, unused going forward)
-- so pre-existing rows created before this migration still resolve their
-- single character via the old columns; every new generation is written
-- through this table instead, via `position` 1-4.
CREATE TABLE generation_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  UNIQUE (generation_id, position)
);
CREATE INDEX idx_generation_characters_generation_id ON generation_characters(generation_id);
CREATE INDEX idx_generation_characters_character_id ON generation_characters(character_id);
