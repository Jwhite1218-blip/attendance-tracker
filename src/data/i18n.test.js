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
  PROGRAM_KEY_PREFIXES,
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

test('program keys are recognisable as program keys', () => {
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

test('unreviewed program wording cannot reach a screen', async () => {
  // The real gate. The Spanish for the attendance codes is a draft, and a
  // draft of a disciplinary category must not be shown to staff before a
  // person who speaks the language has signed it off. Once APPROVAL is
  // filled in, this check steps aside and the terms can be wired up.
  if (isApproved()) return

  const { readdir, readFile } = await import('node:fs/promises')
  const roots = ['src/components', 'src/pages', 'src/data', 'src/lib']
  const offenders = []

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) { await walk(path); continue }
      if (!/\.(jsx?|mjs)$/.test(entry.name)) continue
      if (entry.name.endsWith('.test.js') || entry.name === 'programVocabulary.js') continue
      const source = await readFile(path, 'utf8')
      for (const prefix of PROGRAM_KEY_PREFIXES) {
        // A literal scan rather than a regex: there are only three quote
        // styles, and a plain search cannot be tripped up by escaping.
        const used = [`t('${prefix}`, `t("${prefix}`, 't(`' + prefix]
          .some(needle => source.includes(needle))
        if (used) offenders.push(`${path} uses t('${prefix}…')`)
      }
    }
  }

  for (const root of roots) await walk(root)

  assert.deepEqual(
    offenders,
    [],
    'program wording is still a draft — set APPROVAL in programVocabulary.js before using it on screen'
  )
})
