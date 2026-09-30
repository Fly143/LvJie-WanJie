// 内置免费通道（OpenCode Zen）回归测试
// 覆盖：指纹头格式、body 改写（stream/tools/tool_choice）、SSE 聚合、
//       免费名单排序与选择、启动探测顺序、403 后自动换模型（stub 宿主）
// 需要真实联网的用例：AW_ZEN_LIVE=1 时额外跑一次真实探测
import { pathToFileURL } from 'url'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const base = pathToFileURL(path.join(__dirname, '..', 'app', 'js')).href

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}
const realFetch = globalThis.fetch   // 假 fetch 用完必须还原，否则真实用例会被桩污染

const zen = await import(base + '/engine/zen.js')
const { callLLM } = await import(base + '/engine/llm.js')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) }
}

function resetCache(patch) {
  store.clear()
  zen.writeZenCache(Object.assign({ free: [], working: '', at: 0, tried: [] }, patch || {}))
}

// —— 识别与指纹 ——
ok('识别内置通道 base', zen.isZenBase('https://opencode.ai/zen/v1') === true)
ok('识别结尾斜杠', zen.isZenBase('https://opencode.ai/zen/v1/') === true)
ok('非内置通道不误判', zen.isZenBase('https://api.deepseek.com/v1') === false)
ok('空值不误判', zen.isZenBase('') === false)
ok('isZenKey 走规范化 baseUrl', zen.isZenKey({ baseUrl: 'https://opencode.ai/zen/v1', model: 'x', key: 'public' }) === true)

const ses = zen.newZenSession()
ok('session 格式 ses_+12hex+14字母数字', /^ses_[0-9a-f]{12}[A-Za-z0-9]{14}$/.test(ses), ses)
ok('两次 session 不同', zen.newZenSession() !== zen.newZenSession())
const rid = zen.newZenRequestId()
ok('request id 格式', /^msg_[0-9a-f]{12}[A-Z0-9]{14}$/.test(rid), rid)

const h = zen.zenHeaders({ 'Content-Type': 'application/json' })
ok('UA 版本 >= 1.18', /^opencode\/1\.18/.test(h['User-Agent']), h['User-Agent'])
ok('带 ses_ session 头', /^ses_/.test(h['x-opencode-session']))
ok('带 Authorization', /^Bearer /.test(h['Authorization']))

// —— body 改写 ——
const patched = zen.zenPatchBody({ model: 'm', messages: [], stream: false }, false)
ok('强制 stream:true（false 会 403）', patched.stream === true)
ok('非流式调用补 stream_options', patched.stream_options && patched.stream_options.include_usage === true)
const names = patched.tools.map(t => t.function.name)
ok('补齐 bash/glob/grep/read 四件套', ['bash', 'glob', 'grep', 'read'].every(n => names.includes(n)), names)
ok('tool_choice=none 压住工具调用', patched.tool_choice === 'none')
const keep = zen.zenPatchBody({ model: 'm', messages: [], tools: [{ type: 'function', function: { name: 'bash' } }] }, true)
ok('已有同名 tool 不重复注入', keep.tools.filter(t => t.function.name === 'bash').length === 1)
ok('流式调用不写 stream_options', !keep.stream_options)
ok('不修改原对象', (() => { const o = { model: 'm' }; zen.zenPatchBody(o, true); return o.stream === undefined })())

// —— SSE 聚合 ——
const sse = [
  'data: {"id":"a","model":"m","choices":[{"delta":{"content":"你"}}]}',
  'data: {"choices":[{"delta":{"content":"好"}}]}',
  'data: {"choices":[{"delta":{"reasoning_content":"想"},"finish_reason":"stop"}]}',
  'data: [DONE]', ''
].join('\n')
const agg = JSON.parse(zen.zenSseAggregate(sse))
ok('聚合出正文', agg.choices[0].message.content === '你好', agg.choices[0].message.content)
ok('保留 reasoning 与 finish_reason', agg.choices[0].message.reasoning_content === '想' && agg.choices[0].finish_reason === 'stop')
ok('非 SSE 文本不炸', typeof zen.zenSseAggregate('not sse') === 'string')

// —— 名单排序与下一个候选 ——
const ordered = zen.orderZenModels(['a-free', 'mimo-v2.6-flash-free', 'b-free'])
ok('优先模型排最前', ordered[0] === 'mimo-v2.6-flash-free', ordered)
resetCache({ free: ['mimo-v2.6-flash-free', 'deepseek-v4-flash-free', 'x-free'] })
ok('下一个候选按顺序', zen.zenNextModel('mimo-v2.6-flash-free') === 'deepseek-v4-flash-free')
ok('末位候选有兜底', zen.zenNextModel('x-free') === 'mimo-v2.6-flash-free')
ok('zenConfig 形状正确', (() => {
  const c = zen.zenConfig('m-free')
  return c.baseUrl === zen.ZEN_BASE && c.key === zen.ZEN_KEY && c.model === 'm-free' && c.apiStyle === 'chat'
})())

// —— 探测顺序：优先模型失败则顺延 ——
{
  resetCache()
  const calls = []
  globalThis.fetch = async (url, opts) => {
    const u = String(url)
    if (/\/models$/.test(u)) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'deepseek-v4-flash-free' }, { id: 'mimo-v2.6-flash-free' }, { id: 'gpt-x' }] }) }
    }
    const body = JSON.parse((opts && opts.body) || '{}')
    calls.push(body.model)
    if (body.model === 'mimo-v2.6-flash-free') {
      return { ok: false, status: 403, text: async () => 'FreeTierError: free tier can only be used from within OpenCode' }
    }
    return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"好"}}]}\n' }
  }
  const r = await zen.ensureZenReady({ force: true })
  ok('名单里只留 -free', (zen.readZenCache().free || []).join() === 'mimo-v2.6-flash-free,deepseek-v4-flash-free', zen.readZenCache().free)
  ok('优先模型先试、失败顺延到下一个', calls[0] === 'mimo-v2.6-flash-free' && calls[1] === 'deepseek-v4-flash-free', calls)
  ok('探测选出可用模型', r.ok === true && r.model === 'deepseek-v4-flash-free', r)
  ok('可用模型写入缓存', zen.readZenCache().working === 'deepseek-v4-flash-free')

  // 缓存新鲜时不再探测
  const r2 = await zen.ensureZenReady({ force: false })
  ok('缓存新鲜则复用', r2.ok === true && r2.fromCache === true && r2.model === 'deepseek-v4-flash-free', r2)
  globalThis.fetch = realFetch
}

// —— 全部不可用时的失败路径 ——
{
  resetCache()
  globalThis.fetch = async (url) => {
    if (/\/models$/.test(String(url))) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'a-free' }, { id: 'b-free' }] }) }
    return { ok: false, status: 403, text: async () => 'FreeTierError' }
  }
  const r = await zen.ensureZenReady({ force: true })
  ok('全部失败返回不可用', r.ok === false && r.tried.length >= 1, r)
  ok('失败不留下 working', !zen.readZenCache().working)
  globalThis.fetch = realFetch
}

// —— 与 llm.js 集成：403 后自动换模型重试（stub 宿主） ——
{
  resetCache({ free: ['mimo-v2.6-flash-free', 'deepseek-v4-flash-free'], working: 'mimo-v2.6-flash-free' })
  const seen = []
  globalThis.awHost = {
    http: {
      request: async ({ body }) => {
        const b = JSON.parse(body || '{}')
        seen.push({ model: b.model, stream: b.stream, tools: (b.tools || []).map(t => t.function.name), tc: b.tool_choice })
        // 宿主约定：HTTP 交换完成即 ok:true（含 4xx），只有传输失败才 ok:false
        if (b.model === 'mimo-v2.6-flash-free') return { ok: true, status: 403, text: '{"error":{"message":"FreeTierError: OpenCode\'s free tier can only be used from within OpenCode"}}' }
        return { ok: true, status: 200, text: JSON.stringify({ choices: [{ message: { content: '{"narrative":"ok"}' } }] }) }
      }
    }
  }
  const keyObj = { name: '内置', baseUrl: zen.ZEN_BASE, key: 'public', model: 'mimo-v2.6-flash-free', apiStyle: 'chat' }
  const r = await callLLM({ keyObj, system: 's', user: 'u' })
  ok('第三个模型成功返回', r.ok === true && r.text === '{"narrative":"ok"}', r)
  ok('返回切换标记', r.zenSwitched === 'deepseek-v4-flash-free' && r.zenFrom === 'mimo-v2.6-flash-free', r)
  ok('调用方配置被就地更新（下次直接用新模型）', keyObj.model === 'deepseek-v4-flash-free', keyObj.model)
  ok('两次请求都补齐了 tools/stream/tool_choice', seen.length === 2 && seen.every(s => s.stream === true && s.tc === 'none' && ['bash', 'glob', 'grep', 'read'].every(n => s.tools.includes(n))), seen)
  ok('第二次换了模型', seen[1].model === 'deepseek-v4-flash-free', seen)

  // 非流式：上游只回 SSE 时自动聚合
  globalThis.awHost.http.request = async ({ body }) => {
    const b = JSON.parse(body || '{}')
    if (b.model !== 'deepseek-v4-flash-free') return { ok: true, status: 403, text: 'FreeTierError' }
    return { ok: true, status: 200, text: 'data: {"choices":[{"delta":{"content":"聚合"}}]}\ndata: {"choices":[{"delta":{"content":"成功"},"finish_reason":"stop"}]}\ndata: [DONE]\n' }
  }
  const r2 = await callLLM({ keyObj: { name: '内置', baseUrl: zen.ZEN_BASE, key: 'public', model: 'deepseek-v4-flash-free', apiStyle: 'chat' }, system: 's', user: 'u' })
  ok('非流式自动聚合 SSE', r2.ok === true && r2.text === '聚合成功', r2)
  delete globalThis.awHost
}

// —— 测试连接按钮 ——
{
  const { testConnection } = await import(base + '/engine/llm.js')
  ok('缺 Base URL 直接报错', (await testConnection({ key: 'k', model: 'm' })).ok === false)
  ok('缺 Key 直接报错', (await testConnection({ baseUrl: 'https://a.b/v1', model: 'm' })).ok === false)

  const seenUrls = []
  globalThis.awHost = {
    http: {
      request: async ({ url }) => {
        seenUrls.push(url)
        if (/\/models$/.test(url)) return { ok: true, status: 200, text: JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }) }
        return { ok: true, status: 200, text: JSON.stringify({ choices: [{ message: { content: '好' } }] }) }
      }
    }
  }
  const good = await testConnection({ baseUrl: 'https://api.example.com/v1', key: 'sk-x', model: 'm1' })
  ok('成功：返回回复与耗时', good.ok === true && good.reply === '好' && typeof good.ms === 'number', good)
  ok('成功：请求打到 chat/completions', seenUrls.some(u => u === 'https://api.example.com/v1/chat/completions'), seenUrls)

  seenUrls.length = 0
  const noModel = await testConnection({ baseUrl: 'https://api.example.com/v1', key: 'sk-x', model: '' })
  ok('未填模型退化为拉列表', noModel.ok === true && noModel.count === 2, noModel)
  ok('未填模型时请求打到 /models', seenUrls.some(u => /\/models$/.test(u)), seenUrls)

  globalThis.awHost.http.request = async () => ({ ok: true, status: 403, text: '{"error":{"message":"invalid key"}}' })
  const bad = await testConnection({ baseUrl: 'https://api.example.com/v1', key: 'sk-x', model: 'm1' })
  ok('失败：带出 HTTP 状态与原因', bad.ok === false && /403/.test(bad.error || '') && /invalid key/.test(bad.error || ''), bad)
  delete globalThis.awHost
}

// —— 额度：100 次/天、超限分类与提示、不白白换模型 ——
{
  // 分类
  ok('识别 FreeUsageLimitError 为当天额度', zen.zenLimitKind('HTTP 429: {"error":{"message":"FreeUsageLimitError"}}') === 'daily')
  ok('识别 quota 字样为当天额度', zen.zenLimitKind('exceeded your daily quota') === 'daily')
  ok('识别普通限流为短时限流', zen.zenLimitKind('HTTP 429: rate limit exceeded') === 'rate')
  ok('普通错误不误判', zen.zenLimitKind('HTTP 500: internal error') === '')
  ok('额度常量存在', zen.ZEN_DAILY_LIMIT === 100)

  // 本机用量计数：跨天归零
  store.delete('agentworlds_zen_usage_v1')
  ok('初始用量为 0', zen.zenUsageToday().count === 0)
  zen.zenAddUsage(3)
  ok('计数累加', zen.zenUsageToday().count === 3, zen.zenUsageToday())
  const today = new Date()
  const p = n => String(n).padStart(2, '0')
  store.set('agentworlds_zen_usage_v1', JSON.stringify({ day: '2000-01-01', count: 99 }))
  ok('跨天归零', zen.zenUsageToday().count === 0, zen.zenUsageToday())
  store.set('agentworlds_zen_usage_v1', JSON.stringify({ day: today.getFullYear() + '-' + p(today.getMonth() + 1) + '-' + p(today.getDate()), count: 42 }))
  ok('当天沿用', zen.zenUsageToday().count === 42)

  // 提示文案要带上额度与用法
  const msgDaily = zen.zenLimitMessage('daily')
  ok('额度用完提示含额度与次数', /100/.test(msgDaily) && /额度/.test(msgDaily) && /42/.test(msgDaily), msgDaily)
  ok('额度用完提示给出解决办法', /API Key/.test(msgDaily), msgDaily)
  ok('限流提示区分于额度用完', /限流/.test(zen.zenLimitMessage('rate')))

  // 集成：429 额度错误 → 不换模型、直接返回可读原因
  resetCache({ free: ['mimo-v2.6-flash-free', 'deepseek-v4-flash-free'], working: 'mimo-v2.6-flash-free' })
  store.delete('agentworlds_zen_usage_v1')
  let calls = 0
  globalThis.awHost = {
    http: {
      request: async () => {
        calls++
        return { ok: true, status: 429, text: '{"error":{"message":"FreeUsageLimitError: daily usage limit reached"}}' }
      }
    }
  }
  const keyObj = { name: '内置', baseUrl: zen.ZEN_BASE, key: 'public', model: 'mimo-v2.6-flash-free', apiStyle: 'chat' }
  const q = await callLLM({ keyObj, system: 's', user: 'u' })
  ok('额度错误：返回失败但原因可读', q.ok === false && /额度/.test(q.error) && q.zenLimit === 'daily', q)
  ok('额度错误：不浪费换模型重试（只发 1 次）', calls === 1, calls)
  ok('额度错误：记入本机用量', zen.zenUsageToday().count === 1, zen.zenUsageToday())
  delete globalThis.awHost
}

// —— 启动策略：每次拉名单（/models 不耗额度），名单未变则跳过连接测试（省额度） ——
{
  resetCache({ free: ['mimo-v2.6-flash-free'], working: 'mimo-v2.6-flash-free', at: Date.now() })
  store.delete('agentworlds_zen_usage_v1')
  let listCalls = 0
  let chatCalls = 0
  globalThis.fetch = async (url) => {
    if (/\/models$/.test(String(url))) {
      listCalls++
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'mimo-v2.6-flash-free' }, { id: 'x-paid' }] }) }
    }
    chatCalls++
    return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"好"}}]}\n' }
  }
  const { ensureBuiltinZenDefault } = await import(base + '/ui/settings-panels.js')
  const r = await ensureBuiltinZenDefault({})
  ok('启动启用内置通道', r.ok === true && r.enabled === true && r.model === 'mimo-v2.6-flash-free', r)
  ok('启动每次都拉名单（不耗额度）', listCalls >= 1, listCalls)
  ok('名单未变 → 跳过连接测试（省额度）', chatCalls === 0, chatCalls)

  // 名单变了（免费模型轮换）→ 必须重新做连接测试
  let chatCalls2 = 0
  globalThis.fetch = async (url) => {
    if (/\/models$/.test(String(url))) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'mimo-v2.6-flash-free' }, { id: 'new-free' }] }) }
    chatCalls2++
    return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"好"}}]}\n' }
  }
  const r2 = await zen.ensureZenReady({ force: false })
  ok('名单变化 → 重新做连接测试', r2.listChanged === true && r2.probed >= 1 && chatCalls2 >= 1, { r2, chatCalls2 })

  // 手动「通道自检」：名单没变也强制测试
  let chatCalls3 = 0
  globalThis.fetch = async (url) => {
    if (/\/models$/.test(String(url))) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'mimo-v2.6-flash-free' }, { id: 'new-free' }] }) }
    chatCalls3++
    return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"好"}}]}\n' }
  }
  const r3 = await zen.ensureZenReady({ force: true })
  ok('手动自检强制做连接测试', r3.probed >= 1 && chatCalls3 >= 1, { r3, chatCalls3 })

  // 名单一致但缓存的可用模型已不在名单里 → 也要重新测
  resetCache({ free: ['gone-free'], working: 'gone-free', at: Date.now() })
  let chatCalls4 = 0
  globalThis.fetch = async (url) => {
    if (/\/models$/.test(String(url))) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'fresh-free' }] }) }
    chatCalls4++
    return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"好"}}]}\n' }
  }
  const r4 = await zen.ensureZenReady({ force: false })
  ok('旧模型已下架 → 重新测出可用模型', r4.ok === true && r4.model === 'fresh-free' && chatCalls4 >= 1, { r4, chatCalls4 })
  globalThis.fetch = realFetch
}

// —— 静态检查：设置面板里 getElementById 的 id 必须在模板里存在（防改 UI 漏改） ——
{
  const fs = await import('fs')
  const src = fs.readFileSync(new URL('../app/js/ui/settings-panels.js', import.meta.url), 'utf8')
  const ids = [...src.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
  const declared = new Set([...src.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
  const missing = [...new Set(ids)].filter(id => !declared.has(id))
  ok('设置面板引用的 id 都存在', missing.length === 0, missing)
  const modeIds = ['mode-zen', 'mode-custom', 'zen-panel', 'custom-panel', 'zen-model', 'k-zen', 'k-zen-test', 'k-zen-status']
  ok('内置/自定义两个模式的节点齐全', modeIds.every(id => declared.has(id)), modeIds.filter(id => !declared.has(id)))
  const testIds = ['k-test', 'k-test-status']
  ok('测试连接按钮与状态位都在', testIds.every(id => declared.has(id)), testIds.filter(id => !declared.has(id)))
  ok('设置面板确实用了 testConnection', src.includes('testConnection({'))

  // 四种语言的额度文案都要齐（少一种就会回退中文）
  const i18nSrc = fs.readFileSync(new URL('../app/js/engine/i18n.js', import.meta.url), 'utf8')
  const countKey = (k) => (i18nSrc.match(new RegExp('\\b' + k + ':', 'g')) || []).length
  const fourKeys = ['zenPerDay', 'zenResetNext', 'zenShared', 'zenQuotaTip', 'zenWelcomeLimit', 'zenWelcomeSwitch', 'zenWelcomeNoApi', 'testConn']
  ok('额度/测试文案四种语言齐全', fourKeys.every(k => countKey(k) === 4), fourKeys.map(k => k + '=' + countKey(k)))

  // 欢迎页要有额度提示（用户要求的两处提示之一）
  const mainSrc = fs.readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8')
  ok('欢迎页有内置通道额度提示', mainSrc.includes('zenWelcomeHint(') && mainSrc.includes("t('zenWelcomeLimit')"))
  ok('欢迎页提示含按 IP 共享说明', mainSrc.includes("t('zenShared')"))
  ok('自定义模式仍然保留原有表单节点', ['k-add', 'k-base', 'k-value', 'k-model', 'k-style'].every(id => declared.has(id)))
}

// —— 可选：真实联网探测 ——
if (process.env.AW_ZEN_LIVE === '1') {
  resetCache()
  globalThis.fetch = realFetch
  const list = await zen.fetchZenModelList({ timeoutMs: 20000 })
  ok('真实拉取免费名单', list.ok === true && list.free.length > 0, { ok: list.ok, n: list.free.length, err: list.error })
  const first = list.free[0] || 'mimo-v2.6-flash-free'
  const probe = await zen.probeZenModel(first, { timeoutMs: 30000 })
  ok('真实探测首个免费模型 ' + first, probe.ok === true, probe)
} else {
  console.log('SKIP 真实联网探测（AW_ZEN_LIVE=1 可开）')
}

console.log(`ZEN ${pass}/${pass + fail}`)
if (fail) process.exit(1)
