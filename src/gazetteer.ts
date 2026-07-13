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

// World countries -> capital coords + Natural Earth ADMIN name. Matched in the
// headline at LOWER priority than a specific city/region, but still counts as a
// precise location (it's where the story is, not where it was published). This
// is what rescues the large class of headlines that name a country, not a city.
interface Country {
  ne: string // Natural Earth ADMIN name
  lat: number
  lng: number
  aliases: string[]
}

const COUNTRIES: Country[] = [
  { ne: 'United States of America', lat: 38.9, lng: -77.0, aliases: ['united states', 'u.s.', 'usa'] },
  { ne: 'United Kingdom', lat: 51.5, lng: -0.13, aliases: ['united kingdom', 'britain', 'u.k.'] },
  { ne: 'France', lat: 48.85, lng: 2.35, aliases: ['france', 'paris'] },
  { ne: 'Germany', lat: 52.52, lng: 13.4, aliases: ['germany', 'berlin'] },
  { ne: 'Italy', lat: 41.9, lng: 12.5, aliases: ['italy', 'rome'] },
  { ne: 'Spain', lat: 40.42, lng: -3.7, aliases: ['spain', 'madrid'] },
  { ne: 'Poland', lat: 52.23, lng: 21.0, aliases: ['poland', 'warsaw'] },
  { ne: 'Netherlands', lat: 52.37, lng: 4.9, aliases: ['netherlands', 'amsterdam', 'the hague'] },
  { ne: 'Belgium', lat: 50.85, lng: 4.35, aliases: ['belgium', 'brussels'] },
  { ne: 'Sweden', lat: 59.33, lng: 18.07, aliases: ['sweden', 'stockholm'] },
  { ne: 'Norway', lat: 59.91, lng: 10.75, aliases: ['norway', 'oslo'] },
  { ne: 'Finland', lat: 60.17, lng: 24.94, aliases: ['finland', 'helsinki'] },
  { ne: 'Greece', lat: 37.98, lng: 23.73, aliases: ['greece', 'athens'] },
  { ne: 'Turkey', lat: 39.93, lng: 32.86, aliases: ['turkey', 'ankara', 'turkiye'] },
  { ne: 'Romania', lat: 44.43, lng: 26.1, aliases: ['romania', 'bucharest'] },
  { ne: 'Hungary', lat: 47.5, lng: 19.04, aliases: ['hungary', 'budapest'] },
  { ne: 'Austria', lat: 48.21, lng: 16.37, aliases: ['austria', 'vienna'] },
  { ne: 'Switzerland', lat: 46.95, lng: 7.45, aliases: ['switzerland', 'geneva', 'zurich'] },
  { ne: 'Ireland', lat: 53.35, lng: -6.26, aliases: ['ireland', 'dublin'] },
  { ne: 'Portugal', lat: 38.72, lng: -9.14, aliases: ['portugal', 'lisbon'] },
  { ne: 'Czechia', lat: 50.08, lng: 14.44, aliases: ['czech', 'czechia', 'prague'] },
  { ne: 'Bulgaria', lat: 42.7, lng: 23.32, aliases: ['bulgaria', 'sofia'] },
  { ne: 'Belarus', lat: 53.9, lng: 27.57, aliases: ['belarus', 'minsk'] },
  { ne: 'Moldova', lat: 47.0, lng: 28.86, aliases: ['moldova', 'chisinau', 'transnistria'] },
  { ne: 'Bosnia and Herzegovina', lat: 43.86, lng: 18.41, aliases: ['bosnia', 'sarajevo'] },
  { ne: 'Croatia', lat: 45.81, lng: 15.98, aliases: ['croatia', 'zagreb'] },
  { ne: 'North Macedonia', lat: 41.99, lng: 21.43, aliases: ['macedonia', 'skopje'] },
  // ---- Middle East / N. Africa ----
  { ne: 'Iran', lat: 35.69, lng: 51.39, aliases: ['iran', 'iranian'] },
  { ne: 'Iraq', lat: 33.31, lng: 44.36, aliases: ['iraq', 'iraqi'] },
  { ne: 'Saudi Arabia', lat: 24.71, lng: 46.68, aliases: ['saudi arabia', 'saudi'] },
  { ne: 'Jordan', lat: 31.95, lng: 35.93, aliases: ['jordan', 'amman'] },
  { ne: 'United Arab Emirates', lat: 24.45, lng: 54.38, aliases: ['emirates', 'u.a.e.', 'abu dhabi', 'dubai'] },
  { ne: 'Qatar', lat: 25.29, lng: 51.53, aliases: ['qatar', 'doha'] },
  { ne: 'Kuwait', lat: 29.37, lng: 47.98, aliases: ['kuwait'] },
  { ne: 'Egypt', lat: 30.04, lng: 31.24, aliases: ['egypt', 'egyptian'] },
  { ne: 'Algeria', lat: 36.75, lng: 3.06, aliases: ['algeria', 'algiers'] },
  { ne: 'Morocco', lat: 34.02, lng: -6.84, aliases: ['morocco', 'rabat'] },
  { ne: 'Tunisia', lat: 36.8, lng: 10.18, aliases: ['tunisia', 'tunis'] },
  // ---- Sub-Saharan Africa ----
  { ne: 'Nigeria', lat: 9.06, lng: 7.49, aliases: ['nigeria', 'abuja'] },
  { ne: 'Ethiopia', lat: 9.03, lng: 38.74, aliases: ['ethiopia', 'addis ababa'] },
  { ne: 'Kenya', lat: -1.29, lng: 36.82, aliases: ['kenya', 'nairobi'] },
  { ne: 'South Africa', lat: -25.75, lng: 28.19, aliases: ['south africa', 'pretoria', 'johannesburg'] },
  { ne: 'Democratic Republic of the Congo', lat: -4.32, lng: 15.31, aliases: ['dr congo', 'drc', 'kinshasa'] },
  { ne: 'Chad', lat: 12.13, lng: 15.06, aliases: ['chad', "n'djamena"] },
  { ne: 'Niger', lat: 13.51, lng: 2.11, aliases: ['niger', 'niamey'] },
  { ne: 'Cameroon', lat: 3.85, lng: 11.5, aliases: ['cameroon', 'yaounde'] },
  { ne: 'Uganda', lat: 0.35, lng: 32.58, aliases: ['uganda', 'kampala'] },
  { ne: 'Rwanda', lat: -1.95, lng: 30.06, aliases: ['rwanda', 'kigali'] },
  { ne: 'Zimbabwe', lat: -17.82, lng: 31.05, aliases: ['zimbabwe', 'harare'] },
  { ne: 'Mozambique', lat: -25.97, lng: 32.58, aliases: ['mozambique', 'maputo'] },
  { ne: 'Senegal', lat: 14.72, lng: -17.47, aliases: ['senegal', 'dakar'] },
  { ne: 'Ghana', lat: 5.6, lng: -0.19, aliases: ['ghana', 'accra'] },
  // ---- Asia ----
  { ne: 'China', lat: 39.9, lng: 116.4, aliases: ['china', 'chinese', 'beijing'] },
  { ne: 'Japan', lat: 35.68, lng: 139.69, aliases: ['japan', 'tokyo', 'japanese'] },
  { ne: 'India', lat: 28.61, lng: 77.21, aliases: ['india', 'indian'] },
  { ne: 'Pakistan', lat: 33.69, lng: 73.06, aliases: ['pakistan', 'pakistani'] },
  { ne: 'Afghanistan', lat: 34.56, lng: 69.21, aliases: ['afghanistan', 'afghan', 'taliban'] },
  { ne: 'Bangladesh', lat: 23.81, lng: 90.41, aliases: ['bangladesh', 'dhaka'] },
  { ne: 'Myanmar', lat: 19.76, lng: 96.08, aliases: ['burma', 'naypyidaw'] },
  { ne: 'Thailand', lat: 13.76, lng: 100.5, aliases: ['thailand', 'bangkok'] },
  { ne: 'Vietnam', lat: 21.03, lng: 105.85, aliases: ['vietnam', 'hanoi'] },
  { ne: 'Indonesia', lat: -6.21, lng: 106.85, aliases: ['indonesia', 'jakarta'] },
  { ne: 'Malaysia', lat: 3.14, lng: 101.69, aliases: ['malaysia', 'kuala lumpur'] },
  { ne: 'South Korea', lat: 37.57, lng: 126.98, aliases: ['south korea'] },
  { ne: 'North Korea', lat: 39.04, lng: 125.76, aliases: ['north korea', 'dprk'] },
  { ne: 'Kazakhstan', lat: 51.17, lng: 71.43, aliases: ['kazakhstan', 'astana'] },
  // ---- Americas ----
  { ne: 'Canada', lat: 45.42, lng: -75.7, aliases: ['canada', 'ottawa'] },
  { ne: 'Mexico', lat: 19.43, lng: -99.13, aliases: ['mexico', 'mexican'] },
  { ne: 'Brazil', lat: -15.79, lng: -47.88, aliases: ['brazil', 'brasilia', 'brazilian'] },
  { ne: 'Argentina', lat: -34.6, lng: -58.38, aliases: ['argentina', 'buenos aires'] },
  { ne: 'Colombia', lat: 4.71, lng: -74.07, aliases: ['colombia', 'colombian'] },
  { ne: 'Venezuela', lat: 10.48, lng: -66.9, aliases: ['venezuela', 'venezuelan'] },
  { ne: 'Chile', lat: -33.45, lng: -70.67, aliases: ['chile', 'santiago'] },
  { ne: 'Peru', lat: -12.05, lng: -77.04, aliases: ['peru', 'lima'] },
  { ne: 'Cuba', lat: 23.11, lng: -82.37, aliases: ['cuba', 'havana'] },
  { ne: 'Ecuador', lat: -0.18, lng: -78.47, aliases: ['ecuador', 'quito'] },
  // ---- Oceania ----
  { ne: 'Australia', lat: -35.28, lng: 149.13, aliases: ['australia', 'canberra', 'australian'] },
  { ne: 'New Zealand', lat: -41.29, lng: 174.78, aliases: ['new zealand', 'wellington'] },
]

// Precompute alias -> place for fast scanning, longest aliases first so
// "south china sea" beats "china".
const ALIAS_INDEX: { alias: string; place: Place }[] = PLACES.flatMap((p) =>
  p.aliases.map((a) => ({ alias: a, place: p })),
).sort((a, b) => b.alias.length - a.alias.length)

const COUNTRY_INDEX: { alias: string; country: Country }[] = COUNTRIES.flatMap(
  (c) => c.aliases.map((a) => ({ alias: a, country: c })),
).sort((a, b) => b.alias.length - a.alias.length)

function hasWord(haystack: string, needle: string): boolean {
  // Check EVERY occurrence, not just the first: an alias can appear embedded in
  // a larger word ("india" inside "indiana") before a later standalone mention.
  // Stopping at the first hit would miss the standalone one.
  let i = haystack.indexOf(needle)
  while (i >= 0) {
    const before = i === 0 ? ' ' : haystack[i - 1]
    const after =
      i + needle.length >= haystack.length ? ' ' : haystack[i + needle.length]
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return true
    i = haystack.indexOf(needle, i + 1)
  }
  return false
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
  // No city/region — try a country named in the headline (still precise: it's
  // where the story is, not where it was published).
  for (const { alias, country } of COUNTRY_INDEX) {
    if (hasWord(t, alias)) {
      return {
        lat: country.lat,
        lng: country.lng,
        place: country.ne,
        country: country.ne,
        precise: true,
      }
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

/**
 * Free-text place lookup for ad-hoc questions ("what's happening in Kyiv?").
 * Scans the gazetteer for a city/region first (highest rank wins), then a
 * named country. Returns null if no known place is mentioned.
 */
export function findPlace(
  text: string,
): { lat: number; lng: number; place: string } | null {
  const t = ` ${(text || '').toLowerCase()} `
  let best: Place | null = null
  for (const { alias, place } of ALIAS_INDEX) {
    if (hasWord(t, alias)) {
      if (!best || place.rank > best.rank) best = place
      if (best.rank === 3) break
    }
  }
  if (best) return { lat: best.lat, lng: best.lng, place: best.name }
  for (const { alias, country } of COUNTRY_INDEX) {
    if (hasWord(t, alias)) {
      return { lat: country.lat, lng: country.lng, place: country.ne }
    }
  }
  return null
}
