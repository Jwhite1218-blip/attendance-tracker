-- Let the approval queue actually save.
--
-- Problem
-- -------
-- Liz, 2026-10-27: "I tried out the feature for another admin member to
-- request to inactivate an employee with my review. It was submitted on
-- their login but when I went under my login change requests it was not
-- there."
--
-- `pending-approvals-v1` is an array whose entries have stable ids, so the
-- client sends a `keyed-array-patch` for it — two administrators can be
-- submitting at the same moment and a whole-value replace would drop
-- whichever arrived first (src/data/stateMutations.js, KEYED_ARRAY_KEYS).
--
-- But `app_private.apply_legacy_state_mutation` only ever allowed that
-- mutation type for two keys:
--
--   if p_state_key not in ('attendance-blackout-dates', 'employee-custom-records')
--     then raise exception 'Keyed array patch is not valid for this state key.'
--
-- The approvals key was added to the WRITABLE-key allowlist in
-- `public.mutate_legacy_state_entry` on 2026-10-11, and the keyed-array
-- guard in this function was never widened to match. So every request an
-- administrator submitted was refused by the database. It lived in that
-- administrator's own browser, their screen said "Sent to Liz for review",
-- and Liz's queue stayed empty.
--
-- This is the second time the same shape of gap has bitten: the state-key
-- parity test exists because `employee-manager-notes-v1` shipped missing
-- from the writable allowlist. That test checks one of the two lists in
-- this file. It now checks both — see state-key-parity.test.mjs.
--
-- On 2026-10-26 the symptom was read as a stale cache on Liz's side and
-- the change-requests page was made to refetch on arrival. That was a real
-- fault and worth fixing, but it was not this one, and fixing it could not
-- have helped: there was nothing on the server to fetch.
--
-- Identity
-- --------
-- An approval request is identified by its own `id`. The existing fallback
-- branch, coalesce(kronos_id, id), would already pick that up, but it is
-- spelled out rather than relied on — an approval request is not an
-- employee record and should not be matched by employee rules.
--
-- Nothing else in the function changes. It is reproduced whole because
-- `create or replace function` has no way to amend one branch.

create or replace function app_private.apply_legacy_state_mutation(
  p_state_key text,
  p_current jsonb,
  p_mutation jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  removed_identity text;
  patch jsonb;
  patch_identity text;
  patch_value_identity text;
begin
  if jsonb_typeof(p_mutation) <> 'object' then
    raise exception 'A valid state mutation is required.' using errcode = '22023';
  end if;

  if p_mutation ->> 'type' = 'object-patch' then
    if coalesce(jsonb_typeof(p_mutation -> 'set'), 'object') <> 'object'
       or coalesce(jsonb_typeof(p_mutation -> 'remove'), 'array') <> 'array' then
      raise exception 'Invalid object patch.' using errcode = '22023';
    end if;

    result := case when jsonb_typeof(p_current) = 'object' then p_current else '{}'::jsonb end;
    for removed_identity in
      select jsonb_array_elements_text(coalesce(p_mutation -> 'remove', '[]'::jsonb))
    loop
      result := result - removed_identity;
    end loop;
    return result || coalesce(p_mutation -> 'set', '{}'::jsonb);
  end if;

  if p_mutation ->> 'type' = 'keyed-array-patch' then
    -- 'pending-approvals-v1' added 2026-10-27. Keep this list in step with
    -- KEYED_ARRAY_KEYS in src/data/stateMutations.js; state-key-parity.test.mjs
    -- fails the build if the two drift apart again.
    if p_state_key not in (
      'attendance-blackout-dates',
      'employee-custom-records',
      'pending-approvals-v1'
    ) then
      raise exception 'Keyed array patch is not valid for this state key.' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(p_mutation -> 'upsert'), 'array') <> 'array'
       or coalesce(jsonb_typeof(p_mutation -> 'remove'), 'array') <> 'array' then
      raise exception 'Invalid keyed array patch.' using errcode = '22023';
    end if;

    result := case when jsonb_typeof(p_current) = 'array' then p_current else '[]'::jsonb end;
    for removed_identity in
      select jsonb_array_elements_text(coalesce(p_mutation -> 'remove', '[]'::jsonb))
    loop
      select coalesce(jsonb_agg(items.item), '[]'::jsonb)
      into result
      from jsonb_array_elements(result) as items(item)
      where case
        when p_state_key = 'attendance-blackout-dates' then items.item ->> 'date'
        when p_state_key = 'pending-approvals-v1' then items.item ->> 'id'
        else coalesce(items.item ->> 'kronos_id', items.item ->> 'id')
      end is distinct from removed_identity;
    end loop;

    for patch in
      select patches.item
      from jsonb_array_elements(coalesce(p_mutation -> 'upsert', '[]'::jsonb)) as patches(item)
    loop
      patch_identity := patch ->> 'identity';
      if patch_identity is null or patch_identity = '' or patch -> 'value' is null then
        raise exception 'Invalid keyed array patch identity.' using errcode = '22023';
      end if;

      patch_value_identity := case
        when p_state_key = 'attendance-blackout-dates' then patch #>> '{value,date}'
        when p_state_key = 'pending-approvals-v1' then patch #>> '{value,id}'
        else coalesce(patch #>> '{value,kronos_id}', patch #>> '{value,id}')
      end;

      if patch_value_identity is distinct from patch_identity then
        raise exception 'Keyed array identity does not match its value.' using errcode = '22023';
      end if;

      select coalesce(jsonb_agg(items.item), '[]'::jsonb)
      into result
      from jsonb_array_elements(result) as items(item)
      where case
        when p_state_key = 'attendance-blackout-dates' then items.item ->> 'date'
        when p_state_key = 'pending-approvals-v1' then items.item ->> 'id'
        else coalesce(items.item ->> 'kronos_id', items.item ->> 'id')
      end is distinct from patch_identity;
      result := result || jsonb_build_array(patch -> 'value');
    end loop;
    return result;
  end if;

  if p_mutation ->> 'type' = 'replace' then
    return coalesce(p_mutation -> 'value', 'null'::jsonb);
  end if;

  raise exception 'Unsupported state mutation type.' using errcode = '22023';
end;
$$;

-- `create or replace function` resets neither owner nor grants in every
-- case, so the privilege model is re-asserted explicitly, the same way the
-- earlier migrations do.
revoke all on function app_private.apply_legacy_state_mutation(text, jsonb, jsonb) from public;
grant execute on function app_private.apply_legacy_state_mutation(text, jsonb, jsonb) to service_role;
