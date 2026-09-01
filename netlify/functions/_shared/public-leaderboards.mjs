export const PUBLIC_LEADERBOARD_SCHOOLS = [
  { locationId: 'WarrenCnHS', token: '4btSMuJa6ExhsJOw' },
  { locationId: 'StonyBrkMS', token: 'QIBo73Ut-bgWwnYR' },
  { locationId: 'CrestonMS', token: '5T-dX7sAgzwV2TlG' },
  { locationId: 'RaymondPkM', token: 'uIEmWwWeXgvSM8An' },
  { locationId: 'HawthorneE', token: '4pqzlIfB1QNUrAfG' },
  { locationId: 'EastridgeE', token: 'RA3qK0HcnAiCwzeD' },
  { locationId: 'GrassyCrkE', token: '60ERHTL0nj2OL6lB' },
  { locationId: 'LakesideES', token: 'UqcYL8oZMeSMMvzO' },
  { locationId: 'LibertyPkE', token: 'PEufiNTG8zwFdDOM' },
  { locationId: 'BrookViewE', token: 'qPpaxdl81rP-4fyI' },
  { locationId: 'LowellES', token: 'kuk5PjdNWvUFPIFT' },
  { locationId: 'PleasantRn', token: 'O1BNf3s_9t2Sd8i3' },
  { locationId: 'SunnyHt ES', token: 'A__vgfbdcHX8sjwn' },
  { locationId: 'WarrenEC', token: 'F28vGq29lWmelSaF' },
  { locationId: 'WarrenOAca', token: 'OHens9Uz8Km46Haj' },
]

export function publicLeaderboardSchoolForToken(token) {
  return PUBLIC_LEADERBOARD_SCHOOLS.find(entry => entry.token === String(token || '')) || null
}
