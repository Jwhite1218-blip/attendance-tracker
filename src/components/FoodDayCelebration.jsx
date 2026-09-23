import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import foodDayLogo from '../assets/indiana-food-day.png'
import { FOOD_DAY_DISMISSED_KEY, FOOD_DAY_PATH, isFoodDay } from '../data/foodDay.js'
import './FoodDayCelebration.css'

function Arrow() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" /></svg>
}

export function FoodDayBanner({ pathname, homePath }) {
  const [active, setActive] = useState(isFoodDay)
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(FOOD_DAY_DISMISSED_KEY) === 'yes' } catch { return false }
  })

  useEffect(() => {
    const refresh = () => setActive(isFoodDay())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  if (!active || dismissed || ![homePath, '/recognition', FOOD_DAY_PATH].includes(pathname)) return null

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(FOOD_DAY_DISMISSED_KEY, 'yes') } catch { /* Dismissal still works for this visit. */ }
  }

  return (
    <aside className="food-day-banner print:hidden" aria-label="Indiana Food Day celebration">
      <div className="food-day-banner-inner">
        <span className="food-day-banner-spark" aria-hidden="true">✦</span>
        <p>Happy Indiana Food Day, team!</p>
        <Link to={FOOD_DAY_PATH}>Celebrate with us <Arrow /></Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss Food Day welcome banner">
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
