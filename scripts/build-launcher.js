// 编译桌面启动器壳 → <target>/AgentWorlds.exe
// 用法：node scripts/build-launcher.js [目标目录，默认 runtime]
// 依赖：Windows 自带 .NET Framework 的 csc.exe（无需安装 SDK）
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'tools', 'launcher', 'AgentWorldsLauncher.cs')
const OUT_DIR = path.resolve(process.argv[2] || path.join(ROOT, 'runtime'))
const OUT = path.join(OUT_DIR, 'AgentWorlds.exe')

function findCsc() {
  const win = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}

if (!fs.existsSync(SRC)) {
  console.error('缺少启动器源码:', SRC)
  process.exit(1)
}
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const csc = findCsc()
if (!csc) {
  console.error('未找到 csc.exe（需要 .NET Framework 4.x，Windows 自带）。')
  console.error('可跳过本步骤直接运行 AgentWorlds-core.exe（但受限会话下可能需要 --no-sandbox）。')
  process.exit(1)
}

// 先备份已有的 AgentWorlds.exe（若它还是原始 Electron 二进制而非本壳）
const core = path.join(OUT_DIR, 'AgentWorlds-core.exe')
const existing = fs.existsSync(OUT)
let existingIsShim = false
if (fs.existsSync(OUT)) {
  try {
    const buf = fs.readFileSync(OUT)
    // 本壳很小（< 64KB）且不是 PE 里的 Electron 资源；这里用体积粗判
    existingIsShim = buf.length < 65536
  } catch (e) { /* ignore */ }
}
if (!existingIsShim && fs.existsSync(OUT) && !fs.existsSync(core)) {
  fs.renameSync(OUT, core)
  console.log('已把原始主程序改名为 AgentWorlds-core.exe')
}
if (!fs.existsSync(core)) {
  console.error('未找到 AgentWorlds-core.exe —— 请先准备好 runtime/（完整 Electron 发行版）再编译启动器。')
  process.exit(1)
}

execFileSync(csc, ['/nologo', '/target:winexe', '/optimize+', '/out:' + OUT, SRC], { stdio: 'inherit' })
console.log('启动器已生成 →', OUT, '(' + fs.statSync(OUT).size + ' bytes)')
console.log('主程序（Electron 本体）:', core)
