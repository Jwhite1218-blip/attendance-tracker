-- A username on an access profile.
--
-- Problem
-- -------
-- A PIN alone picks a login out of all nineteen. Four digits is a small
-- space, and a guess that lands anywhere lands somewhere real — the guesser
-- does not have to know whose account they are reaching, only that some
-- account answers to 4071.
--
-- Liz, 2026-10-26: "is it possible to create an extra level of security by
-- adding a username to each login... just like their 1st initial and last
-- name (eschmitt for example) and then their pin would remain the same.
-- Can we start this with the admin member logins only first?"
--
-- With a username the lookup starts from the person rather than from the
-- digits, so a guessed PIN is worth nothing on its own and two logins may
-- hold the same PIN without colliding.
--
-- What this does NOT do
-- ---------------------
-- Nothing changes for a profile whose username is null, which is all of
-- them the moment this runs. The column is nullable on purpose: the
-- fifteen kitchen managers keep signing in with a PIN alone, and Liz turns
-- this on one administrator at a time.
--
-- The rule that makes it worth anything lives in the application, in
-- resolveAccessForPin: a profile WITH a username can only be reached by
-- supplying that username. A PIN-only attempt against it is refused rather
-- than falling through to the legacy environment-variable path, which has
-- no usernames and would otherwise hand the account over anyway.
--
-- Stored in plain text, like display_name beside it. A username is an
-- identifier, not a secret — the secret is still the PIN, which stays
-- encrypted with its separate HMAC lookup column. Storing it readable is
-- what lets the access screen show Liz who is who.

alter table public.access_profiles
  add column if not exists username text;

-- Case-insensitive uniqueness within a district. "EScHmitt" and "eschmitt"
-- are the same person, and sign-in lowercases before it looks anything up.
--
-- An index rather than a table constraint because the uniqueness is over
-- lower(username) rather than the raw column, and because a partial index
-- lets the nulls coexist — nineteen profiles with no username are not
-- nineteen duplicates.
create unique index if not exists access_profiles_unique_username
  on public.access_profiles (district_id, lower(username))
  where username is not null;

-- Blank is not a username. Without this a saved empty string would read as
-- "has a username" to the sign-in rule and lock that login out of both
-- paths at once.
alter table public.access_profiles
  drop constraint if exists access_profiles_username_not_blank;

alter table public.access_profiles
  add constraint access_profiles_username_not_blank
    check (username is null or length(trim(username)) >= 3);

-- Liz, 2026-10-26: administrators first. A school login that acquired a
-- username would stop working the moment its manager typed only a PIN, and
-- the fifteen of them are the people least able to ring somebody about it.
-- Lift this when she asks for the buildings.
alter table public.access_profiles
  drop constraint if exists access_profiles_username_admin_only;

alter table public.access_profiles
  add constraint access_profiles_username_admin_only
    check (username is null or role = 'admin');

-- Two more audit events, so "who gave Chris a username" has an answer the
-- same way "who moved Creston's PIN" does. Without widening this check the
-- audit insert fails, and access-admin treats that as a failed save — the
-- username would be refused for a reason nobody could see.
alter table public.access_changes
  drop constraint if exists access_changes_event_check;

alter table public.access_changes
  add constraint access_changes_event_check
    check (event in (
      'created', 'updated', 'pin-changed', 'disabled', 'enabled', 'deleted',
      'migrated', 'username-set', 'username-cleared'
    ));
