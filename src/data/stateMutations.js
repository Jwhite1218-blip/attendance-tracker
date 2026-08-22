const BLACKOUTS_KEY = 'attendance-blackout-dates'
const CUSTOM_EMPLOYEES_KEY = 'employee-custom-records'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function arrayIdentity(key, item) {
  if (!item || typeof item !== 'object') return ''
  if (key === BLACKOUTS_KEY) return String(item.date || '')
  if (key === CUSTOM_EMPLOYEES_KEY) return String(item.kronos_id || item.id || '')
  return ''
}

export function createStateMutation(key, previousValue, nextValue) {
  if (key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY) {
    const previous = new Map(
      (Array.isArray(previousValue) ? previousValue : [])
        .map(item => [arrayIdentity(key, item), item])
        .filter(([identity]) => identity)
    )
    const next = new Map(
      (Array.isArray(nextValue) ? nextValue : [])
        .map(item => [arrayIdentity(key, item), item])
        .filter(([identity]) => identity)
    )

    return {
      type: 'keyed-array-patch',
      upsert: [...next.entries()]
        .filter(([identity, value]) => !previous.has(identity) || !sameValue(previous.get(identity), value))
        .map(([identity, value]) => ({ identity, value })),
      remove: [...previous.keys()].filter(identity => !next.has(identity)),
    }
  }

  if (isPlainObject(previousValue) || isPlainObject(nextValue)) {
    const previous = isPlainObject(previousValue) ? previousValue : {}
    const next = isPlainObject(nextValue) ? nextValue : {}
    return {
      type: 'object-patch',
      set: Object.fromEntries(
        Object.entries(next).filter(([entryKey, value]) =>
          !Object.hasOwn(previous, entryKey) || !sameValue(previous[entryKey], value)
        )
      ),
      remove: Object.keys(previous).filter(entryKey => !Object.hasOwn(next, entryKey)),
    }
  }

  return { type: 'replace', value: nextValue ?? null }
}

export function applyStateMutation(key, currentValue, mutation) {
  if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) {
    throw new Error('A valid state mutation is required.')
  }

  if (mutation.type === 'object-patch') {
    if (mutation.set !== undefined && !isPlainObject(mutation.set)) {
      throw new Error('An object patch must contain an object set.')
    }
    if (mutation.remove !== undefined && !Array.isArray(mutation.remove)) {
      throw new Error('An object patch must contain an array remove list.')
    }
    const current = isPlainObject(currentValue) ? { ...currentValue } : {}
    const set = isPlainObject(mutation.set) ? mutation.set : {}
    const remove = Array.isArray(mutation.remove) ? mutation.remove : []
    for (const entryKey of remove) delete current[String(entryKey)]
    return { ...current, ...set }
  }

  if (mutation.type === 'keyed-array-patch') {
    if (key !== BLACKOUTS_KEY && key !== CUSTOM_EMPLOYEES_KEY) {
      throw new Error('Keyed array patches are not supported for this state key.')
    }

    if (mutation.upsert !== undefined && !Array.isArray(mutation.upsert)) {
      throw new Error('A keyed array patch must contain an array upsert list.')
    }
    if (mutation.remove !== undefined && !Array.isArray(mutation.remove)) {
      throw new Error('A keyed array patch must contain an array remove list.')
    }

    const items = new Map(
      (Array.isArray(currentValue) ? currentValue : [])
        .map(item => [arrayIdentity(key, item), item])
        .filter(([identity]) => identity)
    )
    for (const identity of Array.isArray(mutation.remove) ? mutation.remove : []) {
      items.delete(String(identity))
    }
    for (const patch of Array.isArray(mutation.upsert) ? mutation.upsert : []) {
      const identity = String(patch?.identity || '')
      if (!identity || arrayIdentity(key, patch?.value) !== identity) {
        throw new Error('A keyed array patch contains an invalid identity.')
      }
      items.set(identity, patch.value)
    }
    return [...items.values()]
  }

  if (mutation.type === 'replace') return mutation.value ?? null
  throw new Error('Unsupported state mutation type.')
}

export function isEmptyStateMutation(mutation) {
  if (mutation?.type === 'object-patch') {
    return !Object.keys(mutation.set || {}).length && !(mutation.remove || []).length
  }
  if (mutation?.type === 'keyed-array-patch') {
    return !(mutation.upsert || []).length && !(mutation.remove || []).length
  }
  return false
}
