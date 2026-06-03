const { contextBridge, ipcRenderer } = require('electron')

// Minimal, audited bridge. The renderer gets NO Node access — only:
//   • vantage.netFetch(req)  -> main-process fetch (allow-listed hosts, no CORS)
//   • vantage.keys           -> runtime API keys (from userData/keys.json or env)
// Keys are pulled synchronously at preload so the renderer can read them
// without an async hop; they are never baked into the web bundle.
let keys = {}
try {
  keys = ipcRenderer.sendSync('app:keys') || {}
} catch {
  keys = {}
}

contextBridge.exposeInMainWorld('vantage', {
  netFetch: (req) => ipcRenderer.invoke('net:fetch', req),
  keys,
})
