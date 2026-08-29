import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canSeeLizFutureTools,
  canViewBlackoutCalendar,
  hasLizAdminAccess,
} from './futureTools.js'

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

test('blackout calendar is hidden from editable restricted-district access and from school-level navigation', () => {
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

  // Removed from school-level navigation per Liz's 2026-08-29 request — the
  // dashboard tab is the return path now, and blackout dates already block
  // attendance entry regardless of whether this page is reachable.
  assert.equal(canViewBlackoutCalendar({
    role: 'school',
    canEditAttendance: true,
    canManageBlackouts: false,
  }), false)
})
