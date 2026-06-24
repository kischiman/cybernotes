-- Simple key/value store for app-wide account settings (single-user app).
-- Currently holds the profile display name shown on Telegram posts.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
