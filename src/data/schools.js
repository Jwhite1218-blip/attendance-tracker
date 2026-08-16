// Seed data — 15 schools with varying roster sizes
export const SCHOOLS = [
  { id: 1, name: "Riverside Elementary",     code: "RIV", location: "Riverside, CA",   rosterSize: 12 },
  { id: 2, name: "Oak Ridge Middle School",   code: "OAK", location: "Oak Ridge, TN",  rosterSize: 18 },
  { id: 3, name: "Summit High School",       code: "SUM", location: "Summit, NJ",     rosterSize: 24 },
  { id: 4, name: "Lincoln Academy",          code: "LIN", location: "Lincoln, NE",    rosterSize: 10 },
  { id: 5, name: "Parkside Elementary",      code: "PRK", location: "Parkside, OR",    rosterSize: 14 },
  { id: 6, name: "Westbrook Middle School",   code: "WBR", location: "Westbrook, ME",   rosterSize: 20 },
  { id: 7, name: "Eastgate High School",     code: "EGA", location: "Eastgate, OH",    rosterSize: 22 },
  { id: 8, name: "Cedar Grove Elementary",   code: "CDG", location: "Cedar Grove, IA", rosterSize: 8  },
  { id: 9, name: "Northwood Academy",        code: "NWD", location: "Northwood, NH",  rosterSize: 16 },
  { id: 10, name: "Maple Street Elementary", code: "MAP", location: "Maple Grove, MN", rosterSize: 11 },
  { id: 11, name: "Harborview Middle School", code: "HRB", location: "Harborview, WA",  rosterSize: 19 },
  { id: 12, name: "Brighton High School",    code: "BRI", location: "Brighton, MA",    rosterSize: 25 },
  { id: 13, name: "Pinecrest Elementary",    code: "PNC", location: "Pinecrest, FL",   rosterSize: 9  },
  { id: 14, name: "Stonebridge Academy",     code: "STB", location: "Stonebridge, CT", rosterSize: 15 },
  { id: 15, name: "Lakeside High School",    code: "LKU", location: "Lakeside, CA",    rosterSize: 21 },
]

export const STATUS_OPTIONS = [
  { value: 'present',  label: 'Present',  color: 'present'  },
  { value: 'absent',   label: 'Absent',   color: 'absent'   },
  { value: 'late',     label: 'Late',      color: 'late'     },
  { value: 'excused',  label: 'Excused',   color: 'excused'  },
  { value: 'remote',   label: 'Remote',    color: 'remote'   },
]

export const STATUS_CYCLE = ['present', 'absent', 'late', 'excused', 'remote']

// Generate fake employee names per school
const FIRST_NAMES = [
  "James","Mary","John","Patricia","Robert","Jennifer","Michael","Linda","William","Elizabeth",
  "David","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen",
  "Christopher","Nancy","Daniel","Lisa","Matthew","Margaret","Anthony","Betty","Mark","Sandra",
  "Donald","Ashley","Steven","Kimberly","Paul","Emily","Andrew","Donna","Joshua","Michelle",
  "Kevin","Carol","Brian","Amanda","George","Melissa","Edward","Deborah","Ronald","Stephanie"
]

const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
  "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
  "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts"
]

export function generateRoster(school) {
  const employees = []
  for (let i = 0; i < school.rosterSize; i++) {
    const first = FIRST_NAMES[(school.id * 7 + i * 3) % FIRST_NAMES.length]
    const last = LAST_NAMES[(school.id * 13 + i * 5) % LAST_NAMES.length]
    const roles = ["Teacher", "Admin", "Counselor", "Custodian", "Librarian", "Coach", "Aide"]
    employees.push({
      id: `${school.id}-${i + 1}`,
      firstName: first,
      lastName: last,
      role: roles[i % roles.length],
      schoolId: school.id,
    })
  }
  return employees
}

// Generate dates for current week (or a range)
export function getWeekDates(weekOffset = 0) {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7)
  const dates = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
