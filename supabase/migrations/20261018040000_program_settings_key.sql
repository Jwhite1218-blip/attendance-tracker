-- Admit the programme settings state key.
--
-- Problem
-- -------
-- `public.mutate_legacy_state_entry` rejects any key it does not name. This
-- adds one:
--
--   * `program-settings-v1` — the values Liz can change without a deploy:
--     star milestone names and thresholds, the occurrence stages, required
--     training hours per position, the printed wording of recognition
--     reasons, and the Spanish sign-off. Each is stored as an override; the
--     shipped defaults in src/data/programDefaults.js apply to anything
--     absent, so a partial or damaged value degrades to current behaviour
--     rather than to nothing.
--
-- Written only at Liz's tier (role admin, canManageRoster and
-- canManageBlackouts both true) because these settings change what the app
-- says about somebody's job. Read by every session, including school and
-- recognition-only ones, so that a manager never sees different milestones
-- or different occurrence colours from the district office.
--
-- This migration only redefines the allowlist guard. The mutation semantics,
-- concurrency behaviour, `security invoker`, pinned empty `search_path`, and
-- privilege model are unchanged.

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
      'employee-assignment-history-v1',
      'hr-attendance-progress-v2',
      'hr-flags',
      'all-star-recognition-v1',
      'training-records-v1',
      'pending-approvals-v1',
      'program-settings-v1'
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
