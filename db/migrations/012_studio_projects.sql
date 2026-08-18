CREATE TABLE studio_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Studio',
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  document JSONB NOT NULL DEFAULT '{"schemaVersion":1,"viewport":null,"nodes":[],"edges":[],"locked":false}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_studio_projects_default
  ON studio_projects (is_default)
  WHERE is_default = true AND archived_at IS NULL;

CREATE INDEX idx_studio_projects_updated
  ON studio_projects (updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE studio_composition_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  config JSONB NOT NULL,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, node_id, version)
);

CREATE INDEX idx_studio_composition_revisions_project
  ON studio_composition_revisions (project_id, node_id, version DESC);

CREATE TABLE studio_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  composition_revision_id UUID NOT NULL REFERENCES studio_composition_revisions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed', 'canceled')),
  requested_outputs INTEGER NOT NULL DEFAULT 1 CHECK (requested_outputs BETWEEN 1 AND 6),
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_studio_runs_project_created
  ON studio_runs (project_id, created_at DESC);

ALTER TABLE generations
  ADD COLUMN studio_run_id UUID REFERENCES studio_runs(id) ON DELETE SET NULL,
  ADD COLUMN composition_node_id TEXT,
  ADD COLUMN composition_revision_id UUID REFERENCES studio_composition_revisions(id) ON DELETE SET NULL,
  ADD COLUMN parent_generation_id UUID REFERENCES generations(id) ON DELETE SET NULL;

CREATE INDEX idx_generations_studio_run_id ON generations(studio_run_id);
CREATE INDEX idx_generations_composition_revision_id ON generations(composition_revision_id);

