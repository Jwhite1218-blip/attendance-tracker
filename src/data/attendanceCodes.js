// Warren Township attendance exceptions.
// Unmarked days are intentionally not stored: managers only record exceptions.

export const ATTENDANCE_CODES = [
  {
    code: 'CO',
    label: 'Call Out',
    shortLabel: 'CO',
    description: 'Employee called out for the scheduled day',
    color: 'absent',
    hex: { bg: '#E56E6A', text: '#FFFFFF', border: '#C65350' },
  },
  {
    code: 'RTO',
    label: 'Requested Time Off — Full Day',
    shortLabel: 'RTO',
    description: 'Approved requested time off for a full day',
    color: 'excused',
    hex: { bg: '#84D1ED', text: '#173B4A', border: '#47A9C3' },
  },
  {
    code: 'RTO.5',
    label: 'Requested Time Off — Half Day',
    shortLabel: 'RTO½',
    description: 'Approved requested time off for a half day',
    color: 'excused',
    hex: { bg: '#47A9C3', text: '#FFFFFF', border: '#357E93' },
  },
  {
    code: 'CC',
    label: 'Consecutive Call Out — Seniority Reset',
    shortLabel: 'CC',
    description: 'Second consecutive call-out day; union seniority resets',
    color: 'critical',
    hex: { bg: '#B74743', text: '#FFFFFF', border: '#8E302D' },
  },
  {
    code: 'LE',
    label: 'Late / Left Early',
    shortLabel: 'L/E',
    description: 'Late arrival or employee left before the shift ended',
    color: 'late',
    hex: { bg: '#EC9126', text: '#FFFFFF', border: '#C97815' },
  },
  {
    code: 'NCNS',
    label: 'No Call / No Show',
    shortLabel: 'NCNS',
    description: 'Employee missed the shift without calling',
    color: 'critical',
    hex: { bg: '#E46463', text: '#FFFFFF', border: '#A93D3C' },
  },
  {
    code: 'B/J',
    label: 'Bereavement / Jury Duty',
    shortLabel: 'B/J',
    description: 'Bereavement or jury-duty leave',
    color: 'leave',
    hex: { bg: '#AB3F94', text: '#FFFFFF', border: '#843072' },
  },
  {
    code: 'M',
    label: 'Medical / FMLA / Leave of Absence',
    shortLabel: 'MED',
    description: 'Protected medical or approved leave of absence',
    color: 'leave',
    hex: { bg: '#7D2F69', text: '#FFFFFF', border: '#5F214F' },
  },
  {
    code: 'O',
    label: 'Other Attendance Exception',
    shortLabel: 'OTHER',
    description: 'Another attendance exception; add a comment for context',
    color: 'other',
    hex: { bg: '#64748B', text: '#FFFFFF', border: '#475569' },
  },
]

export const CLEAR_ATTENDANCE = {
  code: '',
  label: 'Clear Entry',
  shortLabel: 'CLEAR',
  description: 'Remove the attendance exception for this day',
  hex: { bg: '#F8FAFC', text: '#64748B', border: '#CBD5E1' },
}

// Saved records from the first prototype are normalized at read time so the
// new language does not erase anyone's existing attendance history.
export const LEGACY_CODE_ALIASES = {
  U: 'CO',
  UP: 'CO',
  'U.5': 'RTO.5',
  'UP.5': 'RTO.5',
  RTOP: 'RTO',
  'L/EQ': 'LE',
}

export function normalizeAttendanceCode(code = '') {
  return LEGACY_CODE_ALIASES[code] || code
}

export const CODE_MAP = Object.fromEntries(
  ATTENDANCE_CODES.map(code => [code.code, code])
)

Object.entries(LEGACY_CODE_ALIASES).forEach(([legacyCode, currentCode]) => {
  CODE_MAP[legacyCode] = CODE_MAP[currentCode]
})

export const CODE_CYCLE = ['', ...ATTENDANCE_CODES.map(code => code.code)]

export const CODE_CATEGORIES = {
  call_out: ['CO', 'CC'],
  requested_time_off: ['RTO', 'RTO.5'],
  late_early: ['LE'],
  no_call_no_show: ['NCNS'],
  protected_leave: ['B/J', 'M'],
  other: ['O'],
}
