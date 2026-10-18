import { spanishApproval } from './programSettings.js'

// Warren's own vocabulary, in both languages.
//
// Kept apart from i18n.js because this is the part that needs a person, not a
// tool. Attendance codes are disciplinary categories that feed HR occurrence
// tracking; getting one subtly wrong in Spanish could misrepresent what a
// record says about somebody's job. The Spanish below is a DRAFT written to
// give Warren's Spanish speakers something to correct instead of a blank page.
//
// Nothing here is wired into the screens yet. Wiring happens after sign-off:
// set APPROVAL.approvedBy and APPROVAL.approvedOn, then connect the consumers
// (attendanceCodes.js, hrFlags.js, recognitionStore.js).
//
// Three judgement calls are flagged as QUESTIONS below rather than decided
// here, because they are Liz's to make, not a translator's.

export const APPROVAL = {
  approvedBy: null,
  approvedOn: null,
  draftedOn: '2026-09-28',
}

// Points a reviewer should rule on before any of this is used.
export const OPEN_QUESTIONS = [
  'Program names — "Star of the Day", "Shooting Star", "All-Stars", "Warren Star Shout-Out". The draft leaves these in English because the printed cards and the banner say them in English, so translating them on screen would not match what is in a manager\'s hand. Overrule if you would rather they were translated.',
  'Star levels — Bronze / Silver / Gold / Platinum / Superstar. The draft translates these. They are tier names rather than brand names, but they do appear on the board, so say if they should stay English.',
  'Annual award names — "Teamwork All-Star" and the rest. The draft leaves these alone because half of each name is the program brand and the mixture reads badly either way.',
  'FMLA and LOA stay as the English acronyms: they are United States legal terms and translating them would make a protected-leave record harder to match against district paperwork.',
]

// Attendance codes. Highest-risk group on this page.
const ATTENDANCE = {
  en: {
    'code.RTO.label': 'REQUESTED TIME OFF, APPROVED',
    'code.RTO.description': 'Approved requested time off for a full day',
    'code.RTO5.label': 'REQUESTED TIME OFF, HALF DAY',
    'code.RTO5.description': 'Approved requested time off for a half day',
    'code.NCNS.label': 'NO CALL, NO SHOW',
    'code.NCNS.description': 'Employee missed the shift without calling',
    'code.LI.label': 'LATE IN, UNAPPROVED',
    'code.LI.description': 'Unapproved late arrival',
    'code.EO.label': 'EARLY OUT, UNAPPROVED',
    'code.EO.description': 'Unapproved early departure',
    'code.UNEX.label': 'UNEXCUSED ABSENCE, CALL IN',
    'code.UNEX.description': 'Employee called in for an unexcused absence',
    'code.M.label': 'MEDICAL (FMLA/LOA)',
    'code.M.description': 'Protected medical, FMLA, or leave-of-absence record',
    'code.BER.label': 'BEREAVEMENT',
    'code.BER.description': 'Bereavement leave',
    'code.OTH.label': 'OTHER',
    'code.OTH.description': 'An approved absence that does not fit any other code',
    'code.CLEAR.label': 'Clear Entry',
    'code.CLEAR.description': 'Remove the attendance exception for this day',
    'code.legacy.CC': 'LEGACY CONSECUTIVE CALL OUT',
    'code.legacy.LE': 'LEGACY LATE / EARLY RECORD',
    'code.legacy.BJ': 'LEGACY BEREAVEMENT / JURY DUTY',
    'code.legacy.O': 'LEGACY OTHER ATTENDANCE EXCEPTION',
  },
  es: {
    'code.RTO.label': 'TIEMPO LIBRE SOLICITADO, APROBADO',
    'code.RTO.description': 'Tiempo libre solicitado y aprobado por el día completo',
    'code.RTO5.label': 'TIEMPO LIBRE SOLICITADO, MEDIO DÍA',
    'code.RTO5.description': 'Tiempo libre solicitado y aprobado por medio día',
    'code.NCNS.label': 'NO LLAMÓ, NO SE PRESENTÓ',
    'code.NCNS.description': 'El empleado faltó a su turno sin avisar',
    'code.LI.label': 'LLEGADA TARDE, NO APROBADA',
    'code.LI.description': 'Llegada tarde sin aprobación',
    'code.EO.label': 'SALIDA TEMPRANA, NO APROBADA',
    'code.EO.description': 'Salida temprana sin aprobación',
    // "Call in" means the employee did phone in; the absence is still
    // unexcused. Both halves have to survive or the record changes meaning.
    'code.UNEX.label': 'AUSENCIA INJUSTIFICADA, CON AVISO',
    'code.UNEX.description': 'El empleado avisó, pero la ausencia no está justificada',
    'code.M.label': 'MÉDICA (FMLA/LOA)',
    'code.M.description': 'Registro médico protegido, FMLA o permiso de ausencia',
    'code.BER.label': 'DUELO',
    'code.BER.description': 'Permiso por duelo',
    'code.OTH.label': 'OTRO',
    'code.OTH.description': 'Una ausencia aprobada que no corresponde a ningún otro código',
    'code.CLEAR.label': 'Borrar registro',
    'code.CLEAR.description': 'Quitar la excepción de asistencia de este día',
    'code.legacy.CC': 'HISTÓRICO: AUSENCIAS CONSECUTIVAS CON AVISO',
    'code.legacy.LE': 'HISTÓRICO: REGISTRO DE LLEGADA TARDE / SALIDA TEMPRANA',
    'code.legacy.BJ': 'HISTÓRICO: DUELO / DEBER DE JURADO',
    'code.legacy.O': 'HISTÓRICO: OTRA EXCEPCIÓN DE ASISTENCIA',
  },
}

// HR occurrence stages. These follow district and union policy language.
const HR_STAGES = {
  en: {
    'hr.none': 'No active attendance action',
    'hr.seniorityResetVerbal': 'Union seniority reset · Verbal warning required',
    'hr.seniorityReset': 'Union seniority reset',
    'hr.verbalWarning': 'Verbal warning required',
    'hr.formalTracking': 'Formal attendance tracking',
    'hr.occurrences.one': '{count} documented occurrence',
    'hr.occurrences.other': '{count} documented occurrences',
  },
  es: {
    'hr.none': 'Sin acción de asistencia activa',
    'hr.seniorityResetVerbal': 'Reinicio de antigüedad sindical · Se requiere advertencia verbal',
    'hr.seniorityReset': 'Reinicio de antigüedad sindical',
    'hr.verbalWarning': 'Se requiere advertencia verbal',
    'hr.formalTracking': 'Seguimiento formal de asistencia',
    'hr.occurrences.one': '{count} incidencia documentada',
    'hr.occurrences.other': '{count} incidencias documentadas',
  },
}

// Recognition. Names stay in English on purpose — see OPEN_QUESTIONS.
const RECOGNITION = {
  en: {
    'recognition.starOfDay.label': 'Star of the Day',
    'recognition.starOfDay.description': 'Daily recognition for an extra-sparkle performance.',
    'recognition.shootingStar.label': 'Shooting Star Nomination',
    'recognition.shootingStar.description': 'Nominate someone for quarterly review. A nomination does not add an earned star or drawing entry.',
    'recognition.shoutOut.label': 'Warren Star Shout-Out',
    'recognition.shoutOut.description': 'A special recognition received from a student, teacher, or staff member.',
    'recognition.employeeOfMonth.label': 'Warren Food Services Employee of the Month',
    'recognition.employeeOfMonth.description': 'Township-wide recognition for a qualifying top performer.',
    'recognition.allStarOfMonth.label': 'All-Star of the Month',
    'recognition.allStarOfMonth.description': 'Building winner drawn from that month\'s daily recognition entries.',

    'level.bronze': 'Bronze Star',
    'level.silver': 'Silver Star',
    'level.gold': 'Gold Star',
    'level.platinum': 'Platinum Star',
    'level.superstar': 'Superstar',

    'reason.Teamwork': 'Teamwork',
    'reason.Teamwork.description': 'Supports coworkers and creates a positive work environment.',
    'reason.Service': 'Service',
    'reason.Service.description': 'Provides exceptional customer service to students and staff.',
    'reason.Safety': 'Safety',
    'reason.Safety.description': 'Consistently follows food safety and sanitation procedures.',
    'reason.Culinary': 'Culinary',
    'reason.Culinary.description': 'Demonstrates excellence in food preparation and meal presentation.',
    'reason.Reliability': 'Reliability',
    'reason.Reliability.description': 'Demonstrates outstanding attendance and dependability.',
    'reason.Positivity': 'Positivity',
    'reason.Positivity.description': 'Brings a positive attitude and helps create a welcoming workplace.',
    'reason.Other': 'Other',
    'reason.Other.description': 'Choose this when none of the listed reasons fit, then explain it in the message below.',
  },
  es: {
    // Program names left in English deliberately — they match the printed
    // cards and the banner a manager is holding.
    'recognition.starOfDay.label': 'Star of the Day',
    'recognition.starOfDay.description': 'Reconocimiento diario por un desempeño que brilla.',
    'recognition.shootingStar.label': 'Shooting Star Nomination',
    'recognition.shootingStar.description': 'Nomine a alguien para la revisión trimestral. Una nominación no suma una estrella ganada ni una entrada al sorteo.',
    'recognition.shoutOut.label': 'Warren Star Shout-Out',
    'recognition.shoutOut.description': 'Un reconocimiento especial recibido de un estudiante, maestro o miembro del personal.',
    'recognition.employeeOfMonth.label': 'Warren Food Services Employee of the Month',
    'recognition.employeeOfMonth.description': 'Reconocimiento de todo el distrito para un empleado destacado que califique.',
    'recognition.allStarOfMonth.label': 'All-Star of the Month',
    'recognition.allStarOfMonth.description': 'Ganador del plantel, sorteado entre las entradas de reconocimiento diario de ese mes.',

    'level.bronze': 'Estrella de Bronce',
    'level.silver': 'Estrella de Plata',
    'level.gold': 'Estrella de Oro',
    'level.platinum': 'Estrella de Platino',
    'level.superstar': 'Superestrella',

    'reason.Teamwork': 'Trabajo en equipo',
    'reason.Teamwork.description': 'Apoya a sus compañeros y crea un ambiente de trabajo positivo.',
    'reason.Service': 'Servicio',
    'reason.Service.description': 'Brinda un servicio excepcional a los estudiantes y al personal.',
    'reason.Safety': 'Seguridad',
    'reason.Safety.description': 'Sigue siempre los procedimientos de inocuidad alimentaria y limpieza.',
    'reason.Culinary': 'Culinaria',
    'reason.Culinary.description': 'Demuestra excelencia en la preparación y presentación de los alimentos.',
    'reason.Reliability': 'Responsabilidad',
    'reason.Reliability.description': 'Demuestra una asistencia y formalidad sobresalientes.',
    'reason.Positivity': 'Actitud positiva',
    'reason.Positivity.description': 'Aporta una actitud positiva y ayuda a crear un lugar de trabajo acogedor.',
    'reason.Other': 'Otro',
    'reason.Other.description': 'Elija esta opción cuando ninguna de las razones aplique y explíquelo en el mensaje de abajo.',
  },
}

export const PROGRAM_STRINGS = {
  en: { ...ATTENDANCE.en, ...HR_STAGES.en, ...RECOGNITION.en },
  es: { ...ATTENDANCE.es, ...HR_STAGES.es, ...RECOGNITION.es },
}

// Grouped for the review sheet, so a reviewer works through related terms
// together rather than an alphabetical jumble.
export const REVIEW_GROUPS = [
  { title: 'Attendance codes', note: 'These feed HR occurrence tracking. Wording here has consequences for a record.', keys: Object.keys(ATTENDANCE.en) },
  { title: 'HR occurrence stages', note: 'District and union policy language.', keys: Object.keys(HR_STAGES.en) },
  { title: 'Recognition', note: 'Program names are left in English on purpose — see the questions.', keys: Object.keys(RECOGNITION.en) },
]

// Sign-off now happens in Settings rather than in this file, so Liz can
// clear the "still under review" notice herself the day her team finishes
// reading it. The constant above stays as the fallback and as the record of
// when the draft was written.
export function isApproved() {
  const approval = spanishApproval() || APPROVAL
  return Boolean(approval.approvedBy && approval.approvedOn)
}

export function approvalRecord() {
  return spanishApproval() || (APPROVAL.approvedBy ? APPROVAL : null)
}
