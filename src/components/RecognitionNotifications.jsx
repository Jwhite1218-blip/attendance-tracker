// The first thing on a manager's dashboard when recognition happened and
// nobody at the kitchen has dealt with it yet. On the district dashboard too
// since 2026-11-11, for an administrator whose login is linked to their own
// employee card — personal news only there, no kitchen queue.
//
// Personal news is a celebration and stays until that person opens it or
// says they've seen it. A shared building login has no person attached, so
// that celebration is not shown. A Star of the Day or Shout-Out in it can be
// printed from right there — an administrator has no kitchen queue to print
// their own card from. Cards to print are the kitchen's job and stay until
// the card is printed or marked printed.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from './LanguageProvider.jsx'
import { useProgramTerms } from './useProgramTerms.js'
import { getEmployeeByKey } from '../data/employeeLocations.js'
import { RECOGNITION_TYPE_MAP, getAllRecognitions } from '../data/recognitionStore.js'
import { PRINTABLE_CARD_TYPES, cardsToPrint, personalRecognitions, printableCardFor } from '../data/recognitionNotices.js'
import {
  markRecognitionSeen,
  markStarCardsPrinted,
  printedStarCardKeys,
  rememberStarCardsPrinted,
  seenIdsForEmployee,
} from '../data/recognitionNoticeStore.js'
import { openStarCardWindow } from '../lib/starCardPrinting.js'
import confetti from '../assets/allstars/confetti.jpg'
import goldStar from '../assets/allstars/star-3d.png'

function personName(employeeId) {
  const employee = getEmployeeByKey(employeeId)
  const name = `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()
  return name || String(employeeId || '')
}

export default function RecognitionNotifications({ employeeId, locationId, canPrint, dataVersion = 0 }) {
  const { t, formatDate } = useLanguage()
  const term = useProgramTerms()
  const [revision, setRevision] = useState(0)
  const [printError, setPrintError] = useState('')
  const refresh = () => setRevision(value => value + 1)

  const personal = useMemo(
    () => personalRecognitions(getAllRecognitions(), {
      employeeId,
      seenIds: seenIdsForEmployee(employeeId),
    }),
    [employeeId, revision, dataVersion],
  )
  const cards = useMemo(
    () => cardsToPrint(getAllRecognitions(), {
      locationId,
      printedKeys: printedStarCardKeys(),
      resolveName: personName,
    }),
    [locationId, revision, dataVersion],
  )

  if (!personal.length && !cards.length) return null

  const markSeen = recognitionId => {
    markRecognitionSeen(employeeId, recognitionId)
    refresh()
  }

  const markPrinted = item => {
    markStarCardsPrinted(item.members)
    refresh()
  }

  const printCard = item => {
    setPrintError('')
    if (!openStarCardWindow([item.card])) {
      setPrintError(t('notices.popupBlocked'))
      return
    }
    try {
      markPrinted(item)
    } catch (error) {
      setPrintError(error.message)
    }
  }

  // The person's own card, group and all. Marked printed the same way the
  // kitchen queue marks it, so it does not then wait there to be printed
  // again — but a login that cannot save that mark still gets its card.
  const printMine = item => {
    setPrintError('')
    const records = getAllRecognitions()
    const record = records.find(entry => String(entry.id) === item.id)
    const printable = record && printableCardFor(record, records, personName)
    if (!printable) return
    if (!openStarCardWindow([printable.card])) {
      setPrintError(t('notices.popupBlocked'))
      return
    }
    rememberStarCardsPrinted(printable.members)
    refresh()
  }

  return (
    <div className="space-y-4 print:hidden" aria-live="polite">
      {personal.length > 0 && (
        <div className="space-y-3">
          {personal.map(item => (
            <PersonalRecognition
              key={item.id}
              item={item}
              formatDate={formatDate}
              term={term}
              t={t}
              onSeen={() => markSeen(item.id)}
              onPrint={PRINTABLE_CARD_TYPES.has(item.type) ? () => printMine(item) : null}
              employeeId={employeeId}
            />
          ))}
        </div>
      )}
      {printError && !cards.length && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/80 px-4 py-3 text-xs font-semibold text-red-100">
          {printError}
        </p>
      )}

      {cards.length > 0 && (
        <section
          className="overflow-hidden rounded-2xl border border-[#e8c65c]/45 bg-[#1c1812] text-white shadow-sm"
          aria-labelledby="cards-to-print-heading"
        >
          <header className="flex items-start gap-3 border-b border-[#e8c65c]/20 px-4 py-4 sm:px-5">
            <img src={goldStar} alt="" className="h-12 w-12 flex-none" />
            <div className="min-w-0 flex-1">
              <h2 id="cards-to-print-heading" className="all-star-display text-2xl uppercase tracking-wide text-[#f8e7b0]">
                {t('notices.cardsToPrint')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/75">{t('notices.cardsToPrintHint')}</p>
            </div>
            <span className="rounded-full bg-[#e8c65c] px-2.5 py-1 text-xs font-black text-[#241703]">{cards.length}</span>
          </header>
          <ul className="max-h-80 divide-y divide-white/10 overflow-y-auto">
            {cards.map(item => (
              <li key={item.printKey} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e8c65c]">
                    {t(`managerHome.cardType.${item.type}`)}
                  </p>
                  <p className="text-sm font-bold text-white">{item.name}</p>
                  <p className="mt-0.5 text-xs text-amber-100/75">
                    {t('notices.recordedBy', { name: item.recognizedBy || t('notices.notRecorded') })}
                    {' · '}
                    {t('notices.shinedOn', { date: formatDate(item.date, { dateStyle: 'medium' }) })}
                  </p>
                  {item.recordedLater && (
                    <p className="mt-0.5 text-xs font-semibold text-[#f4d87d]">
                      {t('notices.recordedLater', { date: formatDate(item.recordedOn, { dateStyle: 'medium' }) })}
                    </p>
                  )}
                  {item.group && (
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-[#e8c65c]">{t('notices.groupCard')}</p>
                  )}
                </div>
                {canPrint ? (
                  <div className="flex flex-none gap-2">
                    <button
                      type="button"
                      onClick={() => printCard(item)}
                      className="rounded-lg bg-[#e8c65c] px-3 py-2 text-xs font-black uppercase tracking-wide text-[#241703] hover:bg-[#ffd75c]"
                    >
                      {t('notices.print')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrintError('')
                        try {
                          markPrinted(item)
                        } catch (error) {
                          setPrintError(error.message)
                        }
                      }}
                      className="rounded-lg border border-[#e8c65c]/40 px-3 py-2 text-xs font-bold text-[#f4d87d] hover:bg-[#e8c65c]/10"
                    >
                      {t('notices.markPrinted')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-100/70">{t('notices.printLocked')}</p>
                )}
              </li>
            ))}
          </ul>
          {printError && (
            <p role="alert" className="border-t border-red-400/30 bg-red-950/40 px-4 py-3 text-xs font-semibold text-red-100 sm:px-5">
              {printError}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function PersonalRecognition({ item, formatDate, term, t, onSeen, onPrint, employeeId }) {
  const typeLabel = term.recognitionLabel(item.type, RECOGNITION_TYPE_MAP[item.type]?.label || item.type)
  const reasons = item.criteria.map(reason => term.reason(reason, reason))
  if (item.otherReason) reasons.push(item.otherReason)
  const who = item.recognizer
    ? (item.sourceName
      ? t('notices.from', { name: item.sourceName })
      : t('notices.recognizedBy', { name: item.recognizedBy }))
    : t('notices.recognizedBy', { name: t('notices.notRecorded') })

  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-[#e8c65c]/55 text-white shadow-lg"
      style={{
        backgroundColor: '#14110c',
        backgroundImage: `linear-gradient(105deg, rgba(12,10,8,0.94) 0%, rgba(12,10,8,0.82) 55%, rgba(12,10,8,0.7) 100%), url(${confetti})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="relative flex gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <img src={goldStar} alt="" className="h-16 w-16 flex-none sm:h-20 sm:w-20" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#e8c65c] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#241703]">
              {t('notices.new')}
            </span>
            <p className="all-star-script text-xl text-[#f4d87d] sm:text-2xl">{typeLabel}</p>
          </div>
          <h2 className="all-star-display mt-1 text-3xl uppercase leading-none tracking-wide text-white sm:text-4xl">
            {t('notices.youWereRecognized')}
          </h2>
          <p className="mt-3 text-sm font-semibold text-amber-50">{who}</p>
          {item.sourceName && item.recognizedBy && item.sourceName !== item.recognizedBy && (
            <p className="mt-0.5 text-xs text-amber-100/70">{t('notices.enteredBy', { name: item.recognizedBy })}</p>
          )}
          <p className="mt-1 text-sm text-amber-100/85">
            {t('notices.shinedOn', { date: formatDate(item.date, { dateStyle: 'full' }) })}
          </p>
          {item.recordedLater && (
            <p className="mt-0.5 text-sm font-semibold text-[#f4d87d]">
              {t('notices.recordedLater', { date: formatDate(item.recordedOn, { dateStyle: 'full' }) })}
            </p>
          )}
          {(reasons.length > 0 || item.note) && (
            <div className="mt-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c65c]">{t('notices.why')}</p>
              {reasons.length > 0 && <p className="mt-1 text-sm text-amber-50">{reasons.join(' · ')}</p>}
              {item.note && <p className="mt-1 text-sm italic text-white/85">“{item.note}”</p>}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSeen}
              className="rounded-lg bg-[#e8c65c] px-3 py-2 text-xs font-black uppercase tracking-wide text-[#241703] hover:bg-[#ffd75c]"
            >
              {t('notices.seen')}
            </button>
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                className="rounded-lg border border-[#e8c65c]/60 bg-[#e8c65c]/15 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#f8e7b0] hover:bg-[#e8c65c]/25"
              >
                {t('notices.printMyCard')}
              </button>
            )}
            <Link
              to={`/employee/${encodeURIComponent(employeeId)}`}
              onClick={onSeen}
              className="rounded-lg border border-[#e8c65c]/40 px-3 py-2 text-xs font-bold text-[#f4d87d] hover:bg-[#e8c65c]/10"
            >
              {t('notices.openCard')}
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
