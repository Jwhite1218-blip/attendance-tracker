// Roster changes that a limited administrator proposes and Liz decides.
//
// Liz, 2026-10-19: "I would like for admin only logins be able to request
// card edits, transfers, inactive employees or add employees. It all needs
// to go through my review."
//
// Before this, three of those four were simply refused to a limited
// administrator and the fourth — transfers — went straight through. Nobody
// had a way to ask. This adds the asking, and closes the transfer gap at the
// same time, so all four behave the same way: a full district administrator
// does them, anybody else proposes them.
//
// The permission boundary is the one the app already uses for district-wide
// policy, so there is no new notion of who Liz is: a full district
// administrator holds both roster and blackout management, and the Access
// page already labels that tier "District administrator".

import { hasLizAdminAccess } from './futureTools.js'

export const APPROVALS_KEY = 'pending-approvals-v1'

// The four things that need her review, in the order she listed them.
export const REQUEST_TYPES = Object.freeze({
  edit: { label: 'Employee card edit', verb: 'edit this card' },
  transfer: { label: 'Transfer', verb: 'transfer this employee' },
  deactivate: { label: 'Employment status', verb: 'change this employee\'s status' },
  add: { label: 'New employee', verb: 'add this employee' },
})

export function isRequestType(type) {
  return Object.prototype.hasOwnProperty.call(REQUEST_TYPES, String(type))
}

// --- who does what ---------------------------------------------------------

// A full district administrator acts directly and is the only one who can
// decide a request.
export function canDecideRequests(access = {}) {
  return hasLizAdminAccess(access)
}

// Everyone else holding administrator roster rights proposes instead. A
// school manager is not in this at all: roster changes were never theirs.
export function canRequestChanges(access = {}) {
  return access.role === 'admin'
    && access.canManageRoster === true
    && !canDecideRequests(access)
}

// The single question every roster screen asks: do I save, or do I ask?
export function rosterActionMode(access = {}) {
  if (canDecideRequests(access)) return 'direct'
  if (canRequestChanges(access)) return 'request'
  return 'none'
}

// --- the records themselves ------------------------------------------------

export class ApprovalError extends Error {}

function fail(message) {
  throw new ApprovalError(message)
}

function nowIso() {
  return new Date().toISOString()
}

export function normalizeRequests(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(entry => entry && typeof entry === 'object')
    .filter(entry => entry.id && isRequestType(entry.type))
    .map(entry => ({
      id: String(entry.id),
      type: String(entry.type),
      empId: entry.empId == null ? '' : String(entry.empId),
      employeeName: String(entry.employeeName || '').trim(),
      summary: String(entry.summary || '').trim(),
      payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
      // What the record looked like when the request was made, so a stale
      // request can be spotted rather than silently overwriting whatever
      // happened since.
      baseline: entry.baseline && typeof entry.baseline === 'object' ? entry.baseline : {},
      note: String(entry.note || '').trim(),
      requestedBy: String(entry.requestedBy || '').trim(),
      requestedAt: String(entry.requestedAt || ''),
      status: ['pending', 'approved', 'declined'].includes(entry.status) ? entry.status : 'pending',
      decidedBy: String(entry.decidedBy || '').trim(),
      decidedAt: String(entry.decidedAt || ''),
      decisionNote: String(entry.decisionNote || '').trim(),
    }))
}

export function pendingRequests(requests) {
  return normalizeRequests(requests).filter(request => request.status === 'pending')
}

export function decidedRequests(requests) {
  return normalizeRequests(requests)
    .filter(request => request.status !== 'pending')
    .sort((left, right) => String(right.decidedAt).localeCompare(String(left.decidedAt)))
}

// --- making one ------------------------------------------------------------

export function buildRequest({ type, empId = '', employeeName = '', summary = '', payload = {}, baseline = {}, note = '', requestedBy = '' }) {
  if (!isRequestType(type)) fail('Unknown kind of request.')
  if (!String(requestedBy || '').trim()) fail('A request has to say who is asking.')
  if (type !== 'add' && !String(empId || '').trim()) fail('A request has to name an employee.')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Nothing to request.')
  if (!Object.keys(payload).length) fail('Nothing to request.')

  return {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(type),
    empId: String(empId || ''),
    employeeName: String(employeeName || '').trim(),
    summary: String(summary || '').trim(),
    payload,
    baseline: baseline && typeof baseline === 'object' ? baseline : {},
    note: String(note || '').trim(),
    requestedBy: String(requestedBy).trim(),
    requestedAt: nowIso(),
    status: 'pending',
    decidedBy: '',
    decidedAt: '',
    decisionNote: '',
  }
}

// One pending request per employee per kind. Two people asking for the same
// transfer twice over is noise in Liz's queue, and approving both would apply
// the change twice.
export function addRequest(requests, request) {
  const existing = normalizeRequests(requests)
  const clash = existing.find(entry =>
    entry.status === 'pending'
    && entry.type === request.type
    && entry.empId === request.empId
    && request.type !== 'add')
  if (clash) fail(`There is already a pending ${REQUEST_TYPES[request.type].label.toLowerCase()} for this employee, asked by ${clash.requestedBy || 'someone'}.`)
  return [...existing, request]
}

// --- deciding one ----------------------------------------------------------

export function decideRequest(requests, id, { status, decidedBy, decisionNote = '' }) {
  if (status !== 'approved' && status !== 'declined') fail('A decision is either approved or declined.')
  if (!String(decidedBy || '').trim()) fail('A decision has to say who made it.')

  const existing = normalizeRequests(requests)
  const target = existing.find(entry => entry.id === String(id))
  if (!target) fail('That request is no longer in the list.')
  if (target.status !== 'pending') fail('That request has already been decided.')

  return existing.map(entry => entry.id === String(id)
    ? {
      ...entry,
      status,
      decidedBy: String(decidedBy).trim(),
      decidedAt: nowIso(),
      decisionNote: String(decisionNote || '').trim(),
    }
    : entry)
}

// Has the record moved under the request since it was made?
//
// Worth checking rather than applying blind: a request to change a position
// that was written a week ago would quietly undo whatever was corrected in
// the meantime, and Liz would have no way of knowing she had done it.
export function staleFields(request, currentRecord = {}) {
  const baseline = request?.baseline || {}
  return Object.keys(baseline)
    .filter(field => {
      const before = baseline[field]
      const now = currentRecord?.[field]
      return String(before ?? '') !== String(now ?? '')
    })
}

// Requests older than this stop being useful and start being a hazard: the
// roster has moved on. They stay visible, flagged, rather than disappearing.
export const STALE_AFTER_DAYS = 30

export function isAgedOut(request, now = new Date()) {
  const asked = Date.parse(request?.requestedAt || '')
  if (!Number.isFinite(asked)) return false
  return (now.getTime() - asked) > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

// Keeps the decided tail from growing without limit. Pending requests are
// never dropped — those are somebody waiting on an answer.
export function pruneDecided(requests, keep = 50) {
  const all = normalizeRequests(requests)
  const pending = all.filter(request => request.status === 'pending')
  const decided = all
    .filter(request => request.status !== 'pending')
    .sort((left, right) => String(right.decidedAt).localeCompare(String(left.decidedAt)))
    .slice(0, keep)
  return [...pending, ...decided]
}
