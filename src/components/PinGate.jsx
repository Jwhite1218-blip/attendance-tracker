import { useState, useEffect, createContext, useContext } from 'react'
import {
  createServerSession,
  clearClientDataCache,
  configureClientAccess,
  endServerSession,
  getServerSession,
  loadSharedState,
} from '../data/sharedStore.js'
import { fetchDeployedBuildId, shouldReloadForUpdate } from '../data/appVersion.js'
import { LanguageToggle, useLanguage } from './LanguageProvider.jsx'

// Exported so scripts/render-pages.jsx can render a page as a given role
// without signing in. Nothing behind the PIN gate is reachable on localhost,
// so executing the components under Node is the only way to prove they
// render at all — see that file for the two outages that justified it.
export const AuthContext = createContext({
  role: 'admin',
  locationId: null,
  displayName: null,
  employeeId: null,
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRecognitionAwards: true,
  recognitionOnly: false,
  canWriteEmployeeNotes: true,
  canManageRoster: true,
  canManageBlackouts: true,
  watermark: null,
  dataVersion: 0,
  syncStatus: 'saved',
})

// Who's logged in: a named admin or a school-scoped manager.
export function useAuth() {
  return useContext(AuthContext)
}

export function logout() {
  configureClientAccess(null)
  endServerSession().finally(() => window.location.reload())
}

export default function PinGate({ children }) {
  const { t } = useLanguage()
  // Use 'checking' string sentinel so it's distinct from null (= not authed)
  const [authed, setAuthed] = useState('checking')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [syncStatus, setSyncStatus] = useState('saved')
  // Which of this login's kitchens is being worked in right now.
  //
  // Liz, 2026-10-26: a few managers cover several. Rather than teach every
  // screen about a list, the context hands them locationId as usual and
  // this decides which one that is — so a single-building login is byte for
  // byte what it was, and a multi-building one simply changes what the rest
  // of the app already reads.
  //
  // Held per tab, so switching kitchen in one does not move the other, and
  // forgotten when the tab closes rather than persisting past the shift.
  const [selectedLocation, setSelectedLocation] = useState(
    () => { try { return sessionStorage.getItem('attendance-selected-location') || '' } catch { return '' } }
  )
  const chooseLocation = value => {
    setSelectedLocation(value)
    try { sessionStorage.setItem('attendance-selected-location', value) } catch { /* private window */ }
  }

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const access = await getServerSession()
        configureClientAccess(access)
        if (access) await loadSharedState()
        else clearClientDataCache()
        if (!cancelled) setAuthed(access)
      } catch (restoreError) {
        configureClientAccess(null)
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
    const handleSyncStatus = event => {
      setSyncStatus(event.detail)
      // A successful flush may return a server value that also contains edits
      // from another device. Re-read the canonical cache in mounted views.
      if (event.detail === 'saved') setDataVersion(version => version + 1)
    }
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
        await loadSharedState()
        setSyncStatus('saved')
        setDataVersion(version => version + 1)
      } catch (refreshError) {
        if (refreshError.status === 401) {
          // The 8-hour session expired while this tab sat open. Flip straight
          // back to the PIN gate rather than leaving a dead-looking app on
          // screen. Queued offline edits survive and flush after re-login.
          configureClientAccess(null)
          clearClientDataCache()
          setAuthed(null)
          return
        }
        // Keep the last confirmed cache available during a brief network issue.
        setSyncStatus('pending')
      } finally {
        refreshing = false
      }
    }

    const refreshOnWake = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshOnWake)
    const intervalId = window.setInterval(refresh, 60 * 1000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshOnWake)
      window.clearInterval(intervalId)
    }
  }, [authed])

  // When someone returns to a tab left open overnight — logged in or sitting
  // on the PIN screen — pick up any newer deploy before they touch anything.
  // Only on wake, never mid-use, so an in-progress edit is never lost to a
  // surprise reload.
  useEffect(() => {
    const checkVersionOnWake = () => {
      if (document.visibilityState !== 'visible') return
      fetchDeployedBuildId().then(deployedId => {
        if (shouldReloadForUpdate(__BUILD_ID__, deployedId, window.sessionStorage)) {
          window.location.reload()
        }
      })
    }
    document.addEventListener('visibilitychange', checkVersionOnWake)
    return () => document.removeEventListener('visibilitychange', checkVersionOnWake)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const access = await createServerSession(pin)
      configureClientAccess(access)
      await loadSharedState()
      setAuthed(access)
      setPin('')
    } catch (submitError) {
      configureClientAccess(null)
      await endServerSession()
      setError(submitError.message || t('gate.signInFailed'))
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  // Still checking session — show brief loading
  if (authed === 'checking') {
    return (
      <div className="min-h-screen bg-charcoal-800 flex items-center justify-center">
        <p className="text-xs text-charcoal-400">{t('gate.connecting')}</p>
      </div>
    )
  }
  // Authenticated — render the app, scoped to this session's role
  if (authed) {
    const coveredLocations = Array.isArray(authed.locationIds) && authed.locationIds.length
      ? authed.locationIds
      : [authed.locationId].filter(Boolean)
    // A remembered choice only counts while it is still one of theirs: a
    // login can be moved between buildings, and a stale selection would
    // otherwise scope them to a kitchen they no longer cover.
    const activeLocationId = coveredLocations.includes(selectedLocation)
      ? selectedLocation
      : coveredLocations[0] || null

    return (
      <AuthContext.Provider value={{
        role: authed.role,
        locationId: activeLocationId,
        locationIds: coveredLocations,
        onLocationChange: coveredLocations.length > 1 ? chooseLocation : null,
        displayName: authed.displayName || null,
        employeeId: authed.employeeId || null,
        canEditAttendance: (authed.role === 'admin' || authed.role === 'school') && authed.canEditAttendance !== false,
        // Building managers record recognition for their own team; the server
        // decides this in auth.mjs and scopes their writes to their own roster.
        canEditRecognition: (authed.role === 'admin' || authed.role === 'school')
          && authed.canEditRecognition === true,
        canManageRecognitionAwards: authed.role === 'admin'
          && authed.canManageRecognitionAwards === true,
        recognitionOnly: authed.recognitionOnly === true,
        canWriteEmployeeNotes: authed.canWriteEmployeeNotes === true,
        canManageRoster: authed.role === 'admin' && authed.canManageRoster !== false,
        canManageBlackouts: authed.role === 'admin' && authed.canManageBlackouts !== false,
        watermark: authed.watermark === 'localis' ? 'localis' : null,
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
          <h1 className="text-xl font-bold text-brand-200 tracking-wide">{t('gate.district').toUpperCase()}</h1>
          <p className="text-xs text-charcoal-300 mt-1">{t('gate.portal')}</p>
          <div className="mt-4 flex justify-center"><LanguageToggle /></div>
        </div>

        <form onSubmit={handleSubmit} className="bg-charcoal-700 rounded-xl border border-charcoal-600 p-6 shadow-xl">
          <label htmlFor="access-pin" className="block text-sm font-medium text-charcoal-100 mb-3">{t('gate.pinLabel')}</label>
          <div className="relative">
            <input
              id="access-pin"
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => { setPin(e.target.value); setError('') }}
              autoFocus
              required
              minLength={4}
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
              aria-label={showPin ? t('gate.hidePin') : t('gate.showPin')}
              aria-pressed={showPin}
              className="absolute right-1 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-md text-charcoal-300 hover:bg-charcoal-700 hover:text-charcoal-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
            {submitting ? t('gate.connecting') : t('gate.unlock')}
          </button>
        </form>

        <p className="text-center text-xs text-charcoal-500 mt-4">
          {t('gate.sessionNote')}
        </p>
      </div>
    </div>
  )
}
