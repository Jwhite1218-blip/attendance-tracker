// What the program means when nobody has changed anything.
//
// These used to live in recognitionStore, hrFlags and trainingRecords. They
// moved here on 2026-10-18 so that programSettings can read them without
// importing those modules back — the settings store sits between the defaults
// and the code that uses them, and a cycle there would be a module-order bug
// waiting to happen.
//
// Each module still re-exports its own, so nothing that imported them before
// had to change.
//
// Changing a value here changes what the district falls back to. Changing one
// in the Settings page changes what the district actually uses, without a
// deploy. The two are kept apart on purpose: a default is a position we took,
// a setting is a decision Liz made.

// --- recognition -----------------------------------------------------------

export const DEFAULT_STAR_LEVELS = [
  { id: 'bronze', name: 'Bronze Star', minimum: 5, symbol: '🥉' },
  { id: 'silver', name: 'Silver Star', minimum: 10, symbol: '🥈' },
  { id: 'gold', name: 'Gold Star', minimum: 20, symbol: '🥇' },
  { id: 'platinum', name: 'Platinum Star', minimum: 30, symbol: '🏆' },
  { id: 'superstar', name: 'Superstar', minimum: 50, symbol: '⭐' },
]

// Keyed by the value already stored on every recognition record, so the
// printed card can say something different from what the database holds
// without migrating a single row.
export const DEFAULT_CRITERION_LABELS = {
  'Showing patience or kindness when helping students': {
    name: 'Compassionate Service',
    description: 'Shows patience or kindness when helping students',
  },
  'Participating in school functions beyond regular duties': {
    name: 'Community Contributor',
    description: 'Participates in school activities beyond job duties',
  },
  'Working with teachers and communicating effectively': {
    name: 'Effective Communicator',
    description: 'Works with teachers & staff effectively',
  },
  'Creating a positive cafeteria environment for students': {
    name: 'Resilient Leader',
    description: 'Creating a positive cafeteria environment for all',
  },
}

// The Leadership Track's milestones, from Liz's programme document and
// confirmed by Jon 2026-10-19. Counted in ACE Coach Bucks, never in Daily
// Stars — a manager holding both has two separate totals on purpose.
export const DEFAULT_COACH_MILESTONES = [
  { id: 'rising-coach', name: 'Rising Coach', minimum: 25, symbol: '◆' },
  { id: 'all-star-coach', name: 'All-Star Coach', minimum: 50, symbol: '◇' },
  { id: 'elite-coach', name: 'Elite Coach', minimum: 100, symbol: '❖' },
  { id: 'hall-of-fame-coach', name: 'Hall of Fame Coach', minimum: 150, symbol: '✦' },
  { id: 'ace-coach-of-the-year', name: 'ACE Coach of the Year', minimum: 200, symbol: '★' },
]

// --- attendance accountability ---------------------------------------------

// The third qualifying occurrence starts formal tracking; the fourth requires
// a verbal warning. Both are editable because Liz owns the policy, but they
// decide what the app says about somebody's job, so the Settings page warns
// before saving and records who changed them.
export const DEFAULT_OCCURRENCE_THRESHOLDS = {
  tracking: 3,
  verbalWarning: 4,
}

// --- professional standards ------------------------------------------------

// Food service confirmed by Liz 2026-10-11; admin team the same day. A
// position absent from this table resolves to null — "no requirement set" —
// rather than defaulting to a tier, so a new job title is never silently
// reported as compliant against a number nobody chose.
export const DEFAULT_POSITION_TRAINING_HOURS = {
  'Food Service Director': 12,
  'Food Service Manager': 10,
  'Food Service Worker Lead': 10,
  'Cook': 6,
  'Food Service Worker': 6,
  'RDM': 12,
  'District Office Manager': 6,
  'RN': 10,
  'Chef': 10,
  'OM': 6,
  'FM': 6,
  'MM': 6,
  'HRM': 6,
}
