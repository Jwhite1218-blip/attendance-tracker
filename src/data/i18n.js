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

import { PROGRAM_STRINGS } from './programVocabulary.js'

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
]

export const DEFAULT_LOCALE = 'en'
export const LANGUAGE_STORAGE_KEY = 'attendance-language-v1'

// Warren's own vocabulary lives in programVocabulary.js and is drafted but
// not signed off. It is merged in here so the completeness checks cover it,
// and a test refuses to let any screen use it until a reviewer approves.
export { APPROVAL, OPEN_QUESTIONS, REVIEW_GROUPS, isApproved } from './programVocabulary.js'

// Prefixes owned by programVocabulary.js.
export const PROGRAM_KEY_PREFIXES = ['code.', 'hr.', 'recognition.', 'level.', 'reason.']

export function isProgramKey(key) {
  return PROGRAM_KEY_PREFIXES.some(prefix => String(key).startsWith(prefix))
}

const UI_STRINGS = {
  en: {
    'language.label': 'Language',
    'language.switchTo': 'Switch to {name}',
    'language.draftNotice': 'The Spanish wording is still a draft under review. Tell Liz if anything reads wrongly — nothing here changes a record.',

    'gate.district': 'Warren Township',
    'gate.portal': 'Food Service Attendance Portal',
    // One line per celebration in celebrations.js. Short: it is read at
    // six in the morning by somebody with their coat still on.
    'celebration.indiana-food-day': 'Happy Indiana Food Day, team!',
    'celebration.halloween-2026': 'Happy Halloween week, team!',
    'celebration.popup.close': 'Close',
    'celebration.popup.dismiss': 'Not now',
    'celebration.popup.title.halloween-2026': 'Happy Halloween, team!',
    'celebration.popup.body.halloween-2026': 'Thanks for everything you do for Warren students. Have a great week — and if somebody on your team is shining, catch them at it.',
    'celebration.cta.indiana-food-day': 'Celebrate with us',
    'celebration.cta.halloween-2026': 'Catch someone shining',
    'gate.usernameLabel': 'Username',
    'gate.usernameHint': 'administrators only',
    'gate.usernamePlaceholder': 'leave blank if you do not have one',
    'gate.pinLabel': 'Enter Access PIN',
    'gate.showPin': 'Show access PIN',
    'gate.hidePin': 'Hide access PIN',
    'gate.unlock': 'Unlock',
    'gate.connecting': 'Connecting…',
    'gate.sessionNote': 'Session expires after 8 hours · Warren Township Food Service',
    'gate.signInFailed': 'Unable to sign in. Please try again.',

    'nav.dashboard': 'Dashboard',
    'nav.allStars': 'All-Stars',
    'nav.employeeRecords': 'Employee Cards',
    'nav.attendance': 'Attendance',
    'nav.reports': 'Reports',
    'nav.blackoutCalendar': 'Blackout Calendar',
    'nav.training': 'Training',
    'nav.customReport': 'Custom Report',
    'nav.masterReport': 'Master Report',
    'nav.settings': 'Settings',
    'nav.access': 'Access',
    'nav.changeRequests': 'Change requests',
    'nav.backupRecovery': 'Backup & Recovery',
    'managerHome.eyebrow': 'Manager dashboard',
    'managerHome.yourSchool': 'Your school',
    'managerHome.onRoster': 'On roster',
    'managerHome.markedToday': 'Marked today',
    'managerHome.attendanceTracker': 'Attendance tracker',
    'managerHome.attendanceTrackerHint': 'Mark the week and add comments for your team.',
    'managerHome.recognitionHint': 'Record a star and see your building board.',
    'managerHome.recordsHint': 'Full-year history for one person.',
    'managerHome.tagline': 'Catch someone shining',
    'managerHome.yourSchools': 'Your schools',
    'managerHome.kitchenCount': 'You cover {count} kitchens · tap one to switch',
    'managerHome.workingIn': 'Working in {name}',
    'managerHome.chooseSchool': 'Choose a school',
    'managerHome.rosterCount': 'The number is how many people are on that roster. Everything on this page follows your choice.',
    'managerHome.birthdaysTitle': '{month} Birthdays',
    'managerHome.birthdaysEmpty': 'No birthdays this month.',
    'managerHome.markedTodayTitle': 'Who\'s marked today',
    'managerHome.markedTodayEmpty': 'No one is marked yet today.',
    'managerHome.markedTodayHint': 'People with an attendance mark for today.',
    'managerTabs.label': 'Manager pages',

    'notices.youWereRecognized': 'You were recognized',
    'notices.new': 'New',
    'notices.recognizedBy': 'Recognized by {name}',
    'notices.from': 'From {name}',
    'notices.enteredBy': 'Entered by {name}',
    'notices.shinedOn': 'Shined on {date}',
    'notices.recordedLater': 'Recorded later on {date}',
    'notices.why': 'Why',
    'notices.seen': 'I\'ve seen this',
    'notices.openCard': 'Open my card',
    'notices.cardsToPrint': 'Cards to print',
    'notices.cardsToPrintHint': 'Star of the Day cards for this kitchen. They stay here until the card is printed.',
    'notices.recordedBy': 'Recorded by {name}',
    'notices.print': 'Print',
    'notices.markPrinted': 'Already printed',
    'notices.groupCard': 'One card for the group',
    'notices.popupBlocked': 'The print window was blocked. Allow pop-ups for this site, then try Print again — or choose Already printed if the card is already on the board.',
    'notices.notRecorded': 'Not recorded',
    'notices.printLocked': 'A login that can record stars has to print these or mark them printed.',

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
    'language.draftNotice': 'La traducción al español todavía es un borrador en revisión. Avise a Liz si algo no suena bien — nada de esto cambia un registro.',

    'gate.district': 'Warren Township',
    'gate.portal': 'Portal de Asistencia de Servicio de Alimentos',
    'celebration.indiana-food-day': '¡Feliz Día de la Comida de Indiana, equipo!',
    'celebration.halloween-2026': '¡Feliz semana de Halloween, equipo!',
    'celebration.popup.close': 'Cerrar',
    'celebration.popup.dismiss': 'Ahora no',
    'celebration.popup.title.halloween-2026': '¡Feliz Halloween, equipo!',
    'celebration.popup.body.halloween-2026': 'Gracias por todo lo que hacen por los estudiantes de Warren. Que tengan una buena semana, y si alguien de su equipo está brillando, reconózcalo.',
    'celebration.cta.indiana-food-day': 'Celebre con nosotros',
    'celebration.cta.halloween-2026': 'Reconozca a un compañero',
    'gate.usernameLabel': 'Nombre de usuario',
    'gate.usernameHint': 'solo administradores',
    'gate.usernamePlaceholder': 'déjelo en blanco si no tiene uno',
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
    'nav.employeeRecords': 'Tarjetas de empleado',
    'nav.attendance': 'Asistencia',
    'nav.reports': 'Informes',
    'nav.blackoutCalendar': 'Calendario de días bloqueados',
    'nav.training': 'Capacitación',
    'nav.customReport': 'Reporte personalizado',
    'nav.masterReport': 'Reporte general',
    'nav.settings': 'Configuración',
    'nav.access': 'Acceso',
    'nav.changeRequests': 'Solicitudes de cambio',
    'nav.backupRecovery': 'Respaldo y recuperación',
    'managerHome.eyebrow': 'Panel del gerente',
    'managerHome.yourSchool': 'Su escuela',
    'managerHome.onRoster': 'En la nómina',
    'managerHome.markedToday': 'Registrados hoy',
    'managerHome.attendanceTracker': 'Registro de asistencia',
    'managerHome.attendanceTrackerHint': 'Marque la semana y agregue comentarios para su equipo.',
    'managerHome.recognitionHint': 'Registre una estrella y vea el tablero de su escuela.',
    'managerHome.recordsHint': 'Historial del año completo de una persona.',
    'managerHome.tagline': 'Reconozca a quien brilla',
    'managerHome.yourSchools': 'Sus escuelas',
    'managerHome.kitchenCount': 'Cubre {count} cocinas · toque una para cambiar',
    'managerHome.workingIn': 'Trabajando en {name}',
    'managerHome.chooseSchool': 'Elija una escuela',
    'managerHome.rosterCount': 'El número es cuántas personas hay en esa nómina. Todo en esta página sigue su elección.',
    'managerHome.birthdaysTitle': 'Cumpleaños de {month}',
    'managerHome.birthdaysEmpty': 'No hay cumpleaños este mes.',
    'managerHome.markedTodayTitle': 'Quién está registrado hoy',
    'managerHome.markedTodayEmpty': 'Todavía no hay nadie registrado hoy.',
    'managerHome.markedTodayHint': 'Personas con una marca de asistencia para hoy.',
    'managerTabs.label': 'Páginas del gerente',

    'notices.youWereRecognized': 'Le reconocieron',
    'notices.new': 'Nuevo',
    'notices.recognizedBy': 'Reconocido por {name}',
    'notices.from': 'De {name}',
    'notices.enteredBy': 'Registrado por {name}',
    'notices.shinedOn': 'Brilló el {date}',
    'notices.recordedLater': 'Se registró después, el {date}',
    'notices.why': 'Por qué',
    'notices.seen': 'Ya lo vi',
    'notices.openCard': 'Abrir mi tarjeta',
    'notices.cardsToPrint': 'Tarjetas para imprimir',
    'notices.cardsToPrintHint': 'Tarjetas de Star of the Day de esta cocina. Se quedan aquí hasta que la tarjeta se imprima.',
    'notices.recordedBy': 'Registrado por {name}',
    'notices.print': 'Imprimir',
    'notices.markPrinted': 'Ya está impresa',
    'notices.groupCard': 'Una tarjeta para el grupo',
    'notices.popupBlocked': 'El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes para este sitio y vuelva a intentar Imprimir, o elija Ya está impresa si la tarjeta ya está en el tablero.',
    'notices.notRecorded': 'No registrado',
    'notices.printLocked': 'Un acceso que puede registrar estrellas tiene que imprimirlas o marcarlas como impresas.',

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

const STRINGS = {
  en: { ...UI_STRINGS.en, ...PROGRAM_STRINGS.en },
  es: { ...UI_STRINGS.es, ...PROGRAM_STRINGS.es },
}

export { STRINGS }

// Plural selection. Kept explicit rather than folded into translate() so a
// caller has to say that a count is involved: "1 incidencia documentada" and
// "3 incidencias documentadas" differ in Spanish exactly as they do in
// English, and a silent fallback to the singular reads as a bug.
export function translateCount(locale, key, count, values) {
  const suffix = Math.abs(Number(count)) === 1 ? 'one' : 'other'
  return translate(locale, `${key}.${suffix}`, { count, ...values })
}

// 'es-MX', 'es_419' and 'ES' all mean Spanish here. Anything unrecognized
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
  // A bare 'YYYY-MM-DD' parses as UTC midnight, which renders as the previous
  // day everywhere west of Greenwich — Warren is on Eastern time, so a date
  // key for today would have printed yesterday on screen all day. Noon local
  // is what the rest of the codebase uses for the same reason; a value that
  // already carries a time is left exactly as given.
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
  const date = value instanceof Date
    ? value
    : new Date(DATE_ONLY.test(String(value || '').trim()) ? `${String(value).trim()}T12:00:00` : value)
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
