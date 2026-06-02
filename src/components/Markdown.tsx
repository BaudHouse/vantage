import { type ReactNode } from 'react'

// Tiny, dependency-free Markdown renderer. Builds React nodes directly (no
// dangerouslySetInnerHTML) so LLM output can never inject HTML. Supports the
// subset models actually emit: headings, bold/italic/code, bullet & numbered
// lists, blockquotes, and paragraphs.

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Order matters: code first (so ** inside `code` is literal), then bold, italic.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyPrefix}-${i++}`
    if (tok.startsWith('`')) {
      nodes.push(<code key={key}>{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)
      if (mm) {
        nodes.push(
          <a key={key} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>,
        )
      }
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function Markdown({ text }: { text: string }) {
  const lines = (text ?? '').replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  let b = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${b++}`}>{inline(para.join(' '), `p${b}`)}</p>)
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i}>{inline(it, `li${b}-${i}`)}</li>
      ))
      blocks.push(
        list.ordered ? (
          <ol key={`l${b++}`}>{items}</ol>
        ) : (
          <ul key={`l${b++}`}>{items}</ul>
        ),
      )
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const quote = /^\s*>\s?(.*)$/.exec(line)

    if (h) {
      flushPara()
      flushList()
      const lvl = h[1].length
      const Tag = (`h${Math.min(4, lvl + 2)}` as 'h3' | 'h4' | 'h5' | 'h6')
      blocks.push(<Tag key={`h${b++}`}>{inline(h[2], `h${b}`)}</Tag>)
    } else if (bullet) {
      flushPara()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(bullet[1])
    } else if (num) {
      flushPara()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(num[1])
    } else if (quote) {
      flushPara()
      flushList()
      blocks.push(
        <blockquote key={`q${b++}`}>{inline(quote[1], `q${b}`)}</blockquote>,
      )
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()

  return <div className="md">{blocks}</div>
}
