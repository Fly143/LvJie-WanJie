const fs = require('fs')
const path = require('path')

function patch(file, oldStr, newStr, label) {
  const p = path.resolve(file)
  let t = fs.readFileSync(p, 'utf8')
  if (!t.includes(oldStr)) {
    console.log('MISS', label)
    process.exitCode = 1
    return
  }
  t = t.split(oldStr).join(newStr)
  fs.writeFileSync(p, t)
  console.log('OK', label)
}

// 1) Android: 不要暴露 stream 桩（会让 canStream 为真），只保留 request
patch('android/app/src/main/java/com/lvjie/app/MainActivity.kt',
`window.awHost={http:{request:req,stream:function(){return Promise.resolve({ok:false})},abort:function(){return Promise.resolve({ok:true})},onChunk:function(){return function(){}},onEnd:function(){return function(){}},onHead:function(){return function(){}}}`,
`window.awHost={http:{request:req,abort:function(){return Promise.resolve({ok:true})},onChunk:function(){return function(){}},onEnd:function(){return function(){}},onHead:function(){return function(){}}}`,
'android-no-stream-stub')

// 2) event.js：任何提前 return 都复位 loading；整体 try/finally
patch('app/js/engine/event.js',
`  if (EV._turn !== turn) return // 过期响应丢弃
  if (EV._ctl === ctl) EV._ctl = null

  if (!res.ok) {
    EV.loading = false`,
`  if (EV._turn !== turn) {
    EV.loading = false
    return // 过期响应丢弃
  }
  if (EV._ctl === ctl) EV._ctl = null

  if (!res.ok) {
    EV.loading = false`,
'event-turn-guard')

patch('app/js/engine/event.js',
`    if (EV._turn !== turn) return // recover 期间被 endEvent/新回合作废
    if (EV.ended && EV._endedByUser) {
      EV.loading = false
      return
    }`,
`    if (EV._turn !== turn) {
      EV.loading = false
      return // recover 期间被 endEvent/新回合作废
    }
    if (EV.ended && EV._endedByUser) {
      EV.loading = false
      return
    }`,
'event-recover-guard')

// 3) event.js：extractGameJSON 等抛错时也要复位 loading
patch('app/js/engine/event.js',
`  const text = normalizeText(res.text)
  const json = extractGameJSON(text)
  const narrative = stripJSONBlock(text)`,
`  let text = ''
  let json = null
  let narrative = ''
  try {
    text = normalizeText(res.text)
    json = extractGameJSON(text)
    narrative = stripJSONBlock(text)
  } catch (e) {
    EV.loading = false
    EV.error = (e && e.message) || '解析失败'
    if (hooks.onState) hooks.onState(EV)
    return
  }`,
'event-parse-guard')

// 4) llm.js：canStream 仅当 stream 真的可用（Android 桩已删，双保险）
patch('app/js/engine/llm.js',
`  const canStream = typeof onDelta === 'function' && globalThis.awHost && globalThis.awHost.http && globalThis.awHost.http.stream`,
`  const canStream = typeof onDelta === 'function' && globalThis.awHost && globalThis.awHost.http && globalThis.awHost.http.stream && globalThis.awHost.http.onChunk && globalThis.awHost.http.onEnd`,
'canStream-strict')

console.log('done')
