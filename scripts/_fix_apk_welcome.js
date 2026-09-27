const fs = require('fs')
const p = 'app/js/ui/render.js'
let t = fs.readFileSync(p, 'utf8')
const names = ['renderScene', 'renderMap', 'renderProfile', 'renderFriends', 'renderQuests', 'renderBag', 'renderSettings']
let n = 0
for (const name of names) {
  const old = `export function ${name}(app, api) {\n  const S = app.S\n  const pack = globalThis.__AW_PACKS__[S.worldview]`
  const neu = `export function ${name}(app, api) {\n  const S = app.S\n  if (!S) return\n  const pack = globalThis.__AW_PACKS__[S.worldview]`
  if (t.includes(old)) {
    t = t.split(old).join(neu)
    n++
  } else if (t.includes(`export function ${name}(app, api) {\n  const S = app.S\n  if (!S) return\n  const pack`)) {
    console.log(name, 'already guarded')
  } else {
    console.log('MISS', name)
  }
}
fs.writeFileSync(p, t)
console.log('guarded', n)

// i18n zh-CN 英文串改回中文
const p2 = 'app/js/engine/i18n.js'
let s = fs.readFileSync(p2, 'utf8')
const pairs = [
  ["styleHelpChat: 'Chat Completions (OpenAI-compatible): POST …/chat/completions'", "styleHelpChat: 'Chat Completions（OpenAI / 兼容网关常见）：POST …/chat/completions'"],
  ["styleHelpResp: 'Responses API: POST …/responses'", "styleHelpResp: 'Responses API（OpenAI 新版）：POST …/responses'"],
  ["kBasePh: 'e.g. https://api.openai.com/v1 or https://your-gateway/v1'", "kBasePh: '例如 https://api.openai.com/v1 或 https://your-gateway/v1'"],
  ["kNamePh: 'My OpenAI / company gateway…'", "kNamePh: '我的 OpenAI / 公司网关…'"],
  ["kModelPh: 'e.g. gpt-4.1-mini / glm-4-flash / deepseek-chat'", "kModelPh: '例如 gpt-4.1-mini / glm-4-flash / deepseek-chat'"],
  ["modelListN: 'Total'", "modelListN: '共'"],
  ["modelListPick: 'items, pick one'", "modelListPick: '个，选择填入'"],
  ["fetchedModels: 'Fetched'", "fetchedModels: '已拉取'"],
  ["fetchedModels2: ' models'", "fetchedModels2: '个模型'"],
  ["pickOrType: 'Pick from list or type manually.'", "pickOrType: '下拉选择或继续手填。'"],
]
let m = 0
for (const [a, b] of pairs) {
  if (s.includes(a)) {
    s = s.split(a).join(b)
    m++
  } else {
    console.log('MISS i18n', a.slice(0, 40))
  }
}
fs.writeFileSync(p2, s)
console.log('i18n fixed', m)
