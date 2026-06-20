ALTER TABLE events ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Update RLS policies to include archived in select (if you have policies restricting select)
-- No policy changes needed — existing policies already allow all CRUD for own events
