import assert from 'node:assert/strict'

const baseUrl = String(process.env.BASE_URL || process.argv[2] || '').replace(/\/$/, '')
assert.match(baseUrl, /^https:\/\//, 'BASE_URL must be an HTTPS URL')

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: 'error', ...options })
}

const homepage = await request('/')
assert.equal(homepage.status, 200, 'The homepage must be available.')

const html = await homepage.text()
assert.match(html, /<div id="root"><\/div>/, 'The application root is missing.')

const expectedHeaders = {
  'content-security-policy': /default-src 'self'/,
  'cross-origin-opener-policy': /^same-origin$/,
  'cross-origin-resource-policy': /^same-origin$/,
  'strict-transport-security': /max-age=31536000/,
  'x-content-type-options': /^nosniff$/,
  'x-frame-options': /^DENY$/,
}

for (const [name, expected] of Object.entries(expectedHeaders)) {
  assert.match(homepage.headers.get(name) || '', expected, `Missing or invalid ${name} header.`)
}

const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
  .map(match => match[1])
assert.ok(assetPaths.length >= 2, 'The built JavaScript and CSS assets were not found.')

for (const assetPath of assetPaths) {
  const asset = await request(assetPath)
  assert.equal(asset.status, 200, `${assetPath} is unavailable.`)
  assert.match(
    asset.headers.get('cache-control') || '',
    /max-age=31536000.*immutable/,
    `${assetPath} is missing immutable asset caching.`
  )
}

for (const path of ['/api/session', '/api/state']) {
  const response = await request(path)
  assert.equal(response.status, 401, `${path} must deny anonymous access.`)
  assert.ok(response.headers.get('x-request-id'), `${path} must return a request ID.`)
}

console.log(JSON.stringify({
  baseUrl,
  homepageStatus: homepage.status,
  assetsVerified: assetPaths.length,
  anonymousSessionStatus: 401,
  anonymousStateStatus: 401,
  securityHeadersVerified: Object.keys(expectedHeaders),
}, null, 2))
