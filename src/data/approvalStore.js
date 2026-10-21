// Reading and writing the queue of roster changes awaiting Liz.
//
// The rules live in approvalRequests.js, which touches no storage and is
// tested on its own. This file is the thin part that talks to the shared
// store, so a browser is the only thing it needs.

import { writeSharedStorage } from './sharedStore.js'
import {
  addEmployee,
  getEffectiveLocation,
  setEmployeeActive,
  transferEmployee,
  updateEmployeeRecord,
} from './employeeLocations.js'
import {
  APPROVALS_KEY,
  addRequest,
  buildRequest,
  decideRequest,
  normalizeRequests,
  pruneDecided,
} from './approvalRequests.js'

export function getApprovalRequests() {
  try {
    return normalizeRequests(JSON.parse(localStorage.getItem(APPROVALS_KEY) || '[]'))
  } catch {
    return []
  }
}

function save(requests) {
  writeSharedStorage(APPROVALS_KEY, pruneDecided(requests))
}

// Builds and stores in one step, because every caller does both and the
// validation belongs to the building half.
export function submitRequest(input) {
  const request = buildRequest(input)
  const next = addRequest(getApprovalRequests(), request)
  save(next)
  return request
}

export function decideApprovalRequest(id, decision) {
  const next = decideRequest(getApprovalRequests(), id, decision)
  save(next)
  return next.find(request => request.id === String(id))
}

// Carries out an approved request, using exactly the functions the direct
// path uses. Nothing here is a second implementation of a roster change —
// an approval is somebody else pressing the same button.
//
// Called only after the decision is recorded, so a failure here leaves the
// request marked approved and unapplied rather than applied and unrecorded.
// That is the safer way round: Liz can see it and retry, whereas a silent
// double application could not be undone.
export function applyApprovedRequest(request, actor = '') {
  if (!request || typeof request !== 'object') throw new Error('Nothing to apply.')

  switch (request.type) {
    case 'edit': {
      const { location, ...fields } = request.payload || {}
      // An edit that moves somebody is still a transfer underneath, so it
      // writes the assignment history too rather than silently relocating
      // them with no record of the move.
      if (location && location !== getEffectiveLocation(request.empId)) {
        transferEmployee(request.empId, location, actor)
      }
      if (Object.keys(fields).length) updateEmployeeRecord(request.empId, fields)
      return
    }
    case 'transfer':
      transferEmployee(request.empId, request.payload?.to, actor)
      return
    case 'deactivate':
      setEmployeeActive(request.empId, request.payload?.active === true)
      return
    case 'add':
      addEmployee(request.payload || {})
      return
    default:
      throw new Error('Unknown kind of request.')
  }
}
