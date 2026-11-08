CREATE TABLE tuxu.projects (
  user_id text NOT NULL, id text NOT NULL, name text NOT NULL, data text NOT NULL,
  revision integer NOT NULL DEFAULT 1, created_at bigint NOT NULL, updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX projects_owner_updated ON tuxu.projects (user_id, updated_at);

CREATE TABLE tuxu.assets (
  id text PRIMARY KEY, user_id text NOT NULL, project_id text NOT NULL,
  object_key text NOT NULL, name text NOT NULL, mime text NOT NULL, size integer NOT NULL,
  generated integer NOT NULL DEFAULT 0, source text NOT NULL DEFAULT 'upload',
  source_url text, image_url text, created_at bigint NOT NULL
);
CREATE INDEX assets_owner_project ON tuxu.assets (user_id, project_id);

CREATE TABLE tuxu.jobs (
  id text PRIMARY KEY, user_id text NOT NULL, project_id text NOT NULL, request_id text NOT NULL,
  kind text NOT NULL, prompt text NOT NULL, skill_ids text NOT NULL, snapshot text NOT NULL,
  base_revision integer NOT NULL, status text NOT NULL, session_id text, environment_id text, turn_id text,
  provider_files text NOT NULL DEFAULT '[]', image_state text, search_state text, result text, error text,
  lease_until bigint NOT NULL DEFAULT 0, created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE INDEX jobs_owner_created ON tuxu.jobs (user_id, created_at);
CREATE UNIQUE INDEX jobs_request_id ON tuxu.jobs (user_id, request_id);

CREATE TABLE tuxu.settings (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE tuxu.webhook_inbox (id text PRIMARY KEY, session_id text, done integer NOT NULL DEFAULT 0, created_at bigint NOT NULL);

-- These tables are used by the trusted backend. Visitor ownership checks remain
-- in the API; Supabase's public Data API must not expose the application tables.
REVOKE ALL ON SCHEMA tuxu FROM PUBLIC;
ALTER TABLE tuxu.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuxu.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuxu.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuxu.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuxu.webhook_inbox ENABLE ROW LEVEL SECURITY;
