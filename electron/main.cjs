const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const DEV = !app.isPackaged
const DEV_URL = 'http://localhost:5174'

// Allow-list of feed hosts the renderer may ask main to fetch on its behalf.
// This is the ONLY network the app makes — a tight, auditable surface.
const ALLOWED_HOSTS = new Set([
  'api.gdeltproject.org', 'earthquake.usgs.gov', 'eonet.gsfc.nasa.gov',
  'query1.finance.yahoo.com', 'api.adsb.lol', 'cwwp2.dot.ca.gov', 'webcams.nyctmc.org',
  'api.rainviewer.com', 'tilecache.rainviewer.com',
  'firms.modaps.eosdis.nasa.gov', 'raw.githubusercontent.com',
  // expansion feeds
  'www.gdacs.org', 'volcanoes.usgs.gov', 'www.nhc.noaa.gov',
  'www.seismicportal.eu', 'api.safecast.org', 'api.weather.gov',
  'api.wheretheiss.at', 'api.coingecko.com',
  'api.waqi.info', 'api.windy.com', 'webcams.windy.com',
  // camera image hosts (for vision analysis)
  'imgproxy.windy.com', 's3-eu-west-1.amazonaws.com', 'api.tfl.gov.uk',
  '127.0.0.1', 'localhost', // local Ollama
])

// Secrets are read at RUNTIME (never bundled): userData/keys.json or env.
function loadKeys() {
  const out = {}
  try {
    const p = path.join(app.getPath('userData'), 'keys.json')
    if (fs.existsSync(p)) Object.assign(out, JSON.parse(fs.readFileSync(p, 'utf8')))
  } catch {
    /* ignore malformed key file */
  }
  for (const k of [
    'VITE_FIRMS_KEY', 'VITE_AISSTREAM_KEY', 'VITE_WAQI_KEY', 'VITE_WINDY_KEY',
  ]) {
    if (process.env[k]) out[k] = process.env[k]
  }
  return out
}
const KEYS = loadKeys()

// Loopback / link-local / private / metadata hosts. 127.0.0.1 and localhost are
// allow-listed for the local Ollama, but a PUBLIC feed must never be able to
// redirect a request onto them — so these are only permitted when the request
// already started there. IPv6 literals arrive bracketed, hence the strip.
function isPrivateHost(h) {
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' ||
    h === '::1' || h === '::' || h.startsWith('fe80:') ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)
  )
}

// Fetch with MANUAL redirect handling: the initial host must be allow-listed,
// and no hop may pivot into a private/loopback host unless the request already
// started there (defeats redirect-based SSRF into local Ollama / the LAN /
// cloud metadata). Bounded hops. Returns the final Response, or null if blocked.
async function guardedFetch(url, opts, maxHops = 5) {
  let current = url
  const startPrivate = isPrivateHost(new URL(url).hostname)
  for (let hop = 0; hop <= maxHops; hop++) {
    const host = new URL(current).hostname
    if (hop === 0 && !ALLOWED_HOSTS.has(host)) return null
    if (!startPrivate && isPrivateHost(host)) return null
    const r = await fetch(current, { ...opts, redirect: 'manual' })
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location')
      if (loc) {
        current = new URL(loc, current).href
        continue
      }
    }
    return r
  }
  return null // too many redirects
}

// Renderer asks main to fetch (Node has no CORS) so webSecurity stays ON.
ipcMain.handle('net:fetch', async (_e, req) => {
  try {
    // Honor the caller's timeout (the cascade needs up to 5 min on CPU Ollama),
    // clamped to a sane ceiling so a bad value can't hang the handler forever.
    const timeoutMs = Math.min(Math.max(Number(req.ms) || 130000, 1000), 300000)
    const r = await guardedFetch(req.url, {
      method: req.method || 'GET',
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!r) return { ok: false, status: 403, text: '' }
    return { ok: r.ok, status: r.status, text: await r.text() }
  } catch {
    return { ok: false, status: 0, text: '' }
  }
})

// Fetch an image (any allow-listed host) and return base64 — for feeding camera
// frames to the local vision model.
ipcMain.handle('net:image', async (_e, url) => {
  try {
    const r = await guardedFetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r || !r.ok) return null
    return Buffer.from(await r.arrayBuffer()).toString('base64')
  } catch {
    return null
  }
})

// Synchronous key handoff at preload time.
ipcMain.on('app:keys', (e) => {
  e.returnValue = KEYS
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#05070d',
    title: 'Vantage',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Stays ON now: the renderer never makes cross-origin calls itself —
      // feed fetches go through the allow-listed main-process handler above.
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // Open external links (article sources) in the system browser — only http(s).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
