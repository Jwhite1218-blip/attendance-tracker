import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_LOCALE,
  NEEDS_PROGRAM_TRANSLATION,
  STRINGS,
  SUPPORTED_LOCALES,
  formatDate,
  missingTranslations,
  normalizeLocale,
  orphanTranslations,
  translate,
} from './i18n.js'

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

test('the program vocabulary is left for a human to translate', () => {
  // These carry policy and brand meaning. If this list ever empties, it should
  // be because Warren's own Spanish speakers wrote them, not because a tool did.
  assert.ok(NEEDS_PROGRAM_TRANSLATION.length > 0)
  for (const note of NEEDS_PROGRAM_TRANSLATION) assert.equal(typeof note, 'string')
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
