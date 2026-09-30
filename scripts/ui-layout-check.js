// 无头测量 API 设置「已保存条目」在手机宽度下的排版。
// 同时渲染两组：
//   NEW = 当前 app/styles.css + 新的两行结构
//   OLD = 复刻修复前的规则（单行挤压、无 nowrap/ellipsis），用于证明检查有鉴别力
// 用系统 Edge 的 --dump-dom 取回测量结果。
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const css = fs.readFileSync(path.join(ROOT, 'app', 'styles.css'), 'utf8')
const EDGE = process.env.AW_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT_HTML = path.join(ROOT, '.smoke-stage', 'layout.html')

const newRows = `
  <div class="key-row">
    <label>
      <input type="radio" name="s1" checked>
      <span class="key-lines">
        <span class="key-top"><b>deepseek-flash</b><span class="ctype">response</span></span>
        <span class="key-sub"><span class="masktext">deepseek-flash</span><span class="masktext key-state">已保存 · 不显示</span></span>
      </span>
    </label>
    <button class="btn btn-sm btn-danger" type="button">删除</button>
  </div>
  <div class="key-row">
    <label>
      <input type="radio" name="s1">
      <span class="key-lines">
        <span class="key-top"><b>一个很长很长的备注名称用于测试截断效果</b><span class="ctype">chat</span></span>
        <span class="key-sub"><span class="masktext">deepseek-reasoner-very-long-model-name</span><span class="masktext key-state">已保存 · 不显示</span></span>
      </span>
    </label>
    <button class="btn btn-sm btn-danger" type="button">删除</button>
  </div>`

// 修复前的结构与规则（单行、6 个元素互相挤压）
const oldRows = `
  <div class="key-row">
    <label>
      <input type="radio" name="s2" checked>
      <b>deepseek-flash</b>
      <span class="ctype">response</span>
      <span class="masktext">deepseek-flash</span>
      <span class="masktext key-state">已保存 · 不显示</span>
    </label>
    <button class="btn btn-sm btn-danger" type="button">删除</button>
  </div>`

const page = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style>
<style>
/* 模拟 360px 手机：弹窗原本是 fixed，这里收进固定宽度容器再量 */
#new,#old{width:360px;margin:0 0 16px}
#new .modal-mask,#old .modal-mask{position:static;padding:20px}
#new .modal,#old .modal{max-width:100%}
/* 复刻修复前的规则，仅作用于 #old 对照组 */
#old .key-row{flex-wrap:wrap}
#old .key-row label{flex:1;display:flex;gap:8px;align-items:center;min-width:160px}
#old .masktext{white-space:normal;overflow:visible;text-overflow:clip}
#old .ctype{white-space:normal;flex:0 1 auto}
#old .key-state{flex:0 1 auto}
</style></head>
<body style="margin:0;padding:10px;background:#0b1020">
<div id="new"><div class="modal-mask"><div class="modal">${newRows}</div></div></div>
<div id="old"><div class="modal-mask"><div class="modal">${oldRows}</div></div></div>
<script>
function measure(scope) {
  var root = document.querySelector(scope)
  var box = e => { var b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } }
  var states = [].slice.call(root.querySelectorAll('.key-state'))
  var names = [].slice.call(root.querySelectorAll('.key-top b, label > b'))
  var row = root.querySelector('.key-row')
  var modal = root.querySelector('.modal')
  var lh = states[0] ? (parseFloat(getComputedStyle(states[0]).lineHeight) || 16) : 16
  return {
    lineHeight: Math.round(lh),
    states: states.map(function (e) { var r = box(e); r.text = e.textContent; return r }),
    names: names.map(function (e) { var r = box(e); r.text = e.textContent; return r }),
    row: box(row), modal: box(modal),
    rowOverflow: row.scrollWidth - row.clientWidth,
    phone: Math.round(root.getBoundingClientRect().width),
    pageOverflow: root.scrollWidth - root.clientWidth,
    viewport: window.innerWidth
  }
}
var out = { new: measure('#new'), old: measure('#old') }
var pre = document.createElement('pre')
pre.id = 'aw-out'
var A = 'AW_JSON_ST' + 'ART', B = 'AW_JSON_EN' + 'D'
pre.textContent = A + JSON.stringify(out) + B
document.body.appendChild(pre)
</script>
</body></html>`

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true })
fs.writeFileSync(OUT_HTML, page)

const url = 'file:///' + OUT_HTML.replace(/\\/g, '/')
let dom = ''
try {
  dom = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--window-size=360,720', '--virtual-time-budget=3000', '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (e) {
  console.log('UI_LAYOUT_ERROR 无法运行 Edge: ' + (e && e.message))
  process.exit(1)
}

const hits = [...dom.matchAll(/AW_JSON_START([\s\S]*?)AW_JSON_END/g)]
const m = hits.length ? hits[hits.length - 1] : null
if (!m) {
  console.log('UI_LAYOUT_ERROR 未取到测量结果（Edge 未执行脚本？）')
  process.exit(1)
}
let r
try { r = JSON.parse(m[1]) } catch (e) {
  console.log('UI_LAYOUT_ERROR JSON 解析失败')
  process.exit(1)
}

const lines = []
let fail = 0
const check = (name, cond, extra) => {
  lines.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''))
  if (!cond) fail++
}
const vertical = (v) => v.states.some(s => s.h > v.lineHeight * 2 + 2 || s.w <= s.h)
const overflowing = (v) => v.rowOverflow > 0 || v.pageOverflow > 0

for (const key of ['new', 'old']) {
  const v = r[key]
  lines.push(`[${key}] viewport=${v.viewport} lineHeight=${v.lineHeight} row=${v.row.w}x${v.row.h} modal=${v.modal.w} ` +
    `rowOverflow=${v.rowOverflow} pageOverflow=${v.pageOverflow}`)
  v.states.forEach((s, i) => lines.push(`   state[${i}] ${s.w}x${s.h} "${s.text}"`))
  v.names.forEach((s, i) => lines.push(`   name[${i}] ${s.w}x${s.h} "${s.text}"`))
}

check('新样式：状态文字不竖排', !vertical(r.new))
check('新样式：无横向溢出', !overflowing(r.new))
check('新样式：长备注名被截断而非撑破', r.new.names[1].w <= r.new.row.w)
check('新样式：弹窗不超屏', r.new.modal.w <= r.new.viewport)
// 鉴别力：对照组必须复现问题，否则说明这个检查测不出东西
check('对照组（旧样式）确实复现竖排或溢出', vertical(r.old) || overflowing(r.old))

console.log(lines.join('\n'))
console.log(fail ? 'UI_LAYOUT_FAIL' : 'UI_LAYOUT_OK')
process.exit(fail ? 1 : 0)
