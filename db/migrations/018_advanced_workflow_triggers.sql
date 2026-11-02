-- Unattended Advanced Studio runs.
--
-- A trigger is a saved way to run a workflow — its inputs and which nodes —
-- that fires on a schedule, from a webhook, or on demand. schedule is null
-- for a webhook-only or on-demand trigger, else { "type": "interval",
-- "minutes": n } or { "type": "daily", "time": "HH:MM" } in the server's local
-- time. Only a SHA-256 of the webhook token is stored; the token itself is
-- shown once, when it is created.
--
-- resumed_from links a run that picked up an interrupted run's unfinished
-- nodes to the run it resumed.
CREATE TABLE advanced_workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule JSONB,
  webhook_token_hash TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_id UUID REFERENCES advanced_workflow_runs(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_advanced_workflow_triggers_project ON advanced_workflow_triggers (project_id, created_at);
CREATE INDEX idx_advanced_workflow_triggers_due ON advanced_workflow_triggers (next_run_at) WHERE enabled AND schedule IS NOT NULL;

ALTER TABLE advanced_workflow_runs
  ADD COLUMN resumed_from UUID REFERENCES advanced_workflow_runs(id) ON DELETE SET NULL,
  ADD COLUMN trigger_id UUID REFERENCES advanced_workflow_triggers(id) ON DELETE SET NULL;
