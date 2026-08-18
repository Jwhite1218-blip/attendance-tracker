// Employee location overrides stored in localStorage
// Allows transferring employees between schools without modifying the JSON file

import employees from './employees.json'
import { LOCATION_MAP } from './locations.js'

const STORAGE_KEY = 'employee-location-overrides'

export function getLocationOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveLocationOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

// Get effective location for an employee (override > JSON default)
export function getEffectiveLocation(empId) {
  const overrides = getLocationOverrides()
  const emp = employees.find(e => e.id === empId || e.kronos_id === empId)
  if (!emp) return null
  return overrides[emp.kronos_id || emp.id] || emp.location
}

// Get all employees with their effective (possibly overridden) location
export function getEmployeesWithEffectiveLocations() {
  const overrides = getLocationOverrides()
  return employees.map(e => ({
    ...e,
    location: overrides[e.kronos_id || e.id] || e.location,
  }))
}

// Permanently transfer an employee to a new home location
export function transferEmployee(empKey, newLocationId) {
  const overrides = getLocationOverrides()
  overrides[empKey] = newLocationId
  saveLocationOverrides(overrides)
}

// Get employees for a specific location (using effective locations)
export function getRosterForLocation(locationId) {
  return getEmployeesWithEffectiveLocations().filter(e => e.location === locationId)
}

// Get location counts using effective locations
export function getLocationCounts() {
  const allEmps = getEmployeesWithEffectiveLocations()
  const counts = {}
  allEmps.forEach(e => {
    const loc = e.location || 'Unknown'
    counts[loc] = (counts[loc] || 0) + 1
  })
  return counts
}
