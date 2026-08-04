ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS studio_mode TEXT NOT NULL DEFAULT 'normal'
    CHECK (studio_mode IN ('normal', 'advanced')),
  ADD COLUMN IF NOT EXISTS advanced_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_generations_batch_id ON generations(batch_id);

CREATE TABLE IF NOT EXISTS studio_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_recipes_updated_at ON studio_recipes(updated_at DESC);
