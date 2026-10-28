// The greeting that opens itself, once, on a celebration morning.
//
// Jon, 2026-10-28: "a pop up graphic that is active on everyone's PIN
// until like 10, but once they sign in it won't happen again."
//
// Three rules, and the last two are what keep it welcome:
//
//   Only on a celebration day that asks for one.
//   Only before the hour that celebration names — a manager signing in at
//   two to fix a Tuesday is working, not arriving.
//   Once. Remembered in localStorage, so it survives signing out.
//
// Remembered per device rather than per person, because that is what the
// browser can know. On a shared kitchen tablet the first person in sees
// it and the rest do not. The alternative — storing it per login — would
// be wrong in the other direction, since a building login is not one
// person either.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { celebrationPopup, popupSeenKeyFor } from '../data/celebrations.js'
import { useLanguage } from './LanguageProvider.jsx'
import './CelebrationPopup.css'

// Drawn rather than drawn on: an inline SVG scales, needs no asset, and
// takes the brand palette. The star sunglasses are deliberate — the
// Indiana Food Day tomato wears a pair, so the district already has a
// visual joke and this is the same one in season.
function Pumpkin() {
  return (
    <svg viewBox="0 0 200 170" width="188" height="160" role="img" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="celebration-gourd" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#ffb257" />
          <stop offset="58%" stopColor="#f08121" />
          <stop offset="100%" stopColor="#c2550f" />
        </radialGradient>
      </defs>

      {/* Stem and a curl of vine. */}
      <path d="M100 36c0-12-5-19-13-23 10-1 17 4 20 12 3-7 9-11 17-10-6 5-9 12-9 21z" fill="#2f6b3c" />
      <path d="M124 26c9-7 19-6 24 2" fill="none" stroke="#2f6b3c" strokeWidth="5" strokeLinecap="round" />

      {/* Body: one wide gourd with two side lobes, then ribs over the top. */}
      <ellipse cx="100" cy="104" rx="76" ry="58" fill="url(#celebration-gourd)" />
      <ellipse cx="56" cy="106" rx="34" ry="54" fill="#e9761b" opacity="0.55" />
      <ellipse cx="144" cy="106" rx="34" ry="54" fill="#e9761b" opacity="0.55" />
      <path d="M72 54c-10 30-10 70 0 100M128 54c10 30 10 70 0 100" fill="none" stroke="#b64c0c" strokeWidth="4" strokeLinecap="round" opacity="0.5" />

      {/* Star sunglasses. */}
      <path d="M44 92h112" stroke="#15120e" strokeWidth="7" strokeLinecap="round" />
      <g fill="#15120e">
        <path d="M70 70.5l7.4 15.6 17 2.5-12.3 12.3 2.9 17.3L70 109.9l-15 7.7 2.9-17.3L45.6 88.6l17-2.5z" />
        <path d="M130 70.5l7.4 15.6 17 2.5-12.3 12.3 2.9 17.3-15-7.9-15 7.7 2.9-17.3-12.3-12.2 17-2.5z" />
      </g>
      <g fill="#ffd75c">
        <path d="M70 79l4 8.6 9.4 1.4-6.8 6.7 1.6 9.5-8.2-4.3-8.2 4.2 1.6-9.4-6.8-6.7 9.4-1.4z" />
        <path d="M130 79l4 8.6 9.4 1.4-6.8 6.7 1.6 9.5-8.2-4.3-8.2 4.2 1.6-9.4-6.8-6.7 9.4-1.4z" />
      </g>

      {/* A grin, because the point is that somebody smiles at six a.m. */}
      <path d="M76 128q24 20 48 0" fill="none" stroke="#15120e" strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}

export default function CelebrationPopup({ pathname, homePath }) {
  const { t } = useLanguage()
  const [celebration] = useState(celebrationPopup)
  const [open, setOpen] = useState(false)
  const closeRef = useRef(null)

  // Marked seen as it opens, not as it closes. Somebody who closes the tab
  // rather than the dialog has still had their morning greeting, and
  // should not be met with it again on the next sign-in.
  useEffect(() => {
    if (!celebration || pathname !== homePath) return
    const key = popupSeenKeyFor(celebration)
    let seen = false
    try { seen = localStorage.getItem(key) === 'yes' } catch { seen = true }
    if (seen) return
    try { localStorage.setItem(key, 'yes') } catch { /* shows once this visit instead */ }
    setOpen(true)
  }, [celebration, pathname, homePath])

  useEffect(() => {
    if (!open) return undefined
    closeRef.current?.focus()
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open || !celebration) return null

  const close = () => setOpen(false)

  return (
    <div
      className="celebration-popup-scrim print:hidden"
      role="presentation"
      onClick={event => { if (event.target === event.currentTarget) close() }}
    >
      <div
        className={`celebration-popup celebration-popup--${celebration.tone || 'food-day'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-popup-heading"
      >
        <button
          type="button"
          ref={closeRef}
          onClick={close}
          className="celebration-popup-close"
          aria-label={t('celebration.popup.close')}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>

        <Pumpkin />

        <h2 id="celebration-popup-heading">{t(`celebration.popup.title.${celebration.id}`)}</h2>
        <p>{t(`celebration.popup.body.${celebration.id}`)}</p>

        <div className="celebration-popup-actions">
          {celebration.path && (
            <Link className="celebration-popup-go" to={celebration.path} onClick={close}>
              {t(`celebration.cta.${celebration.id}`)}
            </Link>
          )}
          <button type="button" onClick={close} className="celebration-popup-dismiss">
            {t('celebration.popup.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
