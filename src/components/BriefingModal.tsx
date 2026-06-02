import type { Briefing } from '../briefing'

interface Props {
  briefing: Briefing | null
  onClose: () => void
}

export default function BriefingModal({ briefing, onClose }: Props) {
  if (!briefing) return null
  const exportMd = () => {
    const md =
      `# VANTAGE Daily Briefing — ${briefing.date}\n\n` +
      `**${briefing.headline}**\n\n` +
      briefing.bullets.map((b) => `- ${b}`).join('\n') +
      `\n\n## Hotspots\n` +
      briefing.hotspots.map((h) => `- ${h.country}: ${h.count}`).join('\n') +
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
