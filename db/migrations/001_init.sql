CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE character_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TYPE preset_type AS ENUM ('background', 'style');
CREATE TABLE presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), type preset_type NOT NULL, name TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL, is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (type, name)
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TYPE generation_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  character_photo_id UUID REFERENCES character_photos(id) ON DELETE SET NULL,
  pose_photo_path TEXT NOT NULL, engine TEXT NOT NULL,
  background_preset_id UUID REFERENCES presets(id) ON DELETE SET NULL,
  style_preset_id UUID REFERENCES presets(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL, status generation_status NOT NULL DEFAULT 'pending',
  output_path TEXT, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);
CREATE INDEX idx_generations_character_id ON generations(character_id);
CREATE INDEX idx_generations_status ON generations(status);
