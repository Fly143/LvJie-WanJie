// 用本项目 runtime/（或 AW_ELECTRON_RUNTIME）stage 并冒烟新 app
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const ELECTRON_SRC = process.env.AW_ELECTRON_RUNTIME
  || (fs.existsSync(path.join(ROOT, 'runtime', 'AgentWorlds.exe')) ? path.join(ROOT, 'runtime') : null)
  || (fs.existsSync(path.join(ROOT, 'runtime')) ? path.join(ROOT, 'runtime') : null)
const STAGE = path.join(ROOT, '.smoke-stage')

if (!ELECTRON_SRC || !fs.existsSync(ELECTRON_SRC)) {
  console.error('未找到 Electron 运行时。请设置 AW_ELECTRON_RUNTIME 或准备 runtime/')
  process.exit(1)
}

const EXE_NAME = fs.existsSync(path.join(ELECTRON_SRC, 'AgentWorlds.exe'))
  ? 'AgentWorlds.exe'
  : fs.readdirSync(ELECTRON_SRC).find(n => /agent.*\.exe$/i.test(n) || n === 'electron.exe')
if (!EXE_NAME) {
  console.error('运行时目录下未找到可执行文件:', ELECTRON_SRC)
  process.exit(1)
}

function rimraf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true })
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

rimraf(STAGE)
fs.mkdirSync(path.join(STAGE, 'resources', 'app'), { recursive: true })

for (const ent of fs.readdirSync(ELECTRON_SRC, { withFileTypes: true })) {
  if (ent.name === 'resources') continue
  const s = path.join(ELECTRON_SRC, ent.name)
  const d = path.join(STAGE, ent.name === EXE_NAME ? 'AgentWorlds.exe' : ent.name)
  if (ent.isDirectory()) copyDir(s, d)
  else fs.copyFileSync(s, d)
}

copyDir(path.join(ROOT, 'app'), path.join(STAGE, 'resources', 'app'))
fs.mkdirSync(path.join(STAGE, 'resources', 'app', 'assets'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'main.js'), path.join(STAGE, 'resources', 'app', 'main.js'))
if (fs.existsSync(path.join(ROOT, 'preload.js'))) {
  fs.copyFileSync(path.join(ROOT, 'preload.js'), path.join(STAGE, 'resources', 'app', 'preload.js'))
}
fs.writeFileSync(
  path.join(STAGE, 'resources', 'app', 'package.json'),
  JSON.stringify({
    name: rootPkg.name || 'agent-worlds',
    productName: rootPkg.productName || '旅界',
    version: rootPkg.version || '0.0.0',
    main: 'main.js'
  }, null, 2)
)
if (fs.existsSync(path.join(ROOT, 'assets'))) {
  copyDir(path.join(ROOT, 'assets'), path.join(STAGE, 'resources', 'app', 'assets'))
}

// 子进程输出写文件而非 pipe 捕获：受限沙箱下 spawnSync 的 pipe stdio 会 EPERM
const logPath = path.join(STAGE, 'smoke-output.txt')
const logFd = fs.openSync(logPath, 'w')
// --no-sandbox：本环境（受限服务会话）下 Chromium 沙箱初始化失败，
// 无该 flag 时 exe 在加载 main.js 之前即 0x80000003 快速崩溃（BEX64/c0000409）
const r = spawnSync(path.join(STAGE, 'AgentWorlds.exe'), ['--no-sandbox'], {
  env: { ...process.env, XX_SMOKE_TEST: '1' },
  stdio: ['ignore', logFd, logFd],
  timeout: 20000
})
try { fs.closeSync(logFd) } catch (e) { /* ignore */ }
const out = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
process.stdout.write(out)
const packsOk = /"packs"\s*:\s*6/.test(out) || /"packCards"\s*:\s*6/.test(out)
if (!packsOk) {
  console.error('SMOKE_FAIL')
  process.exit(1)
}

// API 设置面板：四个 tab 的切换与预设下拉（真实 Electron DOM 里点一遍）
const uiLine = out.split(/\r?\n/).find(l => l.startsWith('SMOKE_UI='))
if (!uiLine) {
  console.error('SMOKE_UI_MISSING')
  process.exit(1)
}
let ui = null
try { ui = JSON.parse(uiLine.slice('SMOKE_UI='.length)) } catch (e) { ui = null }
const uiErrs = []
if (!ui) uiErrs.push('无法解析 SMOKE_UI')
else {
  if (!ui.modal) uiErrs.push('设置弹窗没打开')
  for (const k of ['zen', 'preset', 'saved', 'custom']) {
    if (!ui.tabs || ui.tabs[k] !== 'ok') uiErrs.push('tab ' + k + ' 切换异常: ' + (ui.tabs && ui.tabs[k]))
  }
  if (!(ui.presetOptions >= 5)) uiErrs.push('预设下拉选项过少: ' + ui.presetOptions)
  if (ui.legacyPresetButtons !== 0) uiErrs.push('预设仍是全部铺开的按钮: ' + ui.legacyPresetButtons)
  if (!ui.stepsFolded) uiErrs.push('教程没有默认折叠')
  if (!ui.hasPresetKey) uiErrs.push('预设面板缺少 Key 输入框')
  if (!ui.hasPresetModel) uiErrs.push('预设面板缺少模型输入 / 刷新按钮')
  if (!ui.customForm) uiErrs.push('自定义接口表单缺失')
  if (!ui.customEmpty) uiErrs.push('自定义接口表单不应预填内容（应为空白新增表单）')
}
if (uiErrs.length) {
  console.error('SMOKE_UI_FAIL ' + uiErrs.join(' | '))
  process.exit(1)
}
console.log('SMOKE_UI_OK tabs=' + JSON.stringify(ui.tabs) + ' presetOptions=' + ui.presetOptions)
console.log('SMOKE_OK')
