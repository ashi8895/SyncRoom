-- SyncRoom database schema.
-- Run via: npm run migrate  (server/src/db/migrate.js loads this file)
--
-- Notes:
--   - There is no login/auth system, so `users` rows are created on the fly
--     the first time a given userId (a short nanoid generated per browser
--     session) is seen — think of it as "known participants", not accounts.
--   - `rooms` carries playback state (video_id/play_state/current_time)
--     as well as the identity columns, so a room can resume where it left
--     off after a server restart — same idea as the old SQLite version,
--     just on Postgres now.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  video_id TEXT,
  play_state TEXT NOT NULL DEFAULT 'paused',
  current_time REAL NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);

CREATE TABLE IF NOT EXISTS room_participants (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON room_participants(room_id);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);

CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_videos_room_id ON videos(room_id);
