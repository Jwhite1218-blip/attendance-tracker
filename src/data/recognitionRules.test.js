import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aceBuckRecipientAllowed,
  monthlyDrawingStatus,
  quarterWindowFor,
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
test('only the district awards an ACE Star Buck', () => {
  assert.equal(recognitionTypeAllowedForRole('admin', 'ace-buck'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'ace-buck'), false,
    'a building manager cannot award one, not even to their own staff')
  assert.equal(recognitionTypeAllowedForRole('admin', 'ace-buck', false), true,
    'it is not gated behind the district award capability the way Employee of the Month is')
  assert.equal(recognitionTypeAllowedForRole('nobody', 'ace-buck'), false)
})

test('an ACE Star Buck only goes to manager-grade staff', () => {
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
