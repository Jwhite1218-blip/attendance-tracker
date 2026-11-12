// The printable Star of the Day card, 4" x 3.5", six to a US Letter page.
//
// One definition serves both the blank sheets printed for the bulletin board
// (scripts/make-star-cards.mjs) and the single card a manager prints straight
// after recording a star. Keeping them here means the card a manager prints
// cannot drift from the ones already pinned to the board.
//
// The layout follows Liz's printed card: script title at the left, Aramark mark
// at the right, the gold outline star behind the name rule, the reason list in
// lowercase condensed caps, and DATE / RECOGNIZED BY ruled along the foot.
//
// Reasons come from ALL_STAR_REASON_OPTIONS so the card always offers exactly
// the reasons the program recognizes.
//
// Fonts and the logo arrive as `assets` rather than being imported, because
// this module is also run under Node by the sheet generator and by its tests,
// where a .woff2 import would not resolve. With no assets the card still prints
// correctly in system faces — it just isn't the branded version.

import { ALL_STAR_REASON_OPTIONS } from './recognitionStore.js'
import { PROGRAM_STRINGS } from './programVocabulary.js'

// The card is handed to the person it is about, and a good share of the
// kitchens are Spanish-speaking. Liz, 2026-10-19: both languages on the one
// card rather than printing two versions, so a manager never has to pick
// which card somebody gets.
//
// The reason words come from the same Spanish dictionary the screens use, so
// a correction made during the Spanish review reaches the printed card too.
// The four fixed labels are the card's own furniture and live here.
const ES = PROGRAM_STRINGS.es

const CARD_LABELS = {
  title: ['Star of the Day', 'Estrella del Día'],
  why: ['Why they shine :', 'Por qué brillan :'],
  date: ['Date', 'Fecha'],
  by: ['Recognized by', 'Reconocido por'],
}

function spanishReason(name) {
  return ES[`reason.${name}`] || ''
}

export const CARDS_PER_PAGE = 6

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatCardDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return escapeHtml(value)
  const [year, month, day] = String(value).split('-')
  return `${Number(month)}/${Number(day)}/${year}`
}

function awardChips(criteria) {
  return (Array.isArray(criteria) ? criteria : [])
    .filter(Boolean)
    .slice(0, 6)
    .map(name => `<span class="chip">${escapeHtml(name)}</span>`)
    .join('')
}

// Warren Star Shout-Out, same 4" x 3.5" certificate. Teal frame, the name,
// who it is from, and the reason. No artwork behind the name. A Star Coach
// Buck is celebrated on the dashboard and is not printed.
function renderAwardCard(entry) {
  const groupSize = Array.isArray(entry.names) ? entry.names.length : 1
  const written = [String(entry.otherReason || '').trim(), String(entry.message || '').trim()].filter(Boolean)
  const slots = written.map(line => `<p class="msg">${escapeHtml(line)}</p>`)
  while (slots.length < 2) slots.push('<span class="ruled"></span>')
  const from = String(entry.sourceName || '').trim()
    ? `<p class="fromline">From ${escapeHtml(entry.sourceName)}</p>`
    : ''

  return `<article class="card card-shout">
  <div class="frame">
    <header class="head">
      <div>
        <p class="award-kicker">Warren Student Nutrition</p>
        <h2 class="award-title">Warren Star Shout-Out</h2>
        <p class="award-sub">Un reconocimiento especial</p>
      </div>
      <span class="brand"></span>
    </header>
    <div class="namezone">
      <span class="nameline${groupSize > 1 ? ` group group-${Math.min(groupSize, 6)}` : ''}">${escapeHtml(entry.name || '')}</span>
      ${from}
    </div>
    <p class="why">${CARD_LABELS.why[0]}<span class="why-es">${CARD_LABELS.why[1]}</span></p>
    <p class="chips">${awardChips(entry.criteria)}</p>
    <div class="message">${slots.join('')}</div>
    <div class="footrow">
      <div class="field"><span class="lbl">${CARD_LABELS.date[0]}<span class="lbl-es">${CARD_LABELS.date[1]}</span></span><span class="line">${formatCardDate(entry.date)}</span></div>
      <div class="field"><span class="lbl">${CARD_LABELS.by[0]}<span class="lbl-es">${CARD_LABELS.by[1]}</span></span><span class="line">${escapeHtml(entry.recognizedBy || '')}</span></div>
    </div>
  </div>
</article>`
}

function renderCard(entry) {
  if (entry?.kind === 'ace-buck') return ''
  if (entry?.kind === 'star-shout-out') return renderAwardCard(entry)
  const filled = Boolean(entry)
  const chosen = new Set(entry?.criteria || [])
  const reasons = ALL_STAR_REASON_OPTIONS
    .map(name => {
      const on = filled && chosen.has(name)
      return `<span class="reason${on ? ' reason-on' : ''}">`
        + `<span class="en">${escapeHtml(name)}</span>`
        + `<span class="es">${escapeHtml(spanishReason(name))}</span>`
        + '</span>'
    })
    .join('<span class="sep">-</span>')

  const written = filled
    ? [String(entry.otherReason || '').trim(), String(entry.message || '').trim()].filter(Boolean)
    : []
  // Always two slots, so a card with one line of writing and a blank card
  // rule out to the same height and the footer never shifts.
  const slots = written.map(line => `<p class="msg">${escapeHtml(line)}</p>`)
  while (slots.length < 2) slots.push('<span class="ruled"></span>')
  // Liz, 2026-10-27: a group award prints one card naming everybody, so
  // the name rule has to hold more than one name. The type steps down as
  // the list grows rather than at one fixed smaller size, because a card
  // for two should not be punished for a card for six.
  const groupSize = Array.isArray(entry?.names) ? entry.names.length : 1
  const message = slots.join('')

  return `<article class="card">
  <div class="frame">
    <header class="head">
      <h2 class="title">${CARD_LABELS.title[0]}<span class="subtitle">${CARD_LABELS.title[1]}</span></h2>
      <span class="brand"></span>
    </header>
    <span class="bigstar" aria-hidden="true"></span>
    <div class="namezone">
      <span class="nameline${filled && groupSize > 1 ? ` group group-${Math.min(groupSize, 6)}` : ''}">${
        filled ? escapeHtml(entry.name || '') : ''
      }</span>
    </div>
    <p class="why">${CARD_LABELS.why[0]}<span class="why-es">${CARD_LABELS.why[1]}</span></p>
    <p class="reasons">${reasons}</p>
    <div class="message">${message}</div>
    <div class="footrow">
      <div class="field"><span class="lbl">${CARD_LABELS.date[0]}<span class="lbl-es">${CARD_LABELS.date[1]}</span></span><span class="line">${filled ? formatCardDate(entry.date) : ''}</span></div>
      <div class="field"><span class="lbl">${CARD_LABELS.by[0]}<span class="lbl-es">${CARD_LABELS.by[1]}</span></span><span class="line">${filled ? escapeHtml(entry.recognizedBy || '') : ''}</span></div>
    </div>
  </div>
</article>`
}

// Only emitted when the caller supplies the files. Same-origin URLs are the
// only option here: the site's CSP has no font-src of its own, so it falls back
// to default-src 'self', which rules out inlined data: fonts.
function fontFaces(assets) {
  const faces = [
    ['CardScript', assets.script],
    ['CardLabel', assets.label],
    ['CardDisplay', assets.display],
  ]
  return faces
    .filter(([, url]) => url)
    .map(([family, url]) => `@font-face { font-family: ${family}; src: url("${escapeHtml(url)}") format('woff2'); font-display: block; }`)
    .join('\n  ')
}

const STYLES = `
  :root { color-scheme: light; --gold: #b8892f; --goldlt: #d8b062; --ink: #111111; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f7; color: var(--ink);
         font: 12px/1.4 "Segoe UI", system-ui, -apple-system, sans-serif;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .screen-note { max-width: 8in; margin: 24px auto 0; padding: 14px 18px; background: #fff;
    border: 1px solid #cbd5e1; border-left: 4px solid var(--gold); border-radius: 6px; font-size: 13px; }
  .screen-note h1 { margin: 0 0 6px; font-size: 15px; }
  .screen-note p { margin: 4px 0; color: #475569; }
  .sheet { width: 8.5in; margin: 24px auto; padding: 0.25in; background: #fff;
           box-shadow: 0 2px 12px rgba(15,23,42,.12); }
  .grid { display: grid; grid-template-columns: repeat(2, 4in); grid-auto-rows: 3.5in; }
  .card { position: relative; padding: 0.1in; break-inside: avoid; }
  /* The cut guide sits on the card edge; the printed frame is inset within it. */
  .card { outline: 1px dashed #c8d0da; outline-offset: -0.5px; }
  .frame { position: relative; height: 100%; border: 1px solid #b9c2ce;
           padding: 0.13in 0.15in 0.1in; display: flex; flex-direction: column; overflow: hidden; }

  .head { display: flex; align-items: flex-start; justify-content: space-between;
          gap: 8px; flex: none; position: relative; z-index: 2; }
  .title { margin: 0; font-family: CardScript, "Segoe Script", "Brush Script MT", cursive;
           font-size: 33px; line-height: .95; font-weight: 400; color: var(--ink);
           text-shadow: 2px 2px 0 rgba(150,150,150,.5); }
  /* The Spanish title hangs below the script without adding to the head's
     height, so the gold star and the name rule stay where they were. */
  .subtitle { display: block; position: absolute; margin-top: -2px;
              font-family: CardLabel, "Arial Narrow", Impact, sans-serif;
              font-size: 10px; font-weight: 400; letter-spacing: .06em;
              text-transform: uppercase; color: var(--gold); text-shadow: none; }
  .brand { flex: none; width: 0.78in; height: 0.3in; background-repeat: no-repeat;
           background-position: right top; background-size: contain; }

  /* Sits behind the name rule exactly as it does on the printed card. */
  .bigstar { position: absolute; top: 0.34in; left: 50%; transform: translateX(-50%);
             width: 1.85in; height: 1.78in; z-index: 0; pointer-events: none;
             background-repeat: no-repeat; background-position: center; background-size: contain; }

  .namezone { flex: none; margin-top: 0.58in; position: relative; z-index: 2; }
  .nameline { display: block; border-bottom: 3px solid var(--ink); min-height: 26px;
              padding: 0 3px 1px; text-align: center;
              font-family: CardDisplay, "Arial Narrow", Impact, sans-serif;
              font-size: 19px; font-weight: 700; letter-spacing: .01em;
              color: var(--ink); line-height: 1.35; }
  /* A group card. Several names share one rule, so the type steps down as
     the list grows and the line is allowed to wrap — a single name keeps
     the size it has always printed at. */
  .nameline.group { line-height: 1.2; }
  .nameline.group-2 { font-size: 17px; }
  .nameline.group-3 { font-size: 15px; }
  .nameline.group-4 { font-size: 14px; }
  .nameline.group-5 { font-size: 13px; }
  .nameline.group-6 { font-size: 12px; letter-spacing: 0; }

  .why { margin: 7px 0 1px; font-family: CardLabel, "Arial Narrow", Impact, sans-serif;
         font-size: 11px; font-weight: 400; letter-spacing: .04em; text-transform: uppercase;
         color: var(--gold); position: relative; z-index: 2; }
  .why-es { margin-left: 5px; text-transform: none; font-style: italic;
            color: #8d97a4; letter-spacing: .02em; }
  .reasons { margin: 0; position: relative; z-index: 2;
             font-family: CardDisplay, "Arial Narrow", Impact, sans-serif;
             font-size: 11px; font-weight: 700; letter-spacing: .005em;
             text-transform: lowercase; color: var(--ink); line-height: 1.3; }
  /* Each reason is a stacked pair, so the two languages stay together when
     the row wraps instead of drifting onto separate lines. */
  .reason { display: inline-block; vertical-align: top; text-align: center; }
  .reason .en { display: block; }
  .reason .es { display: block; font-size: 8px; font-weight: 600; line-height: 1.15;
                color: #6b7280; font-style: italic; }
  .reason-on { color: var(--gold); border-bottom: 2px solid var(--goldlt); padding-bottom: 1px; }
  .reason-on .es { color: var(--gold); }
  .sep { margin: 0 3px; color: #8d97a4; vertical-align: top; }

  .message { flex: 1; display: flex; flex-direction: column;
             justify-content: space-evenly; padding: 5px 0 3px; min-height: 0;
             position: relative; z-index: 2; }
  .ruled { display: block; border-bottom: 1px solid #9aa4b1; height: 0; }
  .msg { margin: 0; font-size: 9.5px; line-height: 1.3; color: #24324a;
         border-bottom: 1px solid #9aa4b1; padding-bottom: 2px; }

  .footrow { display: flex; align-items: flex-end; gap: 0.2in; flex: none; padding-top: 5px;
             position: relative; z-index: 2; }
  .footrow .field { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
  .footrow .field:first-child { flex: 1; }
  .footrow .field:nth-child(2) { flex: 1.7; }
  .lbl { font-family: CardLabel, "Arial Narrow", Impact, sans-serif; font-size: 9px;
         letter-spacing: .05em; text-transform: uppercase; color: var(--ink); flex: none;
         line-height: 1.1; }
  .lbl-es { display: block; font-size: 7.5px; font-style: italic; letter-spacing: .02em;
            text-transform: none; color: #6b7280; }
  .line { flex: 1; border-bottom: 1px solid var(--ink); min-height: 13px; font-size: 9.5px;
          font-weight: 600; padding: 0 2px 1px; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Warren Star Shout-Out uses the same 4in x 3.5in frame. The teal edge
     and the display title are what set it apart from the script Star of
     the Day card. */
  .card-shout .frame { border: 2px solid #0f766e; background: linear-gradient(180deg, #e5f6f2 0%, #fff 46%); }
  .award-sub { margin: 3px 0 0; font-size: 9px; font-style: italic; color: #6b7280; }
  .award-kicker { margin: 0; font-family: CardLabel, "Arial Narrow", Impact, sans-serif;
                  font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); }
  .award-title { margin: 2px 0 0; font-family: CardDisplay, "Arial Narrow", Impact, sans-serif;
                 font-size: 22px; line-height: .95; letter-spacing: .03em; text-transform: uppercase; }
  .card-shout .award-title { color: #0f766e; font-size: 20px; }
  .card-shout .nameline { border-bottom-color: #0f766e; }
  .card-shout .namezone { margin-top: 0.28in; }
  .fromline { margin: 4px 0 0; text-align: center; font-size: 11px; font-weight: 700; color: #0f766e; }
  .chips { margin: 6px 0 0; position: relative; z-index: 2; }
  .chip { display: inline-block; margin: 0 4px 3px 0; padding: 1px 5px;
          border: 1px solid currentColor; border-radius: 3px;
          font-family: CardLabel, "Arial Narrow", Impact, sans-serif;
          font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
  .card-shout .chip { color: #0f766e; text-transform: none; letter-spacing: 0; font-family: "Segoe UI", system-ui, sans-serif; }
  .card-shout .why { margin-top: 6px; }

  @media print {
    body { background: #fff; }
    .screen-note { display: none; }
    .sheet { margin: 0; box-shadow: none; padding: 0; width: auto; }
    .sheet + .sheet { break-before: page; }
    @page { size: letter portrait; margin: 0.25in; }
  }
`

// entries: [{ name, date, criteria: [...], message, recognizedBy }].
// pad fills each page out to six cards so a part-full sheet still cuts cleanly;
// a single card printed from the app leaves the rest of the page alone instead.
// assets: { script, label, display, logo } — same-origin URLs, all optional.
export function buildStarCardHtml(entries = [], { pad = true, screenNote = '', assets = {}, fit = false } = {}) {
  const list = Array.isArray(entries) ? entries : []
  const sheets = []

  for (let index = 0; index < Math.max(list.length, pad ? CARDS_PER_PAGE : 0); index += CARDS_PER_PAGE) {
    const slice = list.slice(index, index + CARDS_PER_PAGE)
    const count = pad ? CARDS_PER_PAGE : slice.length
    const cards = []
    for (let position = 0; position < count; position++) {
      cards.push(renderCard(slice[position]))
    }
    sheets.push(`<section class="sheet"><div class="grid">${cards.join('')}</div></section>`)
  }

  const note = screenNote
    ? `<div class="screen-note"><h1>Star of the Day cards</h1><p>${escapeHtml(screenNote)}</p></div>`
    : ''
  // `fit` drops the letter-sheet framing so a single card can be shown at its
  // own size inside a preview window. The card itself is untouched, which is
  // the point: what the person approves is what comes out of the printer.
  const fitRules = fit
    ? `body { background: #fff; }
  .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
  .grid { grid-template-columns: 4in; }`
    : ''
  const artRules = [
    assets.logo ? `.brand { background-image: url("${escapeHtml(assets.logo)}"); }` : '',
    assets.star ? `.bigstar { background-image: url("${escapeHtml(assets.star)}"); }` : '',
  ].filter(Boolean).join('\n  ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Star of the Day cards</title>
<style>
  ${fontFaces(assets)}
${STYLES}
  ${artRules}
  ${fitRules}
</style>
</head>
<body>${note}${sheets.join('')}</body>
</html>`
}
