import test from 'node:test'
import assert from 'node:assert/strict'
import {
  backupFilename,
  parseBackupText,
  validateBackupEnvelope,
} from './backupRecovery.js'

const validBackup = {
  format: 'warren-attendance-backup',
  version: 1,
  exportedAt: '2026-08-26T12:34:56.000Z',
  exportedBy: 'Liz',
  entries: {
    'attendance-blackout-dates': [],
    'all-star-recognition-v1': {},
  },
}

test('valid Warren backups provide a clear summary and stable filename', () => {
  assert.deepEqual(validateBackupEnvelope(validBackup), {
    exportedAt: '2026-08-26T12:34:56.000Z',
    exportedBy: 'Liz',
    sectionCount: 2,
  })
  assert.equal(backupFilename(new Date(validBackup.exportedAt)), 'warren-attendance-backup-2026-08-26T12-34-56.json')
})

test('backup parsing rejects unrelated or malformed files', () => {
  assert.deepEqual(parseBackupText(JSON.stringify(validBackup)), validBackup)
  assert.throws(() => parseBackupText('{bad json'), /not valid JSON/)
  assert.throws(() => parseBackupText(JSON.stringify({ entries: {} })), /not a supported Warren attendance backup/)
})
