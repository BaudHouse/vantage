import { useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import { KIND_COLOR, WORLD_GEOJSON, type GeoEvent } from '../feeds'
import { ENTITY_COLOR, ENTITY_GLYPH, entityTitle, type Entity } from '../layers'
import type { Aircraft, Ship } from '../layers'
import type { RadarFrame } from '../weather'
import { escapeHtml } from '../safe'
import { rawFetch } from '../net'

interface Props {
  events: GeoEvent[] // conflict / quake / disaster (points + rings)
  markers: Entity[] // aircraft / ship / camera / fire (sprite icons)
  intensity: Record<string, number>
  radar: RadarFrame | null
  onSelect: (e: Entity) => void
  onGlobeClick?: (lat: number, lng: number) => void
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
  } else {
    // Generic glyph marker (hazard / volcano / storm / radiation / alert /
    // satellite) — a colored glow disc behind the layer's emoji.
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 24)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.5
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.font = '30px "Segoe UI Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ENTITY_GLYPH[type] ?? '◆', 0, 2)
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  texCache.set(key, tex)
  return tex
}

// Materials are cached and REUSED across refreshes (keyed by type+color+heading
// bucket) so we never leak GPU resources when the aircraft feed re-polls. The
// key space is finite (≈types×colors×72 buckets) but we still cap + dispose on
// eviction so a long-running session can't accumulate stale heading-bucket
// materials unbounded. (Textures live in the small texCache and are shared, so
// they are NOT disposed here.)
const matCache = new Map<string, THREE.SpriteMaterial>()
const MAT_CAP = 800

function materialFor(
  type: string,
  color: string,
  headingDeg: number,
): THREE.SpriteMaterial {
  const bucket = Math.round((((headingDeg % 360) + 360) % 360) / 5) * 5
  const key = `${type}:${color}:${bucket}`
  let m = matCache.get(key)
  if (!m) {
    if (matCache.size >= MAT_CAP) {
      const oldest = matCache.keys().next().value
      if (oldest !== undefined) {
        matCache.get(oldest)?.dispose()
        matCache.delete(oldest)
      }
    }
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

// ---- weather radar overlay ------------------------------------------------
// react-globe.gl's tiles layer won't reliably render async-textured custom
// materials, so instead we composite all RainViewer Mercator tiles onto ONE
// equirectangular canvas and drape it over a translucent sphere just above the
// globe surface (three's SphereGeometry UVs are equirectangular, so it aligns
// with the base map exactly).

const GLOBE_R = 100 // three-globe's globe radius

function mercY2lat(t: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * t))) * 180) / Math.PI
}

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
}

async function buildRadarSphere(frame: RadarFrame): Promise<THREE.Object3D | null> {
  const z = 4
  const n = 1 << z
  const W = 2048
  const H = 1024
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!

  const jobs: Promise<void>[] = []
  let drew = 0
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const latN = mercY2lat(y / n)
      const latS = mercY2lat((y + 1) / n)
      const lngW = (x / n) * 360 - 180
      const url = frame.template
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
      jobs.push(
        loadImg(url).then((img) => {
          if (!img) return
          const dx = ((lngW + 180) / 360) * W
          const dw = (360 / n / 360) * W
          const dy = ((90 - latN) / 180) * H
          const dh = ((latN - latS) / 180) * H
          ctx.drawImage(img, dx, dy, dw, dh)
          drew++
        }),
      )
    }
  }
  await Promise.all(jobs)
  if (!drew) return null

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  // Sphere UVs in three start at +X/−Z; the base globe image uses the same
  // convention, so a plain sphere lines up with the map.
  const geo = new THREE.SphereGeometry(GLOBE_R * 1.004, 96, 96)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 1
  return mesh
}

export default function GlobeView({
  events,
  markers,
  intensity,
  radar,
  onSelect,
  onGlobeClick,
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
    rawFetch(WORLD_GEOJSON, { ms: 12000 })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((j) => j && setCountries(j.features ?? []))
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
    if (import.meta.env.DEV) (window as any).__globe = g
  }, [])

  const maxIntensity = useMemo(
    () => Math.max(1, ...Object.values(intensity)),
    [intensity],
  )

  // Radar overlay is added straight to the three scene (react-globe.gl's custom
  // layer wouldn't mount an externally-built mesh reliably).
  const radarMeshRef = useRef<THREE.Mesh | null>(null)
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    const scene = g.scene()
    const clear = () => {
      if (radarMeshRef.current) {
        scene.remove(radarMeshRef.current)
        radarMeshRef.current.geometry.dispose()
        const mat = radarMeshRef.current.material as THREE.MeshBasicMaterial
        mat.map?.dispose() // the per-frame CanvasTexture — the real recurring leak
        mat.dispose()
        radarMeshRef.current = null
      }
    }
    if (!radar) {
      clear()
      return
    }
    let cancelled = false
    buildRadarSphere(radar).then((mesh) => {
      if (cancelled || !mesh) return
      clear()
      scene.add(mesh)
      radarMeshRef.current = mesh as THREE.Mesh
    })
    return () => {
      cancelled = true
    }
  }, [radar])

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
        onGlobeClick={({ lat, lng }: { lat: number; lng: number }) =>
          onGlobeClick?.(lat, lng)
        }
        // ---- conflict choropleth ----
        // Kept deliberately FLAT and hugging the surface (max altitude 0.008,
        // below every marker at 0.012+) so the fill tints countries by conflict
        // intensity without extruding a red dome that buries cameras, fires and
        // other markers underneath it. Intensity now reads through colour, not
        // height, and the cap is translucent so markers show through.
        polygonsData={countries}
        polygonAltitude={(d: any) => {
          const v = intensity[nameOf(d)] ?? 0
          return 0.002 + (v / maxIntensity) * 0.006
        }}
        polygonCapColor={(d: any) => {
          const v = intensity[nameOf(d)] ?? 0
          if (!v) return 'rgba(40,52,70,0.06)'
          const a = 0.1 + (v / maxIntensity) * 0.35
          return `rgba(220,40,40,${a.toFixed(2)})`
        }}
        polygonSideColor={() => 'rgba(180,30,30,0.05)'}
        polygonStrokeColor={() => 'rgba(120,150,190,0.2)'}
        polygonLabel={(d: any) => {
          const name = escapeHtml(nameOf(d))
          const v = intensity[nameOf(d)] ?? 0
          return v
            ? `<div class="tip"><b>${name}</b><br/>${v} conflict report(s)/24h</div>`
            : `<div class="tip">${name}</div>`
        }}
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
          return `<div class="tip"><b>${escapeHtml(e.title)}</b><br/>${escapeHtml(e.detail)}</div>`
        }}
        onPointClick={(d: any) => onSelect(d as GeoEvent)}
        // ---- entity sprites (aircraft / ship / camera / fire) ----
        objectsData={markers}
        objectLat={(d: any) => (d as Entity).lat}
        objectLng={(d: any) => (d as Entity).lng}
        objectAltitude={(d: any) =>
          (d as Entity).kind === 'aircraft'
            ? 0.02 + Math.min(0.1, ((d as Aircraft).altitude || 0) / 450000)
            : 0.018
        }
        objectThreeObject={(d: any) => spriteFor(d as Entity)}
        objectLabel={(d: any) => `<div class="tip">${escapeHtml(entityTitle(d as Entity))}</div>`}
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
