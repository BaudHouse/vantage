import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only middleware: fetch any image server-side (Node has no CORS) so the
// renderer can grab camera frames to base64 for the vision model. In a packaged
// build this job is done by the Electron main process (electron/main.cjs).
function imgProxy(): Plugin {
  return {
    name: 'vantage-imgproxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/imgproxy?')) return next()
        const target = new URL(req.url, 'http://x').searchParams.get('url')
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400
          return res.end('bad url')
        }
        // SSRF guard: this dev middleware fetches arbitrary URLs server-side, so
        // refuse internal/loopback/link-local/private hosts (incl. cloud
        // metadata) even though image URLs only come from trusted feeds.
        let host = ''
        try {
          host = new URL(target).hostname.toLowerCase()
        } catch {
          res.statusCode = 400
          return res.end('bad url')
        }
        if (
          // IPv6 literals arrive bracketed ("[::1]", "[fe80::1]"), so a plain
          // "host === '::1'" never matches them. This dev proxy only fetches
          // public image feeds, so refuse ANY IPv6 literal outright — closing
          // loopback/link-local/ULA/IPv4-mapped in one shot.
          host.startsWith('[') ||
          host === 'localhost' ||
          host.endsWith('.localhost') ||
          host === '0.0.0.0' ||
          host === '::1' ||
          host === '169.254.169.254' ||
          /^127\./.test(host) ||
          /^10\./.test(host) ||
          /^192\.168\./.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
          /^169\.254\./.test(host) ||
          host.endsWith('.internal') ||
          host.endsWith('.local')
        ) {
          res.statusCode = 403
          return res.end('blocked host')
        }
        fetch(target)
          .then(async (r) => {
            const buf = Buffer.from(await r.arrayBuffer())
            res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
            res.setHeader('Cache-Control', 'no-store')
            res.end(buf)
          })
          .catch(() => {
            res.statusCode = 502
            res.end('fetch failed')
          })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), imgProxy()],
  build: {
    // The 'globe' chunk is three.js + react-globe.gl — an irreducible ~1.8 MB
    // (≈518 kB gzip) 3D engine. It's deliberately split into its own chunk and
    // lazy-loaded (see the lazy GlobeView import in App.tsx), so it never blocks
    // first paint — the app shell is ~92 kB gzip and renders immediately. The
    // size warning is therefore a false positive for this architecture; the
    // limit is set just above the vendor bundle rather than silently disabled.
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'globe'
          if (id.includes('node_modules/react-globe.gl')) return 'globe'
          if (id.includes('node_modules/three-globe')) return 'globe'
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      // Proxy free OSINT feeds to dodge browser CORS.
      '/feeds/gdelt': {
        target: 'https://api.gdeltproject.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/gdelt/, '/api/v2'),
      },
      '/feeds/usgs': {
        target: 'https://earthquake.usgs.gov',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/usgs/, ''),
      },
      '/feeds/eonet': {
        target: 'https://eonet.gsfc.nasa.gov',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/eonet/, '/api/v3'),
      },
      '/feeds/stooq': {
        target: 'https://stooq.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/stooq/, ''),
      },
      '/feeds/opensky': {
        target: 'https://opensky-network.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/opensky/, '/api'),
      },
      // Live aircraft (ADS-B), no key, no rate-limit grief like OpenSky.
      '/feeds/adsb': {
        target: 'https://api.adsb.lol',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/adsb/, ''),
      },
      // Caltrans public CCTV (traffic cameras), no key.
      '/feeds/caltrans': {
        target: 'https://cwwp2.dot.ca.gov',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/caltrans/, ''),
      },
      // NYC DOT live traffic cameras (no key, ~1-2s refresh).
      '/feeds/nyccams': {
        target: 'https://webcams.nyctmc.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/nyccams/, ''),
      },
      // Transport for London JamCams (no key) — live JPEG + short MP4 clips.
      '/feeds/tfl': {
        target: 'https://api.tfl.gov.uk',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/tfl/, ''),
      },
      // RainViewer radar frame index, no key (tiles load directly as textures).
      '/feeds/rainviewer': {
        target: 'https://api.rainviewer.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/rainviewer/, ''),
      },
      // NASA FIRMS active-fire/thermal (free MAP_KEY required).
      '/feeds/firms': {
        target: 'https://firms.modaps.eosdis.nasa.gov',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/feeds\/firms/, ''),
      },
      // ---- expansion feeds (all free / key-less) ----
      '/feeds/gdacs': { target: 'https://www.gdacs.org', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/gdacs/, '') },
      '/feeds/usgsvolc': { target: 'https://volcanoes.usgs.gov', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/usgsvolc/, '') },
      '/feeds/nhc': { target: 'https://www.nhc.noaa.gov', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/nhc/, '') },
      '/feeds/emsc': { target: 'https://www.seismicportal.eu', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/emsc/, '') },
      '/feeds/safecast': { target: 'https://api.safecast.org', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/safecast/, '') },
      '/feeds/nws': { target: 'https://api.weather.gov', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/nws/, '') },
      '/feeds/iss': { target: 'https://api.wheretheiss.at', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/iss/, '') },
      '/feeds/coingecko': { target: 'https://api.coingecko.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/coingecko/, '') },
      '/feeds/waqi': { target: 'https://api.waqi.info', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/waqi/, '') },
      '/feeds/windy': { target: 'https://api.windy.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/feeds\/windy/, '') },
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ''),
      },
    },
  },
})
