CREATE TABLE tuxu.accounts (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','user')),
  disabled integer NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE TABLE tuxu.account_sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES tuxu.accounts(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX account_sessions_owner ON tuxu.account_sessions(account_id);
CREATE INDEX account_sessions_expiry ON tuxu.account_sessions(expires_at);
CREATE TABLE tuxu.login_attempts (
  bucket text PRIMARY KEY,
  window_start bigint NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE tuxu.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuxu.account_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuxu.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tuxu.accounts, tuxu.account_sessions, tuxu.login_attempts FROM PUBLIC;
