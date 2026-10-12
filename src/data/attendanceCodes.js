// Warren Township attendance exceptions.
// Unmarked days are intentionally not stored: managers only record exceptions.

export const ATTENDANCE_CODES = [
  {
    code: 'RTO',
    label: 'REQUESTED TIME OFF, APPROVED',
    shortLabel: 'RTO',
    description: 'Approved requested time off for a full day',
    color: 'excused',
    hex: { bg: '#84D1ED', text: '#173B4A', border: '#47A9C3' },
  },
  {
    code: 'RTO.5',
    label: 'REQUESTED TIME OFF, HALF DAY',
    shortLabel: 'RTO.5',
    description: 'Approved requested time off for a half day',
    color: 'excused',
    hex: { bg: '#47A9C3', text: '#FFFFFF', border: '#357E93' },
  },
  {
    code: 'NCNS',
    label: 'NO CALL, NO SHOW',
    shortLabel: 'NCNS',
    description: 'Employee missed the shift without calling',
    color: 'critical',
    hex: { bg: '#B74743', text: '#FFFFFF', border: '#8E302D' },
  },
  {
    code: 'LI',
    label: 'LATE IN, UNAPPROVED',
    shortLabel: 'LI',
    description: 'Unapproved late arrival',
    color: 'late',
    hex: { bg: '#EC9126', text: '#FFFFFF', border: '#C97815' },
  },
  {
    code: 'EO',
    label: 'EARLY OUT, UNAPPROVED',
    shortLabel: 'EO',
    description: 'Unapproved early departure',
    color: 'late',
    hex: { bg: '#E8A32B', text: '#3F2B0A', border: '#C5851C' },
  },
  {
    code: 'UNEX',
    label: 'UNEXCUSED ABSENCE, CALL IN',
    shortLabel: 'UNEX',
    description: 'Employee called in for an unexcused absence',
    color: 'absent',
    hex: { bg: '#E56E6A', text: '#FFFFFF', border: '#C65350' },
  },
  {
    code: 'M',
    label: 'MEDICAL (FMLA/LOA)',
    shortLabel: 'M',
    description: 'Protected medical, FMLA, or leave-of-absence record',
    color: 'leave',
    hex: { bg: '#7D2F69', text: '#FFFFFF', border: '#5F214F' },
  },
  {
    code: 'BER',
    label: 'BEREAVEMENT',
    shortLabel: 'BER',
    description: 'Bereavement leave',
    color: 'leave',
    hex: { bg: '#AB3F94', text: '#FFFFFF', border: '#843072' },
  },
  {
    // Stored as 'JUR' on purpose. This was the jury-duty code and Liz asked
    // for it to become a general "other" on 2026-10-11; renaming the stored
    // value would orphan every record already written under it, and the badge
    // would vanish from those days. The code is an identifier, not a label —
    // only what people read has changed.
    code: 'JUR',
    label: 'OTHER',
    shortLabel: 'OTHER',
    description: 'An approved absence that does not fit any other code',
    color: 'leave',
    hex: { bg: '#8B5AA5', text: '#FFFFFF', border: '#68417D' },
  },
]

export const CLEAR_ATTENDANCE = {
  code: '',
  label: 'Clear Entry',
  shortLabel: 'CLEAR',
  description: 'Remove the attendance exception for this day',
  hex: { bg: '#F8FAFC', text: '#64748B', border: '#CBD5E1' },
}

// Safe one-to-one migrations from earlier tracker versions. Ambiguous combined
// codes remain available as legacy display records instead of being guessed.
export const LEGACY_CODE_ALIASES = {
  U: 'UNEX',
  UP: 'UNEX',
  CO: 'UNEX',
  'U.5': 'RTO.5',
  'UP.5': 'RTO.5',
  RTOP: 'RTO',
}

const LEGACY_DISPLAY_CODES = [
  {
    code: 'CC',
    label: 'LEGACY CONSECUTIVE CALL OUT',
    shortLabel: 'CC',
    hex: { bg: '#B74743', text: '#FFFFFF', border: '#8E302D' },
  },
  {
    code: 'LE',
    label: 'LEGACY LATE / EARLY RECORD',
    shortLabel: 'L/E',
    hex: { bg: '#EC9126', text: '#FFFFFF', border: '#C97815' },
  },
  {
    code: 'L/EQ',
    label: 'LEGACY LATE / EARLY RECORD',
    shortLabel: 'L/E',
    hex: { bg: '#EC9126', text: '#FFFFFF', border: '#C97815' },
  },
  {
    code: 'B/J',
    label: 'LEGACY BEREAVEMENT / JURY DUTY',
    shortLabel: 'B/J',
    hex: { bg: '#AB3F94', text: '#FFFFFF', border: '#843072' },
  },
  {
    code: 'O',
    label: 'LEGACY OTHER ATTENDANCE EXCEPTION',
    shortLabel: 'OTHER',
    hex: { bg: '#64748B', text: '#FFFFFF', border: '#475569' },
  },
]

export function normalizeAttendanceCode(code = '') {
  return LEGACY_CODE_ALIASES[code] || code
}

export const CODE_MAP = Object.fromEntries(
  [...ATTENDANCE_CODES, ...LEGACY_DISPLAY_CODES].map(code => [code.code, code])
)

Object.entries(LEGACY_CODE_ALIASES).forEach(([legacyCode, currentCode]) => {
  CODE_MAP[legacyCode] = CODE_MAP[currentCode]
})

export const CODE_CYCLE = ['', ...ATTENDANCE_CODES.map(code => code.code)]

export const CODE_CATEGORIES = {
  requested_time_off: ['RTO', 'RTO.5'],
  no_call_no_show: ['NCNS'],
  late_in: ['LI'],
  early_out: ['EO'],
  unexcused_call_in: ['UNEX', 'CC'],
  protected_leave: ['M', 'BER'],
  other: ['JUR'],
  legacy: ['LE', 'L/EQ', 'B/J', 'O'],
}
