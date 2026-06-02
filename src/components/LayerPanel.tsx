import { LAYERS, type LayerId } from '../layers'

interface Props {
  active: Set<LayerId>
  counts: Record<LayerId, number>
  keyMissing: Set<LayerId>
  onToggle: (id: LayerId) => void
}

export default function LayerPanel({
  active,
  counts,
  keyMissing,
  onToggle,
}: Props) {
  return (
    <div className="layer-panel">
      <div className="lp-head">LAYERS</div>
      {LAYERS.map((l) => {
        const on = active.has(l.id)
        const missing = keyMissing.has(l.id)
        return (
          <button
            key={l.id}
            className={`lp-row ${on ? 'on' : ''}`}
            onClick={() => onToggle(l.id)}
            title={
              missing
                ? `Needs a free ${l.needsKey} in .env.local`
                : `Toggle ${l.label}`
            }
          >
            <span className="lp-glyph" style={{ color: l.color }}>
              {l.glyph}
            </span>
            <span className="lp-label">{l.label}</span>
            {missing ? (
              <span className="lp-key">key</span>
            ) : (
              <span className="lp-count">{counts[l.id] ?? 0}</span>
            )}
            <span className={`lp-dot ${on ? 'on' : ''}`} />
          </button>
        )
      })}
    </div>
  )
}
