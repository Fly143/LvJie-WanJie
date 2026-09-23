// 用旧 Electron 运行时（D:\DS\917580）stage 并冒烟新 app
// 新装 electron 可能缺系统 DLL，故优先复用已知可跑的运行时。
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OLD = 'D:\\DS\\917580'
const STAGE = path.join(ROOT, '.smoke-stage')

function rimraf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true })
}

rimraf(STAGE)
fs.mkdirSync(path.join(STAGE, 'resources', 'app'), { recursive: true })

for (const ent of fs.readdirSync(OLD, { withFileTypes: true })) {
  if (ent.name === 'AgentXiuXian.exe' || ent.name === 'resources') continue
  const s = path.join(OLD, ent.name)
  const d = path.join(STAGE, ent.name)
  if (ent.isDirectory()) copyDir(s, d)
  else fs.copyFileSync(s, d)
}
fs.copyFileSync(path.join(OLD, 'AgentXiuXian.exe'), path.join(STAGE, 'AgentWorlds.exe'))

copyDir(path.join(ROOT, 'app'), path.join(STAGE, 'resources', 'app'))
fs.mkdirSync(path.join(STAGE, 'resources', 'app', 'assets'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'electron', 'main.js'), path.join(STAGE, 'resources', 'app', 'main.js'))
fs.writeFileSync(
  path.join(STAGE, 'resources', 'app', 'package.json'),
  JSON.stringify({ name: 'agent-worlds', productName: 'Agent万象', version: '0.1.0', main: 'main.js' }, null, 2)
)
if (fs.existsSync(path.join(ROOT, 'assets'))) {
  copyDir(path.join(ROOT, 'assets'), path.join(STAGE, 'resources', 'app', 'assets'))
}

const r = spawnSync(path.join(STAGE, 'AgentWorlds.exe'), [], {
  env: { ...process.env, XX_SMOKE_TEST: '1' },
  encoding: 'utf8',
  timeout: 20000
})
const out = (r.stdout || '') + (r.stderr || '')
process.stdout.write(out)
if (!out.includes('"packs":6') && !out.includes('"packs": 6')) {
  console.error('SMOKE_FAIL')
  process.exit(1)
}
console.log('SMOKE_OK')
