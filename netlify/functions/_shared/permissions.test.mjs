import test from 'node:test'
import assert from 'node:assert/strict'
import { accessForPin, normalizeAccessProfile, normalizeSchoolLocationId } from './auth.mjs'
import { LOCATIONS } from '../../../src/data/locations.js'
import { EMPLOYEE_NOTES_KEY, RECOGNITION_KEY, canWriteStateKey } from './permissions.mjs'

const liz = {
  role: 'admin',
  canManageRoster: true,
  canManageBlackouts: true,
}

const limitedDistrictAdmin = {
  role: 'admin',
  canManageRoster: false,
  canManageBlackouts: false,
}

const readOnlyDistrictViewer = {
  role: 'admin',
  canEditAttendance: false,
  canManageRoster: false,
  canManageBlackouts: false,
}

test('Liz can manage attendance, employee records, and blackout dates', () => {
  assert.equal(canWriteStateKey(liz, 'att-emp-123-2026'), true)
  assert.equal(canWriteStateKey(liz, EMPLOYEE_NOTES_KEY), true)
  assert.equal(canWriteStateKey(liz, RECOGNITION_KEY), true)
  assert.equal(canWriteStateKey(liz, 'employee-record-overrides'), true)
  assert.equal(canWriteStateKey(liz, 'attendance-blackout-dates'), true)
})

test('limited district administrators can mark attendance and write HR notes without changing protected records', () => {
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'att-emp-123-2026'), true)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, EMPLOYEE_NOTES_KEY), true)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, RECOGNITION_KEY), true)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'employee-record-overrides'), false)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'employee-custom-records'), false)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'attendance-blackout-dates'), false)
})

test('read-only district viewers cannot change attendance or protected records', () => {
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'att-emp-123-2026'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'hr-attendance-progress-v2'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, EMPLOYEE_NOTES_KEY), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, RECOGNITION_KEY), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'employee-record-overrides'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'employee-custom-records'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'attendance-blackout-dates'), false)
})

test('recognition pilots can save recognitions without attendance or HR access', () => {
  const recognitionPilot = {
    role: 'admin',
    canEditAttendance: false,
    canEditRecognition: true,
    recognitionOnly: true,
    canManageRoster: false,
    canManageBlackouts: false,
  }

  assert.equal(canWriteStateKey(recognitionPilot, RECOGNITION_KEY), true)
  assert.equal(canWriteStateKey(recognitionPilot, 'att-emp-123-2026'), false)
  assert.equal(canWriteStateKey(recognitionPilot, EMPLOYEE_NOTES_KEY), false)
  assert.equal(canWriteStateKey(recognitionPilot, 'employee-record-overrides'), false)
  assert.equal(canWriteStateKey(recognitionPilot, 'attendance-blackout-dates'), false)
})

test('PIN configuration can issue plain and Localis-watermarked read-only access', () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    1111: {
      role: 'admin',
      displayName: 'Read-Only Review',
      canEditAttendance: false,
      canManageRoster: false,
      canManageBlackouts: false,
    },
    2222: {
      role: 'admin',
      displayName: 'Localis Collective Review',
      canEditAttendance: false,
      canManageRoster: false,
      canManageBlackouts: false,
      watermark: 'localis',
    },
    3333: {
      role: 'admin',
      displayName: 'Recognition Pilot',
      canEditAttendance: false,
      canEditRecognition: true,
      canManageRecognitionAwards: false,
      recognitionOnly: true,
      canManageRoster: false,
      canManageBlackouts: false,
      watermark: 'localis',
    },
  })

  try {
    const plain = accessForPin('1111')
    const watermarked = accessForPin('2222')
    const recognitionPilot = accessForPin('3333')
    assert.equal(plain.canEditAttendance, false)
    assert.equal(plain.canWriteEmployeeNotes, false)
    assert.equal(plain.watermark, null)
    assert.equal(watermarked.canEditAttendance, false)
    assert.equal(watermarked.watermark, 'localis')
    assert.equal(recognitionPilot.canEditAttendance, false)
    assert.equal(recognitionPilot.canEditRecognition, true)
    assert.equal(recognitionPilot.canManageRecognitionAwards, false)
    assert.equal(recognitionPilot.recognitionOnly, true)
    assert.equal(recognitionPilot.canWriteEmployeeNotes, false)
    assert.equal(recognitionPilot.canManageRoster, false)
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
  }
})

test('additive Chef PIN receives restricted district access without replacing existing PINs', () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousChefPin = process.env.ATTENDANCE_CHEF_PIN
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    1111: {
      role: 'admin',
      displayName: 'Existing Administrator',
      canManageRoster: true,
      canManageBlackouts: true,
    },
  })
  process.env.ATTENDANCE_CHEF_PIN = '2468'

  try {
    const existing = accessForPin('1111')
    const chef = accessForPin('2468')
    assert.equal(existing.displayName, 'Existing Administrator')
    assert.equal(existing.canManageRoster, true)
    assert.equal(chef.displayName, 'Chef')
    assert.equal(chef.canEditAttendance, true)
    assert.equal(chef.canWriteEmployeeNotes, true)
    assert.equal(chef.canManageRecognitionAwards, false)
    assert.equal(chef.canManageRoster, false)
    assert.equal(chef.canManageBlackouts, false)

    process.env.ATTENDANCE_CHEF_PIN = '1111'
    assert.equal(accessForPin('1111').displayName, 'Existing Administrator')
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousChefPin === undefined) delete process.env.ATTENDANCE_CHEF_PIN
    else process.env.ATTENDANCE_CHEF_PIN = previousChefPin
  }
})

test('all school identifiers, names, short names, case, and spacing normalize to one canonical building ID', () => {
  const schools = LOCATIONS.filter(location => location.id !== 'Admin')

  for (const school of schools) {
    assert.equal(normalizeSchoolLocationId(school.id), school.id)
    assert.equal(normalizeSchoolLocationId(school.id.toLowerCase()), school.id)
    assert.equal(normalizeSchoolLocationId(`  ${school.id.replaceAll(' ', '')}  `), school.id)
    assert.equal(normalizeSchoolLocationId(school.name), school.id)
    assert.equal(normalizeSchoolLocationId(school.shortName), school.id)
  }

  assert.equal(normalizeSchoolLocationId('Admin'), null)
  assert.equal(normalizeSchoolLocationId('Not A Warren School'), null)
  assert.equal(normalizeSchoolLocationId(''), null)
})

test('PIN profiles fail closed for invalid buildings and contradictory capabilities', () => {
  assert.equal(normalizeAccessProfile({ role: 'school' }), null)
  assert.equal(normalizeAccessProfile({ role: 'school', locationId: 'Admin' }), null)
  assert.equal(normalizeAccessProfile({ role: 'school', locationId: 'Unknown School' }), null)
  assert.equal(normalizeAccessProfile({ role: 'viewer' }), null)

  const school = normalizeAccessProfile({
    role: 'school',
    locationId: 'sunnyhtes',
    canManageRoster: true,
    canManageBlackouts: true,
    canManageRecognitionAwards: true,
  })
  assert.equal(school.locationId, 'SunnyHt ES')
  assert.equal(school.canEditAttendance, true)
  assert.equal(school.canEditRecognition, true)
  assert.equal(school.canManageRoster, false)
  assert.equal(school.canManageBlackouts, false)
  assert.equal(school.canManageRecognitionAwards, false)

  const recognitionOnlySchool = normalizeAccessProfile({
    role: 'school',
    locationId: 'Creston',
    recognitionOnly: true,
    canEditAttendance: true,
    canEditRecognition: true,
  })
  assert.equal(recognitionOnlySchool.locationId, 'CrestonMS')
  assert.equal(recognitionOnlySchool.canEditAttendance, false)
  assert.equal(recognitionOnlySchool.canEditRecognition, true)
  assert.equal(recognitionOnlySchool.recognitionOnly, true)

  const readOnlyAdmin = normalizeAccessProfile({ role: 'admin', canEditAttendance: false })
  assert.equal(readOnlyAdmin.canManageRoster, false)
  assert.equal(readOnlyAdmin.canManageBlackouts, false)
  assert.equal(readOnlyAdmin.canManageRecognitionAwards, false)

  const limitedAdmin = normalizeAccessProfile({
    role: 'admin',
    canManageRoster: false,
    canManageBlackouts: false,
  })
  assert.equal(limitedAdmin.canManageRecognitionAwards, false)

  const lizAdmin = normalizeAccessProfile({ role: 'admin' })
  assert.equal(lizAdmin.canManageRoster, true)
  assert.equal(lizAdmin.canManageBlackouts, true)
  assert.equal(lizAdmin.canManageRecognitionAwards, true)
})

test('additive presentation pilot PINs receive existing restricted district-manager permissions', () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousPilots = process.env.ATTENDANCE_RECOGNITION_PILOT_PINS_JSON
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    1111: {
      role: 'admin',
      displayName: 'Existing Administrator',
      canManageRoster: true,
      canManageBlackouts: true,
    },
  })
  process.env.ATTENDANCE_RECOGNITION_PILOT_PINS_JSON = JSON.stringify({
    681204: 'Pilot Manager 1',
    1111: 'Conflicting Pilot',
  })

  try {
    const existing = accessForPin('1111')
    const pilot = accessForPin('681204')
    assert.equal(existing.displayName, 'Existing Administrator')
    assert.equal(existing.canManageRoster, true)
    assert.equal(pilot.displayName, 'Pilot Manager 1')
    assert.equal(pilot.canEditAttendance, true)
    assert.equal(pilot.canEditRecognition, true)
    assert.equal(pilot.canManageRecognitionAwards, true)
    assert.equal(pilot.recognitionOnly, false)
    assert.equal(pilot.canWriteEmployeeNotes, true)
    assert.equal(pilot.canManageRoster, false)
    assert.equal(pilot.canManageBlackouts, false)
    assert.equal(pilot.watermark, 'localis')
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousPilots === undefined) delete process.env.ATTENDANCE_RECOGNITION_PILOT_PINS_JSON
    else process.env.ATTENDANCE_RECOGNITION_PILOT_PINS_JSON = previousPilots
  }
})

test('school managers can only write attendance for employees in their school', () => {
  const schoolManager = { role: 'school' }
  const allowedEmployeeIds = new Set(['123'])

  assert.equal(canWriteStateKey(schoolManager, 'att-emp-123-2026', allowedEmployeeIds), true)
  assert.equal(canWriteStateKey(schoolManager, 'att-emp-456-2026', allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, RECOGNITION_KEY, allowedEmployeeIds), true)
  assert.equal(canWriteStateKey(schoolManager, EMPLOYEE_NOTES_KEY, allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, 'attendance-blackout-dates', allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, 'employee-location-overrides', allowedEmployeeIds), false)
})
