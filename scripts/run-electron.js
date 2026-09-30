// 启动 旅界：使用本项目 runtime/ 下的完整 Electron 发行版
// - 先清掉 ELECTRON_RUN_AS_NODE（否则 exe 会被当成 node 跑，静默秒退）
// - 常规启动若在 4 秒内异常退出（受限/远程会话下 Chromium 沙箱不可用会静默秒退），
//   自动用 --no-sandbox 重试一次
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const runtimeDir = path.join(root, 'runtime')
const exe = path.join(runtimeDir, 'AgentWorlds.exe')

if (!fs.existsSync(exe)) {
  console.error('runtime/AgentWorlds.exe 不存在，请先准备 runtime/（完整 Electron 发行版）')
  process.exit(1)
}

const env = Object.assign({}, process.env)
delete env.ELECTRON_RUN_AS_NODE

const args = process.argv.slice(2)
const startedAt = Date.now()

function launch(extraArgs) {
  return spawn(exe, args.concat(extraArgs), {
    stdio: 'inherit',
    env,
    windowsHide: false,
    cwd: runtimeDir
  })
}

const child = launch([])
let retried = false

child.on('error', (e) => {
  console.error('spawn error', e)
  process.exit(1)
})

child.on('close', (code) => {
  const fast = Date.now() - startedAt < 4000
  // 秒退（不论退出码，本环境下无沙箱时会以 0 静默退出）→ 回退兼容模式再试一次
  if (!retried && fast) {
    retried = true
    console.log('[i] 常规启动未成功，改用兼容模式（--no-sandbox）重试…')
    const again = launch(['--no-sandbox'])
    again.on('error', (e) => { console.error('spawn error', e); process.exit(1) })
    again.on('close', (c2) => process.exit(c2 == null ? 1 : c2))
    return
  }
  process.exit(code == null ? 1 : code)
})
