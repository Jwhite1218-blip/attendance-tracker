begin;

-- All Star Tracker is a standalone multi-district product. Every business row
-- carries a district_id so tenant isolation can be enforced in PostgreSQL.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.districts (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  timezone text not null default 'America/Indianapolis',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  constraint districts_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.schools (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  external_code text not null,
  name text not null,
  short_name text,
  school_type text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  constraint schools_district_external_code_key unique (district_id, external_code),
  constraint schools_district_id_id_key unique (district_id, id)
);

create table public.employees (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  external_id text not null,
  first_name text not null,
  last_name text not null,
  position text,
  birth_month smallint,
  birth_day smallint,
  hire_date date,
  service_date date,
  t_shirt_size text,
  notes text,
  active boolean not null default true,
  inactive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  constraint employees_district_external_id_key unique (district_id, external_id),
  constraint employees_district_id_id_key unique (district_id, id),
  constraint employees_birth_month_valid check (birth_month is null or birth_month between 1 and 12),
  constraint employees_birth_day_valid check (birth_day is null or birth_day between 1 and 31),
  constraint employees_t_shirt_size_length check (t_shirt_size is null or char_length(t_shirt_size) <= 24)
);

create table public.employee_school_assignments (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  employee_id bigint not null,
  school_id bigint not null,
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  constraint employee_school_assignments_employee_fkey
    foreign key (district_id, employee_id)
    references public.employees(district_id, id) on delete cascade,
  constraint employee_school_assignments_school_fkey
    foreign key (district_id, school_id)
    references public.schools(district_id, id) on delete restrict,
  constraint employee_school_assignments_date_order
    check (ended_on is null or ended_on >= started_on)
);

create unique index employee_school_assignments_one_current_idx
  on public.employee_school_assignments (district_id, employee_id)
  where ended_on is null;
create index employee_school_assignments_school_idx
  on public.employee_school_assignments (district_id, school_id, started_on desc);

create table public.attendance_entries (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  employee_id bigint not null,
  attendance_date date not null,
  code text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  constraint attendance_entries_employee_fkey
    foreign key (district_id, employee_id)
    references public.employees(district_id, id) on delete cascade,
  constraint attendance_entries_employee_date_key
    unique (district_id, employee_id, attendance_date),
  constraint attendance_entries_code_length
    check (char_length(code) between 1 and 20)
);

create index attendance_entries_district_date_idx
  on public.attendance_entries (district_id, attendance_date desc);
create index attendance_entries_employee_date_idx
  on public.attendance_entries (district_id, employee_id, attendance_date desc);

create table public.blackout_dates (
  district_id bigint not null references public.districts(id) on delete cascade,
  blackout_date date not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  primary key (district_id, blackout_date)
);

create table public.district_memberships (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  can_edit_attendance boolean not null default true,
  can_manage_roster boolean not null default false,
  can_manage_blackouts boolean not null default false,
  watermark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  constraint district_memberships_user_district_key unique (district_id, user_id),
  constraint district_memberships_role_valid check (role in ('owner', 'admin', 'school_manager', 'viewer')),
  constraint district_memberships_watermark_valid check (watermark is null or watermark = 'localis')
);

create index district_memberships_user_idx
  on public.district_memberships (user_id, district_id);

-- Compatibility bridge for the current application. This preserves the exact
-- key/value state format during cutover while normalized rows are populated.
create table public.legacy_state_entries (
  district_id bigint not null references public.districts(id) on delete cascade,
  state_key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  primary key (district_id, state_key),
  constraint legacy_state_entries_key_length check (char_length(state_key) between 1 and 200)
);

create table public.migration_runs (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  migration_name text not null,
  source_system text not null,
  status text not null,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint migration_runs_status_valid check (status in ('started', 'completed', 'failed'))
);

create index migration_runs_district_started_idx
  on public.migration_runs (district_id, started_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  actor_name text not null default 'system',
  entity_type text not null,
  entity_key text not null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_valid check (action in ('insert', 'update', 'delete', 'migration'))
);

create index audit_events_district_created_idx
  on public.audit_events (district_id, created_at desc);
create index audit_events_entity_idx
  on public.audit_events (district_id, entity_type, entity_key, created_at desc);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.capture_audit_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  target_row jsonb;
  target_district_id bigint;
  target_actor text;
  target_key text;
begin
  if tg_op = 'INSERT' then
    old_row := null;
    new_row := to_jsonb(new);
    target_row := new_row;
  elsif tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
    new_row := to_jsonb(new);
    target_row := new_row;
  else
    old_row := to_jsonb(old);
    new_row := null;
    target_row := old_row;
  end if;

  target_district_id := (target_row ->> 'district_id')::bigint;
  target_actor := coalesce(target_row ->> 'updated_by', 'system');
  target_key := coalesce(
    target_row ->> 'id',
    target_row ->> 'state_key',
    target_row ->> 'external_id',
    target_row ->> 'external_code',
    target_row ->> 'attendance_date',
    target_row ->> 'blackout_date',
    'unknown'
  );

  insert into public.audit_events (
    district_id,
    actor_name,
    entity_type,
    entity_key,
    action,
    previous_value,
    new_value
  ) values (
    target_district_id,
    target_actor,
    tg_table_name,
    target_key,
    lower(tg_op),
    old_row,
    new_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'districts',
    'schools',
    'employees',
    'employee_school_assignments',
    'attendance_entries',
    'blackout_dates',
    'district_memberships',
    'legacy_state_entries'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'schools',
    'employees',
    'employee_school_assignments',
    'attendance_entries',
    'blackout_dates',
    'district_memberships',
    'legacy_state_entries'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app_private.capture_audit_event()',
      table_name || '_capture_audit',
      table_name
    );
  end loop;
end;
$$;

-- Defense in depth: browser roles receive no table access. The live web app
-- reaches these tables only through its authenticated server functions.
alter table public.districts enable row level security;
alter table public.schools enable row level security;
alter table public.employees enable row level security;
alter table public.employee_school_assignments enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.district_memberships enable row level security;
alter table public.legacy_state_entries enable row level security;
alter table public.migration_runs enable row level security;
alter table public.audit_events enable row level security;

alter table public.districts force row level security;
alter table public.schools force row level security;
alter table public.employees force row level security;
alter table public.employee_school_assignments force row level security;
alter table public.attendance_entries force row level security;
alter table public.blackout_dates force row level security;
alter table public.district_memberships force row level security;
alter table public.legacy_state_entries force row level security;
alter table public.migration_runs force row level security;
alter table public.audit_events force row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.districts to service_role;
grant select, insert, update, delete on public.schools to service_role;
grant select, insert, update, delete on public.employees to service_role;
grant select, insert, update, delete on public.employee_school_assignments to service_role;
grant select, insert, update, delete on public.attendance_entries to service_role;
grant select, insert, update, delete on public.blackout_dates to service_role;
grant select, insert, update, delete on public.district_memberships to service_role;
grant select, insert, update, delete on public.legacy_state_entries to service_role;
grant select, insert, update on public.migration_runs to service_role;
grant select, insert on public.audit_events to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on function app_private.set_updated_at() from public, anon, authenticated;
revoke execute on function app_private.capture_audit_event() from public, anon, authenticated;

-- Warren Township is tenant one. Future districts receive their own district_id.
insert into public.districts (slug, name, timezone, updated_by)
values ('warren-township', 'MSD of Warren Township Food Service', 'America/Indianapolis', 'database foundation')
on conflict (slug) do update
set name = excluded.name,
    timezone = excluded.timezone,
    updated_by = excluded.updated_by;

insert into public.schools (
  district_id,
  external_code,
  name,
  short_name,
  school_type,
  sort_order,
  updated_by
)
select
  districts.id,
  seed.external_code,
  seed.name,
  seed.short_name,
  seed.school_type,
  seed.sort_order,
  'database foundation'
from public.districts
cross join (values
  ('WarrenCnHS', 'Warren Central HS', 'Warren Central', 'High School', 1),
  ('StonyBrkMS', 'Stony Brook MS', 'Stony Brook', 'Middle School', 2),
  ('CrestonMS', 'Creston MS', 'Creston', 'Middle School', 3),
  ('RaymondPkM', 'Raymond Park MS', 'Raymond Park', 'Middle School', 4),
  ('HawthorneE', 'Hawthorne Elementary', 'Hawthorne', 'Elementary', 5),
  ('EastridgeE', 'Eastridge Elementary', 'Eastridge', 'Elementary', 6),
  ('GrassyCrkE', 'Grassy Creek Elementary', 'Grassy Creek', 'Elementary', 7),
  ('LakesideES', 'Lakeside Elementary', 'Lakeside', 'Elementary', 8),
  ('LibertyPkE', 'Liberty Park Elementary', 'Liberty Park', 'Elementary', 9),
  ('BrookViewE', 'Brookview Elementary', 'Brookview', 'Elementary', 10),
  ('LowellES', 'Lowell Elementary', 'Lowell', 'Elementary', 11),
  ('PleasantRn', 'Pleasant Run Elementary', 'Pleasant Run', 'Elementary', 12),
  ('SunnyHt ES', 'Sunny Heights Elementary', 'Sunny Heights', 'Elementary', 13),
  ('WarrenEC', 'Warren Early Childhood', 'Warren EC', 'Elementary', 14),
  ('WarrenOAca', 'Warren OA Academy', 'Warren Academy', 'Academy', 15),
  ('Admin', 'District Admin', 'Admin', 'Administration', 16)
) as seed(external_code, name, short_name, school_type, sort_order)
where districts.slug = 'warren-township'
on conflict (district_id, external_code) do update
set name = excluded.name,
    short_name = excluded.short_name,
    school_type = excluded.school_type,
    sort_order = excluded.sort_order,
    updated_by = excluded.updated_by;

commit;
