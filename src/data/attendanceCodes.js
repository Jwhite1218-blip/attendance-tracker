// Real attendance codes from the food service attendance tracking system
// Blank/unmarked = Present (employee showed up and worked their shift)
// Color blocking uses the official brand palette: Plum, Watermelon, Mango, Green Smoothie, Clear Skies

export const ATTENDANCE_CODES = [
  {
    code: '',
    label: 'Present',
    shortLabel: 'P',
    description: 'Employee present, working as scheduled',
    paid: true,
    color: 'present',
    hex: { bg: '#7AB44C', text: '#FFFFFF', border: '#74B143' } // Green Smoothie
  },
  {
    code: 'U',
    label: 'Unexcused Absence (Unpaid)',
    shortLabel: 'U',
    description: 'Unexcused absence, unpaid',
    paid: false,
    color: 'absent',
    hex: { bg: '#E56E6A', text: '#FFFFFF', border: '#E46463' } // Watermelon
  },
  {
    code: 'UP',
    label: 'Unexcused Absence (Paid)',
    shortLabel: 'UP',
    description: 'Unexcused absence, paid',
    paid: true,
    color: 'absent',
    hex: { bg: '#E56E6A', text: '#FFFFFF', border: '#9b3f2e' } // Watermelon (deeper border for paid variant)
  },
  {
    code: 'RTO',
    label: 'RTO Approved (Unpaid)',
    shortLabel: 'RTO',
    description: 'Requested Time Off approved, unpaid',
    paid: false,
    color: 'excused',
    hex: { bg: '#84D1ED', text: '#FFFFFF', border: '#47A9C3' } // Clear Skies
  },
  {
    code: 'RTOP',
    label: 'RTO Approved (Paid)',
    shortLabel: 'RTOP',
    description: 'Requested Time Off approved, paid',
    paid: true,
    color: 'excused',
    hex: { bg: '#47A9C3', text: '#FFFFFF', border: '#357e93' } // Clear Skies (deeper, paid variant)
  },
  {
    code: 'CC',
    label: 'Consecutive Call Out',
    shortLabel: 'CC',
    description: 'Consecutive call out (pattern of missed days)',
    paid: false,
    color: 'late',
    hex: { bg: '#E8A32B', text: '#FFFFFF', border: '#EC9126' } // Mango
  },
  {
    code: 'L/EQ',
    label: 'Late / Early Quit',
    shortLabel: 'L/EQ',
    description: 'Late arrival or early quit',
    paid: true,
    color: 'late',
    hex: { bg: '#EC9126', text: '#FFFFFF', border: '#c97815' } // Mango (deeper variant)
  },
  {
    code: 'NCNS',
    label: 'No Call No Show',
    shortLabel: 'NCNS',
    description: 'No call, no show',
    paid: false,
    color: 'absent',
    hex: { bg: '#E46463', text: '#FFFFFF', border: '#c14a49' } // Watermelon (deepest — most severe)
  },
  {
    code: 'B/J',
    label: 'Bereavement / Jury Duty',
    shortLabel: 'B/J',
    description: 'Bereavement or jury duty leave',
    paid: true,
    color: 'remote',
    hex: { bg: '#AB3F94', text: '#FFFFFF', border: '#9b3f84' } // Plum
  },
  {
    code: 'M',
    label: 'Medical (FMLA / LOA)',
    shortLabel: 'M',
    description: 'Medical leave — FMLA or Leave of Absence',
    paid: null,
    color: 'remote',
    hex: { bg: '#9b3f84', text: '#FFFFFF', border: '#7d2f69' } // Plum (deeper variant)
  },
  {
    code: 'U.5',
    label: 'Half Day (Unpaid)',
    shortLabel: 'U.5',
    description: 'Half day absence, unpaid',
    paid: false,
    color: 'absent',
    hex: { bg: '#E56E6A', text: '#FFFFFF', border: '#E46463' } // Watermelon
  },
  {
    code: 'UP.5',
    label: 'Half Day (Paid)',
    shortLabel: 'UP.5',
    description: 'Half day absence, paid',
    paid: true,
    color: 'late',
    hex: { bg: '#E8A32B', text: '#FFFFFF', border: '#EC9126' } // Mango
  },
]

// Quick lookup by code
export const CODE_MAP = Object.fromEntries(
  ATTENDANCE_CODES.map(c => [c.code, c])
)

// Codes for the cycle when clicking a cell (skip blank/Present, start with U)
export const CODE_CYCLE = ATTENDANCE_CODES.map(c => c.code)

// Categories for grouping in reports
export const CODE_CATEGORIES = {
  present: ['', ],
  unexcused_unpaid: ['U', 'NCNS', 'CC', 'U.5'],
  unexcused_paid: ['UP', 'UP.5'],
  rto_unpaid: ['RTO'],
  rto_paid: ['RTOP'],
  late_early: ['L/EQ'],
  leave: ['B/J', 'M'],
}
