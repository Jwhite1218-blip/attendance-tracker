-- Admit the training and assignment-history state keys.
--
-- Problem
-- -------
-- `public.mutate_legacy_state_entry` is the single write path for every
-- client-driven state change, and its hardcoded allowlist rejects anything it
-- does not name with 'Unsupported state key.'. Three keys are added here for
-- Liz's 2026-10-10 notes:
--
--   * `employee-assignment-history-v1` — one entry per employee recording each
--     school they have been assigned to and when. Liz: "now I have to go in
--     and edit an employee to change their school — can we track that so we
--     know where they worked?" A transfer currently overwrites the employee's
--     location with no record that the previous one existed, so the question
--     is unanswerable after the fact. Written only by a roster-managing
--     administrator, the same permission that performs the transfer itself.
--
--   * `training-records-v1` — USDA Professional Standards training entries,
--     one per training event, carrying the employees it covered. Required
--     hours restart each July. Administrator-only for now: the entry form Liz
--     described selects across all schools at once, which is a district act.
--
--   * `pending-approvals-v1` — declared ahead of the edit/transfer approval
--     workflow ("Other admin logins can request to edit/transfer with my
--     approval?"), which is still being specified. Nothing writes it yet. The
--     precedent is `all-star-recognition-v1`, admitted by the previous
--     migration ahead of its own merge, so that release did not need a
--     database change of its own.
--
-- The stress/lab environment runs on Netlify Blobs, which has no allowlist, so
-- this class of failure cannot be reproduced there. `state-key-parity.test.mjs`
-- asserts the application's managed keys are a subset of this list.
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
      'employee-assignment-history-v1',
      'hr-attendance-progress-v2',
      'hr-flags',
      'all-star-recognition-v1',
      'training-records-v1',
      'pending-approvals-v1'
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
