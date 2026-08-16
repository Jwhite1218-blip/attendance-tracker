// 15 real school locations from the Kronos locations export
// Plus Admin for district-level staff

export const LOCATIONS = [
  { id: 'WarrenCnHS',  name: 'Warren Central HS',     shortName: 'Warren Central', type: 'High School',    sort: 1 },
  { id: 'StonyBrkMS',  name: 'Stony Brook MS',         shortName: 'Stony Brook',    type: 'Middle School',  sort: 2 },
  { id: 'CrestonMS',   name: 'Creston MS',             shortName: 'Creston',       type: 'Middle School',  sort: 3 },
  { id: 'RaymondPkM',  name: 'Raymond Park MS',        shortName: 'Raymond Park',   type: 'Middle School',  sort: 4 },
  { id: 'HawthorneE',  name: 'Hawthorne Elementary',   shortName: 'Hawthorne',     type: 'Elementary',     sort: 5 },
  { id: 'EastridgeE',  name: 'Eastridge Elementary',   shortName: 'Eastridge',     type: 'Elementary',     sort: 6 },
  { id: 'GrassyCrkE',  name: 'Grassy Creek Elementary', shortName: 'Grassy Creek',  type: 'Elementary',     sort: 7 },
  { id: 'LakesideES',  name: 'Lakeside Elementary',     shortName: 'Lakeside',      type: 'Elementary',     sort: 8 },
  { id: 'LibertyPkE',  name: 'Liberty Park Elementary', shortName: 'Liberty Park',  type: 'Elementary',     sort: 9 },
  { id: 'BrookViewE',  name: 'Brookview Elementary',    shortName: 'Brookview',     type: 'Elementary',     sort: 10 },
  { id: 'LowellES',    name: 'Lowell Elementary',      shortName: 'Lowell',        type: 'Elementary',     sort: 11 },
  { id: 'PleasantRn',  name: 'Pleasant Run Elementary', shortName: 'Pleasant Run',  type: 'Elementary',     sort: 12 },
  { id: 'SunnyHt ES',  name: 'Sunny Heights Elementary', shortName: 'Sunny Heights', type: 'Elementary',    sort: 13 },
  { id: 'WarrenEC',    name: 'Warren Early Childhood', shortName: 'Warren EC',      type: 'Elementary',     sort: 14 },
  { id: 'WarrenOAca',  name: 'Warren OA Academy',       shortName: 'Warren Academy', type: 'Academy',       sort: 15 },
  { id: 'Admin',       name: 'District Admin',          shortName: 'Admin',          type: 'Administration', sort: 16 },
]

export const LOCATION_MAP = Object.fromEntries(LOCATIONS.map(l => [l.id, l]))
