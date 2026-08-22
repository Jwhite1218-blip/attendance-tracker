import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '')
const TEST_PIN = __ENV.TEST_PIN || '609106'
const PROFILE = __ENV.PROFILE || 'smoke'
const WRITE_RATIO = Number(__ENV.WRITE_RATIO || '0.20')

const profiles = {
  smoke: [{ duration: '5s', target: 1 }],
  load: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  stress: [
    { duration: '15s', target: 10 },
    { duration: '20s', target: 25 },
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  spike: [
    { duration: '10s', target: 10 },
    { duration: '5s', target: 100 },
    { duration: '20s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  soak: [
    { duration: '30s', target: 25 },
    { duration: '10m', target: 25 },
    { duration: '30s', target: 0 },
  ],
}

if (!profiles[PROFILE]) throw new Error(`Unknown PROFILE "${PROFILE}".`)

export const options = {
  stages: profiles[PROFILE],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    state_read_duration: ['p(95)<1500'],
    state_write_duration: ['p(95)<2000'],
  },
}

const stateReadDuration = new Trend('state_read_duration', true)
const stateWriteDuration = new Trend('state_write_duration', true)
const applicationErrors = new Rate('application_errors')

export function setup() {
  const homepage = http.get(BASE_URL)
  if (!check(homepage, { 'homepage is available': response => response.status === 200 })) {
    throw new Error(`Homepage failed with HTTP ${homepage.status}.`)
  }
  const login = http.post(`${BASE_URL}/api/session`, JSON.stringify({ pin: TEST_PIN }), {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!check(login, { 'login succeeds': response => response.status === 200 })) {
    throw new Error(`Login failed with HTTP ${login.status}.`)
  }
  return { cookie: login.headers['Set-Cookie'].split(';')[0] }
}

export default function (data) {
  const headers = { Cookie: data.cookie, 'Content-Type': 'application/json' }
  const read = http.get(`${BASE_URL}/api/state`, { headers, tags: { endpoint: 'state-read' } })
  stateReadDuration.add(read.timings.duration)
  const readPassed = check(read, { 'state read succeeds': response => response.status === 200 })
  applicationErrors.add(!readPassed)

  if (Math.random() < WRITE_RATIO) {
    const key = `att-emp-loadtest-${__VU}-2026`
    const write = http.post(`${BASE_URL}/api/state`, JSON.stringify({
      action: 'mutate',
      key,
      mutation: {
        type: 'object-patch',
        set: {
          [`2026-09-${String((__ITER % 20) + 1).padStart(2, '0')}`]: {
            code: 'RTO',
            date: `2026-09-${String((__ITER % 20) + 1).padStart(2, '0')}`,
          },
        },
        remove: [],
      },
    }), { headers, tags: { endpoint: 'state-write' } })
    stateWriteDuration.add(write.timings.duration)
    const writePassed = check(write, { 'state write succeeds': response => response.status === 200 })
    applicationErrors.add(!writePassed)
  }
  sleep(0.2)
}
