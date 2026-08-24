function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getWeekDates(weekOffset = 0, referenceDate = new Date()) {
  const today = new Date(referenceDate)
  const monday = new Date(today)
  const daysSinceMonday = (today.getDay() + 6) % 7
  monday.setDate(today.getDate() - daysSinceMonday + weekOffset * 7)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return dateKey(date)
  })
}
