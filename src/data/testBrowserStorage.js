export function installTestBrowserStorage() {
  const createStorage = () => {
    const values = new Map()
    return {
      get length() { return values.size },
      clear() { values.clear() },
      getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null },
      key(index) { return [...values.keys()][index] ?? null },
      removeItem(key) { values.delete(String(key)) },
      setItem(key, value) { values.set(String(key), String(value)) },
    }
  }

  globalThis.localStorage = createStorage()
  globalThis.sessionStorage = createStorage()
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type
      this.detail = options.detail
    }
  }
  globalThis.window = { dispatchEvent() {} }
  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    const value = body.key ? JSON.parse(localStorage.getItem(body.key) || 'null') : null
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, value } },
    }
  }
}
