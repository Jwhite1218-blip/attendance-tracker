// Recognising a district payroll number, so the server can refuse one.
//
// Jon, 2026-10-30: until that evening the payroll number was the key every
// attendance row, star, note and login link hung from for the 146 people in
// the original roster. They were re-keyed onto opaque keys — the kind an
// employee added in the app has had since 2026-10-20 — and the database's
// copies of the old data were cleared. The one-time move and its preview
// screen have been taken out again; what stays is the guard: once the
// roster names nobody by payroll number, nothing may write one back (a
// tablet left open since before the re-key) and no backup from before it
// may be restored.
//
// The roster field is still called kronos_id. It holds the opaque key now;
// the name is historical.

// What a payroll number looks like here: seven or eight digits in practice.
// Bounded both ways so a year, a count or a timestamp never qualifies.
const PAYROLL_PATTERN = /^\d{5,10}$/

export function isPayrollKey(value) {
  return PAYROLL_PATTERN.test(String(value ?? '').trim())
}

const ATTENDANCE_KEY = /^att-emp-(.+)-(\d{4})$/

// The shared maps whose object keys are a person's key.
const PERSON_KEYED_MAPS = new Set([
  'employee-record-overrides',
  'employee-location-overrides',
  'employee-manager-notes-v1',
  'employee-assignment-history-v1',
])

// The attendance-status maps, keyed `${personKey}-${schoolYear}`.
const PERSON_YEAR_KEYED_MAPS = new Set(['hr-attendance-progress-v2', 'hr-flags'])
const PERSON_YEAR_KEY = /^(.+)-(\d{4})$/

// Fields that hold a person's key wherever they appear in a value.
const PERSON_FIELDS = new Set(['employeeId', 'empId', 'kronos_id', 'employee_id', 'employeeIds'])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keyOf(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

// Every payroll-shaped key the data uses to name a person, wherever it sits:
// in a state key, as a map key, or in one of the person fields.
export function payrollKeysInEntries(entries) {
  const found = new Set()
  const note = value => {
    if (isPayrollKey(value)) found.add(String(value).trim())
  }
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!isPlainObject(value)) return
    for (const [field, inner] of Object.entries(value)) {
      if (PERSON_FIELDS.has(field)) {
        if (Array.isArray(inner)) inner.forEach(note)
        else note(inner)
      }
      walk(inner)
    }
  }

  for (const [stateKey, value] of Object.entries(entries || {})) {
    const attendance = stateKey.match(ATTENDANCE_KEY)
    if (attendance) note(attendance[1])
    if (PERSON_KEYED_MAPS.has(stateKey) && isPlainObject(value)) Object.keys(value).forEach(note)
    if (PERSON_YEAR_KEYED_MAPS.has(stateKey) && isPlainObject(value)) {
      Object.keys(value).forEach(mapKey => note(mapKey.match(PERSON_YEAR_KEY)?.[1]))
    }
    walk(value)
  }
  return found
}

export function rosterIsRekeyed(roster) {
  return (roster || []).every(employee => !isPayrollKey(keyOf(employee)))
}
