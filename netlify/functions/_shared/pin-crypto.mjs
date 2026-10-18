// Encrypting a PIN so it can be stored, and read back.
//
// Decided 2026-10-18: PINs stay readable to the app. Liz needs to answer
// "what is Creston's code?" by looking it up, not by reissuing it — that
// question is half the day-to-day annoyance this work exists to remove. So
// this is encryption, not hashing, and the difference is deliberate.
//
// What it buys: a raw database dump is not a list of door codes. What it
// does not buy: protection from anyone holding both the database and
// ATTENDANCE_PIN_KEY. For sixteen shared building codes on an internal
// district tool, that is the right trade.
//
// Two values are stored per PIN, because one cannot do both jobs:
//
//   pin_encrypted — AES-256-GCM. A random IV each time, so the same PIN
//     encrypts differently on every write. Recoverable, tamper-evident.
//   pin_lookup    — HMAC-SHA256 under the same key. Deterministic, so
//     sign-in is one indexed query rather than decrypting every row.
//
// Sign-in matches on pin_lookup. pin_encrypted exists only so the admin
// screen can show Liz the number.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const VERSION = 'v1'

function environmentValue(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || ''
}

// The key arrives as 64 hex characters (32 bytes). Anything else is a
// misconfiguration worth failing loudly on: a short key would silently
// weaken every PIN in the district.
export function pinKey() {
  const raw = environmentValue('ATTENDANCE_PIN_KEY').trim()
  if (!raw) throw new Error('ATTENDANCE_PIN_KEY is not configured.')
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('ATTENDANCE_PIN_KEY must be 64 hexadecimal characters (32 bytes).')
  }
  return Buffer.from(raw, 'hex')
}

export function hasPinKey() {
  try {
    pinKey()
    return true
  } catch {
    return false
  }
}

export function encryptPin(pin, key = pinKey()) {
  const value = String(pin ?? '')
  if (!value) throw new Error('A PIN is required.')

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Versioned so a future key or algorithm change can be recognised rather
  // than guessed at from the length of the payload.
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptPin(stored, key = pinKey()) {
  const parts = String(stored || '').split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('That stored PIN is not in a format this version understands.')
  }

  const iv = Buffer.from(parts[1], 'base64url')
  const tag = Buffer.from(parts[2], 'base64url')
  const payload = Buffer.from(parts[3], 'base64url')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('That stored PIN is malformed.')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  // GCM throws here if the row has been altered, which is the point of using
  // it: a tampered PIN fails rather than decrypting to something arbitrary.
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
}

export function pinLookup(pin, key = pinKey()) {
  const value = String(pin ?? '')
  if (!value) throw new Error('A PIN is required.')
  return createHmac('sha256', key).update(`attendance-pin-lookup:${value}`).digest('base64url')
}

// Used when comparing a decrypted PIN against a candidate, so the comparison
// does not leak the answer through its own duration.
export function pinMatches(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8')
  const b = Buffer.from(String(right ?? ''), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

// For the admin screen's "short PIN" column and for validation, without
// anything having to handle the PIN itself.
export function pinLengthOf(pin) {
  return String(pin ?? '').length
}

// Generates a key for ATTENDANCE_PIN_KEY. Not called by the app — this is
// here so the setup instructions have something to point at.
export function generatePinKey() {
  return randomBytes(32).toString('hex')
}
