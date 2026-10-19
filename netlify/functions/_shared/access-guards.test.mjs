// Each of these is a way to lock nineteen people out of the tracker, with
// no way back except a developer writing SQL. They are tested here rather
// than through the endpoint so the rule itself is the thing under test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GuardError,
  assertNoPrivilegeEscalation,
  assertNotLastAdministrator,
  assertNotSelfLockout,
  assertValidPin,
  assertValidProfileInput,
  isOwnProfile,
  normalizeCapabilities,
} from './access-guards.mjs'

const LIZ_SESSION = {
  profileId: 'liz-id',
  displayName: 'Elizabeth Schmitt',
  role: 'admin',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRecognitionAwards: true,
  canManageRoster: true,
  canManageBlackouts: true,
}

function profile(overrides = {}) {
  return {
    id: 'liz-id',
    display_name: 'Elizabeth Schmitt',
    role: 'admin',
    location_id: null,
    disabled_at: null,
    capabilities: { canManageRoster: true, canManageBlackouts: true },
    ...overrides,
  }
}

const OTHER_ADMIN = profile({
  id: 'other-id',
  display_name: 'Marlene & Reese',
})

test('a code must be four to eight digits', () => {
  assert.equal(assertValidPin('1742'), '1742')
  assert.equal(assertValidPin(' 1742 '), '1742')
  assert.equal(assertValidPin('12345678'), '12345678')
  for (const bad of ['123', '123456789', '', 'abcd', '17 42', '1.42', null]) {
    assert.throws(() => assertValidPin(bad), GuardError, JSON.stringify(bad))
  }
})

// A school login with no building is refused at sign-in, so creating one
// would mean a credential that exists and cannot be used.
test('a school login must name a real school', () => {
  assert.deepEqual(
    assertValidProfileInput({ displayName: 'Creston Manager', role: 'school', locationId: 'CrestonMS' }),
    { displayName: 'Creston Manager', role: 'school', locationId: 'CrestonMS' }
  )
  assert.throws(() => assertValidProfileInput({ displayName: 'X', role: 'school' }), /which school/)
  assert.throws(() => assertValidProfileInput({ displayName: 'X', role: 'school', locationId: 'Nowhere' }), /which school/)
})

test('a district login drops any school it was given', () => {
  assert.deepEqual(
    assertValidProfileInput({ displayName: 'Liz', role: 'admin', locationId: 'CrestonMS' }),
    { displayName: 'Liz', role: 'admin', locationId: null }
  )
})

test('a login needs a name and a real role', () => {
  assert.throws(() => assertValidProfileInput({ displayName: '  ', role: 'admin' }), /a name/)
  assert.throws(() => assertValidProfileInput({ displayName: 'x'.repeat(81), role: 'admin' }), /too long/)
  assert.throws(() => assertValidProfileInput({ displayName: 'X', role: 'superuser' }), /school or district/)
})

test('only known capability flags survive, and only as booleans', () => {
  assert.deepEqual(
    normalizeCapabilities({ canManageRoster: true, canEditAttendance: false, nonsense: true, canManageBlackouts: 'yes' }),
    { canEditAttendance: false, canManageRoster: true }
  )
  assert.deepEqual(normalizeCapabilities(null), {})
})

test('nobody can grant what they do not hold', () => {
  assert.doesNotThrow(() => assertNoPrivilegeEscalation(LIZ_SESSION, { canManageRoster: true }))
  const limited = { ...LIZ_SESSION, canManageRoster: false, canManageBlackouts: false }
  assert.throws(() => assertNoPrivilegeEscalation(limited, { canManageRoster: true }), /do not have it/)
  assert.doesNotThrow(() => assertNoPrivilegeEscalation(limited, { canManageRoster: false }),
    'withholding is always allowed')
})

test('your own profile is recognised by id, and by name when there is no id', () => {
  assert.equal(isOwnProfile(LIZ_SESSION, profile()), true)
  assert.equal(isOwnProfile(LIZ_SESSION, OTHER_ADMIN), false)
  // A session from before migration carries no profileId. The rule has to
  // keep applying to it.
  const legacySession = { displayName: 'Elizabeth Schmitt', role: 'admin', canManageRoster: true }
  assert.equal(isOwnProfile(legacySession, profile()), true)
  assert.equal(isOwnProfile(legacySession, OTHER_ADMIN), false)
  assert.equal(isOwnProfile({}, profile()), false, 'an anonymous session owns nothing')
  assert.equal(isOwnProfile(LIZ_SESSION, null), false)
})

test('you cannot disable yourself, or strip your own administrator access', () => {
  assert.throws(() => assertNotSelfLockout(LIZ_SESSION, profile(), { disabling: true }), /your own login/)
  assert.throws(
    () => assertNotSelfLockout(LIZ_SESSION, profile(), { capabilities: { canManageRoster: false, canManageBlackouts: true } }),
    /your own administrator access/
  )
  assert.doesNotThrow(() => assertNotSelfLockout(LIZ_SESSION, OTHER_ADMIN, { disabling: true }),
    'disabling somebody else is fine')
  assert.doesNotThrow(
    () => assertNotSelfLockout(LIZ_SESSION, profile(), { capabilities: { canManageRoster: true, canManageBlackouts: true } }),
    'keeping your own access is fine'
  )
})

// The worst outcome available: a district that cannot manage its own access,
// recoverable only by a developer writing SQL.
test('the last full administrator cannot be removed', () => {
  const only = [profile()]
  assert.throws(() => assertNotLastAdministrator(only, profile(), { disabling: true }), /last full administrator/)
  assert.throws(
    () => assertNotLastAdministrator(only, profile(), { capabilities: { canManageRoster: false } }),
    /last full administrator/
  )
  assert.throws(
    () => assertNotLastAdministrator(only, profile(), { role: 'school' }),
    /last full administrator/
  )
})

test('with a second administrator, the first can be stood down', () => {
  const both = [profile(), OTHER_ADMIN]
  assert.doesNotThrow(() => assertNotLastAdministrator(both, profile(), { disabling: true }))
})

// A disabled administrator is not a safety net — nobody can sign in as them.
test('a disabled administrator does not count as the other one', () => {
  const withDisabled = [profile(), profile({ id: 'other-id', display_name: 'Old Admin', disabled_at: '2026-01-01' })]
  assert.throws(() => assertNotLastAdministrator(withDisabled, profile(), { disabling: true }), /last full administrator/)
})

// Neither is a limited administrator: they cannot manage access at all.
test('a limited administrator does not count as the other one', () => {
  const withLimited = [
    profile(),
    profile({ id: 'limited-id', display_name: 'District Office', capabilities: { canManageRoster: false, canManageBlackouts: false } }),
  ]
  assert.throws(() => assertNotLastAdministrator(withLimited, profile(), { disabling: true }), /last full administrator/)
})

test('changing a non-administrator is never blocked by the last-admin rule', () => {
  const school = profile({ id: 'school-id', role: 'school', location_id: 'CrestonMS', capabilities: { canEditAttendance: true } })
  assert.doesNotThrow(() => assertNotLastAdministrator([school], school, { disabling: true }))
})
