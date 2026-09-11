-- Advanced Studio shares the studio_projects table with the guided Studio.
-- `workspace` is the discriminator: every existing row is a guided Studio
-- project, and every query in routes/studio-projects.js and
-- routes/advanced-studio-projects.js filters on it so the two workspaces can
-- never surface each other's projects.
ALTER TABLE studio_projects
  ADD COLUMN workspace TEXT NOT NULL DEFAULT 'studio';

ALTER TABLE studio_projects
  ADD CONSTRAINT studio_projects_workspace_check
  CHECK (workspace IN ('studio', 'advanced'));

-- Which creation template seeded the project ('image' | 'video' | 'storyboard'
-- | 'blank'). Kept as a column rather than inside the document so the project
-- gallery can label cards without deserializing the whole graph.
ALTER TABLE studio_projects
  ADD COLUMN template TEXT;

CREATE INDEX idx_studio_projects_workspace_updated
  ON studio_projects (workspace, updated_at DESC)
  WHERE archived_at IS NULL;

-- The singleton "My Studio" default belongs to the guided workspace only;
-- Advanced Studio has no forced default project.
DROP INDEX IF EXISTS idx_studio_projects_default;
CREATE UNIQUE INDEX idx_studio_projects_default
  ON studio_projects (is_default)
  WHERE is_default = true AND archived_at IS NULL AND workspace = 'studio';
