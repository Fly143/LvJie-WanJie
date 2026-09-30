// 自定义 LLM 接入：不绑定厂商，仅需 Base URL + API Key + 模型 + 协议
// apiStyle: 'chat'     → POST {base}/chat/completions   (OpenAI Chat Completions)
//           'response' → POST {base}/responses          (OpenAI Responses API)
// 走 awHost.http（主进程代理）；无宿主时回退 fetch（Node 冒烟）
import { isZenKey, isZenBase, zenPatchBody, zenHeaders, zenSseAggregate, zenNextModel, zenActiveModel, writeZenCache, zenAddUsage, zenLimitKind, zenLimitMessage } from './zen.js'

const DEFAULT_TIMEOUT_MS = 120000
const MAX_TOKENS = 4000
export const MAX_TOKENS_DRAFT = 8000

/** 归一化玩家 Key 对象 */
export function normalizeApiKey(k) {
  if (!k || typeof k !== 'object') return null
  const apiStyle = (k.apiStyle === 'response' || k.style === 'response') ? 'response' : 'chat'
  const baseUrl = String(k.baseUrl || k.url || k.endpoint || '').trim().replace(/\/+$/, '')
  const key = String(k.key || k.value || k.token || '').trim()
  const model = String(k.model || '').trim()
  const name = String(k.name || k.label || model || '自定义').trim()
  if (!baseUrl || !key || !model) return null
  return { name, baseUrl, key, model, apiStyle }
}

export function maskKey(key) {
  const s = String(key || '')
  return s ? '••••••••' : ''
}

/** 把 Base URL 拼成最终 endpoint */
export function endpointOf(k) {
  const base = String(k.baseUrl || '').replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) return ''
  if (k.apiStyle === 'response') {
    if (/\/responses$/i.test(base)) return base
    return base + '/responses'
  }
  if (/\/chat\/completions$/i.test(base)) return base
  if (/\/v\d+$/i.test(base)) return base + '/chat/completions'
  if (/\/completions$/i.test(base)) return base
  return base + '/chat/completions'
}

function messagesToResponseInput(messages) {
  return messages.map(m => ({
    role: m.role,
    content: m.content
  }))
}

function extractResponseText(data) {
  if (!data) return ''
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text
  if (typeof data.output === 'string') return data.output
  if (Array.isArray(data.output)) {
    const parts = []
    for (const item of data.output) {
      if (!item) continue
      if (typeof item.content === 'string') { parts.push(item.content); continue }
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (!c) continue
          if (typeof c.text === 'string') parts.push(c.text)
          else if (typeof c.content === 'string') parts.push(c.content)
        }
      }
      if (typeof item.text === 'string') parts.push(item.text)
    }
    return parts.join('\n').trim()
  }
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content || ''
  }
  return ''
}

/** 统一 HTTP：主进程代理优先 */
async function httpSend({ url, method, headers, body, timeoutMs, signal }) {
  const ms = timeoutMs || DEFAULT_TIMEOUT_MS
  const host = globalThis.awHost && globalThis.awHost.http
  if (host && host.request) {
    // 主进程代理；本地 signal 仅用于 UI 取消时忽略过期结果
    const r = await host.request({ url, method, headers, body, timeoutMs: ms })
    if (signal && signal.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
      throw err
    }
    if (!r || !r.ok) {
      const err = new Error((r && r.error) || '网络错误')
      if (r && r.aborted) err.name = 'AbortError'
      throw err
    }
    return { status: r.status, text: r.text }
  }

  const timeoutCtl = new AbortController()
  const timer = setTimeout(() => timeoutCtl.abort(), ms)
  let combined = timeoutCtl.signal
  if (signal) {
    if (typeof AbortSignal.any === 'function') {
      combined = AbortSignal.any([signal, timeoutCtl.signal])
    } else {
      signal.addEventListener('abort', () => timeoutCtl.abort(), { once: true })
    }
  }
  try {
    const res = await fetch(url, { method, headers, body, signal: combined })
    const text = await res.text()
    return { status: res.status, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 对外的调用入口：内置免费通道失败时自动换下一个免费模型重试。
 */
export async function callLLM(opts = {}) {
  const k0 = normalizeApiKey(opts.keyObj)
  if (!isZenKey(k0)) return callLLMOnce(opts)
  let model = k0.model || zenActiveModel()
  let last = null
  for (let i = 0; i < 3; i++) {
    const keyObj = Object.assign({}, opts.keyObj, { model })
    const r = await callLLMOnce(Object.assign({}, opts, { keyObj }))
    if (r && r.ok) {
      writeZenCache({ working: model, at: Date.now() })
      if (i > 0) {
        try { opts.keyObj.model = model } catch (e) { /* ignore */ }
        return Object.assign({}, r, { zenSwitched: model, zenFrom: k0.model })
      }
      return r
    }
    last = r
    if (r && r.aborted) return r
    const err = String((r && r.error) || '')
    // 额度/限流：同一额度下换模型没用，直接把原因讲清楚（否则剧情中途会莫名失败）
    const limitKind = zenLimitKind(err)
    if (limitKind) {
      return Object.assign({}, r, { error: zenLimitMessage(limitKind), zenLimit: limitKind })
    }
    // 只有「通道/模型本身不可用」才换模型；网络波动交给上层既有重试
    if (!/HTTP (400|401|403|404|422|426|429)|FreeTier|free tier|not found|未找到/i.test(err)) return r
    const next = zenNextModel(model)
    if (!next || next === model) {
      return Object.assign({}, r, { error: err + '（内置免费通道暂无其它可用模型）' })
    }
    model = next
  }
  return last || { ok: false, error: '内置免费通道调用失败' }
}

/**
 * 测试连接：发一次最小请求，验证 Base URL / Key / 模型是否真的能用。
 * 没填模型时退化为拉取模型列表（`GET {Base URL}/models`）。
 * 内置免费通道会自动走指纹注入与换模型逻辑。
 * @returns {Promise<{ok:boolean, ms:number, reply?:string, count?:number, url?:string, switched?:string, error?:string}>}
 */
export async function testConnection({ baseUrl, key, model, apiStyle, timeoutMs } = {}) {
  const started = Date.now()
  const base = String(baseUrl || '').trim()
  const token = String(key || '').trim()
  const mdl = String(model || '').trim()
  const ms = () => Date.now() - started
  if (!base) return { ok: false, ms: ms(), error: '请先填写 Base URL' }
  if (!token) return { ok: false, ms: ms(), error: '请先填写 API Key' }

  // 没填模型：退化为模型列表探测（同样能验证地址与密钥）
  if (!mdl) {
    const r = await listModels({ baseUrl: base, key: token })
    if (r && r.ok) return { ok: true, ms: ms(), count: (r.models || []).length, url: r.url }
    return { ok: false, ms: ms(), error: (r && r.error) || '连接失败', url: r && r.url }
  }

  const k = normalizeApiKey({ baseUrl: base, key: token, model: mdl, apiStyle })
  if (!k) return { ok: false, ms: ms(), error: '配置不完整（需要 Base URL、Key、模型）' }
  const t = Number(timeoutMs) > 0 ? Number(timeoutMs) : 20000
  try {
    const r = await callLLM({ keyObj: k, user: '回复一个字：好', maxTokens: 16, timeoutMs: t })
    if (r && r.ok) {
      return {
        ok: true,
        ms: ms(),
        reply: String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        switched: r.zenSwitched || undefined
      }
    }
    return { ok: false, ms: ms(), error: (r && r.error) || '连接失败' }
  } catch (e) {
    return { ok: false, ms: ms(), error: (e && e.message) || '连接失败' }
  }
}

/** 单次调用（不含内置通道的换模型重试） */
async function callLLMOnce({ keyObj, system, user, history = [], signal, onDelta, maxTokens, prevResponseId, forceJson, timeoutMs }) {
  const k = normalizeApiKey(keyObj)
  if (!k) {
    return { ok: false, error: '未配置有效的 API（需要 Base URL、Key、模型）' }
  }

  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  for (const h of history) {
    if (h && h.role && h.content != null) messages.push({ role: h.role, content: h.content })
  }
  messages.push({ role: 'user', content: user })

  const url = endpointOf(k)
  if (!url) return { ok: false, error: 'Base URL 必须以 http(s):// 开头' }

  // 内置免费通道：上游只有 chat/completions，且强制 stream:true
  const zen = isZenKey(k)
  const isChat = zen ? true : (k.apiStyle !== 'response')
  // Responses API：有 prevResponseId 时走服务端链（只发增量）
  const useChain = !isChat && !!prevResponseId
  let body
  if (!isChat) {
    if (useChain) {
      body = {
        model: k.model,
        // 链上续聊不重放历史，system 提示必须走 instructions，否则改提示词不生效
        instructions: system,
        input: [{ role: 'user', content: user }],
        previous_response_id: String(prevResponseId),
        store: true,
        temperature: 0.9
      }
      // 链上续聊也必须强制 JSON，否则第二轮起模型吐纯文本，解析不到数据块
      if (forceJson) body.text = { format: { type: 'json_object' } }
    } else {
      body = {
        model: k.model,
        input: messagesToResponseInput(messages),
        store: true,
        temperature: 0.9
      }
      if (forceJson) body.text = { format: { type: 'json_object' } }
    }
    if (maxTokens > 0) body.max_output_tokens = Number(maxTokens)
  } else {
    body = {
      model: k.model,
      messages,
      temperature: 0.9
    }
    // 仅游戏事件强制 JSON，避免破坏考据等自由文本调用
    if (forceJson) body.response_format = { type: 'json_object' }
    if (maxTokens > 0) body.max_tokens = Number(maxTokens)
  }

  // 流式：chat / response 均支持；宿主 stream + 增量回调
  const canStream = typeof onDelta === 'function' && globalThis.awHost && globalThis.awHost.http && globalThis.awHost.http.stream && globalThis.awHost.http.onChunk && globalThis.awHost.http.onEnd
  const reqMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
  // 内置通道：补齐上游要求的 tools 与 stream，并用 tool_choice:none 压住工具调用
  if (zen) body = zenPatchBody(body, !!canStream)
  if (canStream) {
    body.stream = true
    let streamed = null
    try {
      streamed = await callLLMStream({ k, url, body, signal, onDelta, apiStyle: isChat ? 'chat' : 'response', timeoutMs: reqMs })
    } catch (e) {
      streamed = null
    }
    // 启动失败或零增量失败 → 回退非流式（内置通道必须保持 stream:true，否则上游 403）
    if (streamed) return streamed
    if (!zen) delete body.stream
  }

  // 部分网关不支持 response_format：4xx 时去掉该字段重试一次
  const sendOnce = () => {
    if (zen) zenAddUsage(1) // 本机用量估算（用于额度提示）
    return httpSend({
      url,
      method: 'POST',
      headers: zen
        ? zenHeaders({ 'Content-Type': 'application/json', 'Accept': 'text/event-stream' })
        : {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + k.key
          },
      body: JSON.stringify(body),
      timeoutMs: reqMs,
      signal
    })
  }
  try {
    let res = await sendOnce()
    if (res && res.status >= 400 && res.status < 500 && /response_format|text\.format|json_object/i.test(String(res.text || ''))) {
      delete body.response_format
      if (body.text) delete body.text
      res = await sendOnce()
    }
    let raw = res.text || ''
    // 内置通道上游只回 SSE：非流式调用方在这里聚合回 JSON
    if (zen && raw && !/^\s*[\[{]/.test(raw) && /data:\s*\{/.test(raw)) raw = zenSseAggregate(raw)
    if (res.status < 200 || res.status >= 300) {
      let msg = raw.slice(0, 400)
      try {
        const j = JSON.parse(raw)
        msg = (j.error && (j.error.message || j.error.msg || j.error)) || j.message || msg
        if (typeof msg === 'object') msg = JSON.stringify(msg)
      } catch (e) { /* keep raw */ }
      return { ok: false, error: 'HTTP ' + res.status + ': ' + msg }
    }
    let data
    try { data = JSON.parse(raw) } catch (e) { return { ok: false, error: '响应不是合法 JSON' } }

    let text = normalizeContentText(
      !isChat
        ? extractResponseText(data)
        : (data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : extractResponseText(data))
    )
    if (!text) return { ok: false, error: '模型返回空内容' }
    const responseId = (!isChat && data && typeof data.id === 'string') ? data.id : undefined
    return { ok: true, text, responseId }
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, error: '已取消', aborted: true }
    return { ok: false, error: (e && e.message) || '网络错误' }
  }
}

/** content 可能是 string 或 [{type,text}] */
function normalizeContentText(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    return v.map(p => {
      if (typeof p === 'string') return p
      if (p && typeof p.text === 'string') return p.text
      if (p && typeof p.content === 'string') return p.content
      return ''
    }).join('')
  }
  return String(v)
}

/** SSE 流式：chat 读 choices.delta.content；response 读 response.output_text.delta */
async function callLLMStream({ k, url, body, signal, onDelta, apiStyle, timeoutMs }) {
  const host = globalThis.awHost.http
  // end 只认本流 id；id 未就绪时挂起，避免并发串扰
  let streamId = null
  const waiters = []
  const endBox = { done: null, p: null }
  endBox.p = new Promise((r) => { endBox.done = r })
  let buf = ''
  let text = ''
  let status = 200
  let err = null
  let aborted = false
  let streamRespId = null
  let endFallbackOff = null
  let endFallbackTimer = null

  const pushDelta = (delta) => {
    if (!delta) return
    text += delta
    try { onDelta(delta, text) } catch (e) { /* ignore */ }
  }

  // 必须先注册 chunk/end，再 stream，否则首批 chunk 丢失
  const offEnd0 = host.onEnd((d) => {
    if (!d) return
    if (!streamId) {
      waiters.push(d)
      return
    }
    if (d.id === streamId) endBox.done(d)
  })
  const offChunk = host.onChunk((d) => {
    if (!d || (streamId && d.id !== streamId)) return
    buf += d.text || ''
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        // 捕获响应 id：response 事件带 response.id（response.created 等）；chat 首 chunk 带顶层 id
        if (!streamRespId) {
          if (apiStyle === 'response') {
            if (j && j.response && typeof j.response.id === 'string') streamRespId = j.response.id
          } else if (j && typeof j.id === 'string') {
            streamRespId = j.id
          }
        }
        const delta = extractStreamDelta(j, apiStyle)
        if (delta) pushDelta(delta)
      } catch (e) { /* partial json */ }
    }
  })
  const drainWaiters = () => {
    if (!streamId) return
    for (const d of waiters) {
      if (d && d.id === streamId) endBox.done(d)
    }
    waiters.length = 0
  }
  // 统一收尾：注销所有监听器 + 清理兜底定时器
  let offHead = () => {}
  const cleanupStream = () => {
    try { offEnd0() } catch (e) { /* ignore */ }
    try { offChunk() } catch (e) { /* ignore */ }
    try { offEnd() } catch (e) { /* ignore */ }
    try { offHead() } catch (e) { /* ignore */ }
    if (endFallbackTimer) { clearTimeout(endFallbackTimer); endFallbackTimer = null }
    if (endFallbackOff) { try { endFallbackOff() } catch (e) { /* ignore */ } endFallbackOff = null }
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  if (isZenKey(k)) zenAddUsage(1) // 本机用量估算（用于额度提示）
  const started = await host.stream({
    url,
    method: 'POST',
    headers: isZenKey(k)
      ? zenHeaders({ 'Content-Type': 'application/json', 'Accept': 'text/event-stream' })
      : {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + k.key,
          'Accept': 'text/event-stream'
        },
    body: JSON.stringify(body),
    timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
  })
  if (!started || !started.ok || !started.id) {
    // 启动失败必须把已注册的 chunk/end 监听一并注销，否则泄漏的 onChunk 会把后续并发流的增量灌进本回调
    try { offEnd0() } catch (e) { /* ignore */ }
    try { offChunk() } catch (e) { /* ignore */ }
    return null
  }
  const id = started.id
  streamId = id
  drainWaiters()
  const endForId = new Promise((resolve) => {
    endBox.p.then((d) => {
      if (d && (d.id === id || !d.id)) resolve(d)
      else {
        const off = host.onEnd((dd) => {
          if (dd && dd.id === id) { try { off() } catch (e) {} resolve(dd) }
        })
        endFallbackOff = off
        endFallbackTimer = setTimeout(() => { try { off() } catch (e) {} }, 200000)
      }
    })
  })

  const onAbort = () => {
    aborted = true
    try { host.abort(id) } catch (e) { /* ignore */ }
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  offHead = host.onHead((d) => {
    try {
      if (d && d.id === id && d.headers) {
        // 不可靠，仅为兜底
      }
    } catch (e) { /* ignore */ }
  })
  const offEnd = host.onEnd((d) => {
    if (!d || d.id !== id) return
    status = d.status || status
    if (!d.ok) err = d.error || '流式失败'
    if (d.aborted) aborted = true
    endBox.done(d)
  })
  const settled = { end: null }
  const endPromise = endForId.then((d) => {
    if (d) {
      status = d.status || status
      if (!d.ok) err = d.error || '流式失败'
      if (d.aborted) aborted = true
    }
    settled.end = true
    return true
  })

  // 仅当 8 秒内完全无增量才放弃流式；一旦有字，必须等 end
  const noChunkFail = new Promise((resolve) => {
    setTimeout(() => {
      if (!text) resolve('empty')
      // 有字则不 resolve，交给 endPromise / waitStreamEnd
    }, 8000)
  })
  const raceResult = await Promise.race([
    endPromise.then(() => 'end'),
    waitStreamEnd(host, id).then(() => 'timeout'),
    noChunkFail
  ])
  if (raceResult === 'empty' && !text) {
    try { host.abort(id) } catch (e) { /* ignore */ }
    cleanupStream()
    return null
  }
  if (!settled.end && !text) {
    cleanupStream()
    return null
  }
  let incomplete = false
  if (!settled.end && text && err == null && !aborted) {
    // 超时/半截：仍返回文本，但标记不完整
    incomplete = true
  }
  cleanupStream()

  // 零增量失败 → 让上层回退非流式
  const gotText = text.trim().length > 0
  if (!gotText) return null
  if (aborted) return { ok: false, error: '已取消', aborted: true }
  if (err) return { ok: false, error: err }
  if (status < 200 || status >= 300) return { ok: false, error: 'HTTP ' + status }
  return { ok: true, text, incomplete: incomplete || undefined, responseId: streamRespId || undefined }
}

/** 从 SSE JSON 里抠增量文本 */
export function extractStreamDelta(j, apiStyle) {
  if (!j || typeof j !== 'object') return ''
  if (apiStyle === 'response') {
    const t = String(j.type || '')
    // 思考链/摘要不是正文，绝不能进 resultText
    if (/reason|think|summary/i.test(t)) return ''
    // 仅 output_text.delta（含兼容 text.delta）算正文
    if (typeof j.delta === 'string' && /output_text\.delta|(^|\.)text\.delta$/i.test(t) && !/reason|think/i.test(t)) return j.delta
    if (typeof j.output_text === 'string' && j.output_text) return j.output_text
    if (j.choices && j.choices[0] && j.choices[0].delta && typeof j.choices[0].delta.content === 'string') {
      return j.choices[0].delta.content
    }
    return ''
  }
  // chat completions
  if (j.choices && j.choices[0] && j.choices[0].delta) {
    const c = j.choices[0].delta.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      return c.map(p => (p && typeof p.text === 'string') ? p.text : '').join('')
    }
  }
  return ''
}

function waitStreamEnd(host, id, maxMs = 185000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearInterval(timer)
      try { off() } catch (e) { /* ignore */ }
      resolve()
    }
    const timer = setInterval(() => {
      if (Date.now() - t0 > maxMs) {
        try { host.abort(id) } catch (e) { /* ignore */ }
        done()
      }
    }, 250)
    const off = host.onEnd((d) => {
      if (!d || d.id !== id) return
      done()
    })
  })
}

/** 拉取模型列表（OpenAI 兼容 GET {base}/models） */
export async function listModels({ baseUrl, key }) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  const token = String(key || '').trim()
  if (!base) return { ok: false, error: '请先填写 Base URL' }
  if (!/^https?:\/\//i.test(base)) return { ok: false, error: 'Base URL 必须以 http(s):// 开头' }
  if (!token) return { ok: false, error: '请先填写 API Key' }

  let url = base
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '/models')
  else if (/\/responses$/i.test(url)) url = url.replace(/\/responses$/i, '/models')
  else if (/\/v\d+$/i.test(url) || /\/compatible-mode\/v\d+$/i.test(url)) url = url + '/models'
  else if (/\/models$/i.test(url)) { /* already */ }
  else url = url + '/models'

  try {
    const res = await httpSend({
      url,
      method: 'GET',
      headers: isZenBase(base)
        ? zenHeaders({ 'Content-Type': 'application/json' })
        : {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
      timeoutMs: 30000
    })
    const raw = res.text || ''
    if (res.status < 200 || res.status >= 300) {
      let msg = raw.slice(0, 300)
      try {
        const j = JSON.parse(raw)
        msg = (j.error && (j.error.message || j.error.msg)) || j.message || msg
      } catch (e) { /* keep raw */ }
      return { ok: false, error: 'HTTP ' + res.status + ': ' + msg, url }
    }
    let data
    try { data = JSON.parse(raw) } catch (e) { return { ok: false, error: '响应不是合法 JSON', url } }

    const ids = []
    const list = Array.isArray(data) ? data
      : Array.isArray(data.data) ? data.data
      : Array.isArray(data.models) ? data.models
      : Array.isArray(data.items) ? data.items
      : []
    for (const m of list) {
      const id = typeof m === 'string' ? m : (m && (m.id || m.model || m.name))
      if (id && ids.indexOf(String(id)) < 0) ids.push(String(id))
    }
    if (!ids.length) return { ok: false, error: '未解析到模型 id', url }
    ids.sort()
    return { ok: true, models: ids, url }
  } catch (e) {
    return { ok: false, error: (e && e.message) || '网络错误' }
  }
}

/** 从模型输出中抽出 JSON（优先 ```json 块；降级用括号配对扫描） */

/** 流式展示用：从（可能未闭合的）JSON 里抽出 narrative，去掉转义，避免刷屏 JSON/字面 \n */
export function narrativeFromStream(text) {
  const s = String(text == null ? '' : text)
  if (!s) return ''
  const j = extractGameJSON(s)
  if (j && typeof j.narrative === 'string' && j.narrative.trim()) return j.narrative
  // 未闭合 JSON：直接抠 "narrative":".....
  const m = s.match(/"narrative"\s*:\s*"((?:\\.|[^"\\])*)/)
  if (m && m[1] != null) {
    try {
      return JSON.parse('"' + m[1] + '"')
    } catch (e) {
      return m[1]
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }
  }
  // 不是 JSON 就原样（去掉围栏）
  if (!/"(?:narrative|options|changes|thought)"/.test(s) && !/^\s*\{/.test(s)) {
    return s
      .replace(/```think[\s\S]*?```/gi, '')
      .replace(/```json[\s\S]*?```/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim()
  }
  // JSON 但还没写到 narrative：返回空，等后续 chunk
  return ''
}

export function extractGameJSON(text) {
  if (text == null) return null
  const s = typeof text === 'string' ? text : String(text)
  if (!s) return null
  // 1) 标准围栏（可能被截断，safeParse 会尝试补全）
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const j = safeParse(fence[1].trim())
    if (j) return sanitizeGameJSON(j)
  }
  // 2) 末尾未闭合围栏：截断场景常见
  const open = s.lastIndexOf('```json')
  const open2 = s.lastIndexOf('```')
  const cut = open >= 0 ? open : (open2 >= 0 ? open2 : -1)
  if (cut >= 0) {
    let body = s.slice(cut).replace(/^```(?:json)?/i, '')
    const j = safeParse(body.trim())
    if (j) return sanitizeGameJSON(j)
  }
  // 3) 正文里第一段花括号
  const scanned = scanFirstJSON(s)
  if (scanned) {
    const j = safeParse(scanned)
    if (j) return sanitizeGameJSON(j)
  }
  return null
}

/** 在文本中找第一段花括号配对的 JSON 对象（跳过字符串） */
export function scanFirstJSON(text) {
  const s = String(text || '')
  let start = -1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') { start = i; break }
  }
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escCh = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (escCh) escCh = false
      else if (c === '\\') escCh = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** 尾部被 max_tokens 截断时，补上未闭合的 } ] 与字符串 */
export function autoCloseJSON(s) {
  let inStr = false
  let escCh = false
  const stack = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (escCh) escCh = false
      else if (c === '\\') escCh = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') stack.push('}')
    else if (c === '[') stack.push(']')
    else if (c === '}' || c === ']') {
      if (stack.length && stack[stack.length - 1] === c) stack.pop()
    }
  }
  let out = s.replace(/,\s*$/, '')
  if (inStr) out += '"'
  while (stack.length) out += stack.pop()
  return out
}

function safeParse(s) {
  try { return JSON.parse(s) } catch (e) { /* try trailing commas */ }
  // 尾部截断的 JSON：补右括号再试
  try {
    const closed = autoCloseJSON(String(s || ''))
    if (closed && closed !== s) {
      try { return JSON.parse(closed) } catch (e) { /* fallthrough */ }
    }
  } catch (e) { /* fallthrough */ }
  try {
    // 仅剥离结构层尾逗号：, 后跟 } 或 ] 且不在字符串内
    let out = ''
    let inStr = false
    let escCh = false
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (inStr) {
        out += c
        if (escCh) escCh = false
        else if (c === '\\') escCh = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') { inStr = true; out += c; continue }
      if (c === ',' ) {
        let j = i + 1
        while (j < s.length && /\s/.test(s[j])) j++
        if (s[j] === '}' || s[j] === ']') continue
      }
      out += c
    }
    return JSON.parse(out)
  } catch (e) { return null }
}

function sanitizeGameJSON(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return j
  const out = Object.assign({}, j)
  if (typeof out.narrative === 'string') {
    if (!out.options && Array.isArray(out.choices)) out.options = out.choices
  }
  delete out.thought
  delete out.thinking
  delete out.reasoning
  return out
}
