import { useState } from 'react'
import { useAuth } from '../components/PinGate.jsx'
import {
  downloadFullBackup,
  readBackupFile,
  restoreFullBackup,
  validateBackupEnvelope,
} from '../data/backupRecovery.js'

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function BackupRecovery() {
  const access = useAuth()
  const [selectedBackup, setSelectedBackup] = useState(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const handleDownload = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await downloadFullBackup()
      setMessage({ type: 'success', text: `${result.filename} downloaded with ${result.sectionCount} data sections.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async event => {
    const file = event.target.files?.[0]
    setSelectedBackup(null)
    setSelectedFileName(file?.name || '')
    setConfirmation('')
    setMessage(null)
    if (!file) return
    try {
      const backup = await readBackupFile(file)
      setSelectedBackup(backup)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const handleRestore = async () => {
    if (!selectedBackup) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await restoreFullBackup(selectedBackup, confirmation)
      setMessage({ type: 'success', text: `Backup restored successfully at ${formatDateTime(result.restoredAt)}. Reloading the verified data…` })
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
      setBusy(false)
    }
  }

  const summary = selectedBackup ? validateBackupEnvelope(selectedBackup) : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Liz administrator only</p>
        <h1 className="mt-2 text-2xl font-black text-gray-950">Backup & Recovery</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-950/80">
          Warren’s live records are stored separately from the website. Refreshing the page, signing out, or publishing a new website version does not replace the database.
        </p>
      </div>

      {message && (
        <div role="status" className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${message.type === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-700" aria-hidden="true">↓</div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">1. Download a complete backup</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Save this private JSON file somewhere Liz controls. It contains attendance, HR notes, roster changes, blackout dates, and All-Star recognition records.
          </p>
          <button type="button" onClick={handleDownload} disabled={busy} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60">
            {busy ? 'Working…' : 'Download complete backup'}
          </button>
          <p className="mt-3 text-xs font-medium text-amber-700">Keep backup files private because they may contain confidential attendance and HR information.</p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-xl text-amber-700" aria-hidden="true">↻</div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">2. Restore without technical help</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">Choose the most recent trusted backup. The system validates it and keeps an automatic safety copy of the current data before restoring.</p>
          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Backup file</span>
            <input type="file" accept="application/json,.json" onChange={handleFile} disabled={busy} className="mt-1.5 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
          </label>
          {summary && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <p className="font-bold">{selectedFileName}</p>
              <p className="mt-1">Created {formatDateTime(summary.exportedAt)} by {summary.exportedBy} · {summary.sectionCount} data sections</p>
            </div>
          )}
          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Type RESTORE to confirm</span>
            <input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={!selectedBackup || busy} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold uppercase tracking-widest focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:bg-gray-50" />
          </label>
          <button type="button" onClick={handleRestore} disabled={!selectedBackup || confirmation !== 'RESTORE' || busy} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40">
            Restore this backup
          </button>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-gray-900">If the website ever appears down</h2>
        <ol className="mt-3 grid gap-3 text-sm text-gray-600 sm:grid-cols-3">
          <li className="rounded-xl bg-gray-50 p-4"><span className="block font-black text-brand-700">1 · Do not re-enter</span><span className="mt-1 block">A website outage does not mean the database was erased.</span></li>
          <li className="rounded-xl bg-gray-50 p-4"><span className="block font-black text-brand-700">2 · Reload and sign in</span><span className="mt-1 block">Use the normal Warren tracker address after service returns.</span></li>
          <li className="rounded-xl bg-gray-50 p-4"><span className="block font-black text-brand-700">3 · Restore only if missing</span><span className="mt-1 block">If verified records are absent, open this page and restore the latest backup.</span></li>
        </ol>
        <p className="mt-4 text-xs text-gray-400">Signed in as {access.displayName || 'Liz administrator'}.</p>
      </section>
    </div>
  )
}
