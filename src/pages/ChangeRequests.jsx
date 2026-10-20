// Liz's review queue for roster changes.
//
// Her instruction, 2026-10-19: administrators who are not her propose card
// edits, transfers, status changes and new employees, and "it all needs to
// go through my review". This is the review.
//
// Nothing here is a second way to change the roster. Approving calls the
// same functions the direct path calls, so an approval is Liz pressing the
// button the requester could not.

import { useMemo, useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import { LOCATION_MAP } from '../data/locations.js'
import { getEmployeeByKey } from '../data/employeeLocations.js'
import {
  REQUEST_TYPES,
  canDecideRequests,
  decidedRequests,
  isAgedOut,
  pendingRequests,
  staleFields,
} from '../data/approvalRequests.js'
import { applyApprovedRequest, decideApprovalRequest, getApprovalRequests } from '../data/approvalStore.js'

function formatWhen(iso) {
  const parsed = Date.parse(iso || '')
  if (!Number.isFinite(parsed)) return 'Unknown date'
  return new Date(parsed).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function locationName(id) {
  return LOCATION_MAP[id]?.name || id || 'Unassigned'
}

export default function ChangeRequests() {
  const access = useAuth()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})

  const requests = useMemo(() => getApprovalRequests(), [version])
  const pending = pendingRequests(requests)
  const decided = decidedRequests(requests)

  if (!canDecideRequests(access)) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500">Only a district administrator reviews change requests.</p>
      </div>
    )
  }

  const decide = (request, status) => {
    setError('')
    try {
      // The decision is recorded first. If applying then fails, the request
      // reads as approved and not yet applied, which Liz can see and act on —
      // better than a change that happened with no record of who allowed it.
      decideApprovalRequest(request.id, {
        status,
        decidedBy: access.displayName,
        decisionNote: notes[request.id] || '',
      })
      if (status === 'approved') applyApprovedRequest(request, access.displayName)
      setNotes(current => ({ ...current, [request.id]: '' }))
      setVersion(value => value + 1)
    } catch (decisionError) {
      setError(decisionError.message || 'Unable to record that decision.')
      setVersion(value => value + 1)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Change requests</h1>
        <p className="mt-1 text-sm text-gray-500">
          Roster changes proposed by other administrators. Nothing on this page has happened yet — a change is made
          only when you approve it.
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </header>

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Waiting for you{pending.length > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{pending.length}</span>}
        </h2>

        {pending.length === 0 ? (
          <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Nothing is waiting for review.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map(request => (
              <RequestCard
                key={request.id}
                request={request}
                note={notes[request.id] || ''}
                onNote={value => setNotes(current => ({ ...current, [request.id]: value }))}
                onApprove={() => decide(request, 'approved')}
                onDecline={() => decide(request, 'declined')}
              />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Already decided</h2>
          <ul className="mt-3 space-y-2">
            {decided.map(request => (
              <li key={request.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                <span className={`font-semibold ${request.status === 'approved' ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {request.status === 'approved' ? 'Approved' : 'Declined'}
                </span>
                {' · '}
                {REQUEST_TYPES[request.type]?.label || request.type}
                {request.employeeName ? ` · ${request.employeeName}` : ''}
                {' · '}
                <span className="text-gray-500">
                  asked by {request.requestedBy || 'someone'}, decided by {request.decidedBy} on {formatWhen(request.decidedAt)}
                </span>
                {request.decisionNote && <p className="mt-1 text-gray-600">“{request.decisionNote}”</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function RequestCard({ request, note, onNote, onApprove, onDecline }) {
  // The record as it stands now, so a request written against older values
  // can be spotted before it overwrites them.
  const current = request.type === 'add' ? null : getEmployeeByKey(request.empId)
  const stale = current ? staleFields(request, { ...current, location: current.location }) : []
  const aged = isAgedOut(request)

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">
            {REQUEST_TYPES[request.type]?.label || request.type}
            {request.employeeName && <span className="font-normal text-gray-600"> · {request.employeeName}</span>}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Asked by {request.requestedBy || 'someone'} on {formatWhen(request.requestedAt)}
          </p>
        </div>
      </div>

      {request.summary && <p className="mt-2 text-sm text-gray-700">{request.summary}</p>}

      {request.type === 'add' && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-3">
          {[
            ['Personnel ID', request.payload.kronos_id],
            ['Job title', request.payload.position],
            ['School', locationName(request.payload.location)],
            ['Hire date', request.payload.hire_date],
            ['Service date', request.payload.service_date],
          ].filter(([, value]) => value).map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-400">{label}</dt>
              <dd className="font-medium text-gray-700">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {request.note && <p className="mt-2 text-xs italic text-gray-500">“{request.note}”</p>}

      {stale.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>This record has changed since the request was made.</strong> {stale.join(', ')} {stale.length === 1 ? 'is' : 'are'} no
          longer what the requester saw. Approving will overwrite the current value.
        </p>
      )}

      {aged && (
        <p className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          This request is over a month old. Check it still reflects what is wanted.
        </p>
      )}

      <label className="mt-3 block text-xs font-semibold text-gray-600">
        Note (optional, kept with the decision)
        <input
          type="text"
          value={note}
          onChange={event => onNote(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Approve and apply
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Decline
        </button>
      </div>
    </li>
  )
}
