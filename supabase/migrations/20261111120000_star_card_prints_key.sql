-- Admit the star-card print queue.
--
-- Problem
-- -------
-- A Star of the Day card has to be printed for the kitchen board. When an
-- administrator records that star hours later, the kitchen needs to see it
-- the next time someone signs in, and it has to stay there until the card
-- is actually printed. That "already printed" mark is shared: printing on
-- the kitchen computer has to clear the list for every other login, so it
-- cannot live only in one browser.
--
-- `star-card-prints-v1` is that mark. One entry per physical card (a group
-- award is one card), naming the recognition records it covers. Written by
-- the same people who can record recognition. A building session is narrowed
-- to its own kitchen in the state function, the same way recognition is.
--
-- `public.mutate_legacy_state_entry` rejects any key it does not name, with
-- 'Unsupported state key.'. The stress lab runs on Netlify Blobs and has no
-- allowlist, so this failure only appears on Supabase. state-key-parity
-- checks this list.
--
-- This migration only redefines the allowlist guard. The mutation semantics,
-- concurrency behaviour, `security invoker`, pinned empty `search_path`, and
-- privilege model are unchanged. It is not applied to production from the
-- repository; it ships in the change so it can be applied before the feature
-- is used on the live site.

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
      'star-card-prints-v1',
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

revoke all on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) from public;
revoke all on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) from anon;
revoke all on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) from authenticated;
grant execute on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) to service_role;
