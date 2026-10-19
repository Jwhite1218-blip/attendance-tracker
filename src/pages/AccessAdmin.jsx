// Who has access to the tracker, and what their PIN is.
//
// Read-only on purpose for this pass. Nineteen credentials migrated
// themselves out of a secret environment variable; before anything can
// change them, Liz and Jon should be able to look at the list and say "that
// is wrong". Create, change PIN, edit access and disable come next.
//
// This is the first time anyone has been able to see this at all. The PINs
// lived in a Netlify variable that cannot be read back, so "what is
// Creston's code?" had no answer except reissuing it.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import { hasLizAdminAccess } from '../data/futureTools.js'
import { LOCATION_MAP } from '../data/locations.js'

const CAPABILITY_LABELS = [
  ['canManageRoster', 'Roster'],
  ['canManageBlackouts', 'Blackout dates'],
  ['canManageRecognitionAwards', 'Award draws'],
  ['canEditAttendance', 'Attendance'],
  ['canEditRecognition', 'Recognition'],
]

function reachLabel(profile) {
  if (profile.role === 'admin') return 'Every school'
  return LOCATION_MAP[profile.locationId]?.name || profile.locationId || '—'
}

function tierLabel(profile) {
  if (profile.role !== 'admin') return 'School'
  const { canManageRoster, canManageBlackouts } = profile.capabilities || {}
  return canManageRoster && canManageBlackouts ? 'District administrator' : 'District (limited)'
}

function formatWhen(value) {
  if (!value) return 'Not since 19 Oct'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AccessAdmin() {
  const access = useAuth()
  const [profiles, setProfiles] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/access-admin', { credentials: 'same-origin' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`)
      setProfiles(body.profiles || [])
    } catch (loadError) {
      setError(loadError.message || 'Could not load the access list.')
      setProfiles(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => [...(profiles || [])].sort((left, right) => {
    // Disabled last, then administrators, then schools by name — the order
    // somebody scanning for a problem would want.
    if (Boolean(left.disabledAt) !== Boolean(right.disabledAt)) return left.disabledAt ? 1 : -1
    if (left.role !== right.role) return left.role === 'admin' ? -1 : 1
    return String(left.displayName).localeCompare(String(right.displayName))
  }), [profiles])

  if (!hasLizAdminAccess(access)) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-bold text-gray-900">Access</h1>
        <p className="mt-2 text-sm text-gray-500">
          Sign-in codes are managed by the district administrator. Ask Liz if somebody needs access.
        </p>
      </div>
    )
  }

  const toggleReveal = id => setRevealed(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">District administrator</p>
            <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">Access</h1>
            <p className="mt-1 text-sm text-gray-500">
              Every sign-in code for the district, what it reaches, and when it was last used.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Read-only for now. Changing a PIN, editing what it reaches, adding and disabling are the next
          step — this list exists first so you can check the nineteen codes that moved across by themselves.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <p className="mt-1 text-xs text-red-700">
            If this says table-backed access is not switched on, the deploy may predate the setting.
          </p>
        </div>
      )}

      {profiles && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-4 sm:p-5">
            <h2 className="text-sm font-bold text-gray-900">
              {profiles.length} sign-in {profiles.length === 1 ? 'code' : 'codes'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Codes are hidden until you choose Show, so the whole list is never on screen at once.
            </p>
          </div>

          <ul className="divide-y divide-gray-100">
            {sorted.map(profile => (
              <li key={profile.id} className={`p-4 sm:px-5 ${profile.disabledAt ? 'bg-gray-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                      {profile.displayName}
                      {profile.disabledAt && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600">
                          Disabled
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {tierLabel(profile)} · {reachLabel(profile)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {CAPABILITY_LABELS
                        .filter(([flag]) => profile.capabilities?.[flag] === true)
                        .map(([flag, label]) => (
                          <span key={flag} className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            {label}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex flex-none items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-base font-bold tracking-widest text-gray-900">
                        {profile.pinReadable
                          ? (revealed.has(profile.id) ? profile.pin : '•'.repeat(profile.pinLength || 4))
                          : <span className="font-sans text-xs font-semibold text-red-700">Unreadable</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">Last used {formatWhen(profile.lastUsedAt)}</p>
                    </div>
                    {profile.pinReadable && (
                      <button
                        type="button"
                        onClick={() => toggleReveal(profile.id)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        {revealed.has(profile.id) ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                </div>

                {!profile.pinReadable && (
                  <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
                    This code cannot be decrypted, so it cannot be shown or used. It still exists and still
                    counts as access. Tell Jon — it means the encryption key changed after this row was written.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {profiles && profiles.length === 0 && !error && (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
          No codes have moved across yet. They migrate as people sign in.
        </p>
      )}
    </div>
  )
}
