import { useEffect, useRef, useState } from 'react'
import { askOperator, ollamaModel, type ChatMsg } from '../operator'
import { entityTitle, type Camera, type Entity } from '../layers'
import { findPlace } from '../gazetteer'
import { fetchCameras } from '../cameras'
import {
  nearestCameras,
  camsMatchingText,
  mightHaveCams,
  scanCameras,
} from '../vision'
import Markdown from './Markdown'

interface Props {
  getContext: () => string
  cameras: Camera[]
  focus?: { entity: Entity; n: number } | null
  entityContext?: (e: Entity) => string
}

export default function OperatorChat({
  getContext,
  cameras,
  focus,
  entityContext,
}: Props) {
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [camStatus, setCamStatus] = useState('')
  const [input, setInput] = useState('')
  const camerasRef = useRef(cameras)
  useEffect(() => {
    camerasRef.current = cameras
  }, [cameras])
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        'VANTAGE Operator online. Ask me to assess the situation, a region, or the markets. Ask about a place with live cameras nearby and I’ll pull a visual check before answering. Or click any tracked entity → “Ask Operator”.',
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
    // Agentic tool-use: if the question names a place we have live cameras
    // near, pull a vision sitrep from them and fold it into the model's context
    // so the answer reflects CURRENT ground truth, not just the feed counts.
    let camNote = ''
    const place = findPlace(text)
    const wantCams = !!place || mightHaveCams(text)
    // Use the layer's cameras if loaded; otherwise fetch the keyless set on
    // demand (cached) so the check works even with the camera layer off.
    let camList = camerasRef.current
    if (wantCams && !camList.length) {
      setCamStatus('📷 loading cameras…')
      try {
        camList = await fetchCameras()
        camerasRef.current = camList
      } catch {
        camList = []
      }
    }
    // Prefer cameras whose own region/name matches the question (covers the
    // cities our cams cover); fall back to whatever's geographically nearest a
    // gazetteer place (covers conflict zones that happen to have cams nearby).
    let cams = camsMatchingText(text, camList, 3)
    if (!cams.length && place) {
      cams = nearestCameras(camList, place.lat, place.lng, 3, 200)
    }
    const label = cams.length
      ? cams[0].region || cams[0].name || place?.place || 'the area'
      : ''
    if (cams.length) {
      setCamStatus(`📷 checking ${cams.length} live cameras near ${label}…`)
      const { result } = await scanCameras(cams, label, (s) =>
        setCamStatus(`📷 ${label}: ${s}`),
      )
      setCamStatus('')
      if (result && !result.startsWith('⚠') && !/no cameras/i.test(result)) {
        camNote = `LIVE CAMERA CHECK near ${label} (${cams.length} feed${
          cams.length > 1 ? 's' : ''
        }, just now):\n${result}`
      }
    }

    const history = next.filter((x) => x.role !== 'system').slice(-8)
    const parts = [getContext(), camNote, extraContext].filter(Boolean)
    const reply = await askOperator(m, history, parts.join('\n\n'))
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
            <button
              className="op-close"
              onClick={() => setOpen(false)}
              aria-label="Close operator chat"
            >
              ✕
            </button>
          </div>
          <div className="op-body">
            {msgs.map((m, i) => (
              <div key={i} className={`op-msg ${m.role}`}>
                {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              </div>
            ))}
            {busy && (
              <div className="op-msg assistant dim">
                {camStatus || 'analyzing…'}
              </div>
            )}
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
