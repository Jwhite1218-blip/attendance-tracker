import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import employees from './employees.json' with { type: 'json' }
import { isPayrollKey, payrollKeysInEntries, rosterIsRekeyed } from './payrollKeys.js'

// The roster file must never carry a payroll number again — not as a key,
// not in any other field. Read as text as well as parsed, so a number
// tucked into a field nothing reads still fails this.
test('the roster names nobody by payroll number, anywhere in the file', () => {
  assert.equal(rosterIsRekeyed(employees), true)
  const text = readFileSync(new URL('./employees.json', import.meta.url), 'utf8')
  assert.equal(/(?<![0-9])[0-9]{5,10}(?![0-9])/.test(text), false)
})

// Made-up numbers throughout; none is anybody's.

test('a payroll number is five to ten digits standing alone, nothing else', () => {
  assert.equal(isPayrollKey('emp-8iui5e5i'), true)
  assert.equal(isPayrollKey(3204252), true)
  assert.equal(isPayrollKey('emp-k3x9a2bq'), false)
  assert.equal(isPayrollKey('2026'), false)
  assert.equal(isPayrollKey('1793206131000'), false)
  assert.equal(isPayrollKey(''), false)
})

test('a payroll number is found wherever the data names a person with one', () => {
  const found = payrollKeysInEntries({
    'att-emp-30000001-2026': { '2026-09-01': { date: '2026-09-01', code: 'UNEX', note: '' } },
    'employee-record-overrides': { 30000002: { position: 'Cook' } },
    'employee-assignment-history-v1': { 30000003: [] },
    'hr-attendance-progress-v2': { '30000004-2026': { occurrenceCount: 1 } },
    'all-star-recognition-v1': { s1: { id: 's1', employeeId: '30000005', redraw: { setAside: [{ employeeId: '30000006' }] } } },
    'training-records-v1': { t1: { employeeIds: ['30000007'] } },
    'pending-approvals-v1': [{ empId: 30000008 }],
    'employee-custom-records': [{ id: 147, kronos_id: '30000009' }],
  })
  assert.deepEqual([...found].sort(), [
    '30000001', '30000002', '30000003', '30000004', '30000005',
    '30000006', '30000007', '30000008', '30000009',
  ])
})

test('records keyed by opaque codes, and numbers that are not keys, are not flagged', () => {
  const found = payrollKeysInEntries({
    'att-emp-emp-aaaa1111-2026': { '2026-09-01': { date: '2026-09-01', code: 'UNEX', note: 'Called 30000001' } },
    'employee-record-overrides': { 'emp-aaaa1111': { position: 'Cook' } },
    'all-star-recognition-v1': { 'recognition-1793206131000-4a30000001b': { employeeId: 'emp-aaaa1111' } },
    'employee-custom-records': [{ id: 147, kronos_id: 'emp-cccc3333' }],
  })
  assert.equal(found.size, 0)
})

test('a roster is re-keyed once nobody in it is named by a payroll number', () => {
  assert.equal(rosterIsRekeyed([{ id: 1, kronos_id: 'emp-aaaa1111' }, { id: 2, kronos_id: 'emp-bbbb2222' }]), true)
  assert.equal(rosterIsRekeyed([{ id: 1, kronos_id: 'emp-aaaa1111' }, { id: 3, kronos_id: '30000003' }]), false)
})
