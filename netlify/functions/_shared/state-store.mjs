import { getStore } from '@netlify/blobs'
import { applyStateMutation } from '../../../src/data/stateMutations.js'
import { updateBlobJSON } from './blob-json.mjs'

const BLOBS_STORE_NAME = 'attendance-shared-state'
const DEFAULT_DISTRICT_SLUG = 'warren-township'
const PAGE_SIZE = 1000
const BLOB_UPDATE_MAX_ATTEMPTS = 64

function environmentValue(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || ''
}

function normalizedBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function assertConfigured(value, name) {
  if (!value) throw new Error(`${name} is required when the Supabase state backend is enabled.`)
}

function apiHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    Accept: 'application/json',
    ...extra,
  }
}

async function checkedJson(response, operation) {
  if (!response.ok) {
    throw new Error(`Supabase ${operation} failed with status ${response.status}.`)
  }

  const value = await response.json()
  if (!Array.isArray(value)) {
    throw new Error(`Supabase ${operation} returned an unexpected response.`)
  }
  return value
}

async function checkedValue(response, operation) {
  if (!response.ok) {
    throw new Error(`Supabase ${operation} failed with status ${response.status}.`)
  }
  return response.json()
}

export function createSupabaseStateStore({ baseUrl, secretKey, districtSlug, fetchImpl = fetch }) {
  const apiBaseUrl = normalizedBaseUrl(baseUrl)
  const tenantSlug = String(districtSlug || DEFAULT_DISTRICT_SLUG)

  assertConfigured(apiBaseUrl, 'SUPABASE_URL')
  assertConfigured(secretKey, 'SUPABASE_SECRET_KEY')
  assertConfigured(tenantSlug, 'SUPABASE_DISTRICT_SLUG')

  let districtIdPromise
  let entriesPromise

  async function districtId() {
    if (!districtIdPromise) {
      districtIdPromise = (async () => {
        const query = new URLSearchParams({
          slug: `eq.${tenantSlug}`,
          select: 'id',
          limit: '1',
        })
        const response = await fetchImpl(`${apiBaseUrl}/rest/v1/districts?${query}`, {
          headers: apiHeaders(secretKey),
        })
        const rows = await checkedJson(response, 'district lookup')
        const id = Number(rows[0]?.id)
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error(`Supabase district "${tenantSlug}" was not found.`)
        }
        return id
      })()
    }
    return districtIdPromise
  }

  async function loadEntries() {
    if (!entriesPromise) {
      entriesPromise = (async () => {
        const id = await districtId()
        const entries = new Map()
        let offset = 0

        while (true) {
          const query = new URLSearchParams({
            district_id: `eq.${id}`,
            select: 'state_key,value',
            order: 'state_key.asc',
            limit: String(PAGE_SIZE),
            offset: String(offset),
          })
          const response = await fetchImpl(`${apiBaseUrl}/rest/v1/legacy_state_entries?${query}`, {
            headers: apiHeaders(secretKey),
          })
          const rows = await checkedJson(response, 'state read')
          rows.forEach(row => entries.set(String(row.state_key), row.value))
          if (rows.length < PAGE_SIZE) break
          offset += PAGE_SIZE
        }

        return entries
      })()
    }
    return entriesPromise
  }

  return {
    async list() {
      const entries = await loadEntries()
      return { blobs: [...entries.keys()].map(key => ({ key })) }
    },

    async get(key, options = {}) {
      if (options.type && options.type !== 'json') {
        throw new Error('The attendance state store only supports JSON values.')
      }
      const entries = await loadEntries()
      return entries.has(String(key)) ? entries.get(String(key)) : null
    },

    async setJSON(key, value, actor = 'system') {
      const id = await districtId()
      const stateKey = String(key || '')
      if (!stateKey) throw new Error('A state key is required.')

      const query = new URLSearchParams({ on_conflict: 'district_id,state_key' })
      const response = await fetchImpl(`${apiBaseUrl}/rest/v1/legacy_state_entries?${query}`, {
        method: 'POST',
        headers: apiHeaders(secretKey, {
          'Content-Type': 'application/json',
          'Content-Profile': 'public',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify({
          district_id: id,
          state_key: stateKey,
          value,
          updated_by: String(actor || 'system'),
        }),
      })

      if (!response.ok) {
        throw new Error(`Supabase state write failed with status ${response.status}.`)
      }

      const entries = await loadEntries()
      entries.set(stateKey, value)
    },

    async updateJSON(key, mutation, actor = 'system') {
      const id = await districtId()
      const stateKey = String(key || '')
      if (!stateKey) throw new Error('A state key is required.')

      const response = await fetchImpl(`${apiBaseUrl}/rest/v1/rpc/mutate_legacy_state_entry`, {
        method: 'POST',
        headers: apiHeaders(secretKey, {
          'Content-Type': 'application/json',
          'Content-Profile': 'public',
          'Accept-Profile': 'public',
        }),
        body: JSON.stringify({
          p_district_id: id,
          p_state_key: stateKey,
          p_mutation: mutation,
          p_actor: String(actor || 'system'),
        }),
      })

      const value = await checkedValue(response, 'atomic state mutation')
      const entries = await loadEntries()
      entries.set(stateKey, value)
      return value
    },
  }
}

export function createBlobsStateStore({
  store = getStore({ name: BLOBS_STORE_NAME, consistency: 'strong' }),
  maxUpdateAttempts = BLOB_UPDATE_MAX_ATTEMPTS,
} = {}) {

  // @netlify/blobs' Store.setJSON(key, value, options) treats its third argument
  // as a SetOptions object (onlyIfMatch/onlyIfNew/metadata), not an actor string.
  // The Supabase-backed store accepts (key, value, actor) for audit tracking, so
  // this adapter matches that shape and drops the actor rather than forwarding a
  // bare string into the real SDK, which throws inside Store.getConditions().
  return {
    list: (...args) => store.list(...args),
    get: (...args) => store.get(...args),
    setJSON: (key, value) => store.setJSON(key, value),
    updateJSON: (key, mutation) => updateBlobJSON(
      store,
      key,
      current => applyStateMutation(key, current, mutation),
      maxUpdateAttempts
    ),
  }
}

export function getStateStore() {
  const backend = environmentValue('ATTENDANCE_STATE_BACKEND') || 'blobs'
  if (backend === 'blobs') return createBlobsStateStore()
  if (backend !== 'supabase') {
    throw new Error(`Unsupported attendance state backend: ${backend}`)
  }

  return createSupabaseStateStore({
    baseUrl: environmentValue('SUPABASE_URL'),
    secretKey: environmentValue('SUPABASE_SECRET_KEY'),
    districtSlug: environmentValue('SUPABASE_DISTRICT_SLUG') || DEFAULT_DISTRICT_SLUG,
  })
}
