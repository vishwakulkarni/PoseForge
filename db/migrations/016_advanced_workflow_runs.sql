-- Advanced Studio versions and runs.
--
-- A version is a snapshot of what a workflow *does* (nodes, settings, wiring),
-- recorded the first time that recipe runs; moving nodes around or new
-- results do not make a new version. recipe_hash dedupes, so returning to an
-- earlier recipe reuses its version. A run is one execution of a version with
-- its own inputs, per-node outcomes and output files, so results are no
-- longer only the last eight kept on a node.
--
-- The guided Studio's studio_runs / studio_composition_revisions (012) model
-- per-node composition configs and stay separate.
CREATE TABLE advanced_workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  recipe_hash TEXT NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  UNIQUE (project_id, recipe_hash)
);

CREATE TABLE advanced_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES advanced_workflow_versions(id) ON DELETE CASCADE,
  batch_id UUID,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  nodes JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_advanced_workflow_runs_project ON advanced_workflow_runs (project_id, created_at DESC);
CREATE INDEX idx_advanced_workflow_runs_version ON advanced_workflow_runs (version_id, created_at DESC);
CREATE INDEX idx_advanced_workflow_runs_batch ON advanced_workflow_runs (batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE generations
  ADD COLUMN advanced_run_id UUID REFERENCES advanced_workflow_runs(id) ON DELETE SET NULL;

CREATE INDEX idx_generations_advanced_run_id ON generations (advanced_run_id);
