import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import warrenLogo from '../assets/warren-logo.png'

const TEST_ENVIRONMENT_LABEL = String(import.meta.env.VITE_TEST_ENVIRONMENT_LABEL || '').trim()
const REFRESH_INTERVAL_MS = 60 * 1000

function LeaderBadge({ label, value, tone = 'amber' }) {
  const colors = tone === 'sky'
    ? 'border-sky-200 bg-sky-50 text-sky-900'
    : tone === 'purple'
      ? 'border-purple-200 bg-purple-50 text-purple-900'
      : 'border-amber-200 bg-amber-50 text-amber-950'
  return (
    <span className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ${colors}`}>
      {label} <strong className="ml-1 text-sm">{value}</strong>
    </span>
  )
}

function LeaderRow({ leader }) {
  const topThreeStyles = {
    1: 'border-[#d8af36] bg-gradient-to-r from-[#fff5c7] via-white to-white shadow-[0_10px_35px_rgba(174,116,30,0.16)]',
    2: 'border-slate-300 bg-gradient-to-r from-slate-100 to-white',
    3: 'border-orange-300 bg-gradient-to-r from-orange-50 to-white',
  }
  return (
    <article className={`rounded-2xl border p-4 sm:p-5 ${topThreeStyles[leader.rank] || 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-4">
        <span className={`all-star-display flex h-12 w-12 flex-none items-center justify-center rounded-full text-2xl ${leader.rank <= 3 ? 'bg-[#201a11] text-[#ffd75c]' : 'bg-gray-100 text-gray-600'}`}>
          {leader.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="truncate text-lg font-black text-gray-950 sm:text-xl">{leader.name}</h2>
            <div className="flex-none text-right">
              <p className="all-star-display text-4xl leading-none text-[#ad741e]">{leader.earnedStars}</p>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">earned stars</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <LeaderBadge label="Daily" value={leader.dailyStars} />
            <LeaderBadge label="Shout-outs" value={leader.shoutOuts} tone="purple" />
            <LeaderBadge label="Shooting nominations" value={leader.shootingNominations} tone="sky" />
            {leader.buildingAllStars > 0 && <LeaderBadge label="Monthly All-Star" value={leader.buildingAllStars} />}
            {leader.employeeOfMonth > 0 && <LeaderBadge label="Employee of Month" value={leader.employeeOfMonth} />}
          </div>
        </div>
      </div>
    </article>
  )
}

function LoadingBoard() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white px-6 py-12 text-center shadow-sm">
      <span className="inline-block animate-pulse text-5xl text-[#d5aa3d]" aria-hidden="true">★</span>
      <p className="mt-3 text-sm font-bold text-gray-700">Loading the school’s All-Star board…</p>
    </div>
  )
}

export default function PublicSchoolLeaderboard() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

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
          {TEST_ENVIRONMENT_LABEL} · NFC leaderboard preview · Test data only
        </div>
      )}
      <header className="relative overflow-hidden border-b-4 border-[#d5aa3d] bg-black px-4 py-8 text-white sm:py-10">
        <span className="pointer-events-none absolute -right-10 -top-16 text-[15rem] leading-none text-[#e3b93f]/10" aria-hidden="true">★</span>
        <div className="relative mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <img src={warrenLogo} alt="Warren Township" className="h-12 w-12 rounded-xl border border-amber-300/40 bg-white object-contain p-1" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e9c866]">Warren Student Nutrition Team</p>
              <p className="mt-1 text-xs text-white/50">School All-Star leaderboard</p>
            </div>
          </div>
          <h1 className="all-star-display mt-7 text-5xl uppercase leading-none sm:text-6xl">
            {data?.school?.shortName || 'All-Star'} <span className="text-[#e7bd4d]">Leaders</span>
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
            <h2 className="all-star-display mt-3 text-2xl uppercase text-gray-950">Leaderboard unavailable</h2>
            <p className="mt-2 text-sm text-red-700">{error}</p>
          </div>
        )}
        {data && data.leaders.length > 0 && (
          <div className="space-y-3">
            {data.leaders.map(leader => <LeaderRow key={`${leader.rank}-${leader.name}`} leader={leader} />)}
          </div>
        )}
        {data && data.leaders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-5xl text-[#d5aa3d]" aria-hidden="true">☆</p>
            <h2 className="all-star-display mt-3 text-3xl uppercase text-gray-950">The board is ready</h2>
            <p className="mt-2 text-sm text-gray-500">The first saved school recognition will appear here automatically.</p>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-amber-200 bg-[#fff9e9] p-4 text-xs leading-relaxed text-gray-600">
          <p className="font-black uppercase tracking-wide text-[#9a651b]">How the board is counted</p>
          <p className="mt-2">Earned-star rank is based on Star of the Day. Warren Star Shout-Outs, Shooting Star nominations, and Employee of the Month are compiled alongside it but counted separately.</p>
          <p className="mt-2 font-semibold text-sky-800">Shooting Star nominations are tracked for Liz’s quarterly review but do not increase the earned-star rank.</p>
        </section>
        <p className="mt-5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Read-only employee recognition display · No attendance or personnel records are shown</p>
      </main>
    </div>
  )
}
