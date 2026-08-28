import test from 'node:test'
import assert from 'node:assert/strict'
import {
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

test('school managers cannot create district Employee of the Month records', () => {
  assert.equal(recognitionTypeAllowedForRole('school', 'star-of-day'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'shooting-star'), true)
  assert.equal(recognitionTypeAllowedForRole('school', 'warren-employee-month'), false)
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
