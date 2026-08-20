import { useState, useEffect, createContext, useContext } from 'react'
import {
  createServerSession,
  endServerSession,
  getServerSession,
  loadSharedState,
} from '../data/sharedStore.js'

const AuthContext = createContext({
  role: 'admin',
  locationId: null,
  displayName: null,
  employeeId: null,
  canManageRoster: true,
  canManageBlackouts: true,
  dataVersion: 0,
  syncStatus: 'saved',
})

// Who's logged in: a named admin or a school-scoped manager.
export function useAuth() {
  return useContext(AuthContext)
}

export function logout() {
  endServerSession().finally(() => window.location.reload())
}

export default function PinGate({ children }) {
  // Use 'checking' string sentinel so it's distinct from null (= not authed)
  const [authed, setAuthed] = useState('checking')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [syncStatus, setSyncStatus] = useState('saved')

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const access = await getServerSession()
        if (access) await loadSharedState(access)
        if (!cancelled) setAuthed(access)
      } catch (restoreError) {
        await endServerSession()
        if (!cancelled) {
          setError(restoreError.message)
          setAuthed(null)
        }
      }
    }

    restoreSession()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handleSyncStatus = event => setSyncStatus(event.detail)
    window.addEventListener('attendance-sync-status', handleSyncStatus)
    return () => window.removeEventListener('attendance-sync-status', handleSyncStatus)
  }, [])

  useEffect(() => {
    if (!authed || authed === 'checking') return undefined

    let refreshing = false
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        await loadSharedState(authed, { mergeLocal: false })
        setSyncStatus('saved')
        setDataVersion(version => version + 1)
      } catch {
        // Keep the last confirmed cache available during a brief network issue.
        setSyncStatus('pending')
      } finally {
        refreshing = false
      }
    }

    window.addEventListener('focus', refresh)
    const intervalId = window.setInterval(refresh, 60 * 1000)
    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(intervalId)
    }
  }, [authed])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const access = await createServerSession(pin)
      await loadSharedState(access)
      setAuthed(access)
      setPin('')
    } catch (submitError) {
      await endServerSession()
      setError(submitError.message || 'Unable to sign in. Please try again.')
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  // Still checking session — show brief loading
  if (authed === 'checking') return <div className="min-h-screen bg-charcoal-800" />
  // Authenticated — render the app, scoped to this session's role
  if (authed) {
    return (
      <AuthContext.Provider value={{
        role: authed.role,
        locationId: authed.locationId,
        displayName: authed.displayName || null,
        employeeId: authed.employeeId || null,
        canManageRoster: authed.role === 'admin' && authed.canManageRoster !== false,
        canManageBlackouts: authed.role === 'admin' && authed.canManageBlackouts !== false,
        dataVersion,
        syncStatus,
      }}>
        {children}
      </AuthContext.Provider>
    )
  }

  // Not authenticated — show PIN gate
  return (
    <div className="min-h-screen bg-charcoal-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
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

        <form onSubmit={handleSubmit} className="bg-charcoal-700 rounded-xl border border-charcoal-600 p-6 shadow-xl">
          <label className="block text-sm font-medium text-charcoal-200 mb-3">Enter Access PIN</label>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => { setPin(e.target.value); setError('') }}
              autoFocus
              maxLength={8}
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={submitting}
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

          {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-4 py-3 rounded-lg bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 disabled:opacity-60 disabled:cursor-wait transition-colors"
          >
            {submitting ? 'Connecting…' : 'Unlock'}
          </button>
        </form>

        <p className="text-center text-xs text-charcoal-500 mt-4">
          Session expires after 8 hours · Warren Township Food Service
        </p>
      </div>
    </div>
  )
}
