import { useEffect, useRef, useState } from 'react'

interface Tool {
  name: string
  desc: string
  glyph: string
  url: string
  current?: boolean
}

const TOOLS: Tool[] = [
  { name: 'Vantage', desc: 'Global conflict intelligence', glyph: '▲', url: '/', current: true },
  { name: 'MiroFish', desc: 'Agent-swarm forecasts', glyph: '🐟', url: 'http://localhost:5275' },
  { name: 'WiFi Sense', desc: 'In-home presence mapping', glyph: '📡', url: 'http://localhost:8731' },
]

export default function Launcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="launcher" ref={ref}>
      <button className="navbtn launch-btn" onClick={() => setOpen((o) => !o)}>
        ⊞ TOOLS
      </button>
      {open && (
        <div className="launch-menu">
          <div className="launch-head">LOCAL TOOLKIT</div>
          {TOOLS.map((t) => (
            <a
              key={t.name}
              className={`launch-item ${t.current ? 'current' : ''}`}
              href={t.url}
              target={t.current ? undefined : '_blank'}
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <span className="li-glyph">{t.glyph}</span>
              <span className="li-text">
                <b>{t.name}</b>
                <span>{t.desc}</span>
              </span>
              {t.current ? (
                <span className="li-here">here</span>
              ) : (
                <span className="li-go">↗</span>
              )}
            </a>
          ))}
          <div className="launch-foot">
            MiroFish & WiFi must be running locally to open.
          </div>
        </div>
      )}
    </div>
  )
}
