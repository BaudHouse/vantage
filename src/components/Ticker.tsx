import type { GeoEvent } from '../feeds'
import { safeUrl } from '../safe'

function ago(t: number): string {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  return `${h}h`
}

const FLAG: Record<string, string> = {
  Ukraine: '🇺🇦', Russia: '🇷🇺', Israel: '🇮🇱', Iran: '🇮🇷', 'United States': '🇺🇸',
  Syria: '🇸🇾', Iraq: '🇮🇶', Yemen: '🇾🇪', Sudan: '🇸🇩', China: '🇨🇳',
  Lebanon: '🇱🇧', Pakistan: '🇵🇰', India: '🇮🇳', Myanmar: '🇲🇲', Somalia: '🇸🇴',
}

export default function Ticker({ events }: { events: GeoEvent[] }) {
  const items = events
    .filter((e) => e.kind === 'conflict')
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 14)

  if (!items.length) return null

  return (
    <div className="ticker">
      <span className="ticker-tag">● LATEST</span>
      <div className="ticker-track">
        <div className="ticker-run">
          {[...items, ...items].map((e, i) => (
            <a
              key={i}
              className="ticker-item"
              href={safeUrl(e.url) ?? '#'}
              target="_blank"
              rel="noreferrer"
            >
              <span className="tf">{FLAG[e.country ?? ''] ?? '🌐'}</span>
              {e.title.toUpperCase()}
              <em>{ago(e.time)}</em>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
