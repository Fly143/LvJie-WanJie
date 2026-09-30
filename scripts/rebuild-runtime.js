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
fs.writeFileSync(
  path.join(RUNTIME, 'PROVENANCE.txt'),
  [
    'electron_version=' + (ver || 'unknown'),
    'source=' + dist,
    'package_electron=' + (rootPkg.devDependencies && rootPkg.devDependencies.electron),
    'rebuilt_at=' + new Date().toISOString(),
    'main_exe=' + EXE_NAME + (BUILD_LAUNCHER ? ' (+ AgentWorlds.exe launcher shim)' : ''),
    'note=main_exe is electron.exe renamed; window icon set in main.js'
  ].join('\n') + '\n'
)

// —— 随包启动器脚本（内容保持 ASCII：cmd.exe 会按当前代码页解析脚本字节，中文会被拆成命令）——
const CMD_SMART = [
  '@echo off',
  'rem ASCII-only on purpose: cmd.exe mangles non-ASCII bytes inside .cmd files.',
  'rem Normal launch first; if it exits within a few seconds (Chromium sandbox is not',
  'rem usable in some restricted/remote sessions and the app quits silently), retry',
  'rem once with --no-sandbox.',
  'setlocal',
  'set "EXE=%~dp0' + RUN_EXE + '"',
  'if not exist "%EXE%" (',
  '  echo [x] %EXE% not found - please extract the whole ZIP first.',
  '  pause',
  '  exit /b 1',
  ')',
  'echo Starting AgentWorlds ...',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$exe=\'%EXE%\'; $p = Start-Process -FilePath $exe -PassThru; Start-Sleep -Seconds 5; if ($p.HasExited) { Write-Host \'[i] normal launch failed, retrying with --no-sandbox ...\'; Start-Process -FilePath $exe -ArgumentList \'--no-sandbox\' | Out-Null } else { Write-Host \'[i] started.\' }"',
  'endlocal',
  ''
].join('\r\n')
const CMD_COMPAT = [
  '@echo off',
  'rem ASCII-only on purpose. Always launches with --no-sandbox.',
  'setlocal',
  'set "EXE=%~dp0' + RUN_EXE + '"',
  'if not exist "%EXE%" (',
  '  echo [x] %EXE% not found - please extract the whole ZIP first.',
  '  pause',
  '  exit /b 1',
  ')',
  'echo Starting AgentWorlds in compatibility mode (--no-sandbox) ...',
  'start "" "%EXE%" --no-sandbox',
  'endlocal',
  ''
].join('\r\n')
const CMD_FIX = [
  '@echo off',
  'rem ASCII-only on purpose. Clears leftover Chromium single-instance lock files that',
  'rem can make the app exit silently on some machines.',
  'setlocal',
  'set "UD=%APPDATA%\\旅界"',
  'if not exist "%UD%" (',
  '  echo userData folder not found - nothing to fix.',
  '  pause',
  '  exit /b 0',
  ')',
  'echo Closing any running instance ...',
  'taskkill /IM ' + (BUILD_LAUNCHER ? 'AgentWorlds.exe' : 'AgentWorlds.exe') + ' /F >nul 2>nul',
  'taskkill /IM AgentWorlds-core.exe /F >nul 2>nul',
  'timeout /t 1 /nobreak >nul',
  'echo Clearing singleton lock files ...',
  'del /f /q "%UD%\\SingletonLock" >nul 2>nul',
  'del /f /q "%UD%\\SingletonCookie" >nul 2>nul',
  'del /f /q "%UD%\\SingletonSocket" >nul 2>nul',
  'if exist "%UD%\\SingletonLock" (',
  '  echo [x] Could not delete the lock file - try running as Administrator.',
  ') else (',
  '  echo [i] Done. Now run the launcher .cmd in this folder.',
  ')',
  'pause',
  'endlocal',
  ''
].join('\r\n')
fs.writeFileSync(path.join(RUNTIME, '启动游戏.cmd'), CMD_SMART)
fs.writeFileSync(path.join(RUNTIME, '启动游戏（兼容模式）.cmd'), CMD_COMPAT)
fs.writeFileSync(path.join(RUNTIME, '修复启动.cmd'), CMD_FIX)

// 一眼能看懂的启动说明（放在最外层，避免玩家点错那个大体积的内部主程序）
fs.writeFileSync(
  path.join(RUNTIME, '★ 请双击这里启动.txt'),
  BUILD_LAUNCHER
    ? [
        '双击本目录下的  AgentWorlds.exe  即可启动（几 KB 的那个）。',
        '',
        'AgentWorlds-core.exe（200+ MB）是真正的 Electron 主程序，不要直接双击它：',
        '它在部分受限/远程会话里需要 --no-sandbox 才能启动，AgentWorlds.exe（启动器壳）会自动加上这个参数。',
        '',
        '如果双击 AgentWorlds.exe 没有任何反应：',
        '  1) 先运行 修复启动.cmd  再试（清理上次异常退出残留的实例锁）；',
        '  2) 仍不行就用 启动游戏（兼容模式）.cmd（始终带 --no-sandbox）；',
        '  3) 首次运行若弹「无法验证发布者 / Windows 已保护你的电脑」，点「运行」或「更多信息 → 仍要运行」。',
        '',
        '存档与 API Key 位置：%APPDATA%\\旅界\\',
        ''
      ].join('\r\n')
    : [
        '双击本目录下的  AgentWorlds.exe  即可启动。',
        '',
        '如果双击没有任何反应：先运行 修复启动.cmd，再用 启动游戏（兼容模式）.cmd。',
        '存档与 API Key 位置：%APPDATA%\\旅界\\',
        ''
      ].join('\r\n')
)

fs.writeFileSync(
  path.join(RUNTIME, 'README.md'),
  [
    '# 旅界 · 桌面版（Windows x64）',
    '',
    '## 怎么启动',
    '',
    '1. **先把整个压缩包完整解压**到一个文件夹（例如 `D:\\旅界\\`）。',
    '   ⚠️ 不要直接在压缩包预览里双击 exe —— 那样只会解出一个 exe，游戏本体（`resources\\`）不在旁边，必然打不开。',
    '2. 进入解压后的文件夹，双击 **`' + RUN_EXE + '`**' + (BUILD_LAUNCHER ? '（几 KB 的那个启动器壳；带「内部程序·勿直接运行」字样的不要点，它需要 --no-sandbox 才能起）' : '') + '。',
    '3. 若双击没反应，再双击 **`启动游戏.cmd`**（会自动改用兼容模式重试），或 **`启动游戏（兼容模式）.cmd`**。',
    '',
    '## 打不开时按顺序排查',
    '',
    '| 现象 | 处理 |',
    '| --- | --- |',
    '| 双击没反应 / 窗口闪一下就没了 | 运行 `启动游戏（兼容模式）.cmd`（等价于加 `--no-sandbox`） |',
    '| 提示「实例锁被占用」或莫名其妙退出 | 运行 `修复启动.cmd`（清理残留实例锁 + 结束残留进程）再启动 |',
    '| 弹「Windows 已保护你的电脑 / 无法验证发布者」 | 点「更多信息 → 仍要运行」或「运行」（未做代码签名） |',
    '| 解压后没有 `resources` 文件夹 | 说明只解出了单个 exe，重新完整解压 |',
    '| 卡在空白窗口 | 先看是否有杀毒软件拦截；再试兼容模式 |',
    '| 提示缺少 DLL | 确认解压时没有跳过 `*.dll` 与 `locales\\` |',
    '',
    '存档与 API Key 存在 `%APPDATA%\\旅界\\`。',
    '',
    '## 开发说明',
    '',
    '本目录是**官方 Electron 发行版**（见 `version` / `PROVENANCE.txt`）+ 同步后的游戏本体。',
    '',
    '- 启动（开发）：`npm start` → `runtime/' + RUN_EXE + '`',
    '- 游戏本体在 `runtime/resources/app/`（由 `app/` + `main.js` + `preload.js` + `assets/` 同步）',
    '- 重建：`node scripts/rebuild-runtime.js`（可设 `AW_ELECTRON_ZIP` 指向官方 zip；`AW_BUILD_LAUNCHER=1` 额外编译启动器壳）',
    '- 不要把 `node_modules/electron` 整包拷进来当 runtime',
    ''
  ].join('\n')
)

console.log('runtime rebuilt →', RUNTIME)
