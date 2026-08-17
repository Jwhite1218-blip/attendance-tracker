import { useState, useEffect } from 'react'

// ┌─────────────────────────────────────────────┐
// │  PIN Configuration                          │
// │  Change these PINs to whatever you want.    │
// │  Master PIN = full access to everything.    │
// │  School PINs = access to that school only.   │
// └─────────────────────────────────────────────┘

const MASTER_PIN = '4421'

const SCHOOL_PINS = {
  // Format: 'SCHOOL_ID': 'PIN'
  // Uncomment and set PINs for schools that need restricted access
  // Leave a school out of this map = no restricted PIN for it
  // 'WTHS': '1001',
  // 'WCHS': '1002',
  // 'WAHS': '1003',
  // 'WNHS': '1004',
  // 'SCE': '1005',
  // 'SME': '1006',
  // 'SWS': '1007',
  // 'LRS': '1008',
  // 'MTH': '1009',
  // 'MTHS': '1010',
  // 'PIO': '1011',
  // 'BP': '1012',
  // 'CEC': '1013',
  // 'OAK': '1014',
  // 'GRH': '1015',
}

const STORAGE_KEY = 'att-auth-session'
const SESSION_DURATION = 8 * 60 * 60 * 1000 // 8 hours in milliseconds

export function getAuthState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    // Check session expiry
    if (Date.now() - data.timestamp > SESSION_DURATION) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

export function isMaster() {
  const auth = getAuthState()
  return auth?.role === 'master'
}

export function getAccessibleLocation() {
  const auth = getAuthState()
  return auth?.role === 'school' ? auth.locationId : null
}

export function logout() {
  sessionStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

export default function PinGate({ children }) {
  const [authed, setAuthed] = useState(null) // null = checking, false = show gate, object = authed
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    setAuthed(getAuthState())
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (pin === MASTER_PIN) {
      const session = { role: 'master', timestamp: Date.now() }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      setAuthed(session)
      setPin('')
      return
    }

    // Check school PINs
    const schoolEntry = Object.entries(SCHOOL_PINS).find(([, p]) => p === pin)
    if (schoolEntry) {
      const [locationId] = schoolEntry
      const session = { role: 'school', locationId, timestamp: Date.now() }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      setAuthed(session)
      setPin('')
      return
    }

    setError('Invalid PIN. Please try again.')
    setPin('')
  }

  // Still checking session
  if (authed === null) {
    return <div className="min-h-screen bg-charcoal-800" />
  }

  // Authenticated — render the app
  if (authed) {
    return children
  }

  // Show PIN gate
  return (
    <div className="min-h-screen bg-charcoal-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-charcoal-900 rounded-lg flex items-center justify-center border border-brand-600/40">
              <svg className="w-8 h-8 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zm0 7L2 14l10 5 10-5-10-5z" />
              </svg>
            </div>
          </div>
          <h1 className="text-xl font-bold text-brand-200 tracking-wide">WARREN TOWNSHIP</h1>
          <p className="text-xs text-charcoal-300 mt-1">Food Service Attendance Portal</p>
        </div>

        {/* PIN Entry Card */}
        <form onSubmit={handleSubmit} className="bg-charcoal-700 rounded-xl border border-charcoal-600 p-6 shadow-xl">
          <label className="block text-sm font-medium text-charcoal-200 mb-3">
            Enter Access PIN
          </label>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => { setPin(e.target.value); setError('') }}
              autoFocus
              maxLength={8}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="• • • •"
              className="w-full text-center text-2xl tracking-[0.5em] font-bold bg-charcoal-800 border border-charcoal-500 rounded-lg px-4 py-3 text-brand-100 placeholder-charcoal-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-200"
            >
              {showPin ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29M3 21l3.29-3.29" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178C21.99 11.89 22 11.946 22 12s-.01.111-.036.178C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 mt-3 text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full mt-4 py-3 rounded-lg bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors"
          >
            Unlock
          </button>

          <div className="mt-4 pt-4 border-t border-charcoal-600 text-center">
            <p className="text-xs text-charcoal-400">
              Authorized personnel only
            </p>
          </div>
        </form>

        <p className="text-center text-xs text-charcoal-500 mt-4">
          Session expires after 8 hours · Warren Township Food Service
        </p>
      </div>
    </div>
  )
}
