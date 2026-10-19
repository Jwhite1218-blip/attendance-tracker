import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_LOCALE,
  OPEN_QUESTIONS,
  STRINGS,
  SUPPORTED_LOCALES,
  formatDate,
  missingTranslations,
  normalizeLocale,
  orphanTranslations,
  translate,
  translateCount,
  isApproved,
  isProgramKey,
} from './i18n.js'
import { PROGRAM_STRINGS } from './programVocabulary.js'

test('a missing translation shows English rather than a raw key', () => {
  assert.equal(translate('es', 'gate.unlock'), 'Entrar')

  // Exercise the fallback for real by removing a Spanish string, which is what
  // happens the moment someone adds an English one and has not had it
  // translated yet. Nobody in a kitchen should ever be shown `gate.unlock`.
  const key = 'gate.unlock'
  const spanish = STRINGS.es[key]
  try {
    delete STRINGS.es[key]
    assert.equal(translate('es', key), STRINGS.en[key])
  } finally {
    STRINGS.es[key] = spanish
  }

  assert.equal(translate('es', key), 'Entrar', 'the dictionary is restored')
})

test('no screen can show a raw key for a string we ship', () => {
  for (const key of Object.keys(STRINGS.en)) {
    for (const { code } of SUPPORTED_LOCALES) {
      const text = translate(code, key)
      assert.notEqual(text, key, `${code}/${key} renders as its own key`)
      assert.ok(text.trim().length > 0, `${code}/${key} is empty`)
    }
  }
})

test('an unknown key is returned as itself rather than crashing', () => {
  // Last resort only: visible in development, never fatal in a kitchen.
  assert.equal(translate('en', 'nonexistent.key.for.test'), 'nonexistent.key.for.test')
})

test('an unknown language falls back to English instead of failing', () => {
  assert.equal(normalizeLocale('fr'), 'en')
  assert.equal(normalizeLocale(''), 'en')
  assert.equal(normalizeLocale(null), 'en')
  assert.equal(normalizeLocale(undefined), 'en')
  assert.equal(translate('klingon', 'gate.unlock'), 'Unlock')
})

test('regional Spanish is still Spanish', () => {
  for (const tag of ['es', 'es-MX', 'es_419', 'ES', 'es-US']) {
    assert.equal(normalizeLocale(tag), 'es', tag)
  }
})

test('placeholders are filled, and an unknown one is left alone', () => {
  assert.equal(translate('en', 'language.switchTo', { name: 'Español' }), 'Switch to Español')
  assert.equal(translate('es', 'language.switchTo', { name: 'English' }), 'Cambiar a English')
  assert.equal(translate('en', 'language.switchTo', {}), 'Switch to {name}')
})

test('every supported language covers every English string', () => {
  for (const { code } of SUPPORTED_LOCALES) {
    assert.deepEqual(
      missingTranslations(code),
      [],
      `${code} is missing translations; add them or the screen falls back to English`
    )
  }
})

test('no language carries a key English has dropped', () => {
  // A stale key is worse than a missing one: it looks translated and is never
  // shown, so the gap hides until somebody notices the English on screen.
  for (const { code } of SUPPORTED_LOCALES) {
    assert.deepEqual(orphanTranslations(code), [], `${code} has keys English no longer defines`)
  }
})

test('the judgement calls in the draft are written down, not buried', () => {
  // Whoever reviews the Spanish should be told what the draft decided on their
  // behalf — program names left in English, FMLA kept as an acronym — rather
  // than having to notice it.
  assert.ok(OPEN_QUESTIONS.length > 0)
  for (const question of OPEN_QUESTIONS) assert.equal(typeof question, 'string')
})

test('the program name is not translated', () => {
  // "All-Stars" is what the banner, the cards and the staff all call it.
  assert.equal(STRINGS.es['nav.allStars'], STRINGS.en['nav.allStars'])
})

test('dates follow the reading language', () => {
  const day = '2026-09-25T12:00:00Z'
  const english = formatDate('en', day)
  const spanish = formatDate('es', day)

  assert.match(english, /Sep/)
  assert.match(spanish, /sept?/i)
  assert.notEqual(english, spanish)
})

test('an unreadable date is passed through rather than guessed at', () => {
  assert.equal(formatDate('en', 'not-a-date'), 'not-a-date')
  assert.equal(formatDate('es', ''), '')
})

test('English is the fallback language', () => {
  assert.equal(DEFAULT_LOCALE, 'en')
  assert.ok(SUPPORTED_LOCALES.some(locale => locale.code === DEFAULT_LOCALE))
})

// --- Warren's own vocabulary ------------------------------------------------

test('the drafted program vocabulary is complete in both languages', () => {
  const english = Object.keys(PROGRAM_STRINGS.en)
  assert.ok(english.length > 40, 'the draft should cover the whole vocabulary')
  assert.deepEqual(
    english.filter(key => !Object.hasOwn(PROGRAM_STRINGS.es, key)),
    [],
    'every drafted term needs a Spanish line for a reviewer to correct'
  )
})

test('program keys are recognizable as program keys', () => {
  for (const key of Object.keys(PROGRAM_STRINGS.en)) {
    assert.ok(isProgramKey(key), `${key} is not covered by PROGRAM_KEY_PREFIXES`)
  }
})

test('counts are pluralised rather than silently left singular', () => {
  assert.equal(translateCount('en', 'hr.occurrences', 1), '1 documented occurrence')
  assert.equal(translateCount('en', 'hr.occurrences', 3), '3 documented occurrences')
  assert.equal(translateCount('es', 'hr.occurrences', 1), '1 incidencia documentada')
  assert.equal(translateCount('es', 'hr.occurrences', 3), '3 incidencias documentadas')
  assert.equal(translateCount('es', 'hr.occurrences', 0), '0 incidencias documentadas')
})

test('unreviewed program wording always says it is unreviewed', async () => {
  // The wording is now shown on purpose, so Liz's team can review it where it
  // is actually used rather than on a printout. That makes the risk different:
  // not that staff see the draft, but that they see it without knowing it is
  // one. So while APPROVAL is unset, the app has to carry a visible notice.
  //
  // Once approved, the notice disappears on its own — useProgramTerms derives
  // isDraftLanguage from isApproved() — and this check steps aside.
  if (isApproved()) return

  const { readFile } = await import('node:fs/promises')

  const hook = await readFile('src/components/useProgramTerms.js', 'utf8')
  assert.match(
    hook,
    /isDraftLanguage:[^\n]*!isApproved\(\)/,
    'the draft flag must be derived from the approval state, not hard-coded'
  )

  const shell = await readFile('src/App.jsx', 'utf8')
  assert.ok(
    shell.includes('term.isDraftLanguage'),
    'the app shell must show a notice while the Spanish wording is a draft'
  )
  assert.ok(
    shell.includes("t('language.draftNotice')"),
    'the draft notice must be the translated string, so it reads in the language being reviewed'
  )
})

// A bare date key is local, not UTC: parsed as UTC midnight it renders as the
// previous day in every US timezone, so today's date on a dashboard would read
// as yesterday for the whole day.
test('a date-only key keeps its own day rather than shifting a day back', () => {
  assert.match(formatDate('en', '2026-10-11', { dateStyle: 'full' }), /October 11, 2026/)
  assert.match(formatDate('en', '2026-01-01', { dateStyle: 'full' }), /January 1, 2026/)
  assert.match(formatDate('es', '2026-10-11', { dateStyle: 'full' }), /11 de octubre de 2026/)
})

test('a value that already carries a time is passed through untouched', () => {
  assert.match(formatDate('en', '2026-09-25T12:00:00Z'), /Sep/)
  assert.equal(formatDate('en', 'not-a-date'), 'not-a-date')
})
