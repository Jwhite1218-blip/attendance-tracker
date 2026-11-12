import assert from 'node:assert/strict'
import test from 'node:test'
import { ALL_STAR_REASON_OPTIONS } from './recognitionStore.js'
import { CARDS_PER_PAGE, buildStarCardHtml, formatCardDate } from './starCard.js'

const CARD_PATTERN = /class="card[\s"]/g
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

test('a shout-out card carries the megaphone and a coach buck does not print', () => {
  const html = buildStarCardHtml([
    {
      kind: 'ace-buck',
      name: 'Ulonda Lewis',
      date: '2026-11-09',
      criteria: ['People & Culture'],
      message: 'Steadied the line.',
      recognizedBy: 'Elizabeth Schmitt',
    },
    {
      kind: 'star-shout-out',
      name: 'Melvina Anderson',
      date: '2026-11-10',
      criteria: ['Showing patience or kindness when helping students'],
      message: 'A student said thank you.',
      recognizedBy: 'Elizabeth Schmitt',
      sourceName: 'Ms. Alvarez',
    },
  ], { pad: false, assets: { megaphone: '/shout-megaphone.svg' } })
  assert.equal(cardCount(html), 1)
  assert.equal(html.includes('card-buck'), false)
  assert.equal(html.includes('Star Coach Buck'), false)
  assert.match(html, /card-shout/)
  assert.match(html, /megastar/)
  assert.match(html, /shout-megaphone\.svg/)
  assert.match(html, /Warren Star Shout-Out/)
  assert.match(html, /From Ms\. Alvarez/)
  assert.equal(html.includes('emp-'), false)
})

test('the card carries both languages so one card serves everybody', () => {
  const html = buildStarCardHtml([], { pad: true })

  // Liz, 2026-10-19: both languages on the one card, not two versions.
  assert.ok(html.includes('Star of the Day') && html.includes('Estrella del Día'))
  assert.ok(html.includes('Why they shine :') && html.includes('Por qué brillan :'))
  assert.ok(html.includes('>Date<') && html.includes('>Fecha<'))
  assert.ok(html.includes('Recognized by') && html.includes('Reconocido por'))

  // Reason words come from the shared Spanish dictionary, not a copy.
  assert.ok(html.includes('Teamwork') && html.includes('Trabajo en equipo'))
  assert.ok(html.includes('Reliability') && html.includes('Responsabilidad'))
})

test('what Other was reads with the message, not in the reason list', () => {
  // Liz, 2026-10-19: the reason list stays the fixed set of words a manager
  // ticks; the explanation belongs where the card is written on.
  const html = buildStarCardHtml([{
    name: 'Maria G.',
    date: '2026-10-19',
    criteria: ['Other'],
    otherReason: 'Covered a double shift',
    message: 'Stayed late twice this week.',
    recognizedBy: 'Liz',
  }], { pad: false })

  assert.ok(html.includes('<p class="msg">Covered a double shift</p>'))
  assert.ok(html.includes('<p class="msg">Stayed late twice this week.</p>'))
  // "other" is still printed and ticked, in both languages, like any reason.
  assert.ok(html.includes('>Other<') && html.includes('>Otro<'))
})

test('every card rules out to the same height, written on or not', () => {
  // The writing area is two slots whatever fills them, so the footer sits in
  // the same place on every card and a sheet still cuts straight.
  const slots = html => (html.match(/class="msg"/g) || []).length + (html.match(/class="ruled"/g) || []).length

  const card = entry => buildStarCardHtml([entry], { pad: false })
  const base = { name: 'A', date: '2026-10-19', criteria: ['Service'] }

  assert.equal(slots(card({ ...base })), 2)
  assert.equal(slots(card({ ...base, message: 'Good work.' })), 2)
  assert.equal(slots(card({ ...base, criteria: ['Other'], otherReason: 'Covered a shift' })), 2)
  assert.equal(slots(card({ ...base, criteria: ['Other'], otherReason: 'Covered a shift', message: 'Good work.' })), 2)
  // Six blank cards on a padded sheet, two slots each.
  assert.equal(slots(buildStarCardHtml([], { pad: true })), 12)
})

test('a blank card still offers Other as a choice to tick', () => {
  const html = buildStarCardHtml([], { pad: true })
  assert.ok(html.includes('>Other<'))
  assert.ok(html.includes('>Otro<'))
})

test('the other line is escaped like everything else on the card', () => {
  const html = buildStarCardHtml([{
    name: 'Maria G.',
    date: '2026-10-19',
    criteria: ['Other'],
    otherReason: '<script>alert(1)</script>',
    recognizedBy: 'Liz',
  }], { pad: false })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;'))
})
