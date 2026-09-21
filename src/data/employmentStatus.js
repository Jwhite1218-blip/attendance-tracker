export function validateInactiveDetails(record) {
  for (const [field, label] of [['termination_date', 'Termination date'], ['last_day_worked', 'Last day worked']]) {
    const value = record?.[field]
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`) : new Date(NaN)
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error(`${label} is required and must be a valid date.`)
    }
  }
  if (typeof record?.inactive_reason !== 'string' || !record.inactive_reason.trim()) {
    throw new Error('A reason is required before moving an employee to inactive.')
  }
}

export function validateEmploymentChanges(current, proposed) {
  for (const [id, record] of Object.entries(proposed || {})) {
    if (record?.active !== false) continue
    const previous = current?.[id]
    const detailsChanged = ['termination_date', 'last_day_worked', 'inactive_reason']
      .some(field => record[field] !== previous?.[field])
    // Legacy inactive records can still receive unrelated card edits.
    if (previous?.active !== false || detailsChanged) validateInactiveDetails(record)
  }
}
