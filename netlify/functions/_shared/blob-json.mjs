import { createHash, randomUUID } from 'node:crypto'

const DEFAULT_MAX_ATTEMPTS = 256
const LOCK_LEASE_MS = 30 * 1000

function lockKeyFor(key) {
  const digest = createHash('sha256').update(String(key)).digest('hex')
  return `__lock__/${digest}`
}

async function acquireLock(store, key, maxAttempts) {
  const lockKey = lockKeyFor(key)
  const owner = randomUUID()

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const now = Date.now()
    const lock = { owner, expiresAt: now + LOCK_LEASE_MS }
    const created = await store.setJSON(lockKey, lock, { onlyIfNew: true })

    if (created.modified) {
      return { key: lockKey, owner, expiresAt: lock.expiresAt }
    }

    const existing = await store.getWithMetadata(lockKey, {
      type: 'json',
      consistency: 'strong',
    })
    if (existing?.etag && Number(existing.data?.expiresAt) <= now) {
      const reclaimed = await store.setJSON(lockKey, lock, { onlyIfMatch: existing.etag })
      if (reclaimed.modified) {
        return { key: lockKey, owner, expiresAt: lock.expiresAt }
      }
    }

    const backoff = Math.min(100, 5 + attempt * 3)
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * backoff) + 1))
  }

  throw new Error(`Could not acquire the update lock for "${key}".`)
}

async function releaseLock(store, lock) {
  // A lock cannot have been replaced before its lease expires. If an operation
  // somehow outlives the lease, leave the replacement alone rather than risk
  // deleting another invocation's lock.
  if (Date.now() >= lock.expiresAt) return

  const current = await store.get(lock.key, { type: 'json', consistency: 'strong' })
  if (current?.owner === lock.owner) await store.delete(lock.key)
}

export async function updateBlobJSON(store, key, updateValue, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  const lock = await acquireLock(store, key, maxAttempts)
  try {
    const current = await store.get(key, { type: 'json', consistency: 'strong' })
    const value = await updateValue(current)
    const result = await store.setJSON(key, value)
    if (!result.modified) throw new Error(`Could not update "${key}".`)
    return value
  } finally {
    await releaseLock(store, lock)
  }
}
