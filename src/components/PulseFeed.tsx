import { useMemo, useState } from 'react'
import type { EventKind, GeoEvent } from '../feeds'

type Filter = 'all' | EventKind

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'conflict', label: 'CONFLICT' },
  { id: 'quake', label: 'SEISMIC' },
  { id: 'disaster', label: 'DISASTER' },
]

function ago(t: number): string {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`
}

// Deterministic pseudo-confidence so cards feel like the real product.
function confidence(e: GeoEvent): number {
  if (e.kind === 'conflict') return Math.min(98, 70 + (e.count ?? 1) * 4)
  if (e.kind === 'quake') return Math.round(80 + e.weight * 18)
  return 75
}

interface Props {
  events: GeoEvent[]
  updated: number
  onOpenBriefing: () => void
  onSelect: (e: GeoEvent) => void
}

export default function PulseFeed({
  events,
  updated,
  onOpenBriefing,
  onSelect,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [votes, setVotes] = useState<Record<string, number>>({})

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return events
      .filter((e) => filter === 'all' || e.kind === filter)
      .filter(
        (e) =>
          !term ||
          e.title.toLowerCase().includes(term) ||
          e.detail.toLowerCase().includes(term),
      )
      .sort((a, b) => b.time - a.time || b.weight - a.weight)
      .slice(0, 60)
  }, [events, filter, q])

  const vote = (id: string, d: number) =>
    setVotes((v) => ({ ...v, [id]: (v[id] ?? 0) + d }))

  return (
    <aside className="pulse">
      <button className="briefing-btn" onClick={onOpenBriefing}>
        📄 DAILY BRIEFING
      </button>

      <div className="pulse-head">
        <span className="ph-title">⚡ PULSE FEED</span>
        <span className="ph-time">
          {updated ? new Date(updated).toLocaleTimeString() : '—'}
        </span>
      </div>

      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <input
        className="search"
        placeholder="Search signal…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="cards">
        {list.map((e) => {
          const conf = confidence(e)
          const v = votes[e.id] ?? 0
          return (
            <div className={`card-ev card-${e.kind}`} key={e.id}>
              <div className="ce-top">
                <span className={`sev sev-${e.kind}`}>
                  {e.kind === 'conflict'
                    ? 'HIGH'
                    : e.kind === 'quake'
                      ? 'SEISMIC'
                      : 'NATURAL'}
                </span>
                <span className="ce-ago">{ago(e.time)}</span>
              </div>
              <button className="ce-title" onClick={() => onSelect(e)}>
                {e.title}
              </button>
              <div className="ce-detail">{e.detail}</div>
              <div className="ce-bottom">
                <span className="conf">✓ CONFIDENCE {conf}%</span>
                <div className="vote">
                  <button onClick={() => vote(e.id, 1)}>▲</button>
                  <span>{v}</span>
                  <button onClick={() => vote(e.id, -1)}>▼</button>
                </div>
              </div>
            </div>
          )
        })}
        {!list.length && <div className="empty">No signal in this filter.</div>}
      </div>
    </aside>
  )
}
