import { getKey } from '../net'

interface Props {
  open: boolean
  onClose: () => void
}

interface KeyInfo {
  layer: string
  glyph: string
  env: string
  url: string
  blurb: string
  present: boolean
}

const KEYS: KeyInfo[] = [
  {
    layer: 'Vessels (AIS)',
    glyph: '⚓',
    env: 'VITE_AISSTREAM_KEY',
    url: 'https://aisstream.io/',
    blurb:
      'Live global ship positions (cargo, tankers, naval). No reliable key-less source exists, so this layer needs a free AISStream key.',
    present: !!getKey('VITE_AISSTREAM_KEY'),
  },
  {
    layer: 'Global wildfires / thermal',
    glyph: '🔥',
    env: 'VITE_FIRMS_KEY',
    url: 'https://firms.modaps.eosdis.nasa.gov/api/map_key/',
    blurb:
      'Wildfires already work key-less but cover the US only (NASA EONET). A free NASA FIRMS key adds dense GLOBAL VIIRS thermal detections.',
    present: !!getKey('VITE_FIRMS_KEY'),
  },
  {
    layer: 'Air quality (global)',
    glyph: '🫁',
    env: 'VITE_WAQI_KEY',
    url: 'https://aqicn.org/data-platform/token/',
    blurb:
      'Worldwide air-quality index stations (PM2.5 / AQI). Free instant token from the World Air Quality Index project.',
    present: !!getKey('VITE_WAQI_KEY'),
  },
  {
    layer: 'Global webcams',
    glyph: '📷',
    env: 'VITE_WINDY_KEY',
    url: 'https://api.windy.com/keys',
    blurb:
      'Adds tens of thousands of WORLDWIDE webcams to the camera gallery (searchable by country/region) on top of the key-less US traffic cams.',
    present: !!getKey('VITE_WINDY_KEY'),
  },
]

export default function KeySetup({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="ks-overlay" onClick={onClose}>
      <div className="ks-card" onClick={(e) => e.stopPropagation()}>
        <div className="ks-head">
          <div>
            <span className="ks-kicker">OPTIONAL · FREE</span>
            <h2>Unlock extra layers</h2>
          </div>
          <button className="cg-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="ks-intro">
          Everything else runs key-less. These {KEYS.length} layers need a free
          key (no payment, ~1 minute each). Keys are stored only on your machine.
        </p>

        {KEYS.map((k) => (
          <div className="ks-row" key={k.env}>
            <span className="ks-glyph">{k.glyph}</span>
            <div className="ks-body">
              <div className="ks-row-head">
                <b>{k.layer}</b>
                <span className={`ks-status ${k.present ? 'on' : 'off'}`}>
                  {k.present ? '✓ key detected' : 'no key'}
                </span>
              </div>
              <p>{k.blurb}</p>
              <div className="ks-step">
                <a href={k.url} target="_blank" rel="noreferrer">
                  ① Get free key ↗
                </a>
                <code>② paste as {k.env}</code>
              </div>
            </div>
          </div>
        ))}

        <div className="ks-foot">
          <b>Where:</b> create / edit{' '}
          <code>.env.local</code> in the project root, add the line(s) above,
          then restart the dev server. The file is gitignored, so keys are never
          committed. Note: for <i>local use</i> they stay on this machine — but
          a packaged build inlines <code>VITE_</code> vars, so don't distribute a
          build with keys baked in (load them at runtime instead).
        </div>
      </div>
    </div>
  )
}
