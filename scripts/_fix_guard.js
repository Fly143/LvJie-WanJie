const fs = require('fs')
const p = 'app/js/ui/render.js'
let t = fs.readFileSync(p, 'utf8')
const names = ['renderScene', 'renderMap', 'renderProfile', 'renderFriends', 'renderQuests', 'renderBag', 'renderSettings']
let n = 0
for (const name of names) {
  const old = `export function ${name}(app, api) {\r\n  const S = app.S\r\n  const pack = globalThis.__AW_PACKS__[S.worldview]`
  const neu = `export function ${name}(app, api) {\r\n  const S = app.S\r\n  if (!S) return\r\n  const pack = globalThis.__AW_PACKS__[S.worldview]`
  if (t.includes(old)) {
    t = t.split(old).join(neu)
    n++
  } else {
    console.log('MISS', name)
  }
}
fs.writeFileSync(p, t)
console.log('guarded', n)
