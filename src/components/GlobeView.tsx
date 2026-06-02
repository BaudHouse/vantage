import { useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import { KIND_COLOR, WORLD_GEOJSON, type GeoEvent } from '../feeds'
import { ENTITY_COLOR, entityTitle, type Entity } from '../layers'
import type { Aircraft, Ship } from '../layers'
import type { RadarFrame } from '../weather'

interface Props {
  events: GeoEvent[] // conflict / quake / disaster (points + rings)
  markers: Entity[] // aircraft / ship / camera / fire (sprite icons)
  intensity: Record<string, number>
  radar: RadarFrame | null
  onSelect: (e: Entity) => void
}

// ---- icon textures (drawn once per type+color, cached) ---------------------

const texCache = new Map<string, THREE.Texture>()

function drawIcon(type: string, color: string): THREE.Texture {
  const key = `${type}:${color}`
  const cached = texCache.get(key)
  if (cached) return cached
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  ctx.translate(S / 2, S / 2)

  if (type === 'aircraft') {
    // Plane pointing "up" (north). Heading applied via sprite rotation.
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(8,12,20,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    const p = [
      [0, -26], [4, -8], [26, 6], [26, 12], [4, 6], [3, 22],
      [10, 28], [10, 30], [0, 27], [-10, 30], [-10, 28], [-3, 22],
      [-4, 6], [-26, 12], [-26, 6], [-4, -8],
    ]
    p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (type === 'ship') {
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(6,18,12,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -24)
    ctx.lineTo(16, 24)
    ctx.lineTo(0, 14)
    ctx.lineTo(-16, 24)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (type === 'fire') {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26)
    g.addColorStop(0, '#fff2c2')
    g.addColorStop(0.35, color)
    g.addColorStop(1, 'rgba(255,90,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 26, 0, Math.PI * 2)
    ctx.fill()
  } else if (type === 'camera') {
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(10,6,20,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect?.(-20, -12, 40, 26, 5)
    if (!ctx.roundRect) ctx.rect(-20, -12, 40, 26)
    ctx.fill()
    ctx.stroke()
    // lens
    ctx.fillStyle = 'rgba(10,6,20,0.95)'
    ctx.beginPath()
    ctx.arc(0, 1, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(0, 1, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  texCache.set(key, tex)
  return tex
}

// Materials are cached and REUSED across refreshes (keyed by type+color+heading
// bucket) so we never leak GPU resources when the aircraft feed re-polls.
const matCache = new Map<string, THREE.SpriteMaterial>()

function materialFor(
  type: string,
  color: string,
  headingDeg: number,
): THREE.SpriteMaterial {
  const bucket = Math.round((((headingDeg % 360) + 360) % 360) / 5) * 5
  const key = `${type}:${color}:${bucket}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: drawIcon(type, color),
      transparent: true,
      depthWrite: false,
      rotation: -(bucket * Math.PI) / 180,
    })
    matCache.set(key, m)
  }
  return m
}

function spriteFor(e: Entity): THREE.Sprite {
  let color = ENTITY_COLOR[e.kind] ?? '#ffffff'
  let heading = 0
  let scale = 3
  if (e.kind === 'aircraft') {
    const ac = e as Aircraft
    color = ac.emergency ? '#ff2d2d' : ac.military ? '#ffcf4d' : '#e8eefc'
    heading = ac.heading
    scale = ac.military ? 4.2 : 3.2
  } else if (e.kind === 'ship') {
    heading = (e as Ship).heading || 0
    scale = 3
  } else if (e.kind === 'fire') {
    scale = 3.4
  } else if (e.kind === 'camera') {
    scale = 3
  }
  const sprite = new THREE.Sprite(materialFor(e.kind, color, heading))
  sprite.scale.set(scale, scale, 1)
  return sprite
}

// ---- RainViewer Mercator tiles -> globe equirectangular placement ----------

function mercY2lat(t: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * t))) * 180) / Math.PI
}

interface RadarTile {
  lat: number
  lng: number
  width: number
  height: number
  material: THREE.Material
}

function buildRadarTiles(frame: RadarFrame): RadarTile[] {
  const z = 3
  const n = 1 << z
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  const tiles: RadarTile[] = []
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const latN = mercY2lat(y / n)
      const latS = mercY2lat((y + 1) / n)
      const lngW = (x / n) * 360 - 180
      const height = latN - latS
      if (height <= 0 || Math.abs((latN + latS) / 2) > 84) continue
      const url = frame.template
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
      const tex = loader.load(url)
      tex.colorSpace = THREE.SRGBColorSpace
      const material = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.FrontSide,
      })
      tiles.push({
        lat: (latN + latS) / 2,
        lng: lngW + 180 / n,
        width: 360 / n,
        height,
        material,
      })
    }
  }
  return tiles
}

export default function GlobeView({
  events,
  markers,
  intensity,
  radar,
  onSelect,
}: Props) {
  const globeRef = useRef<any>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [countries, setCountries] = useState<any[]>([])

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return
      setSize({
        w: wrapRef.current.clientWidth,
        h: wrapRef.current.clientHeight,
      })
    })
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    fetch(WORLD_GEOJSON)
      .then((r) => r.json())
      .then((j) => setCountries(j.features ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    const c = g.controls()
    c.autoRotate = false
    c.enableDamping = true
    c.dampingFactor = 0.1
    g.pointOfView({ lat: 30, lng: 20, altitude: 2.3 }, 0)
  }, [])

  const maxIntensity = useMemo(
    () => Math.max(1, ...Object.values(intensity)),
    [intensity],
  )

  const radarTiles = useMemo(
    () => (radar ? buildRadarTiles(radar) : []),
    [radar],
  )

  const nameOf = (feat: any) =>
    feat?.properties?.ADMIN ?? feat?.properties?.NAME ?? ''

  return (
    <div className="globe-wrap" ref={wrapRef}>
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor="#c0392b"
        atmosphereAltitude={0.16}
        // ---- conflict choropleth ----
        polygonsData={countries}
        polygonAltitude={(d: any) => {
          const v = intensity[nameOf(d)] ?? 0
          return v ? 0.01 + (v / maxIntensity) * 0.06 : 0.006
        }}
        polygonCapColor={(d: any) => {
          const v = intensity[nameOf(d)] ?? 0
          if (!v) return 'rgba(40,52,70,0.10)'
          const a = 0.18 + (v / maxIntensity) * 0.55
          return `rgba(220,40,40,${a.toFixed(2)})`
        }}
        polygonSideColor={() => 'rgba(180,30,30,0.08)'}
        polygonStrokeColor={() => 'rgba(120,150,190,0.25)'}
        polygonLabel={(d: any) => {
          const v = intensity[nameOf(d)] ?? 0
          return v
            ? `<div class="tip"><b>${nameOf(d)}</b><br/>${v} conflict report(s)/24h</div>`
            : `<div class="tip">${nameOf(d)}</div>`
        }}
        // ---- weather radar tiles ----
        tilesData={radarTiles}
        tileLat={(d: any) => d.lat}
        tileLng={(d: any) => d.lng}
        tileAltitude={0.004}
        tileWidth={(d: any) => d.width}
        tileHeight={(d: any) => d.height}
        tileUseGlobeProjection={true}
        tileMaterial={(d: any) => d.material}
        tilesTransitionDuration={0}
        // ---- event points (conflict / quake / disaster) ----
        pointsData={events}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d: any) => KIND_COLOR[(d as GeoEvent).kind]}
        pointAltitude={(d: any) => 0.01 + (d as GeoEvent).weight * 0.28}
        pointRadius={(d: any) => 0.12 + (d as GeoEvent).weight * 0.42}
        pointResolution={6}
        pointLabel={(d: any) => {
          const e = d as GeoEvent
          return `<div class="tip"><b>${e.title}</b><br/>${e.detail}</div>`
        }}
        onPointClick={(d: any) => onSelect(d as GeoEvent)}
        // ---- entity sprites (aircraft / ship / camera / fire) ----
        objectsData={markers}
        objectLat={(d: any) => (d as Entity).lat}
        objectLng={(d: any) => (d as Entity).lng}
        objectAltitude={(d: any) =>
          (d as Entity).kind === 'aircraft'
            ? 0.02 + Math.min(0.1, ((d as Aircraft).altitude || 0) / 450000)
            : 0.012
        }
        objectThreeObject={(d: any) => spriteFor(d as Entity)}
        objectLabel={(d: any) => `<div class="tip">${entityTitle(d as Entity)}</div>`}
        onObjectClick={(d: any) => onSelect(d as Entity)}
        // ---- alert rings for the most severe events ----
        ringsData={events.filter((e) => e.weight > 0.55)}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d: any) => () => KIND_COLOR[(d as GeoEvent).kind]}
        ringMaxRadius={() => 4}
        ringPropagationSpeed={() => 2}
        ringRepeatPeriod={() => 900}
      />
    </div>
  )
}
