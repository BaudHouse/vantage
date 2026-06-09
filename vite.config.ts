import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
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
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ''),
      },
    },
  },
})
