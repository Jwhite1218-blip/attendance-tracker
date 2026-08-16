// Real attendance codes from the food service attendance tracking system
// Blank/unmarked = Present (employee showed up and worked their shift)

export const ATTENDANCE_CODES = [
  { 
    code: '', 
    label: 'Present', 
    shortLabel: 'P',
    description: 'Employee present, working as scheduled',
    paid: true,
    color: 'present',
    hex: { bg: '#dcfce7', text: '#166534', border: '#86efac' }
  },
  { 
    code: 'U', 
    label: 'Unexcused Absence (Unpaid)', 
    shortLabel: 'U',
    description: 'Unexcused absence, unpaid',
    paid: false,
    color: 'absent',
    hex: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
  },
  { 
    code: 'UP', 
    label: 'Unexcused Absence (Paid)', 
    shortLabel: 'UP',
    description: 'Unexcused absence, paid',
    paid: true,
    color: 'absent',
    hex: { bg: '#fecaca', text: '#7f1d1d', border: '#f87171' }
  },
  { 
    code: 'RTO', 
    label: 'RTO Approved (Unpaid)', 
    shortLabel: 'RTO',
    description: 'Requested Time Off approved, unpaid',
    paid: false,
    color: 'excused',
    hex: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' }
  },
  { 
    code: 'RTOP', 
    label: 'RTO Approved (Paid)', 
    shortLabel: 'RTOP',
    description: 'Requested Time Off approved, paid',
    paid: true,
    color: 'excused',
    hex: { bg: '#bfdbfe', text: '#1e3a8a', border: '#60a5fa' }
  },
  { 
    code: 'CC', 
    label: 'Consecutive Call Out', 
    shortLabel: 'CC',
    description: 'Consecutive call out (pattern of missed days)',
    paid: false,
    color: 'late',
    hex: { bg: '#fef3c7', text: '#854d0e', border: '#fcd34d' }
  },
  { 
    code: 'L/EQ', 
    label: 'Late / Early Quit', 
    shortLabel: 'L/EQ',
    description: 'Late arrival or early quit',
    paid: true,
    color: 'late',
    hex: { bg: '#fef9c3', text: '#713f12', border: '#fde047' }
  },
  { 
    code: 'NCNS', 
    label: 'No Call No Show', 
    shortLabel: 'NCNS',
    description: 'No call, no show',
    paid: false,
    color: 'absent',
    hex: { bg: '#fca5a5', text: '#7f1d1d', border: '#f87171' }
  },
  { 
    code: 'B/J', 
    label: 'Bereavement / Jury Duty', 
    shortLabel: 'B/J',
    description: 'Bereavement or jury duty leave',
    paid: true,
    color: 'remote',
    hex: { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' }
  },
  { 
    code: 'M', 
    label: 'Medical (FMLA / LOA)', 
    shortLabel: 'M',
    description: 'Medical leave — FMLA or Leave of Absence',
    paid: null,
    color: 'remote',
    hex: { bg: '#e9d5ff', text: '#581c87', border: '#a78bfa' }
  },
  { 
    code: 'U.5', 
    label: 'Half Day (Unpaid)', 
    shortLabel: 'U.5',
    description: 'Half day absence, unpaid',
    paid: false,
    color: 'absent',
    hex: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
  },
  { 
    code: 'UP.5', 
    label: 'Half Day (Paid)', 
    shortLabel: 'UP.5',
    description: 'Half day absence, paid',
    paid: true,
    color: 'late',
    hex: { bg: '#fef3c7', text: '#854d0e', border: '#fcd34d' }
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
