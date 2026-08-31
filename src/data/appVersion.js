// Detects when an open tab is running an older build than the one deployed,
// so tabs left open overnight can reload themselves instead of relying on
// staff to notice anything. The current build's id is baked in at build time
// and the deployed id is published at /version.json by vite.config.js.
const RELOADED_FOR_KEY = 'attendance-reloaded-for-build'

export function isUpdateAvailable(currentId, deployedId) {
  if (!currentId || !deployedId) return false
  if (typeof currentId !== 'string' || typeof deployedId !== 'string') return false
  // Dev servers don't publish version.json, so anything non-deploy-shaped
  // coming back (or a local build id) never triggers a reload.
  if (currentId.startsWith('local-')) return false
  return currentId !== deployedId
}

// Reload at most once per deployed id: if a reload didn't bring this tab up to
// date (a stale CDN edge, an aggressive proxy), retrying every wake would trap
// the tab in a reload loop instead of letting the person keep working.
export function shouldReloadForUpdate(currentId, deployedId, storage) {
  if (!isUpdateAvailable(currentId, deployedId)) return false
  try {
    if (storage.getItem(RELOADED_FOR_KEY) === deployedId) return false
    storage.setItem(RELOADED_FOR_KEY, deployedId)
  } catch {
    return false
  }
  return true
}

export async function fetchDeployedBuildId() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    if (!response.ok) return null
    const body = await response.json()
    return typeof body?.buildId === 'string' ? body.buildId : null
  } catch {
    return null
  }
}
