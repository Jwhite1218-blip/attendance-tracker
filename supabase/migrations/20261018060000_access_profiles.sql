-- Access profiles: sign-in credentials out of the environment.
--
-- Why a new table rather than legacy_state_entries
-- ------------------------------------------------
-- `state.mjs` exports every row of legacy_state_entries into a downloadable
-- backup file (createBackupPayload). Credentials stored there would land in
-- a backup on somebody's laptop. These tables are reached only by their own
-- function and never by the state endpoint, and a standing test asserts the
-- key never appears in the state allowlist.
--
-- What is stored
-- --------------
-- Sixteen credentials: fifteen schools with one PIN each, plus a handful of
-- district office operators. Four digits, unchanged — this replaces where
-- the PINs live, not what they are.
--
-- The PIN is ENCRYPTED, not hashed, so the admin screen can show Liz the
-- number. Hashing would make every forgotten code a forced reissue, which is
-- worse at the job this work exists to do. Two columns, because one value
-- cannot do both jobs:
--
--   pin_encrypted — AES-256-GCM under ATTENDANCE_PIN_KEY, random IV each
--     write, so the same PIN never stores the same way twice.
--   pin_lookup    — HMAC-SHA256 under the same key. Deterministic, indexed,
--     and what sign-in actually matches on, so a sign-in is one query
--     regardless of how many profiles exist.
--
-- capabilities holds the same flags the profile JSON holds today.
-- normalizeAccessProfile in auth.mjs keeps deriving the rest; storing derived
-- values would let them drift from the code that derives them.
--
-- Access model
-- ------------
-- Service role only, exactly like legacy_state_entries: RLS is enabled and
-- no policy is created, so anon and authenticated reach nothing. The Netlify
-- function holding SUPABASE_SECRET_KEY is the only caller.

create table if not exists public.access_profiles (
  id             uuid primary key default gen_random_uuid(),
  district_id    bigint not null references public.districts(id) on delete cascade,

  pin_encrypted  text not null,
  pin_lookup     text not null,
  pin_length     smallint not null check (pin_length between 4 and 8),

  display_name   text not null check (length(trim(display_name)) > 0),
  role           text not null check (role in ('admin', 'school')),
  location_id    text,
  employee_id    text,
  capabilities   jsonb not null default '{}'::jsonb,

  -- Where this row came from, so the self-migration in Phase 1 is visible
  -- rather than having to be inferred: 'legacy' means it wrote itself in on
  -- a successful environment-blob sign-in.
  source         text not null default 'manual' check (source in ('manual', 'legacy')),

  disabled_at    timestamptz,
  last_used_at   timestamptz,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text,

  -- A school login that does not say which school is not a usable profile,
  -- and normalizeAccessProfile would reject it at sign-in. Refuse it here so
  -- it cannot be written in the first place.
  constraint access_profiles_school_needs_location
    check (role <> 'school' or (location_id is not null and length(trim(location_id)) > 0)),

  constraint access_profiles_unique_pin unique (district_id, pin_lookup)
);

create index if not exists access_profiles_district_idx
  on public.access_profiles (district_id);

-- Who changed a credential and when. Asked as "who moved Creston's PIN", and
-- today there is no answer. Never stores a PIN, including a failed one: a log
-- of mistyped PINs is a list of real PINs with digits transposed.
create table if not exists public.access_changes (
  id          bigserial primary key,
  district_id bigint not null references public.districts(id) on delete cascade,
  profile_id  uuid references public.access_profiles(id) on delete set null,
  event       text not null check (event in (
    'created', 'updated', 'pin-changed', 'disabled', 'enabled', 'deleted', 'migrated'
  )),
  detail      jsonb not null default '{}'::jsonb,
  actor       text,
  created_at  timestamptz not null default now()
);

create index if not exists access_changes_district_idx
  on public.access_changes (district_id, created_at desc);

alter table public.access_profiles enable row level security;
alter table public.access_changes  enable row level security;

-- Deliberately no policies. Enabling RLS with none defined denies every role
-- except the service role, which bypasses it. Stated here so that a future
-- reader does not add one thinking it was forgotten.

revoke all on public.access_profiles from anon, authenticated;
revoke all on public.access_changes  from anon, authenticated;
