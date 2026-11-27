-- Applied on every start; every statement must be safe to run again.
-- A database made before accounts existed is brought up to this shape by
-- migrations.js first, so indexes here can rely on every column being there.

-- The owner: one row (single-user app). A NULL setting means "use the server
-- default" from config/env.js. `email` is the connected Google account, if any.
-- google_sub is left from when the app had Google sign-in; it is not used.
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  google_sub      TEXT UNIQUE,
  email           TEXT NOT NULL DEFAULT '',
  name            TEXT,
  picture         TEXT,
  pitch           TEXT,                      -- a sentence or two about the user, for outreach drafts
  timezone        TEXT,
  reminder_hour   INTEGER,
  digest_hour     INTEGER,
  nudge_hour      INTEGER,
  follow_up_days  INTEGER,
  digest_enabled  INTEGER NOT NULL DEFAULT 1,
  google_client_id      TEXT,              -- an OAuth client pasted into Settings (when not set in .env)
  google_client_secret  TEXT,              -- encrypted (services/auth/tokenVault.js)
  resume_folder         TEXT,              -- folder watched for new tailored résumés (services/resumeFolderService.js)
  resume_auto_attach    INTEGER NOT NULL DEFAULT 0,  -- 1 = attach a file on its own when one application clearly matches
  created_at      TEXT NOT NULL
);

-- Left from Google sign-in, which was removed.
DROP TABLE IF EXISTS sessions;

-- The user's Google refresh token (encrypted), what Google granted, and which
-- connectors the user has switched on: JSON list of "calendar", "gmail_send", ...
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token  TEXT NOT NULL,
  scopes         TEXT NOT NULL DEFAULT '',
  enabled        TEXT NOT NULL DEFAULT '[]',
  last_error     TEXT,                      -- set when Google refuses the token, so Settings can ask to reconnect
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company       TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT '',
  url           TEXT,
  status        TEXT NOT NULL DEFAULT 'applied'
                CHECK (status IN ('applied', 'oa', 'interview', 'offer', 'rejected', 'ghosted')),
  applied_on    TEXT NOT NULL,                 -- local date, YYYY-MM-DD
  notes         TEXT NOT NULL DEFAULT '',
  no_url        INTEGER NOT NULL DEFAULT 0,    -- 1 = user said there is no link, stop asking
  no_contact    INTEGER NOT NULL DEFAULT 0,    -- 1 = user said there is no recruiter, stop asking
  jd_text       TEXT NOT NULL DEFAULT '',      -- the job description, kept in case the posting goes offline
  jd_saved_at   TEXT,
  interview_on  TEXT,                          -- local date, when known
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_user ON applications (user_id, applied_on);

-- One row per status change: the history of what moved forward.
CREATE TABLE IF NOT EXISTS status_events (
  id              INTEGER PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  linkedin_url    TEXT,
  email           TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'linkedin')),
  subject         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_on         TEXT,                      -- local date, set by the user
  gmail_draft_id  TEXT,                      -- set once the draft was copied into the user's Gmail
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_topics (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL COLLATE NOCASE,
  plan        TEXT NOT NULL DEFAULT '',      -- what to cover, e.g. from an interview prep guide
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS study_notes (
  id          INTEGER PRIMARY KEY,
  topic_id    INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  studied_on  TEXT NOT NULL,                 -- local date
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('follow_up', 'revision', 'custom')),
  application_id     INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  topic_id           INTEGER REFERENCES study_topics(id) ON DELETE CASCADE,
  revision_stage     INTEGER,                -- 1..4 for revisions
  tag                TEXT,                   -- marks a reminder the app manages itself: 'interview'
  message            TEXT NOT NULL,
  due_at             TEXT NOT NULL,          -- UTC ISO instant
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  notified_at        TEXT,                   -- set by the scheduler when it pushed the browser notification
  completed_at       TEXT,
  calendar_event_id  TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_pending ON reminders (status, due_at);
CREATE INDEX IF NOT EXISTS reminders_user ON reminders (user_id, status, due_at);

-- One row per user and local day: a running summary of what the user did.
CREATE TABLE IF NOT EXISTS journal_entries (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,                 -- local date
  summary     TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  actions     TEXT NOT NULL DEFAULT '[]',    -- JSON: the tool calls behind an assistant reply
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_user ON chat_messages (user_id, id);

-- Small per-user key/value store for the scheduler ("digest last sent on", ...).
CREATE TABLE IF NOT EXISTS meta (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Uploaded résumés. application_id NULL is the user's base résumé; otherwise
-- it is the version tailored for that application. `text` is what was
-- extracted from the file, for the prep guide.
CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  mime            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  content         BLOB NOT NULL,
  text            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_owner ON documents (user_id, application_id);

-- Résumé files the folder watcher has seen (services/resumeFolderService.js).
-- A changed file is a new row (new hash); the same file seen again is skipped.
-- `text` is kept so matches can be re-scored when applications are added later.
CREATE TABLE IF NOT EXISTS resume_folder_files (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path            TEXT NOT NULL,
  filename        TEXT NOT NULL,
  size            INTEGER NOT NULL,
  mtime_ms        INTEGER NOT NULL,
  sha256          TEXT NOT NULL,
  text            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attached', 'ignored')),
  application_id  INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  auto_attached   INTEGER NOT NULL DEFAULT 0,
  no_auto         INTEGER NOT NULL DEFAULT 0,   -- 1 = never attach this one on its own (undone or failed)
  seen_at         TEXT NOT NULL,
  UNIQUE (user_id, path, sha256)
);
CREATE INDEX IF NOT EXISTS resume_folder_files_user ON resume_folder_files (user_id, status);

-- The interview prep guide for an application, as JSON (services/prepGuideService.js).
CREATE TABLE IF NOT EXISTS prep_guides (
  application_id  INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  guide           TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- Mail from a saved recruiter that the reply watcher noticed in the user's inbox.
CREATE TABLE IF NOT EXISTS mail_matches (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id        TEXT NOT NULL,           -- Gmail's id
  application_id    INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  contact_id        INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  sender            TEXT NOT NULL,
  subject           TEXT NOT NULL DEFAULT '',
  snippet           TEXT NOT NULL DEFAULT '',
  received_at       TEXT NOT NULL,
  suggested_status  TEXT,                    -- what the mail seems to mean, or NULL
  state             TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'applied', 'dismissed')),
  created_at        TEXT NOT NULL,
  UNIQUE (user_id, message_id)
);
