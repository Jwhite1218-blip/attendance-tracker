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
import { LOCATION_MAP, LOCATIONS } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'

const CAPABILITY_LABELS = [
  ['canManageRoster', 'Roster'],
  ['canManageBlackouts', 'Blackout dates'],
  ['canManageRecognitionAwards', 'Award draws'],
  ['canEditAttendance', 'Attendance'],
  ['canEditRecognition', 'Recognition'],
]

// Seeing is separate from doing. Liz, 2026-10-26: a login can be given the
// whole district's recognition and none of its attendance, training or
// blackout dates. Unticking one of these hides the pages AND stops the
// records being sent — the server enforces it, this is only the switch.
const VISIBILITY_FLAGS = [
  ['canViewAttendance', 'Attendance', 'The tracker, employee records, the ledger and the attendance reports'],
  ['canViewTraining', 'Training', 'Professional Standards hours'],
  ['canViewBlackouts', 'Blackout dates', 'The blackout calendar'],
]

// Unticking "can see" takes the matching "can do" with it, so the form can
// never hold a contradiction the resolver then has to settle quietly.
const EDIT_REQUIRES_VIEW = {
  canViewAttendance: ['canEditAttendance', 'canManageRoster', 'canManageBlackouts'],
  canViewBlackouts: ['canManageBlackouts'],
}

function reachLabel(profile) {
  if (profile.role === 'admin') return 'Every school'
  return LOCATION_MAP[profile.locationId]?.name || profile.locationId || '—'
}

// What a login actually signs in with. A profile stores only the flags
// somebody set explicitly; the rest are derived at sign-in, and reading the
// stored half makes an implicit capability look switched off. The server
// resolves them for us — see effectiveCapabilities in access-admin.mjs.
function capabilitiesOf(profile) {
  return profile?.effectiveCapabilities || profile?.capabilities || {}
}

function tierLabel(profile) {
  if (profile.role !== 'admin') return 'School'
  const { canManageRoster, canManageBlackouts } = capabilitiesOf(profile)
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
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)

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

  // One path for every write, so the refusal from the server is what the
  // page shows. The guardrails live there; this just reports them.
  const save = useCallback(async (method, payload, successText) => {
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch('/api/access-admin', {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`)
      setNotice({ tone: 'ok', text: successText })
      setEditing(null)
      setAdding(false)
      await load()
      return true
    } catch (saveError) {
      setNotice({ tone: 'bad', text: saveError.message })
      return false
    } finally {
      setBusy(false)
    }
  }, [load])

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading || busy}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(true); setEditing(null); setNotice(null) }}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Add a login
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Changes take effect immediately. A code you change stops working at once, so tell whoever uses it
          before you save.
        </p>
      </header>

      {notice && (
        <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${
          notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
        }`}>
          {notice.text}
        </p>
      )}

      {adding && (
        <ProfileForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={values => save('POST', values, `${values.displayName} can now sign in.`)}
        />
      )}

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
                        .filter(([flag]) => capabilitiesOf(profile)[flag] === true)
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
                    <button
                      type="button"
                      onClick={() => { setEditing(editing === profile.id ? null : profile.id); setNotice(null) }}
                      disabled={busy}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      {editing === profile.id ? 'Close' : 'Edit'}
                    </button>
                  </div>
                </div>

                {editing === profile.id && (
                  <ProfileForm
                    key={profile.id}
                    profile={profile}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSubmit={values => save('PATCH', { id: profile.id, ...values }, `${values.displayName} saved.`)}
                    onChangePin={pin => save('PATCH', { id: profile.id, pin }, 'Code changed. The old one stopped working.')}
                    onToggleDisabled={() => save(
                      'PATCH',
                      { id: profile.id, disabled: !profile.disabledAt },
                      profile.disabledAt ? 'Login turned back on.' : 'Login disabled.'
                    )}
                  />
                )}

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

// One form for adding and for editing. Editing exposes two things a new
// login does not need: changing the code, and turning the login off. Both
// are separate buttons rather than fields, because they take effect on
// their own and should not be bundled into "save".
function ProfileForm({ profile = null, busy, onSubmit, onCancel, onChangePin, onToggleDisabled }) {
  const editing = Boolean(profile)
  const [form, setForm] = useState(() => ({
    displayName: profile?.displayName || '',
    role: profile?.role || 'school',
    locationId: profile?.locationId || '',
    employeeId: profile?.employeeId || '',
    pin: '',
    // Seeded from what the login actually has, not from what is written
    // down against it. Seeding from the stored half turned every implicit
    // capability into an unticked box, and saving the form then switched it
    // off for real.
    capabilities: {
      canEditAttendance: capabilitiesOf(profile).canEditAttendance ?? (profile ? false : true),
      canEditRecognition: capabilitiesOf(profile).canEditRecognition ?? (profile ? false : true),
      canManageRoster: capabilitiesOf(profile).canManageRoster ?? false,
      canManageBlackouts: capabilitiesOf(profile).canManageBlackouts ?? false,
      canManageRecognitionAwards: capabilitiesOf(profile).canManageRecognitionAwards ?? false,
      // Absent means visible, matching the server's resolver.
      canViewAttendance: capabilitiesOf(profile).canViewAttendance ?? true,
      canViewTraining: capabilitiesOf(profile).canViewTraining ?? true,
      canViewBlackouts: capabilitiesOf(profile).canViewBlackouts ?? true,
    },
  }))
  const [newPin, setNewPin] = useState('')

  // Narrowed to the building when there is one, because that is almost
  // always who a school login belongs to; the whole roster otherwise.
  const linkableEmployees = useMemo(() => {
    const scope = form.role === 'school' && form.locationId
      ? employee => employee.location === form.locationId
      : () => true
    return getEmployeesWithEffectiveLocations()
      .filter(scope)
      .map(employee => ({
        key: String(employee.kronos_id || employee.id),
        label: `${employee.first_name} ${employee.last_name}${employee.position ? ` — ${employee.position}` : ''}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [form.role, form.locationId])

  const update = (field, value) => setForm(current => ({ ...current, [field]: value }))
  const toggle = flag => setForm(current => {
    const next = { ...current.capabilities, [flag]: !current.capabilities[flag] }
    // Turning sight off turns the matching abilities off with it.
    if (next[flag] === false) {
      for (const dependent of EDIT_REQUIRES_VIEW[flag] || []) next[dependent] = false
    }
    return { ...current, capabilities: next }
  })

  const submit = event => {
    event.preventDefault()
    const values = {
      displayName: form.displayName.trim(),
      role: form.role,
      locationId: form.role === 'school' ? form.locationId : null,
      employeeId: form.employeeId || null,
      capabilities: form.capabilities,
    }
    if (!editing) values.pin = form.pin.trim()
    onSubmit(values)
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
        {editing ? 'Edit login' : 'New login'}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-700">
          Name
          <input
            value={form.displayName}
            onChange={event => update('displayName', event.target.value)}
            placeholder="Creston Manager"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-700">
          Type
          <select
            value={form.role}
            onChange={event => update('role', event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="school">One school</option>
            <option value="admin">District — every school</option>
          </select>
        </label>

        {form.role === 'school' && (
          <label className="block text-xs font-semibold text-gray-700">
            School
            <select
              value={form.locationId}
              onChange={event => update('locationId', event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal"
            >
              <option value="">Select…</option>
              {[...LOCATIONS].sort((a, b) => a.sort - b.sort).map(location => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Liz, 2026-10-26: linking a login to the person who uses it, so
            that signing in shows them their own recognition. Optional — a
            shared building login is not one person and stays unlinked. */}
        <label className="block text-xs font-semibold text-gray-700">
          Belongs to <span className="font-normal text-gray-400">(optional)</span>
          <select
            value={form.employeeId}
            onChange={event => update('employeeId', event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="">Not linked to one person</option>
            {linkableEmployees.map(employee => (
              <option key={employee.key} value={employee.key}>
                {employee.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-gray-500">
            Their own stars and Coach Bucks appear on their home page when they sign in.
          </span>
        </label>

        {!editing && (
          <label className="block text-xs font-semibold text-gray-700">
            Code
            <input
              value={form.pin}
              onChange={event => update('pin', event.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              placeholder="4 digits"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm tracking-widest"
            />
          </label>
        )}
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-gray-700">Can see</legend>
        <p className="mt-0.5 text-[11px] text-gray-500">
          Unticking one hides those pages and stops the records reaching this login at all.
        </p>
        <div className="mt-1.5 space-y-1.5">
          {VISIBILITY_FLAGS.map(([flag, label, detail]) => (
            <label key={flag} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
              form.capabilities[flag]
                ? 'border-brand-300 bg-brand-50 text-brand-900'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}>
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5"
                checked={form.capabilities[flag]}
                onChange={() => toggle(flag)}
              />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-[11px] font-normal opacity-80">{detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-gray-700">Can do</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {[
            ['canEditAttendance', 'Mark attendance'],
            ['canEditRecognition', 'Record recognition'],
            ['canManageRoster', 'Manage roster'],
            ['canManageBlackouts', 'Blackout dates'],
            ['canManageRecognitionAwards', 'Run award draws'],
          ].map(([flag, label]) => (
            <label key={flag} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              form.capabilities[flag]
                ? 'border-brand-300 bg-brand-100 text-brand-800'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}>
              <input type="checkbox" className="sr-only" checked={form.capabilities[flag]} onChange={() => toggle(flag)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {editing ? 'Save changes' : 'Create login'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-brand-200 pt-4">
          <label className="text-xs font-semibold text-gray-700">
            New code
            <input
              value={newPin}
              onChange={event => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              placeholder="4 digits"
              className="mt-1 block w-28 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm tracking-widest"
            />
          </label>
          <button
            type="button"
            disabled={busy || newPin.length < 4}
            onClick={() => onChangePin(newPin)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Change code
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onToggleDisabled}
            className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {profile.disabledAt ? 'Turn back on' : 'Disable this login'}
          </button>
        </div>
      )}
    </form>
  )
}
