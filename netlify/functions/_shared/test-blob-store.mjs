export function createMemoryBlobStore(initialEntries = {}) {
  const entries = new Map()
  let version = 0

  for (const [key, value] of Object.entries(initialEntries)) {
    version += 1
    entries.set(key, { data: structuredClone(value), etag: String(version) })
  }

  return {
    async get(key) {
      const entry = entries.get(key)
      return entry ? structuredClone(entry.data) : null
    },
    async getWithMetadata(key) {
      const entry = entries.get(key)
      return entry ? { data: structuredClone(entry.data), etag: entry.etag, metadata: {} } : null
    },
    async setJSON(key, value, conditions = {}) {
      await Promise.resolve()
      const current = entries.get(key)
      if (conditions.onlyIfNew && current) return { modified: false }
      if (conditions.onlyIfMatch && current?.etag !== conditions.onlyIfMatch) return { modified: false }
      if (conditions.onlyIfMatch && !current) return { modified: false }
      version += 1
      entries.set(key, { data: structuredClone(value), etag: String(version) })
      return { modified: true, etag: String(version) }
    },
    async delete(key) {
      entries.delete(key)
    },
    async list() {
      return { blobs: [...entries.keys()].map(key => ({ key })) }
    },
    snapshot() {
      return Object.fromEntries([...entries].map(([key, entry]) => [key, structuredClone(entry.data)]))
    },
  }
}
