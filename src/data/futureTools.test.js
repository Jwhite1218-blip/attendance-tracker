import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAccessRecognitionProgram,
  canSeeLizFutureTools,
  canViewBlackoutCalendar,
  hasLizAdminAccess,
} from './futureTools.js'

test('recognition program is limited to administrator authority', () => {
  assert.equal(canAccessRecognitionProgram({ role: 'admin' }), true)
  assert.equal(canAccessRecognitionProgram({ role: 'school' }), false)
  assert.equal(canAccessRecognitionProgram({ role: 'viewer' }), false)
  assert.equal(canAccessRecognitionProgram({}), false)
})

test('future-tool buttons are limited to Liz full-admin access', () => {
  assert.equal(canSeeLizFutureTools({
    role: 'admin',
    canManageRoster: true,
    canManageBlackouts: true,
  }), true)

  assert.equal(canSeeLizFutureTools({
    role: 'admin',
    canManageRoster: false,
    canManageBlackouts: false,
  }), false)

  assert.equal(canSeeLizFutureTools({
    role: 'school',
    canManageRoster: true,
    canManageBlackouts: true,
  }), false)
})

test('Liz-only employee fields use the same full-admin boundary', () => {
  assert.equal(hasLizAdminAccess({
    role: 'admin',
    canManageRoster: true,
    canManageBlackouts: true,
  }), true)

  assert.equal(hasLizAdminAccess({
    role: 'admin',
    canManageRoster: true,
    canManageBlackouts: false,
  }), false)

  assert.equal(hasLizAdminAccess({
    role: 'school',
    canManageRoster: true,
    canManageBlackouts: true,
  }), false)
})

test('blackout calendar is hidden only from editable restricted-district access', () => {
  assert.equal(canViewBlackoutCalendar({
    role: 'admin',
    canEditAttendance: true,
    canManageBlackouts: true,
  }), true)

  assert.equal(canViewBlackoutCalendar({
    role: 'admin',
    canEditAttendance: true,
    canManageBlackouts: false,
  }), false)

  assert.equal(canViewBlackoutCalendar({
    role: 'admin',
    canEditAttendance: false,
    canManageBlackouts: false,
  }), true)

  assert.equal(canViewBlackoutCalendar({
    role: 'school',
    canEditAttendance: true,
    canManageBlackouts: false,
  }), true)
})
