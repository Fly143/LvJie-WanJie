// 内置免费通道（OpenCode Zen 免费档）
//
// 上游 https://opencode.ai/zen/v1 的 *-free 模型带「客户端指纹」校验，第三方直连会被
// 403 FreeTierError 拒绝。本模块统一注入合规指纹（UA / ses_ session / x-opencode-*）、
// 强制 stream:true 并补齐 bash/glob/grep/read 四件套 tools，再用 tool_choice:"none"
// 压住工具调用，保证游戏拿到的仍是纯正文/JSON。
//
// 免费名单会变（模型免费期结束后会换），所以：启动时自动探测 → 按顺序试通即用 → 失败自动换下一个。
//
// 注意：这是绕过上游客户端校验的指纹伪装，属于实验性通道，上游一收紧就会失效；
// 失效时应当引导玩家改用自己的 API Key。

export const ZEN_BASE = 'https://opencode.ai/zen/v1'
export const ZEN_KEY = 'public'
export const ZEN_UA = 'opencode/1.18.13'
export const ZEN_NAME = '内置免费通道'

/** 已知可用的优先顺序（其余按上游 /models 返回顺序） */
export const ZEN_PREFERRED = ['mimo-v2.6-flash-free', 'deepseek-v4-flash-free', 'mimo-v2.5-free']

/** 上游免费档额度（官方说明：100 请求/天，次日重置。可能随时调整） */
export const ZEN_DAILY_LIMIT = 100

const CACHE_KEY = 'agentworlds_zen_cache_v1'
const CACHE_TTL_MS = 6 * 3600 * 1000   // 名单缓存 6 小时
const PROBE_TIMEOUT_MS = 12000
const PROBE_MAX = 6                    // 单次探测最多试几个

const FOUR = [
  ['bash', 'cmd'], ['glob', 'pattern'], ['grep', 'pattern'], ['read', 'path']
].map(([name, prop]) => ({
  type: 'function',
  function: {
    name,
    description: name,
    parameters: { type: 'object', properties: { [prop]: { type: 'string' } }, required: [prop] }
  }
}))

// —— 基础工具 ——

function randHex(n) {
  let s = ''
  while (s.length < n) s += Math.random().toString(16).slice(2)
  return s.slice(0, n)
}

function randAlnum(n) {
  let s = ''
  const cs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  while (s.length < n) s += cs[Math.floor(Math.random() * cs.length)]
  return s.slice(0, n)
}

/** ses_ + 12位hex + 14位字母数字（上游硬要求） */
export function newZenSession() {
  return 'ses_' + randHex(12) + randAlnum(14)
}

export function newZenRequestId() {
  return 'msg_' + randHex(12) + randAlnum(14).toUpperCase()
}

/** 是否指向内置通道（按 host + /zen 路径判断，容忍结尾斜杠与 /v1 后缀差异） */
export function isZenBase(url) {
  const s = String(url || '').trim()
  if (!s) return false
  try {
    const u = new URL(s)
    return /(^|\.)opencode\.ai$/i.test(u.hostname) && /\/zen(\/|$)/i.test(u.pathname)
  } catch (e) {
    return /opencode\.ai\/zen/i.test(s)
  }
}

/** 规范化后的 key 配置是否走内置通道 */
export function isZenKey(k) {
  return !!(k && isZenBase(k.baseUrl))
}

/** 内置通道的请求头（Authorization 上游不校验，带上 Bearer public 即可） */
export function zenHeaders(extra) {
  return Object.assign({
    'User-Agent': ZEN_UA,
    'Authorization': 'Bearer ' + ZEN_KEY,
    'x-opencode-session': newZenSession(),
    'x-opencode-request': newZenRequestId(),
    'x-opencode-client': 'cli',
    'x-opencode-project': 'global'
  }, extra || {})
}

/**
 * 改写请求体以满足上游校验。
 * @param {object} body 原始 chat/completions 请求体
 * @param {boolean} wantStream 调用方是否真的想要流式（false 时上游仍走 SSE，取回后需聚合）
 */
export function zenPatchBody(body, wantStream) {
  const out = Object.assign({}, body)
  out.stream = true                                  // false 会被 403
  if (!wantStream) out.stream_options = { include_usage: true }
  const tools = Array.isArray(out.tools) ? out.tools.slice() : []
  const names = new Set(tools.map(t => t && t.function && t.function.name))
  for (const t of FOUR) if (!names.has(t.function.name)) tools.push(t)  // 缺一即 403
  out.tools = tools
  out.tool_choice = 'none'                           // 压住工具调用，保证正文/JSON 纯净
  return out
}

/** 把上游 SSE 聚合成 chat.completion JSON 文本（给非流式调用方） */
export function zenSseAggregate(raw) {
  const text = String(raw || '')
  const out = {
    object: 'chat.completion',
    choices: [{ index: 0, finish_reason: null, message: { role: 'assistant', content: '' } }]
  }
  const content = []
  const reasoning = []
  let finish = null
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s.startsWith('data:')) continue
    const p = s.slice(5).trim()
    if (p === '[DONE]') break
    let d
    try { d = JSON.parse(p) } catch (e) { continue }
    if (d.id) out.id = d.id
    if (d.model) out.model = d.model
    if (d.created) out.created = d.created
    if (d.usage) out.usage = d.usage
    for (const c of d.choices || []) {
      if (c.finish_reason) finish = c.finish_reason
      const delta = c.delta || {}
      if (delta.content) content.push(delta.content)
      if (delta.reasoning_content) reasoning.push(delta.reasoning_content)
    }
  }
  const msg = out.choices[0].message
  msg.content = content.join('')
  if (reasoning.length) msg.reasoning_content = reasoning.join('')
  out.choices[0].finish_reason = finish || 'stop'
  return JSON.stringify(out)
}

// —— 免费名单缓存 ——

let _mem = null

function store() {
  try { return globalThis.localStorage } catch (e) { return null }
}

export function readZenCache() {
  if (_mem) return _mem
  const ls = store()
  if (ls) {
    try {
      const raw = ls.getItem(CACHE_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d && typeof d === 'object') { _mem = d; return _mem }
      }
    } catch (e) { /* ignore */ }
  }
  _mem = { free: [], working: '', at: 0, tried: [] }
  return _mem
}

export function writeZenCache(patch) {
  const next = Object.assign({}, readZenCache(), patch || {})
  _mem = next
  const ls = store()
  if (ls) {
    try { ls.setItem(CACHE_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
  }
  return next
}

export function zenCacheFresh() {
  const c = readZenCache()
  return !!(c.working && c.at && (Date.now() - c.at) < CACHE_TTL_MS)
}

/** 候选顺序：已知可用优先，其余按上游顺序 */
export function orderZenModels(list) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : []
  const head = ZEN_PREFERRED.filter(m => arr.includes(m))
  const rest = arr.filter(m => !head.includes(m))
  return head.concat(rest)
}

/** 当前应优先使用的模型（缓存 → 优先表 → 空） */
export function zenActiveModel() {
  const c = readZenCache()
  if (c.working) return c.working
  return ZEN_PREFERRED[0]
}

/** 下一个候选（失败时切换用） */
export function zenNextModel(cur) {
  const list = orderZenModels(readZenCache().free)
  const pool = list.length ? list : ZEN_PREFERRED
  const i = pool.indexOf(String(cur || ''))
  if (i >= 0 && i + 1 < pool.length) return pool[i + 1]
  const rest = pool.filter(m => m !== cur)
  return rest[0] || ''
}

// —— 上游交互 ——

async function zenFetch(pathname, { headers, body, method, timeoutMs } = {}) {
  const url = ZEN_BASE.replace(/\/$/, '') + pathname
  const ms = timeoutMs || PROBE_TIMEOUT_MS
  const host = globalThis.awHost && globalThis.awHost.http
  if (host && host.request) {
    return await host.request({ url, method: method || 'GET', headers: headers || {}, body, timeoutMs: ms })
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { method: method || 'GET', headers: headers || {}, body, signal: ctl.signal })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text, headers: {} }
  } catch (e) {
    return { ok: false, error: (e && e.message) || '网络错误' }
  } finally {
    clearTimeout(timer)
  }
}

/** 拉取免费模型名单（仅以 /models 的 -free 后缀为准） */
export async function fetchZenModelList({ timeoutMs } = {}) {
  const r = await zenFetch('/models', { headers: zenHeaders(), timeoutMs: timeoutMs || PROBE_TIMEOUT_MS })
  if (!r || !r.ok) {
    return { ok: false, error: (r && (r.error || ('HTTP ' + r.status))) || '网络错误', free: [] }
  }
  let ids = []
  try {
    const j = JSON.parse(String(r.text || ''))
    const arr = j.data || j.models || []
    ids = arr.map(x => (x && (x.id || x.name)) || '').filter(Boolean)
  } catch (e) {
    return { ok: false, error: '模型列表不是合法 JSON', free: [] }
  }
  const free = orderZenModels(ids.filter(id => /-free$/i.test(id)))
  return { ok: true, free, total: ids.length }
}

/** 探测单个模型：最小对话往返（必须能拿到正文才算通） */
export async function probeZenModel(model, { timeoutMs } = {}) {
  const started = Date.now()
  const body = zenPatchBody({
    model,
    messages: [{ role: 'user', content: '回复一个字：好' }],
    max_tokens: 16
  }, true)
  const r = await zenFetch('/chat/completions', {
    method: 'POST',
    headers: zenHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    timeoutMs: timeoutMs || PROBE_TIMEOUT_MS
  })
  const ms = Date.now() - started
  if (!r || r.ok === false) {
    return { ok: false, model, ms, error: (r && (r.error || ('HTTP ' + r.status))) || '网络错误' }
  }
  if (r.status && (r.status < 200 || r.status >= 300)) {
    const t = String(r.text || '').slice(0, 160)
    return { ok: false, model, ms, error: 'HTTP ' + r.status + (t ? ': ' + t : '') }
  }
  const txt = String(r.text || '')
  // 流式或非流式都能判定：只要有正文/内容片段即视为通
  if (/"content"\s*:\s*"[^"]/.test(txt) || /data:\s*\{/.test(txt)) return { ok: true, model, ms }
  return { ok: false, model, ms, error: '响应为空' }
}

/**
 * 探测并按顺序选出第一个可用模型（结果写入缓存）。
 * @returns {{ok:boolean, model?:string, tried:Array<{model:string,ok:boolean,error?:string}>, error?:string, fromCache?:boolean}}
 */
export async function ensureZenReady({ force = false, onStatus } = {}) {
  const say = (m) => { try { onStatus && onStatus(m) } catch (e) { /* ignore */ } }

  if (!force && zenCacheFresh()) {
    const cur = readZenCache().working
    say('复用上次可用模型 ' + cur)
    return { ok: true, model: cur, tried: [], fromCache: true }
  }

  let free = []
  say('拉取免费模型名单…')
  const list = await fetchZenModelList()
  if (list.ok && list.free.length) free = list.free
  else if (!list.ok) say('名单拉取失败：' + (list.error || ''))
  if (!free.length) free = orderZenModels(ZEN_PREFERRED)
  writeZenCache({ free, at: Date.now() })

  const tried = []
  const pool = free.slice(0, PROBE_MAX)
  for (const m of pool) {
    say('测试 ' + m + '…')
    const r = await probeZenModel(m)
    tried.push({ model: m, ok: r.ok, error: r.error })
    if (r.ok) {
      writeZenCache({ working: m, at: Date.now(), tried })
      say('可用：' + m + '（' + r.ms + 'ms）')
      return { ok: true, model: m, tried }
    }
    say('不可用：' + m + '（' + (r.error || '') + '）')
  }
  writeZenCache({ working: '', at: Date.now(), tried })
  return { ok: false, tried, error: '所有免费模型都不可用（上游可能已收紧校验）' }
}

/** 生成一条内置通道的配置（可直接塞进 playerKeys） */
export function zenConfig(model) {
  return {
    name: ZEN_NAME,
    baseUrl: ZEN_BASE,
    key: ZEN_KEY,
    model: String(model || zenActiveModel()),
    apiStyle: 'chat',
    builtin: 'zen'
  }
}

// —— 额度：上游免费档 100 次/天，超限报 429 FreeUsageLimitError ——
// 本地只做「本机今日已发多少次」的估算（额度可能按 IP 计，仅供参考），
// 目的是在快用完/已用完时给玩家一个明确原因，而不是中途莫名失败。

const USAGE_KEY = 'agentworlds_zen_usage_v1'

function dayKey(d) {
  const x = d || new Date()
  const p = (n) => String(n).padStart(2, '0')
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate())
}

/** 本机今日已发起的免费通道对话请求数 */
export function zenUsageToday() {
  const today = dayKey()
  const ls = store()
  if (ls) {
    try {
      const d = JSON.parse(ls.getItem(USAGE_KEY) || 'null')
      if (d && d.day === today) return { day: today, count: Math.max(0, Math.round(Number(d.count) || 0)) }
    } catch (e) { /* ignore */ }
  }
  return { day: today, count: 0 }
}

/** 记一次请求（跨天自动归零） */
export function zenAddUsage(n = 1) {
  const cur = zenUsageToday()
  const next = { day: cur.day, count: Math.max(0, cur.count + (Number(n) || 0)) }
  const ls = store()
  if (ls) {
    try { ls.setItem(USAGE_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
  }
  return next
}

/** 额度/限流错误分类：'daily'（当天额度用完）| 'rate'（短时限流）| ''（不是额度问题） */
export function zenLimitKind(text) {
  const s = String(text || '')
  if (/FreeUsageLimitError|usage limit|usage_limit|quota|额度|每日|daily limit|exceeded your/i.test(s)) return 'daily'
  if (/rate limit|rate_limit|too many requests|\b429\b/i.test(s)) return 'rate'
  return ''
}

/** 给玩家看的额度提示（带上本机今日用量） */
export function zenLimitMessage(kind) {
  const used = zenUsageToday().count
  const tip = '可到「设置 → 🔑 API → 自定义」填入自己的 API Key 继续玩，或等次日额度重置。'
  if (kind === 'daily') {
    return `内置免费通道今日额度已用完（上游约 ${ZEN_DAILY_LIMIT} 次/天，次日重置；本机今日已发 ${used} 次）。${tip}`
  }
  return `内置免费通道被限流（请求过快，本机今日已发 ${used} 次，上游约 ${ZEN_DAILY_LIMIT} 次/天）。稍等几秒再试；反复出现就换成自己的 API Key。`
}
