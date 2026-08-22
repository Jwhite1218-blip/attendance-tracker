import test from 'node:test'
import assert from 'node:assert/strict'
import { applyStateMutation, createStateMutation } from './stateMutations.js'

test('object patches preserve unrelated concurrent attendance changes', () => {
  const base = { '2026-08-20': { code: 'A' } }
  const userValue = { ...base, '2026-08-21': { code: 'P' } }
  const concurrent = { ...base, '2026-08-22': { code: 'V' } }
  const mutation = createStateMutation('att-emp-123-2026', base, userValue)

  assert.deepEqual(applyStateMutation('att-emp-123-2026', concurrent, mutation), {
    '2026-08-20': { code: 'A' },
    '2026-08-21': { code: 'P' },
    '2026-08-22': { code: 'V' },
  })
})

test('object patches represent explicit deletion without deleting concurrent dates', () => {
  const base = {
    '2026-08-20': { code: 'A' },
    '2026-08-21': { code: 'P' },
  }
  const mutation = createStateMutation('att-emp-123-2026', base, {
    '2026-08-21': { code: 'P' },
  })
  const current = { ...base, '2026-08-22': { code: 'V' } }

  assert.deepEqual(applyStateMutation('att-emp-123-2026', current, mutation), {
    '2026-08-21': { code: 'P' },
    '2026-08-22': { code: 'V' },
  })
})

test('keyed array patches merge independent blackout changes', () => {
  const base = [{ date: '2026-09-01', label: 'Closed' }]
  const mutation = createStateMutation('attendance-blackout-dates', base, [
    ...base,
    { date: '2026-09-02', label: 'Training' },
  ])
  const current = [...base, { date: '2026-09-03', label: 'Weather' }]

  assert.deepEqual(applyStateMutation('attendance-blackout-dates', current, mutation), [
    { date: '2026-09-01', label: 'Closed' },
    { date: '2026-09-03', label: 'Weather' },
    { date: '2026-09-02', label: 'Training' },
  ])
})
