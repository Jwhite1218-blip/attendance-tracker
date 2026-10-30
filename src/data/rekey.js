// The re-key. Jon, 2026-10-30: the district's payroll number was taken off
// every screen on 2026-10-20 but stayed as the key every attendance row,
// star, note and login link hangs from, for the 146 people in the original
// roster. This moves each of them onto an opaque identifier — the same kind
// an employee added in the app has had since that day — and leaves nothing
// in the data that can be matched back to payroll.
//
// Pure functions, shared by the server action that runs it and by the tests.
// Nothing here reads or writes storage.

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

const CUSTOM_EMPLOYEES_KEY = 'employee-custom-records'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keyOf(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

// Every payroll-shaped key the data uses to name a person, wherever it sits:
// in a state key, as a map key, or in one of the person fields. Used both to
// find people the roster does not know (so they are re-keyed too rather than
// left behind) and, afterwards, to prove none remain.
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

// Who moves to what. The roster's people come with their new key already
// chosen — it is committed in the roster file, beside the old one, until
// the re-key has run. Anybody else still named by a payroll number (an
// employee added in the app before 2026-10-20, or a record for somebody
// no longer on any roster) gets a fresh key from generateKey.
export function buildRekeyMap({ roster = [], entries = {}, generateKey }) {
  const map = new Map()
  const taken = new Set()
  const sources = { roster: 0, custom: 0, orphan: 0 }

  for (const employee of roster) {
    taken.add(keyOf(employee))
    const previous = String(employee?.previous_key ?? '').trim()
    const next = keyOf(employee)
    if (isPayrollKey(previous) && next && !isPayrollKey(next)) {
      map.set(previous, next)
      sources.roster += 1
    }
  }

  const custom = Array.isArray(entries?.[CUSTOM_EMPLOYEES_KEY]) ? entries[CUSTOM_EMPLOYEES_KEY] : []
  custom.forEach(employee => taken.add(keyOf(employee)))

  const fresh = () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = generateKey()
      if (!isPayrollKey(candidate) && !taken.has(candidate)) {
        taken.add(candidate)
        return candidate
      }
    }
    throw new Error('Could not allocate a new employee key.')
  }

  for (const employee of custom) {
    const key = keyOf(employee)
    if (isPayrollKey(key) && !map.has(key)) {
      map.set(key, fresh())
      sources.custom += 1
    }
  }

  for (const key of payrollKeysInEntries(entries)) {
    if (!map.has(key)) {
      map.set(key, fresh())
      sources.orphan += 1
    }
  }

  return { map, sources }
}

// Replaces each old key wherever it appears as a whole token. The boundary
// is any letter or digit, so a number inside a longer run of digits, or
// inside a hex identifier, is never touched — only a key that stands on its
// own, as it does in "att-emp-emp-8iui5e5i-2026" or "emp-8iui5e5i-2026".
function tokenReplacer(map) {
  if (!map.size) return value => value
  const alternatives = [...map.keys()].sort((left, right) => right.length - left.length).join('|')
  const pattern = new RegExp(`(?<![0-9A-Za-z])(${alternatives})(?![0-9A-Za-z])`, 'g')
  return value => value.replace(pattern, match => map.get(match))
}

export function rekeyValue(value, map, replace = tokenReplacer(map)) {
  if (typeof value === 'string') return replace(value)
  if (typeof value === 'number') return Number.isInteger(value) && map.has(String(value)) ? map.get(String(value)) : value
  if (Array.isArray(value)) return value.map(inner => rekeyValue(inner, map, replace))
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([field, inner]) => [replace(field), rekeyValue(inner, map, replace)])
    )
  }
  return value
}

// The whole data set, moved. A state key named by an old key is renamed;
// its old name is returned in removedKeys so the caller can delete it rather
// than leave a row whose very name is a payroll number.
//
// If the new name is already in use — somebody marked attendance under the
// new key in the minutes between the new roster going live and this running
// — the two are merged, and what was written under the new key wins: it is
// the more recent of the two.
export function rekeyEntries(entries, map) {
  const replace = tokenReplacer(map)
  const next = {}
  const renamed = []

  for (const [stateKey, value] of Object.entries(entries || {})) {
    const newKey = replace(stateKey)
    if (newKey === stateKey) next[stateKey] = rekeyValue(value, map, replace)
  }

  let merged = 0
  for (const [stateKey, value] of Object.entries(entries || {})) {
    const newKey = replace(stateKey)
    if (newKey === stateKey) continue
    const moved = rekeyValue(value, map, replace)
    if (Object.hasOwn(next, newKey)) {
      next[newKey] = isPlainObject(moved) && isPlainObject(next[newKey])
        ? { ...moved, ...next[newKey] }
        : next[newKey]
      merged += 1
    } else {
      next[newKey] = moved
    }
    renamed.push({ from: stateKey, to: newKey })
  }

  const changed = Object.keys(next).filter(stateKey =>
    !Object.hasOwn(entries, stateKey) || JSON.stringify(entries[stateKey]) !== JSON.stringify(next[stateKey])
  )

  return {
    entries: next,
    removedKeys: renamed.map(item => item.from),
    report: {
      renamedSections: renamed.length,
      mergedSections: merged,
      changedSections: changed.length,
    },
    changedKeys: changed,
  }
}

// After the move, nothing may still carry an old key — not as a whole value,
// not inside a longer one. Returns the state keys that do (never the values),
// so the caller can refuse to write and say where.
export function sectionsStillNamingOldKeys(entries, map) {
  if (!map.size) return []
  const alternatives = [...map.keys()].join('|')
  const pattern = new RegExp(`(?<![0-9A-Za-z])(${alternatives})(?![0-9A-Za-z])`)
  return Object.entries(entries || {})
    .filter(([stateKey, value]) => pattern.test(stateKey) || pattern.test(JSON.stringify(value)))
    .map(([stateKey]) => stateKey)
}

export function rosterIsRekeyed(roster) {
  return (roster || []).every(employee => !isPayrollKey(keyOf(employee)))
}
