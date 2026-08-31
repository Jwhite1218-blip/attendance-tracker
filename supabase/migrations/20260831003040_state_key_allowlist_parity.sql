-- State-key allowlist parity fix.
--
-- Problem
-- -------
-- `public.mutate_legacy_state_entry` is the single write path for every
-- client-driven state change (netlify/functions/state.mjs -> store.updateJSON).
-- Its hardcoded allowlist had drifted behind the application's key surface:
--
--   * `employee-manager-notes-v1` (EMPLOYEE_NOTES_KEY) shipped with the manager
--     HR workflow but was never added here, so every shared HR note write has
--     been rejected with 'Unsupported state key.' on Supabase-backed
--     environments. Confirmed in production: zero rows for that key in
--     `legacy_state_entries`. The note is written to localStorage first, so the
--     author still sees it locally while it never reaches the server and stays
--     stuck in the pending-write queue.
--
--   * `all-star-recognition-v1` (RECOGNITION_KEY) is introduced by the
--     recognition / public NFC leaderboard release and would fail the same way.
--     It is added here so the allowlist is ready ahead of that merge.
--
-- The stress/lab environment runs on Netlify Blobs, which has no allowlist, so
-- this class of failure cannot be reproduced there. `state-key-parity.test.mjs`
-- now asserts the application's managed keys are a subset of this list.
--
-- This migration only redefines the allowlist guard. The mutation semantics,
-- concurrency behaviour (single-statement upsert), `security invoker`, pinned
-- empty `search_path`, and privilege model are unchanged.

create or replace function public.mutate_legacy_state_entry(
  p_district_id bigint,
  p_state_key text,
  p_mutation jsonb,
  p_actor text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_district_id is null or p_district_id <= 0 then
    raise exception 'A valid district is required.' using errcode = '22023';
  end if;
  if not (
    p_state_key in (
      'attendance-blackout-dates',
      'employee-location-overrides',
      'employee-record-overrides',
      'employee-custom-records',
      'employee-manager-notes-v1',
      'hr-attendance-progress-v2',
      'hr-flags',
      'all-star-recognition-v1'
    )
    or p_state_key ~ '^att-emp-.+-[0-9]{4}$'
  ) then
    raise exception 'Unsupported state key.' using errcode = '22023';
  end if;

  insert into public.legacy_state_entries (
    district_id,
    state_key,
    value,
    updated_by
  ) values (
    p_district_id,
    p_state_key,
    app_private.apply_legacy_state_mutation(p_state_key, null, p_mutation),
    left(coalesce(nullif(p_actor, ''), 'system'), 200)
  )
  on conflict (district_id, state_key) do update
  set value = app_private.apply_legacy_state_mutation(
        excluded.state_key,
        public.legacy_state_entries.value,
        p_mutation
      ),
      updated_by = excluded.updated_by
  returning value into result;

  return result;
end;
$$;

-- Re-assert the privilege model explicitly. `create or replace function`
-- preserves existing grants, but restating them keeps this migration
-- self-describing and safe to apply to a freshly built database.
revoke all on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) from public;
revoke all on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) from anon;
revoke all on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) from authenticated;
grant execute on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) to service_role;
