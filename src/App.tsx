import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conflictByCountry, deriveStats, fetchAll, type GeoEvent } from './feeds'
import { fetchMarkets, type Quote } from './markets'
import { fetchAircraft } from './aircraft'
import { fetchCameras } from './cameras'
import { fetchFires, firesEnabled } from './fires'
import { connectShips, disconnectShips, getShips, shipsEnabled } from './ships'
import { fetchRadarFrame, type RadarFrame } from './weather'
import {
  LAYERS,
  type Aircraft,
  type Camera,
  type Entity,
  type Fire,
  type LayerId,
  type Ship,
} from './layers'
import {
  buildBriefing,
  entityContext,
  situationContext,
  type Briefing,
} from './briefing'
import GlobeView from './components/GlobeView'
import PulseFeed from './components/PulseFeed'
import RightRail from './components/RightRail'
import Ticker from './components/Ticker'
import OperatorChat from './components/OperatorChat'
import BriefingModal from './components/BriefingModal'
import LayerPanel from './components/LayerPanel'
import Dossier from './components/Dossier'
import CameraGallery from './components/CameraGallery'
import Launcher from './components/Launcher'
import KeySetup from './components/KeySetup'
import './App.css'
import './layers.css'

const REFRESH_MS = 120_000

const DEFAULT_ON = new Set<LayerId>(
  LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
)

export default function App() {
  const [events, setEvents] = useState<GeoEvent[]>([])
  const [markets, setMarkets] = useState<Quote[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [ships, setShips] = useState<Ship[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [fires, setFires] = useState<Fire[]>([])
  const [radar, setRadar] = useState<RadarFrame | null>(null)
  const [active, setActive] = useState<Set<LayerId>>(DEFAULT_ON)
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState(0)
  const [selected, setSelected] = useState<Entity | null>(null)
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [gallery, setGallery] = useState(false)
  const [keySetup, setKeySetup] = useState(false)
  const [focus, setFocus] = useState<{ entity: Entity; n: number } | null>(null)
  const [viewers] = useState(() => 90 + Math.floor(Math.random() * 60))
  const askN = useRef(0)

  const on = useCallback((id: LayerId) => active.has(id), [active])

  const load = useCallback(async () => {
    setLoading(true)
    const [ev, mk] = await Promise.all([fetchAll(), fetchMarkets()])
    setEvents(ev)
    setMarkets(mk)
    setUpdated(Date.now())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  // Aircraft (ADS-B) — fast cadence while the layer is on.
  useEffect(() => {
    if (!on('aircraft')) {
      setAircraft([])
      return
    }
    let alive = true
    const pull = () => fetchAircraft().then((p) => alive && setAircraft(p))
    pull()
    const t = setInterval(pull, 20_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [on])

  // Traffic cameras — positions are static; refresh occasionally.
  useEffect(() => {
    if (!on('camera')) {
      setCameras([])
      return
    }
    let alive = true
    const pull = () => fetchCameras().then((c) => alive && setCameras(c))
    pull()
    const t = setInterval(pull, 300_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [on])

  // Wildfires (FIRMS) — key-gated.
  useEffect(() => {
    if (!on('fire') || !firesEnabled()) {
      setFires([])
      return
    }
    let alive = true
    const pull = () => fetchFires().then((f) => alive && setFires(f))
    pull()
    const t = setInterval(pull, 600_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [on])

  // Vessels (AIS) — key-gated websocket stream; snapshot on a timer.
  useEffect(() => {
    if (!on('ship') || !shipsEnabled()) {
      setShips([])
      return
    }
    connectShips()
    const t = setInterval(() => setShips(getShips()), 8_000)
    return () => {
      clearInterval(t)
      disconnectShips()
    }
  }, [on])

  // Weather radar frame.
  useEffect(() => {
    if (!on('weather')) {
      setRadar(null)
      return
    }
    let alive = true
    const pull = () => fetchRadarFrame().then((f) => alive && setRadar(f))
    pull()
    const t = setInterval(pull, 300_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [on])

  const intensity = useMemo(() => conflictByCountry(events), [events])
  const stats = useMemo(() => deriveStats(events), [events])

  // Events filtered by active layer (conflict / quake / disaster).
  const shownEvents = useMemo(
    () => events.filter((e) => active.has(e.kind as LayerId)),
    [events, active],
  )

  // On the GLOBE, only plot conflict that's located to a real place — drop the
  // publisher-country fallbacks so they don't litter the US/UK with dots that
  // collide with the heatmap. (The pulse feed still lists them all.)
  const globeEvents = useMemo(
    () => shownEvents.filter((e) => e.kind !== 'conflict' || e.precise),
    [shownEvents],
  )

  // Icon entities filtered by active layer.
  const markers = useMemo<Entity[]>(() => {
    const out: Entity[] = []
    if (on('aircraft')) out.push(...aircraft)
    if (on('ship')) out.push(...ships)
    if (on('camera')) out.push(...cameras)
    if (on('fire')) out.push(...fires)
    return out
  }, [on, aircraft, ships, cameras, fires])

  const counts = useMemo(() => {
    const c = {} as Record<LayerId, number>
    c.conflict = events.filter((e) => e.kind === 'conflict').length
    c.quake = events.filter((e) => e.kind === 'quake').length
    c.disaster = events.filter((e) => e.kind === 'disaster').length
    c.aircraft = aircraft.length
    c.ship = ships.length
    c.camera = cameras.length
    c.fire = fires.length
    c.weather = radar ? 1 : 0
    return c
  }, [events, aircraft, ships, cameras, fires, radar])

  const keyMissing = useMemo(() => {
    const s = new Set<LayerId>()
    if (!firesEnabled()) s.add('fire')
    if (!shipsEnabled()) s.add('ship')
    return s
  }, [])

  const toggle = (id: LayerId) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openBriefing = () => setBriefing(buildBriefing(events, markets))
  const getContext = useCallback(
    () =>
      situationContext(events, markets, {
        aircraft: on('aircraft') ? aircraft : [],
        ships: on('ship') ? ships : [],
        cameras: on('camera') ? cameras : [],
        fires: on('fire') ? fires : [],
        weatherOn: on('weather'),
      }),
    [events, markets, on, aircraft, ships, cameras, fires],
  )

  const askAbout = (e: Entity) => {
    askN.current += 1
    setFocus({ entity: e, n: askN.current })
  }

  // Opening the camera gallery auto-enables the Traffic Cams layer so feeds load.
  const openCameras = () => {
    setActive((prev) => {
      if (prev.has('camera')) return prev
      const next = new Set(prev)
      next.add('camera')
      return next
    })
    setGallery(true)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▲</span>
          <h1>VANTAGE</h1>
          <span className="brand-sub">GLOBAL CONFLICT INTELLIGENCE</span>
        </div>
        <div className="top-stats">
          <div className="tstat">
            <b className="active">{stats.active}</b>
            <span>ACTIVE</span>
          </div>
          <div className="tstat">
            <b className="tension">{stats.tensions}</b>
            <span>TENSIONS</span>
          </div>
          <div className="tstat">
            <b className="up">{aircraft.length}</b>
            <span>AIR TRACKS</span>
          </div>
        </div>
        <nav className="topnav">
          <span className="live">● LIVE</span>
          <span className="viewers">👁 {viewers}</span>
          <button className="navbtn" onClick={openCameras}>
            📷 CAMS
          </button>
          <button className="navbtn" onClick={openBriefing}>
            ◫ BRIEFING
          </button>
          <button className="navbtn" onClick={load} disabled={loading}>
            ↻ {loading ? 'SYNC…' : 'REFRESH'}
          </button>
          <Launcher />
        </nav>
      </header>

      <Ticker events={events} />

      <main className="grid">
        <PulseFeed
          events={events}
          updated={updated}
          onOpenBriefing={openBriefing}
          onSelect={setSelected}
        />

        <section className="center">
          <GlobeView
            events={globeEvents}
            markers={markers}
            intensity={intensity}
            radar={radar}
            onSelect={setSelected}
          />
          <LayerPanel
            active={active}
            counts={counts}
            keyMissing={keyMissing}
            onToggle={toggle}
            onKeySetup={() => setKeySetup(true)}
          />
          {selected && (
            <Dossier
              entity={selected}
              onClose={() => setSelected(null)}
              onAsk={askAbout}
            />
          )}
          <div className="botbar">
            <span className="bb-item">
              <b className="up">{shownEvents.length + markers.length}</b> SIGNALS
            </span>
            <span className="bb-item">
              <b className="active">{stats.active}</b> ACTIVE
            </span>
            <span className="bb-item">
              ✈ <b>{aircraft.length}</b> AIR
            </span>
            <span className="bb-src">
              GDELT · USGS · EONET · ADS-B · FIRMS · AIS · CALTRANS · RAINVIEWER · STOOQ
            </span>
          </div>
        </section>

        <RightRail quotes={markets} getContext={getContext} />
      </main>

      <OperatorChat
        getContext={getContext}
        focus={focus}
        entityContext={entityContext}
      />
      <BriefingModal briefing={briefing} onClose={() => setBriefing(null)} />
      <CameraGallery
        cameras={cameras}
        open={gallery}
        onClose={() => setGallery(false)}
      />
      <KeySetup open={keySetup} onClose={() => setKeySetup(false)} />
    </div>
  )
}
