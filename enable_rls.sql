-- Run this once in the Supabase SQL Editor.
-- Locks every table down to signed-in sessions only. Before this, the
-- public anon key (embedded in the client JS, visible to anyone who views
-- the page source) had unrestricted read/write access to all data.
--
-- Prerequisite: create your login at
--   Supabase Dashboard -> Authentication -> Users -> Add user
--   (check "Auto Confirm User" so there's no email verification step)

DO $$
DECLARE t text;
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
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      t
    );
  END LOOP;
END $$;
