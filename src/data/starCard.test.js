import assert from 'node:assert/strict'
import test from 'node:test'
import { ALL_STAR_REASON_OPTIONS } from './recognitionStore.js'
import { CARDS_PER_PAGE, buildStarCardHtml, formatCardDate } from './starCard.js'

const CARD_PATTERN = /class="card"/g
// Matched on the attribute, not the bare class name: the stylesheet in the same
// document also contains ".reason-on", which a looser pattern counts as a hit.
const MARKED_REASON_PATTERN = /class="reason reason-on"/g

function cardCount(html) {
  return (html.match(CARD_PATTERN) || []).length
}

function markedReasonCount(html) {
  return (html.match(MARKED_REASON_PATTERN) || []).length
}

test('a blank sheet fills the page with six cards to cut', () => {
  const html = buildStarCardHtml()
  assert.equal(cardCount(html), CARDS_PER_PAGE)
  // Nothing is pre-filled, so every reason stays unmarked for circling.
  assert.equal(markedReasonCount(html), 0)
})

test('a part-full sheet is padded so it still cuts cleanly', () => {
  const html = buildStarCardHtml([
    { name: 'Annie Chaney', date: '2026-09-01', criteria: ['Teamwork'], message: 'Covered the line.', recognizedBy: 'Brookview Manager' },
  ])
  assert.equal(cardCount(html), CARDS_PER_PAGE)
  assert.match(html, /Annie Chaney/)
})

// The app prints one card at a time; padding it to six would waste the sheet.
test('a single card printed from the app is not padded', () => {
  const html = buildStarCardHtml([
    { name: 'Demetria Elliott', date: '2026-08-28', criteria: ['Service'], message: 'Learned every name.', recognizedBy: 'Warren Central Manager' },
  ], { pad: false })
  assert.equal(cardCount(html), 1)
  assert.match(html, /Demetria Elliott/)
  assert.match(html, /8\/28\/2026/)
  assert.match(html, /Learned every name\./)
  assert.match(html, /Warren Central Manager/)
})

test('only the chosen reasons are marked', () => {
  const html = buildStarCardHtml([
    { name: 'A B', date: '2026-09-01', criteria: ['Safety'], message: 'x', recognizedBy: 'y' },
  ], { pad: false })
  assert.equal(markedReasonCount(html), 1)
  // Every reason the program recognizes is still offered on the card.
  for (const reason of ALL_STAR_REASON_OPTIONS) assert.match(html, new RegExp(`>${reason}<`))
})

test('card content is escaped so a name cannot inject markup', () => {
  const html = buildStarCardHtml([
    { name: '<script>alert(1)</script>', date: '2026-09-01', criteria: [], message: 'a & b', recognizedBy: '"q"' },
  ], { pad: false })
  assert.equal(html.includes('<script>alert(1)</script>'), false)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /a &amp; b/)
})

test('a malformed date is passed through rather than guessed at', () => {
  assert.equal(formatCardDate('2026-09-01'), '9/1/2026')
  assert.equal(formatCardDate(''), '')
  assert.equal(formatCardDate('not-a-date'), 'not-a-date')
})
