// 《Agent万象》Electron 主进程（Packed：resources/app/main.js）
// 由 runtime/AgentWorlds.exe 加载；require('electron') 为内建 API
if (process.env.ELECTRON_RUN_AS_NODE) delete process.env.ELECTRON_RUN_AS_NODE

const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron')
// 允许程序化启动 BGM（需在 app 使用前声明，但必须在 require 之后）
try {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
} catch (e) { /* ignore */ }
const path = require('path')
const fs = require('fs')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.error('[AgentWorlds] 已有实例在运行，本进程退出（单实例锁）')
  app.quit()
  // 不再注册窗口逻辑
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

/** 读取资源文件（渲染层 file:// 下 fetch 可能被拦） */
ipcMain.handle('aw:asset:read', async (_e, rel) => {
  try {
    const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!clean || clean.includes('..')) return { ok: false, error: '非法路径' }
    const base = __dirname
    const p = path.join(base, clean)
    if (!p.startsWith(base)) return { ok: false, error: '路径越界' }
    if (!fs.existsSync(p)) return { ok: false, error: '文件不存在' }
    const buf = fs.readFileSync(p)
    return {
      ok: true,
      data: buf.toString('base64'),
      type: /\.mid$/i.test(p) ? 'audio/midi' : 'application/octet-stream'
    }
  } catch (e) {
    return { ok: false, error: (e && e.message) || '读取失败' }
  }
})

/* ---------- HTTP 代理：渲染进程不直连外网 ---------- */
const ALLOWED_HTTP = /^https?:\/\//i
let streamSeq = 0
const streamCtl = new Map()

function rejectHttp(url, method) {
  if (!ALLOWED_HTTP.test(url)) return { ok: false, error: '仅允许 http(s) 协议' }
  const m = String(method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(m)) {
    return { ok: false, error: '不允许的 HTTP 方法' }
  }
  return null
}

ipcMain.handle('aw:http', async (_e, req) => {
  const url = String((req && req.url) || '')
  const method = String((req && req.method) || 'GET').toUpperCase()
  const bad = rejectHttp(url, method)
  if (bad) return bad
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

/** 流式：启动后按 chunk 回传，end/error 收尾 */
ipcMain.handle('aw:http:stream', (event, req) => {
  const url = String((req && req.url) || '')
  const method = String((req && req.method) || 'GET').toUpperCase()
  const bad = rejectHttp(url, method)
  if (bad) return bad
  const id = 's' + (++streamSeq)
  const ctl = new AbortController()
  streamCtl.set(id, ctl)
  const timeoutMs = Math.max(1000, Math.min(180000, Number(req.timeoutMs) || 180000))
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  const sender = event.sender

  ;(async () => {
    try {
      const res = await fetch(url, {
        method,
        headers: (req && req.headers) || {},
        body: method === 'GET' || method === 'HEAD' ? undefined : (req && req.body),
        signal: ctl.signal
      })
      sender.send('aw:http:head', { id, status: res.status, headers: Object.fromEntries(res.headers.entries()) })
      if (!res.body) {
        const text = await res.text()
        sender.send('aw:http:chunk', { id, text })
        sender.send('aw:http:end', { id, ok: true })
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder('utf-8')
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        sender.send('aw:http:chunk', { id, text: dec.decode(value, { stream: true }) })
      }
      sender.send('aw:http:chunk', { id, text: dec.decode() })
      sender.send('aw:http:end', { id, ok: true, status: res.status })
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError')
      sender.send('aw:http:end', {
        id,
        ok: false,
        aborted,
        error: aborted ? '请求超时或已取消' : ((e && e.message) || '网络错误')
      })
    } finally {
      clearTimeout(timer)
      streamCtl.delete(id)
    }
  })()

  return { ok: true, id }
})

ipcMain.handle('aw:http:abort', (_e, id) => {
  const ctl = streamCtl.get(String(id))
  if (ctl) {
    try { ctl.abort() } catch (err) { /* ignore */ }
    streamCtl.delete(String(id))
    return { ok: true }
  }
  return { ok: false }
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

if (gotLock) {
  app.whenReady().then(createWindow)
}
app.on('window-all-closed', () => app.quit())
