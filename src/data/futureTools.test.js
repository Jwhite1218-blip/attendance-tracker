import assert from 'node:assert/strict'
import test from 'node:test'
import { canSeeLizFutureTools, hasLizAdminAccess } from './futureTools.js'

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
