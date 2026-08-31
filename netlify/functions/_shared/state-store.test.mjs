import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlobsStateStore, createSupabaseStateStore, getStateStore } from './state-store.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('Supabase state store requires private server configuration', () => {
  assert.throws(
    () => createSupabaseStateStore({ baseUrl: '', secretKey: 'test-secret-key' }),
    /SUPABASE_URL is required/
  )
  assert.throws(
    () => createSupabaseStateStore({ baseUrl: 'https://example.supabase.co', secretKey: '' }),
    /SUPABASE_SECRET_KEY is required/
  )
})

test('Supabase state store reads one district and reuses the loaded state', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/districts?')) return jsonResponse([{ id: 42 }])
    if (String(url).includes('/legacy_state_entries?')) {
      return jsonResponse([
        { state_key: '__state_meta__', value: { initializedAt: '2026-08-20T12:00:00.000Z' } },
        { state_key: 'attendance-blackout-dates', value: [{ date: '2026-09-07' }] },
      ])
    }
    return jsonResponse({}, 404)
  }

  const store = createSupabaseStateStore({
    baseUrl: 'https://example.supabase.co/',
    secretKey: 'test-secret-key',
    districtSlug: 'warren-township',
    fetchImpl,
  })

  const [listing, meta, missing] = await Promise.all([
    store.list(),
    store.get('__state_meta__', { type: 'json' }),
    store.get('missing', { type: 'json' }),
  ])

  assert.deepEqual(listing.blobs, [
    { key: '__state_meta__' },
    { key: 'attendance-blackout-dates' },
  ])
  assert.deepEqual(meta, { initializedAt: '2026-08-20T12:00:00.000Z' })
  assert.equal(missing, null)
  assert.equal(calls.length, 2)

  const districtUrl = new URL(calls[0].url)
  assert.equal(districtUrl.pathname, '/rest/v1/districts')
  assert.equal(districtUrl.searchParams.get('slug'), 'eq.warren-township')
  assert.equal(calls[0].options.headers.apikey, 'test-secret-key')
  assert.equal(calls[0].options.headers.Authorization, undefined)

  const stateUrl = new URL(calls[1].url)
  assert.equal(stateUrl.pathname, '/rest/v1/legacy_state_entries')
  assert.equal(stateUrl.searchParams.get('district_id'), 'eq.42')
  assert.equal(stateUrl.searchParams.get('limit'), '1000')
})

test('Supabase state writes are tenant-scoped, audited, and cached', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/districts?')) return jsonResponse([{ id: 7 }])
    if (options.method === 'POST') return new Response(null, { status: 204 })
    if (String(url).includes('/legacy_state_entries?')) return jsonResponse([])
    return jsonResponse({}, 404)
  }

  const store = createSupabaseStateStore({
    baseUrl: 'https://example.supabase.co',
    secretKey: 'test-secret-key',
    districtSlug: 'warren-township',
    fetchImpl,
  })

  await store.list()
  await store.setJSON('att-emp-123-2026', { '2026-08-20': 'P' }, 'Elizabeth White')

  const post = calls.find(call => call.options.method === 'POST')
  assert.ok(post)
  assert.equal(new URL(post.url).searchParams.get('on_conflict'), 'district_id,state_key')
  assert.equal(post.options.headers.apikey, 'test-secret-key')
  assert.equal(post.options.headers.Authorization, undefined)
  assert.equal(post.options.headers.Prefer, 'resolution=merge-duplicates,return=minimal')
  assert.deepEqual(JSON.parse(post.options.body), {
    district_id: 7,
    state_key: 'att-emp-123-2026',
    value: { '2026-08-20': 'P' },
    updated_by: 'Elizabeth White',
  })
  assert.deepEqual(await store.get('att-emp-123-2026', { type: 'json' }), { '2026-08-20': 'P' })
})

test('Supabase state store fails closed when a write is rejected', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/districts?')) return jsonResponse([{ id: 7 }])
    if (options.method === 'POST') return jsonResponse({ message: 'not allowed' }, 403)
    return jsonResponse([])
  }

  const store = createSupabaseStateStore({
    baseUrl: 'https://example.supabase.co',
    secretKey: 'test-secret-key',
    fetchImpl,
  })

  await assert.rejects(
    store.setJSON('attendance-blackout-dates', [], 'Elizabeth White'),
    /failed with status 403/
  )
})

test('Supabase state mutations use the atomic tenant-scoped RPC', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/districts?')) return jsonResponse([{ id: 7 }])
    if (String(url).includes('/rpc/mutate_legacy_state_entry')) {
      return jsonResponse({ '2026-08-21': { code: 'A' } })
    }
    if (String(url).includes('/legacy_state_entries?')) return jsonResponse([])
    return jsonResponse({}, 404)
  }
  const store = createSupabaseStateStore({
    baseUrl: 'https://example.supabase.co',
    secretKey: 'test-secret-key',
    districtSlug: 'warren-township',
    fetchImpl,
  })
  const mutation = {
    type: 'object-patch',
    set: { '2026-08-21': { code: 'A' } },
    remove: [],
  }

  const value = await store.updateJSON('att-emp-123-2026', mutation, 'Elizabeth White')
  assert.deepEqual(value, { '2026-08-21': { code: 'A' } })

  const rpc = calls.find(call => call.url.includes('/rpc/mutate_legacy_state_entry'))
  assert.ok(rpc)
  assert.equal(rpc.options.headers.apikey, 'test-secret-key')
  assert.equal(rpc.options.headers.Authorization, undefined)
  assert.deepEqual(JSON.parse(rpc.options.body), {
    p_district_id: 7,
    p_state_key: 'att-emp-123-2026',
    p_mutation: mutation,
    p_actor: 'Elizabeth White',
  })
})

test('Blob mutations preserve all 30 concurrent same-key attendance edits', async () => {
  const memory = createMemoryBlobStore()
  const store = createBlobsStateStore({ store: memory })
  await Promise.all(
    Array.from({ length: 30 }, (_, index) => store.updateJSON('att-emp-123-2026', {
      type: 'object-patch',
      set: { [`2026-09-${String(index + 1).padStart(2, '0')}`]: { code: 'A' } },
      remove: [],
    }))
  )

  assert.equal(Object.keys(await store.get('att-emp-123-2026', { type: 'json' })).length, 30)
})

test('the state backend must be configured explicitly', async () => {
  const previous = process.env.ATTENDANCE_STATE_BACKEND
  try {
    delete process.env.ATTENDANCE_STATE_BACKEND
    assert.throws(() => getStateStore(), /ATTENDANCE_STATE_BACKEND is not set/)

    process.env.ATTENDANCE_STATE_BACKEND = '   '
    assert.throws(() => getStateStore(), /ATTENDANCE_STATE_BACKEND is not set/)

    process.env.ATTENDANCE_STATE_BACKEND = 'postgres'
    assert.throws(() => getStateStore(), /Unsupported attendance state backend: postgres/)
  } finally {
    if (previous === undefined) delete process.env.ATTENDANCE_STATE_BACKEND
    else process.env.ATTENDANCE_STATE_BACKEND = previous
  }
})

test('an explicit supabase backend still requires its connection settings', async () => {
  const previous = {
    backend: process.env.ATTENDANCE_STATE_BACKEND,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
  }
  try {
    process.env.ATTENDANCE_STATE_BACKEND = 'supabase'
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SECRET_KEY
    assert.throws(() => getStateStore(), /SUPABASE_URL/)
  } finally {
    for (const [name, value] of [
      ['ATTENDANCE_STATE_BACKEND', previous.backend],
      ['SUPABASE_URL', previous.url],
      ['SUPABASE_SECRET_KEY', previous.key],
    ]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
