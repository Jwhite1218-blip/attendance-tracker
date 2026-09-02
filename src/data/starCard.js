// The printable Star of the Day card, 4" x 3.5", six to a US Letter page.
//
// One definition serves both the blank sheets printed for the bulletin board
// (scripts/make-star-cards.mjs) and the single card a manager prints straight
// after recording a star. Keeping them here means the card a manager prints
// cannot drift from the ones already pinned to the board.
//
// Reasons come from ALL_STAR_REASON_OPTIONS so the card always offers exactly
// the reasons the program recognises.

import { ALL_STAR_REASON_OPTIONS } from './recognitionStore.js'

export const CARDS_PER_PAGE = 6

const STAR_PATH = 'M12 2.3l2.9 6.26 6.85.79-5.08 4.64 1.38 6.74L12 17.4l-6.05 3.33 1.38-6.74L2.25 9.35l6.85-.79z'

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

function renderCard(entry) {
  const filled = Boolean(entry)
  const chosen = new Set(entry?.criteria || [])
  const reasons = ALL_STAR_REASON_OPTIONS
    .map(name => `<span class="reason${filled && chosen.has(name) ? ' reason-on' : ''}">${escapeHtml(name)}</span>`)
    .join('<span class="dot">&middot;</span>')

  const message = filled
    ? `<p class="msg">${escapeHtml(entry.message || '')}</p>`
    : '<span class="ruled"></span><span class="ruled"></span>'

  return `<article class="card">
  <svg class="watermark" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
  <header class="head">
    <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
    <div>
      <h2 class="title">Star of the Day</h2>
      <p class="sub">Warren Student Nutrition</p>
    </div>
  </header>
  <div class="namezone">
    <span class="namelbl">This star goes to</span>
    <span class="nameline">${filled ? escapeHtml(entry.name || '') : ''}</span>
  </div>
  <p class="lbl why">Why they shine${filled ? '' : ' &mdash; circle all that apply'}</p>
  <p class="reasons">${reasons}</p>
  <div class="message">${message}</div>
  <div class="footrow">
    <div class="field"><span class="lbl">Date</span><span class="line">${filled ? formatCardDate(entry.date) : ''}</span></div>
    <div class="field"><span class="lbl">Recognized by</span><span class="line">${filled ? escapeHtml(entry.recognizedBy || '') : ''}</span></div>
  </div>
</article>`
}

const STYLES = `
  :root { color-scheme: light; --gold: #c28b24; --deep: #8a5f14; --ink: #14213d; }
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
  .card { position: relative; border: 1px dashed #9aa7b8; padding: 0.15in 0.18in;
          display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; }
  .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
               width: 3.15in; height: 3.15in; z-index: 0; pointer-events: none;
               fill: var(--gold); opacity: .13; }
  .card > *:not(.watermark) { position: relative; z-index: 1; }
  .head { display: flex; align-items: center; gap: 6px;
          border-bottom: 2px solid var(--gold); padding-bottom: 4px; flex: none; }
  .star { width: 18px; height: 18px; flex: none; fill: var(--gold); }
  .title { margin: 0; font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
           font-size: 17px; letter-spacing: .045em; text-transform: uppercase;
           color: var(--deep); line-height: 1; }
  .sub { margin: 1px 0 0; font-size: 7px; font-weight: 700; letter-spacing: .1em;
         text-transform: uppercase; color: #8b96a5; }
  .namezone { flex: none; text-align: center; margin-top: 11px; }
  .namelbl { display: block; font-size: 7px; font-weight: 700; letter-spacing: .12em;
             text-transform: uppercase; color: var(--deep); margin-bottom: 3px; }
  .nameline { display: block; border-bottom: 1.5px solid var(--deep); min-height: 28px;
              padding: 0 4px 2px; font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
              font-size: 22px; letter-spacing: .02em; color: var(--ink); line-height: 1.3; }
  .lbl { font-size: 7px; font-weight: 700; letter-spacing: .1em;
         text-transform: uppercase; color: #8b96a5; flex: none; }
  .why { margin: 9px 0 2px; }
  .reasons { margin: 0; font-size: 8.5px; color: #45536b; line-height: 1.45; flex: none; }
  .reason-on { font-weight: 700; color: var(--deep); border-bottom: 2px solid var(--gold); padding-bottom: 1px; }
  .dot { margin: 0 2px; color: #b9c2ce; }
  .message { flex: 1; display: flex; flex-direction: column;
             justify-content: space-evenly; padding: 4px 0 3px; min-height: 0; }
  .ruled { display: block; border-bottom: 1px solid #c3cbd6; height: 0; }
  .msg { margin: 0; font-size: 9px; line-height: 1.3; color: #24324a;
         border-bottom: 1px solid #c3cbd6; padding-bottom: 2px; }
  .footrow { display: flex; align-items: flex-end; gap: 0.26in; flex: none;
             border-top: 1px solid #e2e7ee; padding-top: 6px; }
  .footrow .field { display: flex; align-items: baseline; gap: 5px; min-width: 0; }
  .footrow .field:first-child { flex: 1; }
  .footrow .field:nth-child(2) { flex: 1.7; }
  .line { flex: 1; border-bottom: 1px solid #45536b; min-height: 14px; font-size: 9.5px;
          font-weight: 600; padding: 0 2px 1px; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
export function buildStarCardHtml(entries = [], { pad = true, screenNote = '' } = {}) {
  const list = entries.length ? entries : [null]
  const pages = []

  for (let index = 0; index < list.length; index += CARDS_PER_PAGE) {
    const slice = list.slice(index, index + CARDS_PER_PAGE)
    const count = pad ? CARDS_PER_PAGE : slice.length
    const cards = Array.from({ length: count }, (_, slot) => renderCard(slice[slot])).join('\n')
    pages.push(`<section class="sheet"><div class="grid">\n${cards}\n</div></section>`)
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Star of the Day Card</title>
<style>${STYLES}</style>
</head>
<body>
${screenNote ? `<div class="screen-note"><h1>${escapeHtml(screenNote)}</h1><p>Print at 100% scale (not "fit to page") on US Letter, then cut along the dashed lines.</p><p>This note does not print.</p></div>` : ''}
${pages.join('\n')}
</body>
</html>
`
}
