-- Workout splits (PPL, Bro split, etc.)
CREATE TABLE IF NOT EXISTS workout_splits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'days_of_week',
  is_active BOOLEAN DEFAULT FALSE,
  sequential_anchor_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Days/slots within a split
CREATE TABLE IF NOT EXISTS split_days (
  id TEXT PRIMARY KEY,
  split_id TEXT NOT NULL REFERENCES workout_splits(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_rest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workouts (assigned to split_day or template)
CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  split_day_id TEXT REFERENCES split_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_groups JSONB DEFAULT '[]',
  time_of_day TEXT,
  notes TEXT,
  order_index INTEGER DEFAULT 0,
  is_template BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercises within a workout (or templates)
CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  workout_id TEXT REFERENCES workouts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER DEFAULT 3,
  reps INTEGER DEFAULT 10,
  weight NUMERIC,
  is_bodyweight BOOLEAN DEFAULT FALSE,
  notes TEXT,
  order_index INTEGER DEFAULT 0,
  is_template BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actual workout sessions
CREATE TABLE IF NOT EXISTS workout_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  split_id TEXT REFERENCES workout_splits(id) ON DELETE SET NULL,
  split_day_id TEXT REFERENCES split_days(id) ON DELETE SET NULL,
  workout_id TEXT REFERENCES workouts(id) ON DELETE SET NULL,
  workout_name TEXT NOT NULL,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual set logs
CREATE TABLE IF NOT EXISTS set_logs (
  id BIGSERIAL PRIMARY KEY,
  workout_log_id TEXT NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_id TEXT,
  exercise_name TEXT NOT NULL,
  exercise_order INTEGER DEFAULT 0,
  set_number INTEGER NOT NULL,
  weight NUMERIC,
  is_bodyweight BOOLEAN DEFAULT FALSE,
  reps INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security is enabled separately via enable_rls.sql, which covers
-- these tables plus every other table in the app (supplements, contacts, etc).

-- Cardio support (run once in Supabase SQL editor)
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS exercise_type TEXT DEFAULT 'lift';
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS cardio_type TEXT;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS intensity TEXT;

ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS exercise_type TEXT DEFAULT 'lift';
ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS intensity TEXT;
