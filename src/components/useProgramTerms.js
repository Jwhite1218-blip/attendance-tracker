import { useMemo } from 'react'
import { useLanguage } from './LanguageProvider.jsx'
import { isApproved, translateCount } from '../data/i18n.js'
import {
  attendanceDescriptionKey,
  attendanceLabelKey,
  attendanceStageTerm,
  reasonDescriptionKey,
  reasonKey,
  recognitionDescriptionKey,
  recognitionLabelKey,
  starLevelKey,
} from '../data/programTerms.js'

// Reads Warren's own vocabulary in the active language.
//
// Every accessor takes a fallback — the English already carried on the record
// itself — so a screen keeps working even for a code or type this mapping has
// never heard of. Nothing here can render an empty label.
export function useProgramTerms() {
  const { locale, t } = useLanguage()

  return useMemo(() => {
    const read = (key, fallback) => (key ? t(key) : '') || fallback || ''

    return {
      // True while the Spanish is still a draft, so screens can say so.
      isDraftLanguage: locale !== 'en' && !isApproved(),

      codeLabel: (code, fallback) => read(attendanceLabelKey(code), fallback),
      codeDescription: (code, fallback) => read(attendanceDescriptionKey(code), fallback),

      stageLabel: status => {
        const term = attendanceStageTerm(status)
        return term.count === undefined
          ? t(term.key)
          : translateCount(locale, term.key, term.count)
      },

      recognitionLabel: (typeId, fallback) => read(recognitionLabelKey(typeId), fallback),
      recognitionDescription: (typeId, fallback) => read(recognitionDescriptionKey(typeId), fallback),
      starLevel: (levelId, fallback) => read(starLevelKey(levelId), fallback),
      reason: (name, fallback) => read(reasonKey(name), fallback || name),
      reasonDescription: (name, fallback) => read(reasonDescriptionKey(name), fallback),
    }
  }, [locale, t])
}
