import http from 'node:http'
import { handleSessionRequest } from '../../netlify/functions/session.mjs'
import { handleStateRequest } from '../../netlify/functions/state.mjs'
import { createBlobsStateStore } from '../../netlify/functions/_shared/state-store.mjs'
import { createMemoryBlobStore } from '../../netlify/functions/_shared/test-blob-store.mjs'

const port = Number(process.env.PORT || 8788)
process.env.ATTENDANCE_ACCESS_CODES_JSON ||= JSON.stringify({
  609106: { role: 'admin', displayName: 'Isolated Load Test' },
})
process.env.ATTENDANCE_SESSION_SECRET ||= 'isolated-load-test-session-secret'

const rate = createMemoryBlobStore()
const sessions = createMemoryBlobStore()
const stateStore = createBlobsStateStore({
  store: createMemoryBlobStore({
    __state_meta__: { initializedAt: new Date().toISOString(), initializedBy: 'load harness' },
  }),
})

async function webRequest(request) {
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await new Promise((resolve, reject) => {
      const chunks = []
      request.on('data', chunk => chunks.push(chunk))
      request.on('end', () => resolve(Buffer.concat(chunks)))
      request.on('error', reject)
    })
  return new Request(`http://127.0.0.1:${port}${request.url}`, {
    method: request.method,
    headers: request.headers,
    body,
  })
}

const server = http.createServer(async (request, response) => {
  try {
    let result
    if (request.url === '/api/session') {
      result = await handleSessionRequest(await webRequest(request), { ip: request.socket.remoteAddress }, { rate, sessions })
    } else if (request.url === '/api/state') {
      result = await handleStateRequest(await webRequest(request), { stateStore, sessionStore: sessions })
    } else {
      result = new Response('All Star Tracker isolated load harness', { status: 200 })
    }

    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(Buffer.from(await result.arrayBuffer()))
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: error.message }))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Isolated load harness listening on http://127.0.0.1:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
