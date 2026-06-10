import { useEffect, useRef, useState } from 'react'
import type { Briefing } from '../briefing'
import { forecastOutlook, ollamaModel } from '../operator'
import Markdown from './Markdown'

interface Props {
  briefing: Briefing | null
  onClose: () => void
  getContext: () => string
}

export default function BriefingModal({ briefing, onClose, getContext }: Props) {
  const [outlook, setOutlook] = useState<{
    busy?: boolean
    text?: string
    err?: string
  } | null>(null)
  const ranRef = useRef(false)

  const run = async () => {
    setOutlook({ busy: true })
    const model = await ollamaModel()
    if (!model) {
      setOutlook({ err: 'Local model not ready (Ollama).' })
      return
    }
    const text = await forecastOutlook(model, getContext())
    setOutlook(text ? { text } : { err: 'Operator unreachable.' })
  }

  // Auto-run the forward forecast once each time the briefing opens.
  useEffect(() => {
    if (!briefing) {
      ranRef.current = false
      setOutlook(null)
      return
    }
    if (ranRef.current) return
    ranRef.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefing])

  if (!briefing) return null
  const exportMd = () => {
    const md =
      `# VANTAGE Daily Briefing — ${briefing.date}\n\n` +
      `**${briefing.headline}**\n\n` +
      briefing.bullets.map((b) => `- ${b}`).join('\n') +
      `\n\n## Hotspots\n` +
      briefing.hotspots.map((h) => `- ${h.country}: ${h.count}`).join('\n') +
      (outlook?.text ? `\n\n## Forecast — next 24-72h\n${outlook.text}\n` : '') +
      '\n'
    const blob = new Blob([md], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vantage-briefing-${briefing.date.replace(/\W+/g, '-')}.md`
    a.click()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card brief" onClick={(e) => e.stopPropagation()}>
        <div className="brief-top">
          <div>
            <span className="brief-kicker">DAILY BRIEFING</span>
            <h2>{briefing.date}</h2>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="brief-headline">{briefing.headline}</p>
        <ul className="brief-bullets">
          {briefing.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>

        <div className="brief-outlook">
          <div className="bo-head">
            <span className="brief-kicker">📡 FORECAST · NEXT 24-72H</span>
            {!outlook?.busy && (
              <button className="bo-rerun" onClick={run}>
                {outlook?.text ? '↻' : 'run'}
              </button>
            )}
          </div>
          {outlook?.busy && <div className="bo-busy">◍ forecasting…</div>}
          {outlook?.err && <div className="bo-err">⚠ {outlook.err}</div>}
          {outlook?.text && (
            <div className="bo-body">
              <Markdown text={outlook.text} />
            </div>
          )}
        </div>

        <div className="brief-hot">
          <span className="brief-kicker">TOP HOTSPOTS</span>
          {briefing.hotspots.map((h) => (
            <div className="hot-row" key={h.country}>
              <span>{h.country}</span>
              <span className="hot-count">{h.count}</span>
            </div>
          ))}
        </div>
        <button className="export" onClick={exportMd}>
          ⬇ EXPORT MARKDOWN
        </button>
      </div>
    </div>
  )
}
