import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApprovalError,
  addRequest,
  buildRequest,
  canDecideRequests,
  canRequestChanges,
  decideRequest,
  decidedRequests,
  isAgedOut,
  normalizeRequests,
  pendingRequests,
  pruneDecided,
  rosterActionMode,
  staleFields,
} from './approvalRequests.js'

const LIZ = { role: 'admin', canManageRoster: true, canManageBlackouts: true }
// The shape the real district logins carry: roster management off, which is
// why they could not edit a card and why they need to ask at all.
const LIMITED_ADMIN = { role: 'admin', canManageRoster: false, canManageBlackouts: false }
const ROSTER_ADMIN = { role: 'admin', canManageRoster: true, canManageBlackouts: false }
const RECOGNITION_ONLY = { role: 'admin', recognitionOnly: true, canManageRoster: false }
const MANAGER = { role: 'school', locationId: 'CrestonMS', canManageRoster: false }

test('only a full district administrator decides requests', () => {
  assert.equal(canDecideRequests(LIZ), true)
  assert.equal(canDecideRequests(LIMITED_ADMIN), false)
  assert.equal(canDecideRequests(MANAGER), false)
})

test('a limited administrator proposes, and never both proposes and decides', () => {
  assert.equal(canRequestChanges(LIMITED_ADMIN), true)
  // The person who can approve has no reason to queue work for herself.
  assert.equal(canRequestChanges(LIZ), false)
})

test('a school manager gets neither route, because the roster was never theirs', () => {
  assert.equal(rosterActionMode(MANAGER), 'none')
  assert.equal(rosterActionMode(LIZ), 'direct')
})

// Reported by Liz on 2026-10-19: the other admin login showed no request
// button at all. The rule had been written as "an administrator who holds
// roster rights but is not Liz", which is close to empty in practice — the
// people this exists for are exactly the ones without roster rights.
test('an administrator without roster rights is the one who needs to ask', () => {
  assert.equal(rosterActionMode(LIMITED_ADMIN), 'request')
  assert.equal(canRequestChanges(LIMITED_ADMIN), true)
})

test('an administrator with roster rights but not Liz also asks', () => {
  assert.equal(rosterActionMode(ROSTER_ADMIN), 'request')
  assert.equal(canDecideRequests(ROSTER_ADMIN), false)
})

test('a recognition-only login has no employee record to change', () => {
  assert.equal(rosterActionMode(RECOGNITION_ONLY), 'none')
  assert.equal(canRequestChanges(RECOGNITION_ONLY), false)
})

test('every roster screen gets exactly one answer for who it is serving', () => {
  for (const access of [LIZ, LIMITED_ADMIN, ROSTER_ADMIN, RECOGNITION_ONLY, MANAGER, {}]) {
    assert.ok(['direct', 'request', 'none'].includes(rosterActionMode(access)))
  }
})

test('a request has to name who is asking and what is changing', () => {
  assert.throws(() => buildRequest({ type: 'edit', empId: '1', payload: { position: 'Cook' } }), ApprovalError)
  assert.throws(() => buildRequest({ type: 'edit', empId: '1', requestedBy: 'Dana', payload: {} }), /Nothing to request/)
  assert.throws(() => buildRequest({ type: 'nonsense', empId: '1', requestedBy: 'Dana', payload: { a: 1 } }), /Unknown kind/)
  // Only a new employee has no personnel id yet.
  assert.throws(() => buildRequest({ type: 'transfer', requestedBy: 'Dana', payload: { to: 'CrestonMS' } }), /name an employee/)
  assert.ok(buildRequest({ type: 'add', requestedBy: 'Dana', payload: { first_name: 'Sam' } }))
})

test('a new request starts pending and undecided', () => {
  const request = buildRequest({ type: 'edit', empId: '1742', requestedBy: 'Dana', payload: { position: 'Cook' } })
  assert.equal(request.status, 'pending')
  assert.equal(request.decidedBy, '')
  assert.ok(request.requestedAt)
})

test('the same ask twice over is refused rather than queued twice', () => {
  const first = buildRequest({ type: 'transfer', empId: '1742', requestedBy: 'Dana', payload: { to: 'CrestonMS' } })
  const list = addRequest([], first)
  const second = buildRequest({ type: 'transfer', empId: '1742', requestedBy: 'Pat', payload: { to: 'Sunny Heights' } })
  assert.throws(() => addRequest(list, second), /already a pending transfer/)

  // A different kind of change to the same person is a separate decision.
  const edit = buildRequest({ type: 'edit', empId: '1742', requestedBy: 'Pat', payload: { position: 'Cook' } })
  assert.equal(addRequest(list, edit).length, 2)
})

test('two new employees can be proposed at once', () => {
  const one = addRequest([], buildRequest({ type: 'add', requestedBy: 'Dana', payload: { first_name: 'Sam' } }))
  const two = addRequest(one, buildRequest({ type: 'add', requestedBy: 'Dana', payload: { first_name: 'Alex' } }))
  assert.equal(two.length, 2)
})

test('a decision records who made it and cannot be made twice', () => {
  const list = addRequest([], buildRequest({ type: 'edit', empId: '1742', requestedBy: 'Dana', payload: { position: 'Cook' } }))
  const id = list[0].id

  assert.throws(() => decideRequest(list, id, { status: 'approved' }), /who made it/)
  assert.throws(() => decideRequest(list, id, { status: 'maybe', decidedBy: 'Liz' }), /approved or declined/)

  const decided = decideRequest(list, id, { status: 'approved', decidedBy: 'Liz' })
  assert.equal(decided[0].status, 'approved')
  assert.equal(decided[0].decidedBy, 'Liz')
  assert.ok(decided[0].decidedAt)

  assert.throws(() => decideRequest(decided, id, { status: 'declined', decidedBy: 'Liz' }), /already been decided/)
})

test('declining keeps the request and the reason rather than deleting it', () => {
  const list = addRequest([], buildRequest({ type: 'add', requestedBy: 'Dana', payload: { first_name: 'Sam' } }))
  const decided = decideRequest(list, list[0].id, {
    status: 'declined',
    decidedBy: 'Liz',
    decisionNote: 'Already on the roster under another id.',
  })
  assert.equal(decided.length, 1)
  assert.equal(decided[0].decisionNote, 'Already on the roster under another id.')
})

test('pending and decided are separated for the review screen', () => {
  let list = addRequest([], buildRequest({ type: 'edit', empId: '1', requestedBy: 'Dana', payload: { position: 'Cook' } }))
  list = addRequest(list, buildRequest({ type: 'edit', empId: '2', requestedBy: 'Dana', payload: { position: 'Cook' } }))
  list = decideRequest(list, list[0].id, { status: 'approved', decidedBy: 'Liz' })

  assert.equal(pendingRequests(list).length, 1)
  assert.equal(decidedRequests(list).length, 1)
})

test('a request made against values that have since changed is flagged, not applied blind', () => {
  const request = buildRequest({
    type: 'edit',
    empId: '1742',
    requestedBy: 'Dana',
    payload: { position: 'Cook' },
    baseline: { position: 'Food Service Worker', location: 'CrestonMS' },
  })

  // Nothing moved: safe to apply.
  assert.deepEqual(staleFields(request, { position: 'Food Service Worker', location: 'CrestonMS' }), [])

  // Somebody corrected the position in the meantime. Approving would undo it.
  assert.deepEqual(staleFields(request, { position: 'Cook Manager', location: 'CrestonMS' }), ['position'])
})

test('an old request is flagged rather than quietly dropped', () => {
  const fresh = buildRequest({ type: 'edit', empId: '1', requestedBy: 'Dana', payload: { position: 'Cook' } })
  assert.equal(isAgedOut(fresh), false)

  const old = { ...fresh, requestedAt: new Date('2026-01-01').toISOString() }
  assert.equal(isAgedOut(old, new Date('2026-10-19')), true)
  // Still in the list — ageing out is a label, not a deletion.
  assert.equal(pendingRequests([old]).length, 1)
})

test('pruning never drops somebody who is still waiting on an answer', () => {
  const pending = Array.from({ length: 5 }, (_, index) =>
    buildRequest({ type: 'edit', empId: String(index), requestedBy: 'Dana', payload: { position: 'Cook' } }))
  const decided = Array.from({ length: 80 }, (_, index) => ({
    ...buildRequest({ type: 'edit', empId: `old-${index}`, requestedBy: 'Dana', payload: { position: 'Cook' } }),
    status: 'approved',
    decidedBy: 'Liz',
    decidedAt: new Date(2026, 0, 1 + index).toISOString(),
  }))

  const pruned = pruneDecided([...pending, ...decided], 50)
  assert.equal(pendingRequests(pruned).length, 5)
  assert.equal(decidedRequests(pruned).length, 50)
  // The ones kept are the most recent 50 of the 80, so the newest decision
  // survives and nothing older than the 50th does.
  const kept = decidedRequests(pruned).map(request => Date.parse(request.decidedAt))
  const all = decided.map(request => Date.parse(request.decidedAt)).sort((left, right) => right - left)
  assert.equal(Math.max(...kept), all[0])
  assert.equal(Math.min(...kept), all[49])
})

test('a corrupt stored blob reads as an empty list rather than throwing', () => {
  assert.deepEqual(normalizeRequests(null), [])
  assert.deepEqual(normalizeRequests('nonsense'), [])
  assert.deepEqual(normalizeRequests([null, {}, { id: 'x', type: 'bogus' }]), [])
  assert.equal(normalizeRequests([{ id: 'x', type: 'edit' }]).length, 1)
})
