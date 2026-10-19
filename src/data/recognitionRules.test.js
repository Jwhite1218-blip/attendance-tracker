import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aceBuckRecipientAllowed,
  monthlyDrawingStatus,
  quarterWindowFor,
  recognitionRecipients,
  recognitionTypeAllowedForRole,
} from './recognitionRules.js'

test('monthly drawing opens only in the final seven days or after the selected month', () => {
  assert.equal(monthlyDrawingStatus('2026-08', '2026-08-24').isOpen, false)
  assert.deepEqual(monthlyDrawingStatus('2026-08', '2026-08-25'), {
    isOpen: true,
    state: 'final-week',
    opensOn: '2026-08-25',
    closesOn: '2026-08-31',
  })
  assert.equal(monthlyDrawingStatus('2026-08', '2026-09-01').isOpen, true)
  assert.equal(monthlyDrawingStatus('2026-09', '2026-08-31').state, 'future')
})

// Liz, 2026-09-02: building managers give the daily star for their own team.
// Employee of the Month remains the district's award.
test('building managers may give stars, but not the district award', () => {
  assert.equal(recognitionTypeAllowedForRole('school', 'star-of-day'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'shooting-star'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'star-shout-out'), true)
  // canManageRecognitionAwards is administrator-only, so a school session is
  // refused Employee of the Month whether or not it claims the capability.
  assert.equal(recognitionTypeAllowedForRole('school', 'warren-employee-month'), false)
  assert.equal(recognitionTypeAllowedForRole('school', 'warren-employee-month', true), true)
})

test('recognition entry stays closed to every other role', () => {
  for (const role of ['district-viewer', 'public', '', undefined]) {
    assert.equal(recognitionTypeAllowedForRole(role, 'star-of-day'), false)
  }
})

test('administrators keep the district award behind its own capability', () => {
  assert.equal(recognitionTypeAllowedForRole('admin', 'warren-employee-month'), true)
  assert.equal(recognitionTypeAllowedForRole('admin', 'warren-employee-month', false), false)
  assert.equal(recognitionTypeAllowedForRole('admin', 'star-of-day', false), true)
})

test('quarterly nomination windows follow three-month calendar periods', () => {
  assert.deepEqual(quarterWindowFor('2026-08-26'), {
    start: '2026-07-01',
    end: '2026-09-30',
    label: 'Jul–Sep 2026',
  })
})

// Jon, 2026-10-19: "Admin would give out the manager/food service worker lead
// Stars or 'Ace Star Bucks' to be tracked like the employee Star of the Day."
// Top-down from the district, not peer to peer between buildings.
test('only the district awards an ACE Coach Buck', () => {
  assert.equal(recognitionTypeAllowedForRole('admin', 'ace-buck'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'ace-buck'), false,
    'a building manager cannot award one, not even to their own staff')
  assert.equal(recognitionTypeAllowedForRole('admin', 'ace-buck', false), true,
    'it is not gated behind the district award capability the way Employee of the Month is')
  assert.equal(recognitionTypeAllowedForRole('nobody', 'ace-buck'), false)
})

test('an ACE Coach Buck only goes to manager-grade staff', () => {
  const positions = ['Food Service Worker Lead', 'Food Service Manager', 'Food Service Director']
  for (const position of positions) {
    assert.equal(aceBuckRecipientAllowed({ position }, positions), true, position)
  }
  assert.equal(aceBuckRecipientAllowed({ position: 'Cook' }, positions), false)
  assert.equal(aceBuckRecipientAllowed({ position: 'Food Service Worker' }, positions), false)
  assert.equal(aceBuckRecipientAllowed({}, positions), false)
  assert.equal(aceBuckRecipientAllowed(null, positions), false)
})

test('the other recognition types are unchanged by the new one', () => {
  assert.equal(recognitionTypeAllowedForRole('school', 'star-of-day'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'warren-employee-month', false), false)
  assert.equal(recognitionTypeAllowedForRole('admin', 'warren-employee-month', true), true)
})

// Shipped broken on 2026-10-19: the page scopes its employee list to the
// building in view, so the Shout-Out picker offered only that school's own
// lead even though the server was sending all eighteen managers.
test('a Shout-Out can reach managers at other buildings', () => {
  const own = [{ id: 'a', position: 'Cook' }, { id: 'b', position: 'Food Service Worker Lead' }]
  const peers = [{ id: 'c', position: 'Food Service Worker Lead' }, { id: 'd', position: 'Food Service Manager' }]
  const isManager = employee => ['b', 'c', 'd'].includes(employee.id)

  const shoutOut = recognitionRecipients('star-shout-out', { scoped: own, peerManagers: peers, isManager })
  assert.deepEqual(shoutOut.map(e => e.id), ['a', 'b', 'c', 'd'], 'own building plus every peer manager')
})

test('a Daily Star stays inside the building', () => {
  const own = [{ id: 'a', position: 'Cook' }]
  const peers = [{ id: 'c', position: 'Food Service Worker Lead' }]
  const isManager = employee => employee.id === 'c'
  for (const type of ['star-of-day', 'shooting-star', 'warren-employee-month']) {
    assert.deepEqual(
      recognitionRecipients(type, { scoped: own, peerManagers: peers, isManager }).map(e => e.id),
      ['a'],
      type
    )
  }
})

test('an ACE Coach Buck reaches managers and nobody else', () => {
  const own = [{ id: 'a', position: 'Cook' }, { id: 'b', position: 'Food Service Worker Lead' }]
  const peers = [{ id: 'c', position: 'Food Service Manager' }]
  const isManager = employee => ['b', 'c'].includes(employee.id)
  assert.deepEqual(
    recognitionRecipients('ace-buck', { scoped: own, peerManagers: peers, isManager }).map(e => e.id),
    ['b', 'c'],
    'the cook is not offered'
  )
})

test('the recipient rule copes with nothing passed to it', () => {
  assert.deepEqual(recognitionRecipients('star-shout-out'), [])
  assert.deepEqual(recognitionRecipients('star-of-day', { scoped: [] }), [])
})

// Liz, 2026-10-19: "remove any admin member from the list... This program is
// only awarded to kitchen managers." The district office is manager-grade
// and stays on the manager leaderboard, but does not collect the currency
// it hands out.
test('a Coach Buck reaches kitchen managers and not the district office', () => {
  const positions = ['Food Service Worker Lead', 'Food Service Manager', 'Food Service Director']
  assert.equal(aceBuckRecipientAllowed({ position: 'Food Service Worker Lead', location: 'CrestonMS' }, positions), true)
  assert.equal(aceBuckRecipientAllowed({ position: 'Food Service Director', location: 'Admin' }, positions), false)
  assert.equal(aceBuckRecipientAllowed({ position: 'Food Service Manager', location: 'Admin' }, positions), false)
  assert.equal(aceBuckRecipientAllowed({ position: 'Cook', location: 'CrestonMS' }, positions), false)
  // A Food Service Manager posted to a building IS running a kitchen, which
  // is why this is keyed on location rather than on job title.
  assert.equal(aceBuckRecipientAllowed({ position: 'Food Service Manager', location: 'CrestonMS' }, positions), true)
})

test('the Coach Buck picker drops the district office from both lists', () => {
  const scoped = [{ id: 'cook' }, { id: 'lead' }]
  const peers = [{ id: 'peer-lead' }, { id: 'director' }]
  const isManager = e => ['lead', 'peer-lead', 'director'].includes(e.id)
  const isAceEligible = e => ['lead', 'peer-lead'].includes(e.id)
  assert.deepEqual(
    recognitionRecipients('ace-buck', { scoped, peerManagers: peers, isManager, isAceEligible }).map(e => e.id),
    ['lead', 'peer-lead'],
    'the director is manager-grade but not eligible'
  )
})

test('without an eligibility test the picker still refuses a cook', () => {
  const scoped = [{ id: 'cook' }, { id: 'lead' }]
  const isManager = e => e.id === 'lead'
  assert.deepEqual(
    recognitionRecipients('ace-buck', { scoped, isManager }).map(e => e.id),
    ['lead']
  )
})
