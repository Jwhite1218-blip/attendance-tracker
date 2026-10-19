// Runs the SSR bundle built from render-pages.jsx and reports any page that
// throws. See that file for why this exists.
//
//   npx vite build --ssr scripts/render-pages.jsx --outDir dist/ssr
//   node scripts/render-pages.mjs
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

// The browser surface these modules touch at import and render time. Stubbed
// rather than mocked: the point is to execute the component, not to simulate
// a browser.
const store = new Map()
const storage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  key: index => [...store.keys()][index] ?? null,
  get length() { return store.size },
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en-US' }, configurable: true, writable: true,
})
globalThis.window = {
  localStorage: storage,
  sessionStorage: storage,
  location: { origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  print() {},
  open: () => null,
}
globalThis.document = { documentElement: { lang: 'en', setAttribute() {} } }
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init) } }
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ profiles: [] }) })

// A real roster, so the pages render against realistic data rather than
// against emptiness, where a bug in a list body never executes.
store.set('attendance-source-roster-v1', readFileSync('src/data/employees.json', 'utf8'))

const { render } = await import(pathToFileURL('dist/ssr/render-pages.js').href)
const results = render()

let failed = 0
for (const result of results) {
  if (result.ok) {
    console.log(`  ok    ${result.name} (${result.who})`)
  } else {
    failed += 1
    console.log(`  FAIL  ${result.name} (${result.who}): ${result.error}`)
  }
}

console.log(failed
  ? `\n${failed} of ${results.length} page renders threw`
  : `\nall ${results.length} page renders clean`)
process.exit(failed ? 1 : 0)
