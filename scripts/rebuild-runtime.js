// 用官方 Electron 发行版重建 runtime/
// 来源：node_modules/electron/dist 或 AW_ELECTRON_DIST 或 AW_ELECTRON_ZIP
const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const RUNTIME = path.join(ROOT, 'runtime')
const APP_DEST = path.join(RUNTIME, 'resources', 'app')

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function resolveDist() {
  if (process.env.AW_ELECTRON_DIST && fs.existsSync(process.env.AW_ELECTRON_DIST)) {
    return process.env.AW_ELECTRON_DIST
  }
  const zip = process.env.AW_ELECTRON_ZIP
  if (zip && fs.existsSync(zip)) {
    const os = require('os')
    const ex = path.join(os.tmpdir(), 'aw-electron-dist-' + Date.now())
    fs.rmSync(ex, { recursive: true, force: true })
    fs.mkdirSync(ex, { recursive: true })
    console.log('解压', zip)
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${ex.replace(/'/g, "''")}' -Force`
    ], { stdio: 'inherit' })
    return ex
  }
  const local = path.join(ROOT, 'node_modules', 'electron', 'dist')
  if (fs.existsSync(path.join(local, 'electron.exe'))) return local
  return null
}

const dist = resolveDist()
if (!dist) fail('未找到 Electron dist。可设 AW_ELECTRON_DIST / AW_ELECTRON_ZIP，或先 npm install electron')
if (!fs.existsSync(path.join(dist, 'electron.exe'))) fail('dist 下缺少 electron.exe: ' + dist)
const verPath = path.join(dist, 'version')
const ver = fs.existsSync(verPath) ? fs.readFileSync(verPath, 'utf8').trim() : ''
console.log('来源 dist:', dist, 'version:', ver || '(missing)')

// 清空 runtime（保留无关用户文件风险低：本目录仅为发布物）
fs.rmSync(RUNTIME, { recursive: true, force: true })
fs.mkdirSync(RUNTIME, { recursive: true })

// 可选：把主程序改名并编译启动器壳（受限会话下 Chromium 沙箱不可用也能双击启动）
const BUILD_LAUNCHER = process.env.AW_BUILD_LAUNCHER === '1'
// 内部主程序（真正的 Electron，需要 --no-sandbox；玩家双击的是壳 AgentWorlds.exe）
const CORE_NAME = 'AgentWorlds-core.exe'
const EXE_NAME = BUILD_LAUNCHER ? CORE_NAME : 'AgentWorlds.exe'
// 玩家要点的那一个（有壳时是壳，没壳时就是主程序本身）
const RUN_EXE = 'AgentWorlds.exe'

for (const ent of fs.readdirSync(dist, { withFileTypes: true })) {
  if (ent.name === 'resources') continue
  const s = path.join(dist, ent.name)
  const d = path.join(RUNTIME, ent.name === 'electron.exe' ? EXE_NAME : ent.name)
  if (ent.isDirectory()) fs.cpSync(s, d, { recursive: true })
  else fs.copyFileSync(s, d)
}

if (BUILD_LAUNCHER) {
  const b = spawnSync(process.execPath, [path.join(__dirname, 'build-launcher.js'), RUNTIME], { stdio: 'inherit' })
  if (b.status !== 0) fail('编译启动器壳失败（可去掉 AW_BUILD_LAUNCHER 重新构建）')
}

// 同步应用
const r = spawnSync(process.execPath, [path.join(__dirname, 'sync-runtime.js')], { stdio: 'inherit' })
if (r.status !== 0) fail('sync-runtime 失败')

// 写入可追溯版本文件
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
fs.writeFileSync(
  path.join(RUNTIME, 'version'),
  (ver || rootPkg.devDependencies.electron || 'unknown') + '\n'
)

// 随包只留一份简明说明；不再生成 .cmd 启动脚本 / ★提示 / PROVENANCE（启动器已自动适配沙箱）
const readmeLines = [
  '# 旅界 · 桌面版（Windows x64）',
  '',
  '## 怎么启动',
  '',
  '1. **先把整个压缩包完整解压**到一个文件夹（例如 `D:\\旅界\\`）。',
  '   ⚠️ 不要直接在压缩包预览里双击 exe —— 那样只会解出一个 exe，游戏本体（`resources\\`）不在旁边，必然打不开。',
  '2. 进入解压后的文件夹，双击 **`' + RUN_EXE + '`**' +
    (BUILD_LAUNCHER ? '（几 KB 的启动器；`' + CORE_NAME + '` 是内部主程序，不要直接双击它）' : '') + '。',
  '3. 首次运行若弹「Windows 已保护你的电脑 / 无法验证发布者」，点「更多信息 → 仍要运行」或「运行」即可（未做代码签名）。'
]
if (BUILD_LAUNCHER) {
  readmeLines.push(
    '',
    '启动器会自动适配 Chromium 沙箱不可用的环境（必要时自动补 `--no-sandbox`），不需要手动加参数；',
    '若上次异常退出后打不开，删除 `%APPDATA%\\旅界\\SingletonLock` 再启动即可。'
  )
}
readmeLines.push(
  '',
  '存档与 API Key 存在 `%APPDATA%\\旅界\\`。',
  '',
  '## 开发说明',
  '',
  '本目录是**官方 Electron 发行版**（版本见 `version` 文件）+ 同步后的游戏本体。',
  '',
  '- 启动（开发）：`npm start` → `runtime/' + RUN_EXE + '`',
  '- 游戏本体在 `runtime/resources/app/`（由 `app/` + `main.js` + `preload.js` + `assets/` 同步）',
  '- 重建：`node scripts/rebuild-runtime.js`（可设 `AW_ELECTRON_ZIP` 指向官方 zip；`AW_BUILD_LAUNCHER=1` 额外编译启动器）',
  '- 不要把 `node_modules/electron` 整包拷进来当 runtime',
  ''
)
fs.writeFileSync(path.join(RUNTIME, 'README.md'), readmeLines.join('\n'))

// 随包附带「启动游戏.cmd」：与 exe 同目录双击即可，不依赖 npm
const cmdSrc = path.join(ROOT, '启动游戏.cmd')
if (fs.existsSync(cmdSrc)) {
  const portableCmd = [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'set ELECTRON_RUN_AS_NODE=',
    'if not exist "%~dp0AgentWorlds.exe" (',
    '  echo [!] AgentWorlds.exe not found next to this script',
    '  pause',
    '  exit /b 1',
    ')',
    'start "" "%~dp0AgentWorlds.exe"',
    'endlocal',
    ''
  ].join('\r\n')
  fs.writeFileSync(path.join(RUNTIME, '启动游戏.cmd'), portableCmd, 'utf8')
}

console.log('runtime rebuilt →', RUNTIME)
