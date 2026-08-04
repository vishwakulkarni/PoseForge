ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS usage_metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN generations.usage_metrics IS
  'Actual or estimated token/cost metadata, including pricing assumptions and rate date.';
