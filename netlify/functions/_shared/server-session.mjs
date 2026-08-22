import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { sessionFromRequest } from './auth.mjs'

const SESSION_STORE_NAME = 'attendance-auth-sessions'

function sessionKey(sessionId) {
  return createHash('sha256').update(String(sessionId || '')).digest('hex')
}

export function getServerSessionStore() {
  return getStore({ name: SESSION_STORE_NAME, consistency: 'strong' })
}

export async function registerServerSession(session, store = getServerSessionStore()) {
  if (!session?.sessionId || !session.expiresAt) throw new Error('A valid server session is required.')
  const result = await store.setJSON(sessionKey(session.sessionId), { expiresAt: session.expiresAt }, { onlyIfNew: true })
  if (!result.modified) throw new Error('Could not register the new server session.')
}

export async function revokeServerSession(session, store = getServerSessionStore()) {
  if (session?.sessionId) await store.delete(sessionKey(session.sessionId))
}

export async function validatedSessionFromRequest(request, now = Date.now(), store = getServerSessionStore()) {
  const session = sessionFromRequest(request, now)
  if (!session?.sessionId) return null

  const record = await store.get(sessionKey(session.sessionId), { type: 'json' })
  if (!record?.expiresAt || record.expiresAt <= now || record.expiresAt !== session.expiresAt) {
    if (record) await store.delete(sessionKey(session.sessionId))
    return null
  }
  return session
}
