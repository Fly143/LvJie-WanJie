// 《Agent万象》Electron 主进程（Packed：resources/app/main.js）
// 由 runtime/AgentWorlds.exe 加载；require('electron') 为内建 API
if (process.env.ELECTRON_RUN_AS_NODE) delete process.env.ELECTRON_RUN_AS_NODE

const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.error('[AgentWorlds] 已有实例在运行，本进程退出（单实例锁）')
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

function resolvePreload() {
  const c = [
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'app', 'preload.js')
  ]
  for (const p of c) if (fs.existsSync(p)) return p
  return undefined
}

function secretsPath() {
  return path.join(app.getPath('userData'), 'agentworlds_apikeys.bin')
}

/* ---------- HTTP 代理：渲染进程不直连外网 ---------- */
const ALLOWED_HTTP = /^https?:\/\//i

ipcMain.handle('aw:http', async (_e, req) => {
  const url = String((req && req.url) || '')
  if (!ALLOWED_HTTP.test(url)) {
    return { ok: false, error: '仅允许 http(s) 协议' }
  }
  const method = String((req && req.method) || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) {
    return { ok: false, error: '不允许的 HTTP 方法' }
  }
  const timeoutMs = Math.max(1000, Math.min(180000, Number(req.timeoutMs) || 120000))
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      headers: (req && req.headers) || {},
      body: method === 'GET' || method === 'HEAD' ? undefined : (req && req.body),
      signal: ctl.signal
    })
    const text = await res.text()
    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      text,
      headers: Object.fromEntries(res.headers.entries())
    }
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError')
    return { ok: false, error: aborted ? '请求超时或已取消' : ((e && e.message) || '网络错误'), aborted }
  } finally {
    clearTimeout(timer)
  }
})

/* ---------- API Key：safeStorage 加密落盘 ---------- */
ipcMain.handle('aw:secrets:load', () => {
  try {
    const p = secretsPath()
    if (!fs.existsSync(p)) return null
    const buf = fs.readFileSync(p)
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8')
    const data = JSON.parse(json)
    return data && typeof data === 'object' ? data : null
  } catch (e) {
    return null
  }
})

ipcMain.handle('aw:secrets:save', (_e, payload) => {
  try {
    const json = JSON.stringify(payload || { keys: [], selected: 0 })
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8')
    fs.writeFileSync(secretsPath(), buf)
    return { ok: true, encrypted: safeStorage.isEncryptionAvailable() }
  } catch (e) {
    return { ok: false, error: (e && e.message) || '保存失败' }
  }
})

ipcMain.handle('aw:secrets:clear', () => {
  try { fs.rmSync(secretsPath(), { force: true }) } catch (e) { /* ignore */ }
  return { ok: true }
})

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
      webSecurity: true,
      preload: resolvePreload()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const file = 'file://'
    const ok = url.startsWith(file) || url.startsWith('about:')
    if (!ok) e.preventDefault()
  })

  win.once('ready-to-show', () => win.show())
  win.loadFile(resolveIndex())

  win.webContents.on('did-finish-load', () => {
    if (process.env.XX_SMOKE_TEST) {
      win.webContents.executeJavaScript(
        `Promise.resolve().then(() => ({
           title: document.title,
           packs: (globalThis.__AW_PACKS__ && Object.keys(globalThis.__AW_PACKS__).length) || (document.querySelectorAll('.pack-card') || []).length,
           packCards: (document.querySelectorAll('.pack-card') || []).length,
           hasApp: !!document.getElementById('app'),
           hasWelcome: !document.getElementById('welcome')?.hidden
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
