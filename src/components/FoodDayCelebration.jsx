import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import foodDayLogo from '../assets/indiana-food-day.png'
import { FOOD_DAY_PATH } from '../data/foodDay.js'
import { activeCelebration, dismissKeyFor } from '../data/celebrations.js'
import { useLanguage } from './LanguageProvider.jsx'
import './FoodDayCelebration.css'

function Arrow() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" /></svg>
}

// The greeting on a celebration day. Driven by the calendar in
// celebrations.js rather than one hard-coded date, so adding next year's
// is a row in a list.
//
// Still only on the pages somebody lands on or works the board from, still
// dismissible, and still gone the moment the day is over.
export function FoodDayBanner({ pathname, homePath }) {
  const { t } = useLanguage()
  const [celebration, setCelebration] = useState(activeCelebration)
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set())

  useEffect(() => {
    const refresh = () => setCelebration(activeCelebration())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // Read on every render rather than once, because the active celebration
  // can change under a tab left open overnight.
  const key = celebration ? dismissKeyFor(celebration) : ''
  let dismissed = dismissedKeys.has(key)
  if (key && !dismissed) {
    try { dismissed = sessionStorage.getItem(key) === 'yes' } catch { dismissed = false }
  }

  const allowedHere = [homePath, '/recognition', FOOD_DAY_PATH].includes(pathname)
  if (!celebration || dismissed || !allowedHere) return null

  const dismiss = () => {
    setDismissedKeys(current => new Set(current).add(key))
    try { sessionStorage.setItem(key, 'yes') } catch { /* Dismissal still works for this visit. */ }
  }

  const greeting = t(`celebration.${celebration.id}`)
  const callToAction = t(`celebration.cta.${celebration.id}`)

  return (
    <aside
      className={`food-day-banner food-day-banner--${celebration.tone || 'food-day'} print:hidden`}
      aria-label={greeting}
    >
      <div className="food-day-banner-inner">
        <span className="food-day-banner-spark" aria-hidden="true">{celebration.spark || '✦'}</span>
        <p>{greeting}</p>
        {celebration.path && <Link to={celebration.path}>{callToAction} <Arrow /></Link>}
        <button type="button" onClick={dismiss} aria-label="Dismiss this greeting">
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </aside>
  )
}

function Confetti() {
  return <div className="food-day-confetti" aria-hidden="true">
    {Array.from({ length: 28 }, (_, index) => (
      <i key={index} className={`food-day-confetti-piece food-day-shape-${index % 3}`} style={{
        '--piece-x': `${index % 2 ? 95 + (index % 4) : 1 + (index % 5)}%`,
        '--piece-y': `${4 + Math.floor(index / 2) * 6.7}%`,
        '--piece-turn': `${index * 37}deg`,
        '--piece-color': ['#f2262b', '#007a5b', '#d6ac12'][index % 3],
      }} />
    ))}
  </div>
}

export default function FoodDayCelebration({ homePath, canRecognize }) {
  return (
    <div className="food-day-celebration">
      <section className="food-day-hero" aria-labelledby="food-day-heading">
        <Confetti />
        <div className="food-day-hero-inner">
          <div className="food-day-copy">
            <h1 id="food-day-heading"><span>Local food.</span><span>All-star</span><span>team.</span></h1>
            <p className="food-day-thanks">For every meal you prepare and every student you welcome—today, we celebrate you.</p>
            <div className="food-day-actions">
              {canRecognize && <Link className="food-day-primary" to="/recognition">Celebrate a teammate</Link>}
              <Link className="food-day-secondary" to={homePath}>Back to my dashboard</Link>
            </div>
          </div>
          <div className="food-day-poster">
            <img src={foodDayLogo} alt="Indiana Food Day: a smiling tomato wearing star sunglasses above an outline of Indiana" width="331" height="495" />
          </div>
        </div>
      </section>
      <footer className="food-day-footer">
        <div>
          <h2>Warren Student Nutrition Team</h2>
          <p>Every school. Every kitchen. Every one of you.</p>
        </div>
        <time dateTime="2026-09-23">September 23, 2026</time>
      </footer>
    </div>
  )
}
