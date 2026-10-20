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

test('two administrators submitting change requests at once do not overwrite each other', () => {
  const key = 'pending-approvals-v1'
  const base = [{ id: 'req-1', type: 'edit', requestedBy: 'Dana' }]

  // Each loads the same list, then adds their own request without seeing the
  // other's. A whole-value replace would lose whichever landed first.
  const dana = createStateMutation(key, base, [...base, { id: 'req-2', type: 'transfer', requestedBy: 'Dana' }])
  const pat = createStateMutation(key, base, [...base, { id: 'req-3', type: 'add', requestedBy: 'Pat' }])

  assert.equal(dana.type, 'keyed-array-patch')

  let server = base
  server = applyStateMutation(key, server, dana)
  server = applyStateMutation(key, server, pat)

  assert.deepEqual(server.map(request => request.id).sort(), ['req-1', 'req-2', 'req-3'])
})

test('a decision on one request leaves the others alone', () => {
  const key = 'pending-approvals-v1'
  const base = [
    { id: 'req-1', status: 'pending' },
    { id: 'req-2', status: 'pending' },
  ]
  const decided = [
    { id: 'req-1', status: 'approved', decidedBy: 'Liz' },
    { id: 'req-2', status: 'pending' },
  ]

  const mutation = createStateMutation(key, base, decided)
  assert.equal(mutation.upsert.length, 1)
  assert.deepEqual(mutation.remove, [])
  assert.deepEqual(applyStateMutation(key, base, mutation), decided)
})
