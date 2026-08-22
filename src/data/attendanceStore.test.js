import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceAttendanceYearSnapshot } from './attendanceStore.js'

test('replacing a year snapshot removes a cleared day without losing the adjacent school year', () => {
  const current = {
    '2026-03-04': { code: 'UNEX', date: '2026-03-04' },
    '2026-08-18': { code: 'RTO', date: '2026-08-18' },
    '2027-02-10': { code: 'NCNS', date: '2027-02-10' },
  }

  assert.deepEqual(
    replaceAttendanceYearSnapshot(current, 2026, {
      '2026-08-18': { code: 'RTO', date: '2026-08-18' },
    }),
    {
      '2026-08-18': { code: 'RTO', date: '2026-08-18' },
      '2027-02-10': { code: 'NCNS', date: '2027-02-10' },
    }
  )
})

test('replacing a year snapshot normalizes invalid and legacy attendance entries', () => {
  assert.deepEqual(
    replaceAttendanceYearSnapshot({}, 2026, {
      '2026-04-01': { code: 'UP', date: '2026-04-01' },
      '2026-04-02': { code: '', date: '2026-04-02' },
    }),
    {
      '2026-04-01': { code: 'UNEX', date: '2026-04-01' },
    }
  )
})
