import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

import { MANAGED_FIXED_STATE_KEYS } from './permissions.mjs'

// Guards against the failure mode that shipped `employee-manager-notes-v1`:
// the application declared a shared state key, but the SQL allowlist inside
// public.mutate_legacy_state_entry did not, so every write to it was rejected
// with 'Unsupported state key.' on Supabase-backed environments. The stress lab
// runs on Netlify Blobs, which has no allowlist, so no amount of testing there
// can catch it. These assertions are cheap, run in `npm test`, and fail the
// build instead of production.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const sharedStorePath = path.join(repoRoot, 'src/data/sharedStore.js')
const stateMutationsPath = path.join(repoRoot, 'src/data/stateMutations.js')

function readSqlAllowlist() {
  const files = readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()

  let latest = null
  for (const name of files) {
    const sql = readFileSync(path.join(migrationsDir, name), 'utf8')
    if (!/create or replace function public\.mutate_legacy_state_entry/i.test(sql)) continue
    // Later migrations redefine the function, so the last one wins.
    const guard = sql.split(/create or replace function public\.mutate_legacy_state_entry/i).pop()
    const listed = guard.match(/p_state_key in \(([\s\S]*?)\)/i)
    const pattern = guard.match(/p_state_key ~ '([^']+)'/i)
    if (!listed) continue
    latest = {
      migration: name,
      keys: [...listed[1].matchAll(/'([^']+)'/g)].map(match => match[1]),
      pattern: pattern?.[1] ?? null,
    }
  }

  assert.ok(latest, 'No migration defines public.mutate_legacy_state_entry.')
  return latest
}

// There are TWO lists in the SQL, and until 2026-10-27 only the first was
// checked here. The second decides which keys may be written with a
// keyed-array-patch, and it lives in a different function
// (app_private.apply_legacy_state_mutation) redefined by a different
// migration — which is exactly how it fell behind.
function readSqlKeyedArrayKeys() {
  const files = readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()

  let latest = null
  for (const name of files) {
    const sql = readFileSync(path.join(migrationsDir, name), 'utf8')
    if (!/create or replace function app_private\.apply_legacy_state_mutation/i.test(sql)) continue
    const body = sql.split(/create or replace function app_private\.apply_legacy_state_mutation/i).pop()
    const guard = body.match(/keyed-array-patch'[\s\S]*?p_state_key not in \(([\s\S]*?)\)/i)
    if (!guard) continue
    latest = {
      migration: name,
      keys: [...guard[1].matchAll(/'([^']+)'/g)].map(match => match[1]),
    }
  }

  assert.ok(latest, 'No migration defines the keyed-array-patch guard.')
  return latest
}

function readClientKeyedArrayKeys() {
  const source = readFileSync(stateMutationsPath, 'utf8')
  // The list is written as constant names, so the constants are resolved
  // to their values rather than matched as strings.
  const block = source.match(/const KEYED_ARRAY_KEYS = \[([\s\S]*?)\]/)
  assert.ok(block, 'Could not locate KEYED_ARRAY_KEYS in src/data/stateMutations.js.')
  return block[1].split(',').map(name => name.trim()).filter(Boolean).map(name => {
    const declared = source.match(new RegExp(`const ${name} = '([^']+)'`))
    assert.ok(declared, `KEYED_ARRAY_KEYS names ${name}, which is not declared in the same file.`)
    return declared[1]
  })
}

function readClientKeys() {
  const source = readFileSync(sharedStorePath, 'utf8')
  const block = source.match(/const FIXED_STORAGE_KEYS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(block, 'Could not locate FIXED_STORAGE_KEYS in src/data/sharedStore.js.')
  return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1])
}

test('every server-managed state key is permitted by the SQL allowlist', () => {
  const { keys: sqlKeys, migration } = readSqlAllowlist()
  const missing = MANAGED_FIXED_STATE_KEYS.filter(key => !sqlKeys.includes(key))

  assert.deepEqual(
    missing,
    [],
    `State keys declared in permissions.mjs but missing from the SQL allowlist in ${migration}: `
      + `${missing.join(', ')}. Writes to these keys will fail with 'Unsupported state key.' on `
      + 'Supabase-backed environments (production) while still passing on Netlify Blobs (stress lab). '
      + 'Add them to public.mutate_legacy_state_entry in a new migration.'
  )
})

test('client and server agree on the managed state keys', () => {
  assert.deepEqual(
    [...readClientKeys()].sort(),
    [...MANAGED_FIXED_STATE_KEYS].sort(),
    'FIXED_STORAGE_KEYS in src/data/sharedStore.js has drifted from MANAGED_FIXED_STATE_KEYS in '
      + 'netlify/functions/_shared/permissions.mjs. A key the client writes but the server does not '
      + 'recognise is rejected as unmanaged; the reverse silently never syncs.'
  )
})

test('the SQL allowlist still admits per-employee attendance keys', () => {
  const { pattern } = readSqlAllowlist()
  assert.ok(pattern, 'The SQL allowlist no longer matches att-emp-<id>-<year> keys.')

  // Postgres and JS regex syntax differ on character classes; normalise before comparing.
  const asJs = new RegExp(pattern.replace('[0-9]', '\\d'))
  assert.ok(asJs.test('att-emp-12345-2026'), `Pattern ${pattern} rejects a valid attendance key.`)
  assert.ok(!asJs.test('att-emp-12345-26'), `Pattern ${pattern} accepts a malformed attendance key.`)
})

// Liz, 2026-10-27: "it was submitted on their login but when I went under
// my login change requests it was not there."
//
// pending-approvals-v1 was in the writable allowlist above and NOT in the
// keyed-array guard, so every request an administrator submitted was
// refused by the database while their screen said it had been sent. The
// first list was checked here; the second was not.
test('every key the client sends as a keyed-array-patch is allowed to be one', () => {
  const clientKeys = readClientKeyedArrayKeys()
  const { keys: sqlKeys, migration } = readSqlKeyedArrayKeys()
  const missing = clientKeys.filter(key => !sqlKeys.includes(key))

  assert.deepEqual(
    missing,
    [],
    `KEYED_ARRAY_KEYS in src/data/stateMutations.js lists ${missing.join(', ')}, which the `
      + `keyed-array guard in ${migration} refuses. Every write to those keys fails on Supabase `
      + "with 'Keyed array patch is not valid for this state key.' while passing on Netlify Blobs, "
      + 'and the client reports success because the flush is asynchronous. Widen the guard in a '
      + 'new migration.'
  )
})

// The reverse is harmless at runtime but means the SQL is carrying a branch
// for something nothing sends, which is how a reader is misled about what
// the system does.
test('the keyed-array guard does not name keys the client never patches that way', () => {
  const clientKeys = readClientKeyedArrayKeys()
  const { keys: sqlKeys } = readSqlKeyedArrayKeys()
  assert.deepEqual(
    sqlKeys.filter(key => !clientKeys.includes(key)),
    [],
    'The SQL keyed-array guard allows a key the client never sends that way.'
  )
})
