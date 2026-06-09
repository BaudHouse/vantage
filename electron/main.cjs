const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const DEV = !app.isPackaged
const DEV_URL = 'http://localhost:5174'

// Allow-list of feed hosts the renderer may ask main to fetch on its behalf.
// This is the ONLY network the app makes — a tight, auditable surface.
const ALLOWED_HOSTS = new Set([
  'api.gdeltproject.org', 'earthquake.usgs.gov', 'eonet.gsfc.nasa.gov',
  'stooq.com', 'api.adsb.lol', 'cwwp2.dot.ca.gov', 'webcams.nyctmc.org',
  'api.rainviewer.com', 'tilecache.rainviewer.com',
  'firms.modaps.eosdis.nasa.gov', 'raw.githubusercontent.com',
  // expansion feeds
  'www.gdacs.org', 'volcanoes.usgs.gov', 'www.nhc.noaa.gov',
  'www.seismicportal.eu', 'api.safecast.org', 'api.weather.gov',
  'api.wheretheiss.at', 'api.coingecko.com',
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
  for (const k of ['VITE_FIRMS_KEY', 'VITE_AISSTREAM_KEY']) {
    if (process.env[k]) out[k] = process.env[k]
  }
  return out
}
const KEYS = loadKeys()

// Renderer asks main to fetch (Node has no CORS) so webSecurity stays ON.
ipcMain.handle('net:fetch', async (_e, req) => {
  try {
    const u = new URL(req.url)
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return { ok: false, status: 403, text: '' }
    }
    const r = await fetch(req.url, {
      method: req.method || 'GET',
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(130000),
    })
    return { ok: r.ok, status: r.status, text: await r.text() }
  } catch {
    return { ok: false, status: 0, text: '' }
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
