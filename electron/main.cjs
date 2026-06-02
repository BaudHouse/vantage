const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const DEV = !app.isPackaged
const DEV_URL = 'http://localhost:5174'

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#05070d',
    title: 'Conflictly',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Packaged build calls public OSINT APIs cross-origin (no dev proxy).
      webSecurity: DEV,
    },
  })

  // Open external links (article sources) in the system browser, not the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
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
