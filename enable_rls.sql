-- Run this once in the Supabase SQL Editor.
-- Locks every table down to signed-in sessions only. Before this, the
-- public anon key (embedded in the client JS, visible to anyone who views
-- the page source) had unrestricted read/write access to all data.
--
-- Prerequisite: create your login at
--   Supabase Dashboard -> Authentication -> Users -> Add user
--   (check "Auto Confirm User" so there's no email verification step)

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supplements', 'daily_logs', 'weight_logs',
    'reminders', 'reminder_logs',
    'contacts', 'contact_logs',
    'health_metrics', 'metric_entries',
    'workout_splits', 'split_days', 'workouts', 'workout_exercises',
    'workout_logs', 'set_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop every existing policy on this table, whatever it's named, so no
    -- leftover default policy (e.g. from the dashboard's table editor) can
    -- grant unrestricted access alongside the one below.
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;

    -- One permissive policy: any signed-in session gets full access.
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      t
    );
  END LOOP;
END $$;
