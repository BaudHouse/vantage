import { useEffect, useRef, useState } from 'react'
import { askOperator, ollamaModel, type ChatMsg } from '../operator'
import { entityTitle, type Entity } from '../layers'
import Markdown from './Markdown'

interface Props {
  getContext: () => string
  focus?: { entity: Entity; n: number } | null
  entityContext?: (e: Entity) => string
}

export default function OperatorChat({
  getContext,
  focus,
  entityContext,
}: Props) {
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        'VANTAGE Operator online. Ask me to assess the current situation, a region, the markets, or click any tracked entity → “Ask Operator”.',
    },
  ])
  const endRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef(msgs)
  const modelRef = useRef(model)
  useEffect(() => {
    msgsRef.current = msgs
  }, [msgs])
  useEffect(() => {
    modelRef.current = model
  }, [model])

  useEffect(() => {
    if (!open) return
    ollamaModel().then((m) => {
      setModel(m)
      setChecked(true)
    })
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  const runTurn = async (text: string, extraContext = '') => {
    const base = msgsRef.current
    const next: ChatMsg[] = [...base, { role: 'user', content: text }]
    setMsgs(next)
    setBusy(true)
    let m = modelRef.current
    if (!m) {
      m = await ollamaModel()
      if (m) setModel(m)
    }
    if (!m) {
      setMsgs([
        ...next,
        {
          role: 'assistant',
          content:
            '⚠ Local model not ready yet. Once `ollama list` shows qwen2.5:14b I’ll come online automatically.',
        },
      ])
      setBusy(false)
      return
    }
    const history = next.filter((x) => x.role !== 'system').slice(-8)
    const context = extraContext
      ? `${getContext()}\n\n${extraContext}`
      : getContext()
    const reply = await askOperator(m, history, context)
    setMsgs([
      ...next,
      {
        role: 'assistant',
        content:
          reply ?? '⚠ Operator unreachable. Is Ollama running? (`ollama serve`)',
      },
    ])
    setBusy(false)
  }

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    void runTurn(text)
  }

  // "Ask Operator about this" from the dossier.
  useEffect(() => {
    if (!focus) return
    setOpen(true)
    const e = focus.entity
    const q = `Assess this ${e.kind}: ${entityTitle(e)}. What does it imply, and is anything anomalous?`
    void runTurn(q, entityContext?.(e) ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n])

  return (
    <>
      <button className="op-fab" onClick={() => setOpen((o) => !o)}>
        {open ? '✕' : '◉ OPERATOR'}
      </button>

      {open && (
        <div className="op-panel">
          <div className="op-head">
            <b>◉ OPERATOR CHAT</b>
            <span className={`op-status ${model ? 'on' : 'off'}`}>
              {!checked ? 'connecting…' : model ? model : 'model loading'}
            </span>
          </div>
          <div className="op-body">
            {msgs.map((m, i) => (
              <div key={i} className={`op-msg ${m.role}`}>
                {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              </div>
            ))}
            {busy && <div className="op-msg assistant dim">analyzing…</div>}
            <div ref={endRef} />
          </div>
          <div className="op-input">
            <input
              value={input}
              placeholder="Ask the analyst…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button onClick={send} disabled={busy}>
              ▶
            </button>
          </div>
        </div>
      )}
    </>
  )
}
