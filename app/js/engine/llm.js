// 自定义 LLM 接入：不绑定厂商，仅需 Base URL + API Key + 模型 + 协议
// apiStyle: 'chat'     → POST {base}/chat/completions   (OpenAI Chat Completions)
//           'response' → POST {base}/responses          (OpenAI Responses API)

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
  if (s.length <= 8) return s ? '••••' : ''
  return s.slice(0, 4) + '…' + s.slice(-4)
}

/** 把 Base URL 拼成最终 endpoint */
export function endpointOf(k) {
  const base = String(k.baseUrl || '').replace(/\/+$/, '')
  if (k.apiStyle === 'response') {
    if (/\/responses$/i.test(base)) return base
    return base + '/responses'
  }
  if (/\/chat\/completions$/i.test(base)) return base
  if (/\/v\d+$/i.test(base)) return base + '/chat/completions'
  // 允许用户直接填完整路径
  if (/\/completions$/i.test(base)) return base
  return base + '/chat/completions'
}

function messagesToResponseInput(messages) {
  // Responses API：input 可为字符串或 [{role, content}]
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
  // 兼容少数把正文放在 message 里的情况
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content || ''
  }
  return ''
}

/**
 * 调用一次 LLM。
 * @returns {Promise<{ok:boolean, text?:string, error?:string, aborted?:boolean}>}
 */
export async function callLLM({ keyObj, system, user, history = [], signal }) {
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
  let body
  if (k.apiStyle === 'response') {
    body = {
      model: k.model,
      input: messagesToResponseInput(messages),
      temperature: 0.9
    }
  } else {
    body = {
      model: k.model,
      messages,
      temperature: 0.9,
      max_tokens: 2000
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + k.key
      },
      body: JSON.stringify(body),
      signal
    })
    const raw = await res.text()
    if (!res.ok) {
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

    let text = ''
    if (k.apiStyle === 'response') text = extractResponseText(data)
    else {
      text = data && data.choices && data.choices[0] && data.choices[0].message
        ? (data.choices[0].message.content || '')
        : extractResponseText(data)
    }
    if (!text) return { ok: false, error: '模型返回空内容' }
    return { ok: true, text }
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, error: '已取消', aborted: true }
    return { ok: false, error: (e && e.message) || '网络错误' }
  }
}

/** 拉取模型列表（OpenAI 兼容 GET {base}/models） */
export async function listModels({ baseUrl, key }) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  const token = String(key || '').trim()
  if (!base) return { ok: false, error: '请先填写 Base URL' }
  if (!token) return { ok: false, error: '请先填写 API Key' }

  let url = base
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '/models')
  else if (/\/responses$/i.test(url)) url = url.replace(/\/responses$/i, '/models')
  else if (/\/v\d+$/i.test(url) || /\/compatible-mode\/v\d+$/i.test(url)) url = url + '/models'
  else if (/\/models$/i.test(url)) { /* already */ }
  else url = url + '/models'

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    })
    const raw = await res.text()
    if (!res.ok) {
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

/** 从模型输出中抽出 JSON（优先 ```json 块） */
export function extractGameJSON(text) {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const j = safeParse(fence[1].trim())
    if (j) return j
  }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) {
    const j = safeParse(brace[0])
    if (j) return j
  }
  return null
}

function safeParse(s) {
  try { return JSON.parse(s) } catch (e) { /* try trailing commas */ }
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')) } catch (e) { return null }
}
