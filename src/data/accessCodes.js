// Maps each access PIN to what it can see.
// role: 'admin' -> full access, every school, Dashboard, Master Report, Transfers.
// role: 'school' -> locked to one school's roster (Quick Mark, Ledger View, Location View).
//
// ┌─────────────────────────────────────────────────────────┐
// │  Change these PINs to whatever you want before handing   │
// │  them out. Placeholders below are just sequential.       │
// └─────────────────────────────────────────────────────────┘
export const ACCESS_CODES = {
  '4421': { role: 'admin' },

  '1001': { role: 'school', locationId: 'WarrenCnHS' },  // Warren Central HS
  '1002': { role: 'school', locationId: 'StonyBrkMS' },  // Stony Brook MS
  '1003': { role: 'school', locationId: 'CrestonMS' },   // Creston MS
  '1004': { role: 'school', locationId: 'RaymondPkM' },  // Raymond Park MS
  '1005': { role: 'school', locationId: 'HawthorneE' },  // Hawthorne Elementary
  '1006': { role: 'school', locationId: 'EastridgeE' },  // Eastridge Elementary
  '1007': { role: 'school', locationId: 'GrassyCrkE' },  // Grassy Creek Elementary
  '1008': { role: 'school', locationId: 'LakesideES' },  // Lakeside Elementary
  '1009': { role: 'school', locationId: 'LibertyPkE' },  // Liberty Park Elementary
  '1010': { role: 'school', locationId: 'BrookViewE' },  // Brookview Elementary
  '1011': { role: 'school', locationId: 'LowellES' },    // Lowell Elementary
  '1012': { role: 'school', locationId: 'PleasantRn' },  // Pleasant Run Elementary
  '1013': { role: 'school', locationId: 'SunnyHt ES' },  // Sunny Heights Elementary
  '1014': { role: 'school', locationId: 'WarrenEC' },    // Warren Early Childhood
  '1015': { role: 'school', locationId: 'WarrenOAca' },  // Warren OA Academy
  '1016': { role: 'school', locationId: 'Admin' },       // District Admin
}
