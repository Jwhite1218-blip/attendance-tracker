// ATTENDANCE_PEER_ADMIN_PINS_JSON adds administrators at Liz's level without
// rewriting the secret code blob. These tests exist because the failure modes
// are all silent: a peer that quietly gains or loses a capability, or one that
// looks enough like Liz to break her own PIN replacement.
import test from 'node:test'
import assert from 'node:assert/strict'
import { accessForPin, getAccessCodes } from './auth.mjs'

const LIZ = {
  role: 'admin',
  displayName: 'Liz Administrator',
  employeeId: 'emp-pwsfc85t',
  canEditAttendance: true,
  canManageRoster: true,
  canManageBlackouts: true,
}

const BASE_CODES = {
  1111: LIZ,
  2222: { role: 'school', displayName: 'Creston Manager', locationId: 'CrestonMS', canEditAttendance: true },
}

function withEnvironment(values, run) {
  const saved = {}
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function withPeers(peers, codes = BASE_CODES) {
  return {
    ATTENDANCE_ACCESS_CODES_JSON: JSON.stringify(codes),
    ATTENDANCE_PEER_ADMIN_PINS_JSON: peers === undefined ? undefined : JSON.stringify(peers),
    ATTENDANCE_SESSION_SECRET: 'test-secret',
    ATTENDANCE_LIZ_REPLACEMENT_PIN: undefined,
    ATTENDANCE_CHEF_PIN: undefined,
    ATTENDANCE_RECOGNITION_PILOT_PINS_JSON: undefined,
  }
}

test('a peer administrator gets exactly Liz\'s capabilities under their own name', () => {
  withEnvironment(withPeers({ 3333: 'Marrese' }), () => {
    const peer = accessForPin('3333')
    assert.ok(peer, 'the peer PIN signs in')
    assert.equal(peer.role, 'admin')
    assert.equal(peer.displayName, 'Marrese')
    assert.equal(peer.canManageRoster, true)
    assert.equal(peer.canManageBlackouts, true)
    assert.equal(peer.canEditAttendance, true)
    assert.equal(peer.locationId, null, 'an administrator is not tied to a building')
  })
})

// employeeId is one of the two things that identify Liz's own entry. A copy of
// it would make her PIN replacement see two candidates and stop working.
test('a peer does not inherit the employee id that identifies Liz', () => {
  withEnvironment(withPeers({ 3333: 'Marrese' }), () => {
    assert.equal(accessForPin('3333').employeeId, null)
    assert.equal(accessForPin('1111').employeeId, 'emp-pwsfc85t', 'hers is untouched')
  })
})

test('a peer whose name reads as Liz is refused', () => {
  withEnvironment(withPeers({ 3333: 'Liz Deputy', 4444: 'Elizabeth B' }), () => {
    assert.equal(accessForPin('3333'), null)
    assert.equal(accessForPin('4444'), null)
  })
})

// The whole point of an additive variable: it must never be able to take over
// a credential somebody is already using.
test('a PIN already in use is left exactly as it was', () => {
  withEnvironment(withPeers({ 2222: 'Impostor' }), () => {
    const existing = accessForPin('2222')
    assert.equal(existing.role, 'school')
    assert.equal(existing.displayName, 'Creston Manager')
    assert.equal(existing.locationId, 'CrestonMS')
    assert.equal(existing.canManageRoster, false)
  })
})

test('malformed entries are skipped without disturbing the rest', () => {
  withEnvironment(withPeers({ 12: 'Too short', 3333: '   ', 4444: 'Valid Peer' }), () => {
    assert.equal(accessForPin('12'), null)
    assert.equal(accessForPin('3333'), null)
    assert.ok(accessForPin('4444'), 'the good one still applies')
    assert.ok(accessForPin('1111'), 'Liz still signs in')
    assert.ok(accessForPin('2222'), 'the school login still signs in')
  })
})

test('a broken variable never takes the whole roster down', () => {
  for (const broken of ['not json', '[]', '"a string"']) {
    withEnvironment({
      ...withPeers(undefined),
      ATTENDANCE_PEER_ADMIN_PINS_JSON: broken,
    }, () => {
      assert.ok(accessForPin('1111'), `Liz still signs in with ${broken}`)
      assert.ok(accessForPin('2222'), `the school login still signs in with ${broken}`)
      assert.equal(Object.keys(getAccessCodes()).length, 2, 'nothing was added')
    })
  }
})

test('with no Liz entry to copy, nothing is added rather than a profile invented', () => {
  withEnvironment(withPeers({ 3333: 'Marrese' }, {
    2222: { role: 'school', displayName: 'Creston Manager', locationId: 'CrestonMS', canEditAttendance: true },
  }), () => {
    assert.equal(accessForPin('3333'), null)
    assert.ok(accessForPin('2222'))
  })
})

test('unset leaves the roster exactly as configured', () => {
  withEnvironment(withPeers(undefined), () => {
    assert.deepEqual(Object.keys(getAccessCodes()).sort(), ['1111', '2222'])
  })
})
