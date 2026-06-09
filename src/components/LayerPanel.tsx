import { useState } from 'react'
import { LAYERS, type LayerId } from '../layers'
import { loadUi, saveUi } from '../uiprefs'

interface Props {
  active: Set<LayerId>
  counts: Record<LayerId, number>
  keyMissing: Set<LayerId>
  onToggle: (id: LayerId) => void
  onKeySetup: () => void
}

// Calmer grouping so the panel reads as a few short lists instead of a
// wall of 15 toggles. Order within a group is roughly by signal volume.
const GROUPS: { title: string; ids: LayerId[] }[] = [
  { title: 'Conflict', ids: ['conflict', 'hazard', 'alert'] },
  { title: 'Earth', ids: ['quake', 'volcano', 'disaster', 'storm', 'fire', 'radiation'] },
  { title: 'Movement', ids: ['aircraft', 'satellite', 'ship', 'camera'] },
  { title: 'Environment', ids: ['airquality', 'weather'] },
]

export default function LayerPanel({
  active,
  counts,
  keyMissing,
  onToggle,
  onKeySetup,
}: Props) {
  const [open, setOpen] = useState(() => loadUi().layers)
  const toggleOpen = () =>
    setOpen((v) => {
      saveUi({ layers: !v })
      return !v
    })
  const byId = (id: LayerId) => LAYERS.find((l) => l.id === id)

  return (
    <div className={`layer-panel ${open ? '' : 'collapsed'}`}>
      <div className="lp-head">
        <button
          className="lp-collapse"
          onClick={toggleOpen}
          title={open ? 'Collapse layers' : 'Expand layers'}
          aria-label={open ? 'Collapse layer panel' : 'Expand layer panel'}
          aria-expanded={open}
        >
          <span className={`lp-chev ${open ? 'open' : ''}`}>▸</span>
          LAYERS
          {!open && <em className="lp-on">· {active.size} on</em>}
        </button>
        <button
          className="lp-keys"
          onClick={onKeySetup}
          title="Unlock keyed layers"
          aria-label="Set up free API keys for keyed layers"
        >
          🔑
        </button>
      </div>

      {open &&
        GROUPS.map((g) => (
          <div className="lp-group" key={g.title}>
            <div className="lp-group-title">{g.title}</div>
            {g.ids.map((id) => {
              const l = byId(id)
              if (!l) return null
              const on = active.has(l.id)
              const missing = keyMissing.has(l.id)
              return (
                <button
                  key={l.id}
                  className={`lp-row ${on ? 'on' : ''}`}
                  onClick={() => (missing ? onKeySetup() : onToggle(l.id))}
                  title={
                    missing
                      ? `Needs a free ${l.needsKey} — click to set up`
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
        ))}
    </div>
  )
}
