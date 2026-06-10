import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { conflictByCountry, deriveStats, fetchAll, type GeoEvent } from './feeds'
import { fetchMarkets, type Quote } from './markets'
import { fetchAircraft } from './aircraft'
import { fetchCameras } from './cameras'
import { fetchFires, firesEnabled } from './fires'
import { connectShips, disconnectShips, getShips, shipsEnabled } from './ships'
import { fetchRadarFrame, type RadarFrame } from './weather'
import {
  fetchHazards,
  fetchVolcanoes,
  fetchStorms,
  fetchRadiation,
  fetchWxAlerts,
  fetchSatellites,
  fetchEmscQuakes,
  fetchAirQuality,
  airQualityEnabled,
} from './morefeeds'
import {
  LAYERS,
  type Aircraft,
  type AirQuality,
  type Camera,
  type Entity,
  type Fire,
  type Hazard,
  type LayerId,
  type Radiation,
  type Satellite,
  type Ship,
  type Storm,
  type Volcano,
  type WxAlert,
} from './layers'
import {
  buildBriefing,
  entityContext,
  situationContext,
  type Briefing,
} from './briefing'
// Lazy-loaded: keeps three.js + react-globe.gl (the bulk of the bundle) out of
// the initial chunk so the shell + side rails paint immediately.
const GlobeView = lazy(() => import('./components/GlobeView'))
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
import ErrorBoundary from './components/ErrorBoundary'
import Markdown from './components/Markdown'
import TrendsModal from './components/TrendsModal'
import { nearestCameras, scanCameras } from './vision'
import { recordSnapshot, getTrends, TREND_METRICS } from './trends'
import { detectAnomalies } from './anomaly'
import WatchlistModal from './components/WatchlistModal'
import {
  loadWatch,
  saveWatch,
  loadBaseline,
  saveBaseline,
  computeAlerts,
  loadNotify,
  saveNotify,
} from './watchlist'
import {
  loadUi,
  saveUi,
  loadActiveLayers,
  saveActiveLayers,
  hintSeen,
  markHintSeen,
  type Density,
} from './uiprefs'
import './App.css'
import './layers.css'

const REFRESH_MS = 120_000

const DEFAULT_ON = new Set<LayerId>(
  LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
)
const VALID_LAYER_IDS = new Set<LayerId>(LAYERS.map((l) => l.id))

// Restore the operator's layer selection, falling back to defaults on a fresh
// browser. Unknown ids (from an older build) are filtered out.
function initialActiveLayers(): Set<LayerId> {
  const stored = loadActiveLayers()
  if (!stored) return DEFAULT_ON
  const valid = stored.filter((id): id is LayerId =>
    VALID_LAYER_IDS.has(id as LayerId),
  )
  return valid.length ? new Set(valid) : DEFAULT_ON
}

export default function App() {
  const [events, setEvents] = useState<GeoEvent[]>([])
  const [markets, setMarkets] = useState<Quote[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [ships, setShips] = useState<Ship[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [fires, setFires] = useState<Fire[]>([])
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [volcanoes, setVolcanoes] = useState<Volcano[]>([])
  const [storms, setStorms] = useState<Storm[]>([])
  const [radiation, setRadiation] = useState<Radiation[]>([])
  const [wxAlerts, setWxAlerts] = useState<WxAlert[]>([])
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [airQuality, setAirQuality] = useState<AirQuality[]>([])
  const [radar, setRadar] = useState<RadarFrame | null>(null)
  const [active, setActive] = useState<Set<LayerId>>(initialActiveLayers)
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState(0)
  const [selected, setSelected] = useState<Entity | null>(null)
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [gallery, setGallery] = useState(false)
  const [keySetup, setKeySetup] = useState(false)
  const [trendsOpen, setTrendsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [showHint, setShowHint] = useState(() => !hintSeen())
  const [watchOpen, setWatchOpen] = useState(false)
  const [watch, setWatch] = useState<string[]>(() => loadWatch())
  const [baseline, setBaseline] = useState<Record<string, number>>(() =>
    loadBaseline(),
  )
  const [notifyOn, setNotifyOn] = useState(() => loadNotify())
  const [leftOpen, setLeftOpen] = useState(() => loadUi().left)
  const [rightOpen, setRightOpen] = useState(() => loadUi().right)
  const [density, setDensity] = useState<Density>(() => loadUi().density)
  const [areaScan, setAreaScan] = useState<{
    lat: number
    lng: number
    busy?: boolean
    status?: string
    result?: string
    err?: string
  } | null>(null)
  const [focus, setFocus] = useState<{ entity: Entity; n: number } | null>(null)
  const [viewers] = useState(() => 90 + Math.floor(Math.random() * 60))
  const askN = useRef(0)

  // Persist workspace layout so a reload restores the operator's setup.
  useEffect(() => {
    saveUi({ left: leftOpen, right: rightOpen, density })
  }, [leftOpen, rightOpen, density])

  // Remember which layers are switched on across reloads.
  useEffect(() => {
    saveActiveLayers([...active])
  }, [active])

  const dismissHint = useCallback(() => {
    setShowHint(false)
    markHintSeen()
  }, [])

  // Auto-retire the onboarding hint after a while if it's ignored.
  useEffect(() => {
    if (!showHint) return
    const t = setTimeout(dismissHint, 14000)
    return () => clearTimeout(t)
  }, [showHint, dismissHint])

  // Focus mode = both rails hidden so the globe goes full-bleed.
  const focusMode = !leftOpen && !rightOpen
  const onToggleFocus = () => {
    const goFocus = leftOpen || rightOpen
    setLeftOpen(!goFocus)
    setRightOpen(!goFocus)
  }

  // Keyboard shortcuts: [ left rail · ] right rail · \ or f full-globe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') setLeftOpen((v) => !v)
      else if (e.key === ']') setRightOpen((v) => !v)
      else if (e.key === '\\' || e.key === 'f') {
        const goFocus = leftOpen || rightOpen
        setLeftOpen(!goFocus)
        setRightOpen(!goFocus)
      } else if (e.key === '?') setHelpOpen((v) => !v)
      else if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leftOpen, rightOpen])

  // Stable per-layer booleans so a polling effect only re-runs when ITS layer
  // toggles — not on every unrelated layer change (which would tear down and
  // reconnect the AIS websocket each time).
  const onAircraft = active.has('aircraft')
  const onCamera = active.has('camera')
  const onFire = active.has('fire')
  const onShip = active.has('ship')
  const onWeather = active.has('weather')
  const onHazard = active.has('hazard')
  const onVolcano = active.has('volcano')
  const onStorm = active.has('storm')
  const onAlert = active.has('alert')
  const onRadiation = active.has('radiation')
  const onSatellite = active.has('satellite')
  const onAirQuality = active.has('airquality')

  const load = useCallback(async () => {
    setLoading(true)
    const [ev, mk, emsc] = await Promise.all([
      fetchAll(),
      fetchMarkets(),
      fetchEmscQuakes(),
    ])
    // Merge EMSC quakes with USGS, de-duping near-identical events.
    const seen = new Set(ev.map((e) => `${e.lat.toFixed(1)},${e.lng.toFixed(1)}`))
    const extra = emsc.filter(
      (e) => !seen.has(`${e.lat.toFixed(1)},${e.lng.toFixed(1)}`),
    )
    setEvents([...ev, ...extra])
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
    if (!onAircraft) {
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
  }, [onAircraft])

  // Traffic cameras — positions are static; refresh occasionally.
  useEffect(() => {
    if (!onCamera) {
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
  }, [onCamera])

  // Wildfires (FIRMS) — key-gated.
  useEffect(() => {
    if (!onFire || !firesEnabled()) {
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
  }, [onFire])

  // Vessels (AIS) — key-gated websocket stream; snapshot on a timer.
  useEffect(() => {
    if (!onShip || !shipsEnabled()) {
      setShips([])
      return
    }
    connectShips()
    const t = setInterval(() => setShips(getShips()), 8_000)
    return () => {
      clearInterval(t)
      disconnectShips()
    }
  }, [onShip])

  // Weather radar frame.
  useEffect(() => {
    if (!onWeather) {
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
  }, [onWeather])

  // ---- expansion layers (free / key-less) ----
  useEffect(() => {
    if (!onHazard) return setHazards([]), undefined
    let alive = true
    const pull = () => fetchHazards().then((d) => alive && setHazards(d))
    pull()
    const t = setInterval(pull, 600_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onHazard])

  useEffect(() => {
    if (!onVolcano) return setVolcanoes([]), undefined
    let alive = true
    const pull = () => fetchVolcanoes().then((d) => alive && setVolcanoes(d))
    pull()
    const t = setInterval(pull, 600_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onVolcano])

  useEffect(() => {
    if (!onStorm) return setStorms([]), undefined
    let alive = true
    const pull = () => fetchStorms().then((d) => alive && setStorms(d))
    pull()
    const t = setInterval(pull, 600_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onStorm])

  useEffect(() => {
    if (!onAlert) return setWxAlerts([]), undefined
    let alive = true
    const pull = () => fetchWxAlerts().then((d) => alive && setWxAlerts(d))
    pull()
    const t = setInterval(pull, 300_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onAlert])

  useEffect(() => {
    if (!onRadiation) return setRadiation([]), undefined
    let alive = true
    const pull = () => fetchRadiation().then((d) => alive && setRadiation(d))
    pull()
    const t = setInterval(pull, 600_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onRadiation])

  // ISS — poll every 8s (wheretheiss rate-limits ~1/s; keep margin).
  useEffect(() => {
    if (!onSatellite) return setSatellites([]), undefined
    let alive = true
    const pull = () =>
      fetchSatellites().then((d) => alive && d.length && setSatellites(d))
    pull()
    const t = setInterval(pull, 8_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onSatellite])

  useEffect(() => {
    if (!onAirQuality || !airQualityEnabled()) return setAirQuality([]), undefined
    let alive = true
    const pull = () => fetchAirQuality().then((d) => alive && setAirQuality(d))
    pull()
    const t = setInterval(pull, 600_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [onAirQuality])

  const intensity = useMemo(() => conflictByCountry(events), [events])
  const stats = useMemo(() => deriveStats(events), [events])

  const watchAlerts = useMemo(
    () => computeAlerts(watch, intensity, baseline),
    [watch, intensity, baseline],
  )
  // Early-warning: abnormal spikes across any tracked metric, recomputed each
  // time the snapshot history grows.
  const anomalies = useMemo(
    () => detectAnomalies(getTrends(), TREND_METRICS),
    [updated],
  )
  // Pin a region; seed its baseline at the current level so only *future*
  // escalation alerts (you opted in knowing the current state).
  const addWatch = (name: string) => {
    setWatch((prev) => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      saveWatch(next)
      return next
    })
    setBaseline((prev) => {
      const next = { ...prev, [name]: intensity[name] ?? 0 }
      saveBaseline(next)
      return next
    })
  }
  const removeWatch = (name: string) => {
    setWatch((prev) => {
      const next = prev.filter((n) => n !== name)
      saveWatch(next)
      return next
    })
  }
  // Acknowledge: re-baseline every watched region to its current level.
  const ackWatch = () => {
    setBaseline(() => {
      const next: Record<string, number> = {}
      for (const n of watch) next[n] = intensity[n] ?? 0
      saveBaseline(next)
      return next
    })
  }

  // Fire a desktop notification the first time each region crosses into an
  // alerting state (cleared again once it drops out / is acknowledged).
  const notifiedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const live = new Set(watchAlerts.map((a) => a.name))
    for (const n of [...notifiedRef.current]) {
      if (!live.has(n)) notifiedRef.current.delete(n)
    }
    if (
      !notifyOn ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return
    for (const a of watchAlerts) {
      if (notifiedRef.current.has(a.name)) continue
      notifiedRef.current.add(a.name)
      try {
        new Notification('VANTAGE · conflict spike', {
          body: `${a.name}: ${a.current} reports/24h (▲${a.delta})`,
          tag: `vantage-${a.name}`,
        })
      } catch {
        /* notifications best-effort */
      }
    }
  }, [watchAlerts, notifyOn])

  // Same opt-in also pushes a notification when a NEW developing situation
  // (anomaly) is detected — early warning that reaches you, not just the panel.
  const notifiedAnomRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const live = new Set(anomalies.map((a) => a.key))
    for (const k of [...notifiedAnomRef.current]) {
      if (!live.has(k)) notifiedAnomRef.current.delete(k)
    }
    if (
      !notifyOn ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return
    for (const a of anomalies) {
      if (notifiedAnomRef.current.has(a.key)) continue
      notifiedAnomRef.current.add(a.key)
      try {
        new Notification('VANTAGE · developing situation', {
          body: `${a.label}: ${a.current} (${
            a.z >= 99 ? 'spike' : `${a.z}σ`
          }, ▲${a.pct}% vs baseline)`,
          tag: `vantage-anom-${a.key}`,
        })
      } catch {
        /* best-effort */
      }
    }
  }, [anomalies, notifyOn])

  // User-initiated: request OS permission, then enable spike notifications.
  const toggleNotify = async () => {
    if (notifyOn) {
      setNotifyOn(false)
      saveNotify(false)
      return
    }
    if (typeof Notification === 'undefined') return
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setNotifyOn(true)
      saveNotify(true)
    }
  }

  // Snapshot the global picture each refresh for the historical trends view.
  useEffect(() => {
    if (!updated) return
    recordSnapshot({
      active: stats.active,
      tensions: stats.tensions,
      quakes: events.filter((e) => e.kind === 'quake').length,
      hazards: hazards.length,
      storms: storms.length,
      fires: fires.length,
      aircraft: aircraft.length,
      ships: ships.length,
      alerts: wxAlerts.length,
      airquality: airQuality.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updated])

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
    if (onAircraft) out.push(...aircraft)
    if (onShip) out.push(...ships)
    if (onCamera) out.push(...cameras)
    if (onFire) out.push(...fires)
    if (onHazard) out.push(...hazards)
    if (onVolcano) out.push(...volcanoes)
    if (onStorm) out.push(...storms)
    if (onAlert) out.push(...wxAlerts)
    if (onRadiation) out.push(...radiation)
    if (onSatellite) out.push(...satellites)
    if (onAirQuality) out.push(...airQuality)
    return out
  }, [
    onAircraft, onShip, onCamera, onFire, onHazard, onVolcano, onStorm,
    onAlert, onRadiation, onSatellite, onAirQuality,
    aircraft, ships, cameras, fires, hazards, volcanoes, storms, wxAlerts,
    radiation, satellites, airQuality,
  ])

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
    c.hazard = hazards.length
    c.volcano = volcanoes.length
    c.storm = storms.length
    c.alert = wxAlerts.length
    c.radiation = radiation.length
    c.satellite = satellites.length
    c.airquality = airQuality.length
    return c
  }, [events, aircraft, ships, cameras, fires, radar, hazards, volcanoes, storms, wxAlerts, radiation, satellites, airQuality])

  const keyMissing = useMemo(() => {
    const s = new Set<LayerId>()
    if (!shipsEnabled()) s.add('ship')
    if (!airQualityEnabled()) s.add('airquality')
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
        aircraft: onAircraft ? aircraft : [],
        ships: onShip ? ships : [],
        cameras: onCamera ? cameras : [],
        fires: onFire ? fires : [],
        weatherOn: onWeather,
        hazards: onHazard ? hazards : [],
        storms: onStorm ? storms : [],
        volcanoes: onVolcano ? volcanoes : [],
        wxAlerts: onAlert ? wxAlerts : [],
        radiation: onRadiation ? radiation : [],
        satellites: onSatellite ? satellites : [],
        airQuality: onAirQuality ? airQuality : [],
      }),
    [
      events, markets, onAircraft, onShip, onCamera, onFire, onWeather,
      onHazard, onStorm, onVolcano, onAlert, onRadiation, onSatellite, onAirQuality,
      aircraft, ships, cameras, fires, hazards, storms, volcanoes, wxAlerts,
      radiation, satellites, airQuality,
    ],
  )

  const askAbout = (e: Entity) => {
    askN.current += 1
    setFocus({ entity: e, n: askN.current })
  }

  // Click an empty spot on the globe -> AI sitrep from the nearest cameras.
  const onGlobeClick = async (lat: number, lng: number) => {
    if (showHint) dismissHint()
    const near = nearestCameras(cameras, lat, lng, 4)
    if (!near.length) {
      setAreaScan({
        lat,
        lng,
        err: cameras.length
          ? 'No cameras within ~400 km of here.'
          : 'Toggle “Traffic + Global Cams” on, then click an area to scan it.',
      })
      return
    }
    const label = near[0].region || `${lat.toFixed(1)}, ${lng.toFixed(1)}`
    setAreaScan({ lat, lng, busy: true, status: 'locating cameras…' })
    const outcome = await scanCameras(near, label, (status) =>
      setAreaScan({ lat, lng, busy: true, status }),
    )
    setAreaScan({ lat, lng, ...outcome })
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
    <div className={`app density-${density}`}>
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
          <span className="nav-sep" />
          <button
            className={`navbtn icon ${focusMode ? 'on' : ''}`}
            onClick={onToggleFocus}
            title="Full-globe focus mode (f) — hide both side rails"
            aria-label="Toggle full-globe focus mode"
            aria-pressed={focusMode}
          >
            ⛶
          </button>
          <button
            className={`navbtn icon ${density === 'compact' ? 'on' : ''}`}
            onClick={() =>
              setDensity((d) => (d === 'cozy' ? 'compact' : 'cozy'))
            }
            title={
              density === 'cozy'
                ? 'Switch to compact density'
                : 'Switch to cozy density'
            }
            aria-label="Toggle compact density"
            aria-pressed={density === 'compact'}
          >
            ⇲
          </button>
          <button
            className="navbtn icon"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
          >
            ?
          </button>
          <span className="nav-sep" />
          <button className="navbtn" onClick={openCameras}>
            📷 CAMS
          </button>
          <button
            className={`navbtn ${anomalies.length ? 'alerting' : ''}`}
            onClick={() => setTrendsOpen(true)}
            title={
              anomalies.length
                ? `${anomalies.length} developing situation(s) detected`
                : 'Historical trends'
            }
          >
            📈 TRENDS
            {anomalies.length > 0 && (
              <span className="nav-badge">{anomalies.length}</span>
            )}
          </button>
          <button
            className={`navbtn ${watchAlerts.length ? 'alerting' : ''}`}
            onClick={() => setWatchOpen(true)}
          >
            ⭐ WATCH
            {watchAlerts.length > 0 && (
              <span className="nav-badge">{watchAlerts.length}</span>
            )}
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

      <main
        className="grid"
        style={{
          gridTemplateColumns: `${leftOpen ? 'var(--rail)' : '0'} 1fr ${
            rightOpen ? 'var(--rail)' : '0'
          }`,
        }}
      >
        {leftOpen ? (
          <div className="rail-host left">
            <button
              className="rail-collapse left"
              onClick={() => setLeftOpen(false)}
              title="Collapse feed"
              aria-label="Collapse live-feed rail"
            >
              ‹
            </button>
            <PulseFeed
              events={events}
              updated={updated}
              onOpenBriefing={openBriefing}
              onSelect={setSelected}
            />
          </div>
        ) : (
          <div />
        )}

        <section className="center">
          <ErrorBoundary label="Globe">
            <Suspense
              fallback={<div className="globe-loading">◍ initializing globe…</div>}
            >
              <GlobeView
                events={globeEvents}
                markers={markers}
                intensity={intensity}
                radar={radar}
                onSelect={setSelected}
                onGlobeClick={onGlobeClick}
              />
            </Suspense>
          </ErrorBoundary>
          <LayerPanel
            active={active}
            counts={counts}
            keyMissing={keyMissing}
            onToggle={toggle}
            onKeySetup={() => setKeySetup(true)}
          />
          {!leftOpen && (
            <button
              className="rail-reopen left"
              onClick={() => setLeftOpen(true)}
              title="Show live feed"
              aria-label="Show live-feed rail"
            >
              ›
            </button>
          )}
          {!rightOpen && (
            <button
              className="rail-reopen right"
              onClick={() => setRightOpen(true)}
              title="Show markets"
              aria-label="Show markets rail"
            >
              ‹
            </button>
          )}
          {showHint && (
            <div className="globe-hint" role="status">
              <span className="gh-dot" />
              <span>
                Click anywhere on the globe for an instant <b>AI sitrep</b> from
                the nearest live cameras · press <kbd>?</kbd> for shortcuts
              </span>
              <button
                className="gh-x"
                onClick={dismissHint}
                aria-label="Dismiss hint"
              >
                ✕
              </button>
            </div>
          )}
          {selected && (
            <Dossier
              entity={selected}
              onClose={() => setSelected(null)}
              onAsk={askAbout}
            />
          )}
          {areaScan && (
            <div className="area-scan">
              <div className="area-scan-head">
                <b>
                  ◉ AREA SITREP · {areaScan.lat.toFixed(2)}, {areaScan.lng.toFixed(2)}
                </b>
                <button onClick={() => setAreaScan(null)}>✕</button>
              </div>
              {areaScan.busy && (
                <div className="area-scan-busy">◍ {areaScan.status}</div>
              )}
              {areaScan.err && <div className="area-scan-err">⚠ {areaScan.err}</div>}
              {areaScan.result && (
                <div className="area-scan-body">
                  <Markdown text={areaScan.result} />
                </div>
              )}
            </div>
          )}
          <div className="botbar">
            <span className="bb-item">
              <b className="up">{shownEvents.length + markers.length}</b> live
              signals
            </span>
            <span className="bb-src">
              GDELT · USGS · EONET · ADS-B · FIRMS · AIS · RAINVIEWER
            </span>
          </div>
        </section>

        {rightOpen ? (
          <div className="rail-host right">
            <button
              className="rail-collapse right"
              onClick={() => setRightOpen(false)}
              title="Collapse markets"
              aria-label="Collapse markets rail"
            >
              ›
            </button>
            <RightRail quotes={markets} getContext={getContext} />
          </div>
        ) : (
          <div />
        )}
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
      <TrendsModal
        open={trendsOpen}
        onClose={() => setTrendsOpen(false)}
        getContext={getContext}
      />
      <WatchlistModal
        open={watchOpen}
        onClose={() => setWatchOpen(false)}
        watch={watch}
        intensity={intensity}
        baseline={baseline}
        onAdd={addWatch}
        onRemove={removeWatch}
        onAck={ackWatch}
        notifyOn={notifyOn}
        onToggleNotify={toggleNotify}
      />
      {helpOpen && (
        <div className="modal" onClick={() => setHelpOpen(false)}>
          <div
            className="help-card"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="help-head">
              <div>
                <span className="help-kicker">QUICK REFERENCE</span>
                <h2>Keyboard &amp; gestures</h2>
              </div>
              <button className="x" onClick={() => setHelpOpen(false)}>
                ✕
              </button>
            </div>
            <div className="help-grid">
              {[
                ['[', 'Toggle the live-feed rail'],
                [']', 'Toggle the markets rail'],
                ['F  /  \\', 'Full-globe focus mode'],
                ['?', 'Show / hide this panel'],
                ['Esc', 'Close this panel'],
              ].map(([k, d]) => (
                <div className="help-row" key={k}>
                  <kbd>{k}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
            <div className="help-gestures">
              <div className="help-row">
                <span className="help-gesture">Click globe</span>
                <span>AI sitrep from the nearest live cameras</span>
              </div>
              <div className="help-row">
                <span className="help-gesture">Click marker</span>
                <span>Open its dossier (planes, quakes, cams…)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
