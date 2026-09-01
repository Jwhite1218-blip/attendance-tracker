export function localDateKey(dateValue = new Date()) {
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (Number.isNaN(date.valueOf())) throw new Error('A valid date is required.')
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function monthlyDrawingStatus(monthKey, dateValue = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) {
    return { isOpen: false, state: 'invalid', opensOn: null, closesOn: null }
  }

  const [year, month] = monthKey.split('-').map(Number)
  if (month < 1 || month > 12) {
    return { isOpen: false, state: 'invalid', opensOn: null, closesOn: null }
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const opensOn = `${monthKey}-${String(lastDay - 6).padStart(2, '0')}`
  const closesOn = `${monthKey}-${String(lastDay).padStart(2, '0')}`
  const today = localDateKey(dateValue)

  if (today > closesOn) return { isOpen: true, state: 'closed-month', opensOn, closesOn }
  if (today >= opensOn && today <= closesOn) return { isOpen: true, state: 'final-week', opensOn, closesOn }
  if (today < `${monthKey}-01`) return { isOpen: false, state: 'future', opensOn, closesOn }
  return { isOpen: false, state: 'waiting', opensOn, closesOn }
}

export function recognitionTypeAllowedForRole(role, type, canManageRecognitionAwards = role === 'admin') {
  if (role !== 'admin') return false
  return type !== 'warren-employee-month' || canManageRecognitionAwards === true
}

export function quarterWindowFor(dateValue = new Date()) {
  const dateKey = localDateKey(dateValue)
  const year = Number(dateKey.slice(0, 4))
  const month = Number(dateKey.slice(5, 7))
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1
  const endMonth = startMonth + 2
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    label: `${new Date(Date.UTC(year, startMonth - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}–${new Date(Date.UTC(year, endMonth - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
  }
}
