begin;

-- Apply a client mutation to one legacy JSON value. This helper is private and
-- can only be invoked by the server-side service role.
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
    if p_state_key not in ('attendance-blackout-dates', 'employee-custom-records') then
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

-- The UPSERT is one PostgreSQL statement. Concurrent requests lock the same
-- (district_id, state_key) row and apply their patches to the latest value.
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
      'hr-attendance-progress-v2',
      'hr-flags'
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

-- Historical assignment lookups need the non-partial employee index too; the
-- existing partial unique index only covers current assignments.
create index if not exists employee_school_assignments_employee_history_idx
  on public.employee_school_assignments (district_id, employee_id, started_on desc);

grant usage on schema app_private to service_role;
grant execute on function app_private.apply_legacy_state_mutation(text, jsonb, jsonb) to service_role;
grant execute on function public.mutate_legacy_state_entry(bigint, text, jsonb, text) to service_role;

revoke execute on function app_private.apply_legacy_state_mutation(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.mutate_legacy_state_entry(bigint, text, jsonb, text)
  from public, anon, authenticated;

commit;
