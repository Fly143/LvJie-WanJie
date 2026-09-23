// 把 app/ 与 main.js 同步进 runtime/resources/app/
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const srcApp = path.join(root, 'app')
const srcMain = path.join(root, 'main.js')
const srcAssets = path.join(root, 'assets')
const dest = path.join(root, 'runtime', 'resources', 'app')

fs.mkdirSync(dest, { recursive: true })
fs.cpSync(srcApp, dest, { recursive: true })
fs.copyFileSync(srcMain, path.join(dest, 'main.js'))
if (fs.existsSync(srcAssets)) {
  fs.mkdirSync(path.join(dest, 'assets'), { recursive: true })
  fs.cpSync(srcAssets, path.join(dest, 'assets'), { recursive: true })
}
fs.writeFileSync(
  path.join(dest, 'package.json'),
  JSON.stringify({ name: 'agent-worlds', productName: 'Agent万象', version: '0.1.0', main: 'main.js' }, null, 2)
)
console.log('synced →', dest)
