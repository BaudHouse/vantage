import { useMemo, useState } from 'react'
import { computeAlerts } from '../watchlist'

interface Props {
  open: boolean
  onClose: () => void
  watch: string[]
  intensity: Record<string, number>
  baseline: Record<string, number>
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onAck: () => void
  notifyOn: boolean
  onToggleNotify: () => void
}

export default function WatchlistModal({
  open,
  onClose,
  watch,
  intensity,
  baseline,
  onAdd,
  onRemove,
  onAck,
  notifyOn,
  onToggleNotify,
}: Props) {
  const [q, setQ] = useState('')
  const alerts = useMemo(
    () => computeAlerts(watch, intensity, baseline),
    [watch, intensity, baseline],
  )
  const alertByName = useMemo(
    () => new Map(alerts.map((a) => [a.name, a])),
    [alerts],
  )

  // Countries with current conflict activity that aren't already watched.
  const candidates = useMemo(() => {
    const term = q.trim().toLowerCase()
    return Object.entries(intensity)
      .filter(([name, v]) => v > 0 && !watch.includes(name))
      .filter(([name]) => !term || name.toLowerCase().includes(term))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
  }, [intensity, watch, q])

  if (!open) return null

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="watch-card"
        role="dialog"
        aria-modal="true"
        aria-label="Watchlist"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="watch-head">
          <div>
            <span className="watch-kicker">WATCHLIST</span>
            <h2>Pinned regions &amp; spike alerts</h2>
          </div>
          <button className="x" onClick={onClose} aria-label="Close watchlist">
            ✕
          </button>
        </div>

        <button
          className={`watch-notify ${notifyOn ? 'on' : ''}`}
          onClick={onToggleNotify}
          aria-pressed={notifyOn}
        >
          <span>🔔 Desktop alerts on spikes</span>
          <span className="watch-toggle">{notifyOn ? 'ON' : 'OFF'}</span>
        </button>

        {watch.length === 0 ? (
          <div className="watch-empty">
            Nothing pinned yet. Add a region below to get alerted when its
            conflict activity rises.
          </div>
        ) : (
          <>
            <div className="watch-rows">
              {watch.map((name) => {
                const cur = intensity[name] ?? 0
                const al = alertByName.get(name)
                return (
                  <div
                    className={`watch-row ${al ? 'alerting' : ''}`}
                    key={name}
                  >
                    <span className="watch-name">
                      {al ? '🔴' : '🟢'} {name}
                    </span>
                    <span className="watch-stat">
                      <b>{cur}</b> rpt/24h
                      {al && <em className="watch-delta">▲{al.delta}</em>}
                    </span>
                    <button
                      className="watch-rm"
                      onClick={() => onRemove(name)}
                      aria-label={`Stop watching ${name}`}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
            {alerts.length > 0 && (
              <button className="watch-ack" onClick={onAck}>
                ✓ Mark {alerts.length} alert{alerts.length > 1 ? 's' : ''} as
                seen
              </button>
            )}
          </>
        )}

        <div className="watch-add">
          <div className="watch-sub">ADD A REGION (active conflict zones)</div>
          <input
            className="search"
            placeholder="Filter countries…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="watch-cands">
            {candidates.map(([name, v]) => (
              <button
                key={name}
                className="watch-cand"
                onClick={() => onAdd(name)}
              >
                <span>{name}</span>
                <em>{v}</em>
              </button>
            ))}
            {!candidates.length && (
              <div className="watch-empty">
                {q ? 'No match.' : 'No active conflict zones to add right now.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
