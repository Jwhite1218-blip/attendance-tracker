import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import warrenLogo from '../assets/warren-logo.png'

const TEST_ENVIRONMENT_LABEL = String(import.meta.env.VITE_TEST_ENVIRONMENT_LABEL || '').trim()
const REFRESH_INTERVAL_MS = 60 * 1000

// The kinds of recognition a person has had, never how many of each. Until
// 2026-11-11 this page ranked the school's staff by star count, first place
// in gold; the rankings came out of the app that day because recognition
// had become a contest, and this was the most public place it showed.
const AWARD_LABELS = {
  'star-of-day': { label: 'Star of the Day', colors: 'border-amber-200 bg-amber-50 text-amber-950' },
  'star-shout-out': { label: 'Shout-Out', colors: 'border-purple-200 bg-purple-50 text-purple-900' },
  'shooting-star': { label: 'Shooting Star', colors: 'border-sky-200 bg-sky-50 text-sky-900' },
  'all-star-of-month': { label: 'Building All-Star', colors: 'border-amber-300 bg-[#fff5c7] text-amber-950' },
  'warren-employee-month': { label: 'Employee of the Month', colors: 'border-amber-300 bg-[#fff5c7] text-amber-950' },
}

function PersonCard({ person }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex-none text-xl leading-none text-[#d5aa3d]" aria-hidden="true">★</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-black text-gray-950">{person.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {person.awards.map(award => (
              <span
                key={award}
                className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${AWARD_LABELS[award]?.colors || 'border-gray-200 bg-gray-50 text-gray-700'}`}
              >
                {AWARD_LABELS[award]?.label || award}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

function PeopleSection({ title, people }) {
  if (!people.length) return null
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="all-star-display text-2xl uppercase text-gray-950">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {people.map((person, index) => <PersonCard key={`${index}-${person.name}`} person={person} />)}
      </div>
    </section>
  )
}

function formatMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return 'This month'
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function LoadingBoard() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white px-6 py-12 text-center shadow-sm">
      <span className="inline-block animate-pulse text-5xl text-[#d5aa3d]" aria-hidden="true">★</span>
      <p className="mt-3 text-sm font-bold text-gray-700">Loading the school’s All-Stars…</p>
    </div>
  )
}

export default function PublicSchoolLeaderboard() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const thisMonth = data?.thisMonth || []
  const earlier = data?.earlier || []

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`/api/public-leaderboard/${encodeURIComponent(token)}`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(response.status === 404 ? 'This school leaderboard link is not valid.' : body.error)
        if (active) {
          setData(body)
          setError('')
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'The leaderboard is temporarily unavailable.')
      }
    }
    load()
    const intervalId = window.setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [token])

  return (
    <div className="min-h-screen bg-[#f6f1e4]">
      {TEST_ENVIRONMENT_LABEL && (
        <div className="bg-fuchsia-700 px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white">
          {TEST_ENVIRONMENT_LABEL} · NFC board preview · Test data only
        </div>
      )}
      <header className="relative overflow-hidden border-b-4 border-[#d5aa3d] bg-black px-4 py-8 text-white sm:py-10">
        <span className="pointer-events-none absolute -right-10 -top-16 text-[15rem] leading-none text-[#e3b93f]/10" aria-hidden="true">★</span>
        <div className="relative mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <img src={warrenLogo} alt="Warren Township" className="h-12 w-12 rounded-xl border border-amber-300/40 bg-white object-contain p-1" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e9c866]">Warren Student Nutrition Team</p>
              <p className="mt-1 text-xs text-white/50">School All-Star board</p>
            </div>
          </div>
          <h1 className="all-star-display mt-7 text-5xl uppercase leading-none sm:text-6xl">
            {data?.school?.shortName || 'Warren'} <span className="whitespace-nowrap text-[#e7bd4d]">All-Stars</span>
          </h1>
          <p className="all-star-script mt-3 text-xl text-[#f1d98c] sm:text-2xl">See who’s shining this school year.</p>
          {data && (
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-white/55">
              <span className="rounded-full border border-white/15 px-3 py-1.5">{data.school.name}</span>
              <span className="rounded-full border border-white/15 px-3 py-1.5">{data.schoolYear}</span>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">Updates automatically</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {!data && !error && <LoadingBoard />}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-4xl" aria-hidden="true">☆</p>
            <h2 className="all-star-display mt-3 text-2xl uppercase text-gray-950">Board unavailable</h2>
            <p className="mt-2 text-sm text-red-700">{error}</p>
          </div>
        )}
        {data && (thisMonth.length > 0 || earlier.length > 0) && (
          <div>
            <PeopleSection title={`Recognized in ${formatMonth(data.month)}`} people={thisMonth} />
            <PeopleSection title="Earlier this school year" people={earlier} />
          </div>
        )}
        {data && thisMonth.length === 0 && earlier.length === 0 && (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-5xl text-[#d5aa3d]" aria-hidden="true">☆</p>
            <h2 className="all-star-display mt-3 text-3xl uppercase text-gray-950">The board is ready</h2>
            <p className="mt-2 text-sm text-gray-500">The first saved school recognition will appear here automatically.</p>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-amber-200 bg-[#fff9e9] p-4 text-xs leading-relaxed text-gray-600">
          <p className="font-black uppercase tracking-wide text-[#9a651b]">About this board</p>
          <p className="mt-2">Everyone at this school recognized this school year, in name order. Nobody is ranked: whether someone was recognized once or many times, their name is shown the same way.</p>
          <p className="mt-2">Each name shows the kinds of recognition received: Star of the Day, Warren Star Shout-Outs, Shooting Stars, Building All-Star of the Month, and Employee of the Month.</p>
        </section>
        <p className="mt-5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Read-only employee recognition display · No attendance or personnel records are shown</p>
      </main>
    </div>
  )
}
