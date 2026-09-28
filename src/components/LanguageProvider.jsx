import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LOCALE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  formatDate as formatDateIn,
  localeTag,
  normalizeLocale,
  translate,
} from '../data/i18n.js'

// The language is a property of the device, not of the sign-in. A tablet
// mounted in one kitchen can sit in Spanish all year while the district office
// laptop stays in English, and neither follows a PIN around. It also has to
// survive sign-out, so it is kept outside the managed cache that a sign-out
// clears.
function readStoredLocale() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored) return normalizeLocale(stored)
  } catch {
    // Storage unavailable — fall through to the browser's own preference.
  }
  try {
    return normalizeLocale(navigator.language)
  } catch {
    return DEFAULT_LOCALE
  }
}

const LanguageContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, values) => translate(DEFAULT_LOCALE, key, values),
  formatDate: (value, options) => formatDateIn(DEFAULT_LOCALE, value, options),
  locales: SUPPORTED_LOCALES,
})

export function useLanguage() {
  return useContext(LanguageContext)
}

export default function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale)

  const setLocale = useCallback(next => {
    const code = normalizeLocale(next)
    setLocaleState(code)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    } catch {
      // The choice still applies for this visit even if it cannot be kept.
    }
  }, [])

  // Screen readers and the browser's own hyphenation need to know what
  // language the page is actually in.
  useEffect(() => {
    document.documentElement.lang = localeTag(locale)
  }, [locale])

  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key, values) => translate(locale, key, values),
    formatDate: (date, options) => formatDateIn(locale, date, options),
    locales: SUPPORTED_LOCALES,
  }), [locale, setLocale])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// A plain two-way switch rather than a dropdown: there are two languages, and
// a dropdown hides the one you want behind a tap.
export function LanguageToggle({ className = '', tone = 'dark' }) {
  const { locale, setLocale, locales, t } = useLanguage()
  const base = tone === 'dark'
    ? { on: 'bg-brand-500 text-white', off: 'text-charcoal-200 hover:text-white', ring: 'border-charcoal-500' }
    : { on: 'bg-[#b8892f] text-white', off: 'text-[#7a6a4e] hover:text-[#3a2a06]', ring: 'border-[#d7b44b]/60' }

  return (
    <div
      className={`inline-flex items-center rounded-full border ${base.ring} p-0.5 ${className}`}
      role="group"
      aria-label={t('language.label')}
    >
      {locales.map(option => (
        <button
          key={option.code}
          type="button"
          onClick={() => setLocale(option.code)}
          aria-pressed={locale === option.code}
          title={t('language.switchTo', { name: option.name })}
          className={`min-h-8 rounded-full px-2.5 text-[11px] font-bold transition-colors ${
            locale === option.code ? base.on : base.off
          }`}
        >
          {option.code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
