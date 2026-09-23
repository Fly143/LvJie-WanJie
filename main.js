// 《Agent万象》Electron 主进程（Packed：resources/app/main.js）
// 由 runtime/AgentWorlds.exe 加载；require('electron') 为内建 API
if (process.env.ELECTRON_RUN_AS_NODE) delete process.env.ELECTRON_RUN_AS_NODE

const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
}

function resolveIndex() {
  // packed: 与 main.js 同目录的 index.html
  const p = path.join(__dirname, 'index.html')
  return fs.existsSync(p) ? p : path.join(__dirname, 'app', 'index.html')
}

function resolveIcon() {
  const c = [
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'icon.ico')
  ]
  for (const p of c) if (fs.existsSync(p)) return p
  return undefined
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0f1e',
    autoHideMenuBar: true,
    icon: resolveIcon(),
    title: 'Agent万象',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false
    }
  })

  win.once('ready-to-show', () => win.show())
  win.loadFile(resolveIndex())

  win.webContents.on('did-finish-load', () => {
    if (process.env.XX_SMOKE_TEST) {
      win.webContents.executeJavaScript(
        `Promise.resolve().then(() => ({
           title: document.title,
           packs: (document.querySelectorAll('.pack-card') || []).length,
           hasApp: !!document.getElementById('app')
         }))`
      )
        .then(r => console.log('SMOKE=' + JSON.stringify(r)))
        .catch(e => console.log('SMOKE_ERR=' + e.message))
      setTimeout(() => app.exit(0), 5000)
    }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
