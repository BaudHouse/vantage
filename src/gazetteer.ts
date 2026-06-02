// Conflict-zone gazetteer. GDELT's DOC API only tells us the PUBLISHER's country,
// so a US outlet covering Kyiv would otherwise plot a dot on Washington. We fix
// that by reading the actual dateline/place out of each headline and geocoding
// THERE. Each entry carries the Natural Earth ADMIN country name so the
// choropleth aggregates correctly too.
//
// `country` MUST match the ADMIN field in the Natural Earth countries geojson.

export interface Place {
  name: string // canonical display name
  lat: number
  lng: number
  country: string // Natural Earth ADMIN name
  /** match priority — higher wins when several places appear in one headline */
  rank: number
  /** lowercase strings to look for in the headline (word-boundary matched) */
  aliases: string[]
}

const UA = 'Ukraine'
const RU = 'Russia'
const IL = 'Israel'
const PS = 'Palestine'
const US = 'United States of America'

// rank: cities/explicit places = 3, sub-regions = 2, countries handled elsewhere.
export const PLACES: Place[] = [
  // ---- Ukraine war ----
  { name: 'Kyiv', lat: 50.45, lng: 30.52, country: UA, rank: 3, aliases: ['kyiv', 'kiev'] },
  { name: 'Kharkiv', lat: 49.99, lng: 36.23, country: UA, rank: 3, aliases: ['kharkiv', 'kharkov'] },
  { name: 'Kherson', lat: 46.64, lng: 32.61, country: UA, rank: 3, aliases: ['kherson'] },
  { name: 'Bakhmut', lat: 48.59, lng: 38.0, country: UA, rank: 3, aliases: ['bakhmut'] },
  { name: 'Avdiivka', lat: 48.14, lng: 37.74, country: UA, rank: 3, aliases: ['avdiivka', 'avdeevka'] },
  { name: 'Donetsk', lat: 48.02, lng: 37.8, country: UA, rank: 3, aliases: ['donetsk'] },
  { name: 'Luhansk', lat: 48.57, lng: 39.3, country: UA, rank: 3, aliases: ['luhansk', 'lugansk'] },
  { name: 'Mariupol', lat: 47.1, lng: 37.55, country: UA, rank: 3, aliases: ['mariupol'] },
  { name: 'Odesa', lat: 46.48, lng: 30.72, country: UA, rank: 3, aliases: ['odesa', 'odessa'] },
  { name: 'Zaporizhzhia', lat: 47.84, lng: 35.14, country: UA, rank: 3, aliases: ['zaporizhzhia', 'zaporizhzhzhia', 'zaporozhye'] },
  { name: 'Dnipro', lat: 48.46, lng: 35.05, country: UA, rank: 3, aliases: ['dnipro'] },
  { name: 'Lviv', lat: 49.84, lng: 24.03, country: UA, rank: 3, aliases: ['lviv'] },
  { name: 'Sumy', lat: 50.91, lng: 34.8, country: UA, rank: 3, aliases: ['sumy'] },
  { name: 'Crimea', lat: 45.3, lng: 34.4, country: UA, rank: 2, aliases: ['crimea', 'sevastopol', 'simferopol'] },
  // ---- Russia ----
  { name: 'Moscow', lat: 55.75, lng: 37.62, country: RU, rank: 3, aliases: ['moscow'] },
  { name: 'Belgorod', lat: 50.6, lng: 36.58, country: RU, rank: 3, aliases: ['belgorod'] },
  { name: 'Kursk', lat: 51.73, lng: 36.19, country: RU, rank: 3, aliases: ['kursk'] },
  { name: 'Rostov', lat: 47.24, lng: 39.71, country: RU, rank: 3, aliases: ['rostov'] },
  { name: 'St Petersburg', lat: 59.93, lng: 30.34, country: RU, rank: 3, aliases: ['st petersburg', 'saint petersburg'] },
  // ---- Israel / Palestine / Levant ----
  { name: 'Gaza', lat: 31.5, lng: 34.47, country: PS, rank: 3, aliases: ['gaza', 'gaza strip'] },
  { name: 'Rafah', lat: 31.29, lng: 34.25, country: PS, rank: 3, aliases: ['rafah'] },
  { name: 'Khan Younis', lat: 31.34, lng: 34.3, country: PS, rank: 3, aliases: ['khan younis', 'khan yunis'] },
  { name: 'West Bank', lat: 32.0, lng: 35.3, country: PS, rank: 2, aliases: ['west bank', 'ramallah', 'jenin', 'nablus'] },
  { name: 'Jerusalem', lat: 31.78, lng: 35.22, country: IL, rank: 3, aliases: ['jerusalem'] },
  { name: 'Tel Aviv', lat: 32.08, lng: 34.78, country: IL, rank: 3, aliases: ['tel aviv'] },
  { name: 'Beirut', lat: 33.89, lng: 35.5, country: 'Lebanon', rank: 3, aliases: ['beirut', 'lebanon', 'hezbollah'] },
  { name: 'Damascus', lat: 33.51, lng: 36.29, country: 'Syria', rank: 3, aliases: ['damascus'] },
  { name: 'Aleppo', lat: 36.2, lng: 37.13, country: 'Syria', rank: 3, aliases: ['aleppo'] },
  { name: 'Homs', lat: 34.73, lng: 36.71, country: 'Syria', rank: 3, aliases: ['homs'] },
  // ---- Iraq / Iran / Gulf ----
  { name: 'Baghdad', lat: 33.31, lng: 44.36, country: 'Iraq', rank: 3, aliases: ['baghdad'] },
  { name: 'Mosul', lat: 36.34, lng: 43.13, country: 'Iraq', rank: 3, aliases: ['mosul'] },
  { name: 'Erbil', lat: 36.19, lng: 44.01, country: 'Iraq', rank: 3, aliases: ['erbil', 'irbil'] },
  { name: 'Tehran', lat: 35.69, lng: 51.39, country: 'Iran', rank: 3, aliases: ['tehran'] },
  { name: 'Isfahan', lat: 32.65, lng: 51.67, country: 'Iran', rank: 3, aliases: ['isfahan', 'esfahan'] },
  { name: 'Riyadh', lat: 24.71, lng: 46.68, country: 'Saudi Arabia', rank: 3, aliases: ['riyadh'] },
  { name: 'Strait of Hormuz', lat: 26.57, lng: 56.25, country: 'Iran', rank: 2, aliases: ['hormuz'] },
  // ---- Yemen / Red Sea ----
  { name: 'Sanaa', lat: 15.37, lng: 44.19, country: 'Yemen', rank: 3, aliases: ["sana'a", 'sanaa', 'houthi', 'houthis'] },
  { name: 'Aden', lat: 12.78, lng: 45.04, country: 'Yemen', rank: 3, aliases: ['aden'] },
  { name: 'Hodeidah', lat: 14.8, lng: 42.95, country: 'Yemen', rank: 3, aliases: ['hodeidah', 'hudaydah'] },
  { name: 'Red Sea', lat: 18.0, lng: 40.0, country: 'Yemen', rank: 2, aliases: ['red sea'] },
  // ---- Sudan / Sahel / Africa ----
  { name: 'Khartoum', lat: 15.5, lng: 32.56, country: 'Sudan', rank: 3, aliases: ['khartoum', 'omdurman'] },
  { name: 'Darfur', lat: 13.0, lng: 24.5, country: 'Sudan', rank: 2, aliases: ['darfur', 'el fasher', 'el-fasher'] },
  { name: 'Port Sudan', lat: 19.62, lng: 37.22, country: 'Sudan', rank: 3, aliases: ['port sudan'] },
  { name: 'Tripoli', lat: 32.89, lng: 13.19, country: 'Libya', rank: 3, aliases: ['tripoli'] },
  { name: 'Benghazi', lat: 32.12, lng: 20.07, country: 'Libya', rank: 3, aliases: ['benghazi'] },
  { name: 'Mogadishu', lat: 2.05, lng: 45.32, country: 'Somalia', rank: 3, aliases: ['mogadishu', 'al-shabaab', 'al shabaab'] },
  { name: 'Tigray', lat: 14.0, lng: 38.5, country: 'Ethiopia', rank: 2, aliases: ['tigray', 'mekelle'] },
  { name: 'Goma', lat: -1.66, lng: 29.22, country: 'Democratic Republic of the Congo', rank: 3, aliases: ['goma', 'kivu', 'm23'] },
  { name: 'Bamako', lat: 12.64, lng: -8.0, country: 'Mali', rank: 3, aliases: ['bamako'] },
  { name: 'Ouagadougou', lat: 12.37, lng: -1.52, country: 'Burkina Faso', rank: 3, aliases: ['ouagadougou', 'burkina faso'] },
  { name: 'Maiduguri', lat: 11.83, lng: 13.15, country: 'Nigeria', rank: 3, aliases: ['maiduguri', 'boko haram'] },
  { name: 'Cairo', lat: 30.04, lng: 31.24, country: 'Egypt', rank: 3, aliases: ['cairo'] },
  // ---- South / East Asia ----
  { name: 'Kabul', lat: 34.56, lng: 69.21, country: 'Afghanistan', rank: 3, aliases: ['kabul'] },
  { name: 'Kandahar', lat: 31.61, lng: 65.71, country: 'Afghanistan', rank: 3, aliases: ['kandahar'] },
  { name: 'Islamabad', lat: 33.69, lng: 73.06, country: 'Pakistan', rank: 3, aliases: ['islamabad'] },
  { name: 'Karachi', lat: 24.86, lng: 67.01, country: 'Pakistan', rank: 3, aliases: ['karachi'] },
  { name: 'Kashmir', lat: 34.08, lng: 74.8, country: 'India', rank: 2, aliases: ['kashmir', 'srinagar'] },
  { name: 'New Delhi', lat: 28.61, lng: 77.21, country: 'India', rank: 3, aliases: ['new delhi', 'delhi'] },
  { name: 'Pyongyang', lat: 39.04, lng: 125.76, country: 'North Korea', rank: 3, aliases: ['pyongyang'] },
  { name: 'Seoul', lat: 37.57, lng: 126.98, country: 'South Korea', rank: 3, aliases: ['seoul'] },
  { name: 'Taipei', lat: 25.03, lng: 121.57, country: 'Taiwan', rank: 3, aliases: ['taipei', 'taiwan strait'] },
  { name: 'Rakhine', lat: 20.15, lng: 92.9, country: 'Myanmar', rank: 2, aliases: ['rakhine', 'rohingya'] },
  { name: 'Yangon', lat: 16.84, lng: 96.17, country: 'Myanmar', rank: 3, aliases: ['yangon', 'myanmar'] },
  { name: 'Manila', lat: 14.6, lng: 120.98, country: 'Philippines', rank: 3, aliases: ['manila'] },
  { name: 'South China Sea', lat: 13.0, lng: 115.0, country: 'China', rank: 2, aliases: ['south china sea'] },
  // ---- Caucasus / Balkans / E. Europe ----
  { name: 'Tbilisi', lat: 41.72, lng: 44.79, country: 'Georgia', rank: 3, aliases: ['tbilisi'] },
  { name: 'Yerevan', lat: 40.18, lng: 44.51, country: 'Armenia', rank: 3, aliases: ['yerevan'] },
  { name: 'Baku', lat: 40.41, lng: 49.87, country: 'Azerbaijan', rank: 3, aliases: ['baku'] },
  { name: 'Nagorno-Karabakh', lat: 39.82, lng: 46.76, country: 'Azerbaijan', rank: 2, aliases: ['nagorno-karabakh', 'karabakh'] },
  { name: 'Belgrade', lat: 44.79, lng: 20.45, country: 'Republic of Serbia', rank: 3, aliases: ['belgrade'] },
  { name: 'Pristina', lat: 42.66, lng: 21.16, country: 'Kosovo', rank: 3, aliases: ['pristina', 'kosovo'] },
  // ---- Americas ----
  { name: 'Washington', lat: 38.9, lng: -77.04, country: US, rank: 3, aliases: ['washington', 'pentagon', 'white house'] },
  { name: 'Caracas', lat: 10.48, lng: -66.9, country: 'Venezuela', rank: 3, aliases: ['caracas', 'venezuela'] },
  { name: 'Bogota', lat: 4.71, lng: -74.07, country: 'Colombia', rank: 3, aliases: ['bogota'] },
  { name: 'Port-au-Prince', lat: 18.59, lng: -72.31, country: 'Haiti', rank: 3, aliases: ['port-au-prince', 'haiti'] },
  { name: 'Mexico City', lat: 19.43, lng: -99.13, country: 'Mexico', rank: 3, aliases: ['mexico city', 'sinaloa', 'culiacan'] },
]

// Country-level fallback (GDELT sourcecountry name -> coords + NE name).
// Reuses the broad centroid table semantics; only what we need beyond PLACES.
const COUNTRY_FALLBACK: Record<string, { lat: number; lng: number; ne: string }> = {
  Ukraine: { lat: 48.4, lng: 31.2, ne: 'Ukraine' },
  Russia: { lat: 55.0, lng: 40.0, ne: 'Russia' },
  Israel: { lat: 31.4, lng: 35.0, ne: 'Israel' },
  Syria: { lat: 34.8, lng: 38.0, ne: 'Syria' },
  Yemen: { lat: 15.6, lng: 48.5, ne: 'Yemen' },
  Sudan: { lat: 14.0, lng: 30.0, ne: 'Sudan' },
}

// Precompute alias -> place for fast scanning, longest aliases first so
// "south china sea" beats "china".
const ALIAS_INDEX: { alias: string; place: Place }[] = PLACES.flatMap((p) =>
  p.aliases.map((a) => ({ alias: a, place: p })),
).sort((a, b) => b.alias.length - a.alias.length)

function hasWord(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle)
  if (i < 0) return false
  const before = i === 0 ? ' ' : haystack[i - 1]
  const after =
    i + needle.length >= haystack.length ? ' ' : haystack[i + needle.length]
  return !/[a-z]/.test(before) && !/[a-z]/.test(after)
}

export interface Resolved {
  lat: number
  lng: number
  place: string
  country: string // Natural Earth ADMIN name
  precise: boolean // true if matched a specific place, false = country fallback
}

/**
 * Resolve where a story is actually happening from its headline, falling back
 * to the publisher's country only when no place is recognized.
 */
export function resolvePlace(
  title: string,
  sourceCountry: string,
  countryCentroid: (c: string) => [number, number] | null,
): Resolved | null {
  const t = ` ${(title || '').toLowerCase()} `
  let best: Place | null = null
  for (const { alias, place } of ALIAS_INDEX) {
    if (hasWord(t, alias)) {
      if (!best || place.rank > best.rank) best = place
      if (best.rank === 3) break // can't beat a city match
    }
  }
  if (best) {
    return {
      lat: best.lat,
      lng: best.lng,
      place: best.name,
      country: best.country,
      precise: true,
    }
  }
  // Fallback: publisher country.
  const fb = COUNTRY_FALLBACK[sourceCountry]
  if (fb) {
    return { lat: fb.lat, lng: fb.lng, place: sourceCountry, country: fb.ne, precise: false }
  }
  const c = countryCentroid(sourceCountry)
  if (c) {
    return { lat: c[0], lng: c[1], place: sourceCountry, country: sourceCountry, precise: false }
  }
  return null
}
