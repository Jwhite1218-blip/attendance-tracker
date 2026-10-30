import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRekeyMap,
  isPayrollKey,
  payrollKeysInEntries,
  rekeyEntries,
  rosterIsRekeyed,
  sectionsStillNamingOldKeys,
} from './rekey.js'

// Jon, 2026-10-30: the payroll number comes out of the data entirely. These
// numbers are made up; none is anybody's.
const ROSTER = [
  { id: 1, kronos_id: 'emp-aaaa1111', previous_key: '30000001', first_name: 'Ana', last_name: 'One' },
  { id: 2, kronos_id: 'emp-bbbb2222', previous_key: '30000002', first_name: 'Ben', last_name: 'Two' },
]

function sequence(prefix = 'emp-new') {
  let next = 0
  return () => `${prefix}${String(++next).padStart(4, '0')}`
}

function sampleEntries() {
  return {
    'att-emp-30000001-2026': { '2026-09-01': { date: '2026-09-01', code: 'P', note: '' } },
    'att-emp-30000002-2025': { '2025-11-03': { date: '2025-11-03', code: 'UNEX', note: 'Called in' } },
    'employee-record-overrides': { 30000001: { position: 'Cook' } },
    'employee-location-overrides': { 30000002: 'CrestonMS' },
    'employee-manager-notes-v1': { 30000001: [{ text: 'Good week', author: 'Liz', at: null }] },
    'employee-assignment-history-v1': { 30000002: [{ from: 'A', to: 'B', at: '2026-09-01T00:00:00Z', by: 'Liz' }] },
    'hr-attendance-progress-v2': { '30000001-2026': { empId: '30000001', occurrenceCount: 2 } },
    'all-star-recognition-v1': {
      'recognition-1793206131000-4a30000001b': {
        id: 'recognition-1793206131000-4a30000001b',
        employeeId: '30000001',
        type: 'all-star-of-month',
        redraw: { setAside: [{ employeeId: '30000002', setAsideAt: '2026-10-30T00:00:00Z', setAsideBy: 'Liz' }] },
        note: 'Selected from 4 building entries; 1 belonged to this employee.',
        createdAt: '2026-10-30T12:00:00.000Z',
      },
    },
    'training-records-v1': { t1: { id: 't1', employeeIds: ['30000001', '30000002'], hours: 2 } },
    'pending-approvals-v1': [{ id: 'r1', empId: 30000002, payload: { position: 'Lead' } }],
    'employee-custom-records': [
      { id: 147, kronos_id: '30000099', first_name: 'Cara', last_name: 'Typed' },
      { id: 148, kronos_id: 'emp-cccc3333', first_name: 'Dan', last_name: 'Opaque' },
    ],
    'att-emp-30000077-2026': { '2026-08-20': { date: '2026-08-20', code: 'P', note: '' } },
    'program-settings-v1': { starLevels: [{ minimum: 10 }] },
  }
}

test('a payroll number is seven or eight digits standing alone, nothing else', () => {
  assert.equal(isPayrollKey('emp-8iui5e5i'), true)
  assert.equal(isPayrollKey(3204252), true)
  assert.equal(isPayrollKey('emp-k3x9a2bq'), false)
  assert.equal(isPayrollKey('2026'), false)
  assert.equal(isPayrollKey('1793206131000'), false)
  assert.equal(isPayrollKey(''), false)
})

test('the roster brings its new keys; everybody else still named by number gets one', () => {
  const { map, sources } = buildRekeyMap({ roster: ROSTER, entries: sampleEntries(), generateKey: sequence() })
  assert.equal(map.get('30000001'), 'emp-aaaa1111')
  assert.equal(map.get('30000002'), 'emp-bbbb2222')
  // Added in the app before 2026-10-20, with a typed payroll number.
  assert.match(map.get('30000099'), /^emp-new/)
  // Attendance for somebody on no roster at all is moved too, not left behind.
  assert.match(map.get('30000077'), /^emp-new/)
  assert.deepEqual(sources, { roster: 2, custom: 1, orphan: 1 })
  // An employee who already has an opaque key is left exactly as they are.
  assert.equal(map.has('emp-cccc3333'), false)
})

test('every record moves, and no old number is left anywhere', () => {
  const entries = sampleEntries()
  const { map } = buildRekeyMap({ roster: ROSTER, entries, generateKey: sequence() })
  const result = rekeyEntries(entries, map)
  const next = result.entries

  assert.deepEqual(next['att-emp-emp-aaaa1111-2026'], entries['att-emp-30000001-2026'])
  assert.deepEqual(next['att-emp-emp-bbbb2222-2025'], entries['att-emp-30000002-2025'])
  assert.equal(Object.hasOwn(next, 'att-emp-30000001-2026'), false)
  assert.deepEqual(next['employee-record-overrides'], { 'emp-aaaa1111': { position: 'Cook' } })
  assert.deepEqual(next['employee-location-overrides'], { 'emp-bbbb2222': 'CrestonMS' })
  assert.ok(next['employee-manager-notes-v1']['emp-aaaa1111'])
  assert.ok(next['employee-assignment-history-v1']['emp-bbbb2222'])
  assert.deepEqual(next['hr-attendance-progress-v2'], { 'emp-aaaa1111-2026': { empId: 'emp-aaaa1111', occurrenceCount: 2 } })

  const star = Object.values(next['all-star-recognition-v1'])[0]
  assert.equal(star.employeeId, 'emp-aaaa1111')
  assert.equal(star.redraw.setAside[0].employeeId, 'emp-bbbb2222')
  // The number inside a hex identifier is not a key and is not touched.
  assert.equal(star.id, 'recognition-1793206131000-4a30000001b')
  assert.ok(next['all-star-recognition-v1']['recognition-1793206131000-4a30000001b'])

  assert.deepEqual(next['training-records-v1'].t1.employeeIds, ['emp-aaaa1111', 'emp-bbbb2222'])
  // Stored as a number, still moved.
  assert.equal(next['pending-approvals-v1'][0].empId, 'emp-bbbb2222')
  assert.equal(next['employee-custom-records'][0].kronos_id, map.get('30000099'))
  assert.equal(next['employee-custom-records'][1].kronos_id, 'emp-cccc3333')
  assert.deepEqual(next['program-settings-v1'], entries['program-settings-v1'])

  assert.deepEqual(sectionsStillNamingOldKeys(next, map), [])
  assert.equal(payrollKeysInEntries(next).size, 0)
  assert.deepEqual(result.removedKeys.sort(), [
    'att-emp-30000001-2026',
    'att-emp-30000002-2025',
    'att-emp-30000077-2026',
  ])
})

test('attendance marked under the new key before the move is merged, and wins', () => {
  const entries = {
    'att-emp-30000001-2026': {
      '2026-09-01': { date: '2026-09-01', code: 'P', note: '' },
      '2026-10-30': { date: '2026-10-30', code: 'UNEX', note: 'old' },
    },
    'att-emp-emp-aaaa1111-2026': {
      '2026-10-30': { date: '2026-10-30', code: 'P', note: 'marked after the new roster went live' },
    },
  }
  const { map } = buildRekeyMap({ roster: ROSTER, entries, generateKey: sequence() })
  const result = rekeyEntries(entries, map)
  assert.deepEqual(result.entries['att-emp-emp-aaaa1111-2026'], {
    '2026-09-01': { date: '2026-09-01', code: 'P', note: '' },
    '2026-10-30': { date: '2026-10-30', code: 'P', note: 'marked after the new roster went live' },
  })
  assert.equal(result.report.mergedSections, 1)
  assert.deepEqual(result.removedKeys, ['att-emp-30000001-2026'])
})

test('running it again finds nothing to do', () => {
  const entries = sampleEntries()
  const first = buildRekeyMap({ roster: ROSTER, entries, generateKey: sequence() })
  const moved = rekeyEntries(entries, first.map).entries
  const second = buildRekeyMap({ roster: ROSTER, entries: moved, generateKey: sequence('emp-again') })
  // The roster still lists its previous keys, but nothing in the data uses
  // them any more, so the move changes nothing.
  const again = rekeyEntries(moved, second.map)
  assert.equal(again.report.renamedSections, 0)
  assert.equal(again.report.changedSections, 0)
  assert.equal(second.sources.custom + second.sources.orphan, 0)
})

test('a roster is re-keyed once nobody in it is named by a payroll number', () => {
  assert.equal(rosterIsRekeyed(ROSTER), true)
  assert.equal(rosterIsRekeyed([...ROSTER, { id: 3, kronos_id: '30000003' }]), false)
})
