// Language support for the tracker.
//
// Two rules shape this file:
//
// 1. A missing translation falls back to English, never to a raw key. A
//    kitchen should never see `nav.dashboard` on screen because somebody added
//    a string and had not had it translated yet.
//
// 2. Program language is not translated here. Attendance codes, the star
//    levels and the recognition type names carry policy and brand meaning —
//    "Star of the Day" is the name of the program, not a phrase — so they are
//    listed in NEEDS_PROGRAM_TRANSLATION and left for Warren's own Spanish
//    speakers to write. Machine-translating the words that go on somebody's
//    recognition card in front of their family is not acceptable.
//
// Generic interface chrome below is translated: those terms are standard and
// unambiguous.

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
]

export const DEFAULT_LOCALE = 'en'
export const LANGUAGE_STORAGE_KEY = 'attendance-language-v1'

// Terms that must be written by a person who speaks the language and knows
// the program. Listed rather than guessed so the gap is visible.
export const NEEDS_PROGRAM_TRANSLATION = [
  'Attendance code names and their descriptions (attendanceCodes.js)',
  'Recognition type names — Star of the Day, Shooting Star, Warren Star Shout-Out',
  'Star level names — Bronze, Silver, Gold, Platinum, Superstar',
  'The six recognition reasons as they appear on the printed card',
  'HR occurrence stage wording, which follows district policy language',
]

const STRINGS = {
  en: {
    'language.label': 'Language',
    'language.switchTo': 'Switch to {name}',

    'gate.district': 'Warren Township',
    'gate.portal': 'Food Service Attendance Portal',
    'gate.pinLabel': 'Enter Access PIN',
    'gate.showPin': 'Show access PIN',
    'gate.hidePin': 'Hide access PIN',
    'gate.unlock': 'Unlock',
    'gate.connecting': 'Connecting…',
    'gate.sessionNote': 'Session expires after 8 hours · Warren Township Food Service',
    'gate.signInFailed': 'Unable to sign in. Please try again.',

    'nav.dashboard': 'Dashboard',
    'nav.allStars': 'All-Stars',
    'nav.employeeRecords': 'Employee Records',
    'nav.blackoutCalendar': 'Blackout Calendar',
    'nav.customReport': 'Custom Report',
    'nav.masterReport': 'Master Report',
    'nav.backupRecovery': 'Backup & Recovery',
    'nav.toggleMenu': 'Toggle menu',
    'nav.logout': 'Lock and log out',

    'role.schoolManager': 'School Manager',
    'role.schoolRecognition': 'School Recognition',
    'role.administrator': 'Administrator',
    'role.administratorLimited': 'Administrator · Limited editing',
    'role.readOnly': 'Read-only review',
    'role.recognitionPilot': 'Recognition Pilot',

    'sync.shared': 'Shared',
    'sync.saving': 'Saving',
    'sync.retrying': 'Retrying',
    'sync.connectedTitle': 'Shared attendance data is connected.',
    'sync.retryingTitle': 'Changes are saved on this device and will retry automatically.',

    'banner.readOnly': 'Read-only access · Navigation is enabled · All changes are disabled',

    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.close': 'Close',
    'common.print': 'Print',
    'common.search': 'Search',
    'common.loading': 'Loading…',
  },

  es: {
    'language.label': 'Idioma',
    'language.switchTo': 'Cambiar a {name}',

    'gate.district': 'Warren Township',
    'gate.portal': 'Portal de Asistencia de Servicio de Alimentos',
    'gate.pinLabel': 'Ingrese su PIN de acceso',
    'gate.showPin': 'Mostrar el PIN de acceso',
    'gate.hidePin': 'Ocultar el PIN de acceso',
    'gate.unlock': 'Entrar',
    'gate.connecting': 'Conectando…',
    'gate.sessionNote': 'La sesión termina después de 8 horas · Warren Township Food Service',
    'gate.signInFailed': 'No se pudo iniciar sesión. Inténtelo de nuevo.',

    'nav.dashboard': 'Panel principal',
    // All-Stars is the program's name and stays in English on purpose.
    'nav.allStars': 'All-Stars',
    'nav.employeeRecords': 'Expedientes de empleados',
    'nav.blackoutCalendar': 'Calendario de días bloqueados',
    'nav.customReport': 'Reporte personalizado',
    'nav.masterReport': 'Reporte general',
    'nav.backupRecovery': 'Respaldo y recuperación',
    'nav.toggleMenu': 'Abrir o cerrar el menú',
    'nav.logout': 'Bloquear y cerrar sesión',

    'role.schoolManager': 'Gerente de escuela',
    'role.schoolRecognition': 'Reconocimiento de escuela',
    'role.administrator': 'Administrador',
    'role.administratorLimited': 'Administrador · Edición limitada',
    'role.readOnly': 'Solo lectura',
    'role.recognitionPilot': 'Piloto de reconocimiento',

    'sync.shared': 'Guardado',
    'sync.saving': 'Guardando',
    'sync.retrying': 'Reintentando',
    'sync.connectedTitle': 'Los datos de asistencia compartidos están conectados.',
    'sync.retryingTitle': 'Los cambios están guardados en este dispositivo y se reintentarán automáticamente.',

    'banner.readOnly': 'Acceso de solo lectura · Puede navegar · No puede hacer cambios',

    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.close': 'Cerrar',
    'common.print': 'Imprimir',
    'common.search': 'Buscar',
    'common.loading': 'Cargando…',
  },
}

export { STRINGS }

// 'es-MX', 'es_419' and 'ES' all mean Spanish here. Anything unrecognised
// falls back to English rather than throwing.
export function normalizeLocale(value) {
  const base = String(value || '').trim().toLowerCase().replace('_', '-').split('-')[0]
  return SUPPORTED_LOCALES.some(locale => locale.code === base) ? base : DEFAULT_LOCALE
}

export function translate(locale, key, values) {
  const code = normalizeLocale(locale)
  const text = STRINGS[code]?.[key] ?? STRINGS[DEFAULT_LOCALE][key]
  if (text === undefined) return key
  if (!values) return text
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match)
}

// Dates and numbers have to follow the reading language too, or a Spanish
// screen still shows "September 25, 2026".
const LOCALE_TAGS = { en: 'en-US', es: 'es-US' }

export function localeTag(locale) {
  return LOCALE_TAGS[normalizeLocale(locale)]
}

export function formatDate(locale, value, options = { dateStyle: 'medium' }) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.valueOf())) return String(value ?? '')
  return date.toLocaleDateString(localeTag(locale), options)
}

// Which English keys a locale has not covered yet. Used by the tests and
// available for a coverage report as the dictionary grows.
export function missingTranslations(locale) {
  const code = normalizeLocale(locale)
  if (code === DEFAULT_LOCALE) return []
  return Object.keys(STRINGS[DEFAULT_LOCALE]).filter(key => !Object.hasOwn(STRINGS[code], key))
}

// Keys a locale defines that English does not — a stale key left behind after
// an English string was renamed, which would silently never be shown.
export function orphanTranslations(locale) {
  const code = normalizeLocale(locale)
  if (code === DEFAULT_LOCALE) return []
  return Object.keys(STRINGS[code]).filter(key => !Object.hasOwn(STRINGS[DEFAULT_LOCALE], key))
}
