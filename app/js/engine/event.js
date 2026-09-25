// AI 事件状态机
import { buildSystemPrompt } from './prompt.js'
import { callLLM, extractGameJSON } from './llm-bridge.js'
import { applyChanges } from './changes.js'
import { MAX_EVENT_CHOICES } from './constants.js'

const MAX_HISTORY_MSGS = 20
const MAX_USER_LEN = 2000

/**
 * EV 结构：
 * { kind, target, history:[{role,content}], count, options, ended, loading, error, resultText, changesBrief }
 */
export function startEvent(kind, user, target) {
  return {
    kind,
    target: target || null,
    history: [],
    count: 0,
    options: null,
    ended: false,
    loading: true,
    error: '',
    resultText: '',
    changesBrief: null,
    partial: '',
    _ctl: null,
    _turn: 0
  }
}

/**
 * 发送一轮。S 为存档，hooks 用于渲染回调。
 */
export async function runEventTurn(S, EV, userContent, hooks = {}) {
  if (!EV || EV.ended) return
  if (EV.loading && EV._ctl) return // 并发闸：上一轮未完成

  const userText = String(userContent == null ? '' : userContent).slice(0, MAX_USER_LEN)
  EV.loading = true
  EV.error = ''
  const turn = (EV._turn = (EV._turn || 0) + 1)
  if (hooks.onState) hooks.onState(EV)

  const keyObj = resolveKey(S)
  if (!keyObj) {
    EV.loading = false
    EV.error = '请先在设置中配置 API Key（🔑 切换 API Key）'
    if (hooks.onState) hooks.onState(EV)
    return
  }

  const system = buildSystemPrompt(S, {
    limitOn: hooks.limitOn !== false,
    cheatUnlocked: !!hooks.cheatUnlocked,
    focusText: userText,
    focusNames: EV.target ? [String(EV.target)] : []
  })

  EV.history.push({ role: 'user', content: userText })
  EV.partial = ''

  const ctl = new AbortController()
  EV._ctl = ctl
  let lastPaint = 0
  let res
  try {
    res = await callLLM({
      keyObj,
      system,
      user: userText,
      history: trimHistory(EV.history.slice(0, -1)),
      signal: ctl.signal,
      onDelta: (delta, acc) => {
        if (EV._turn !== turn) return
        EV.partial = acc
        EV.resultText = stripJSONBlock(acc)
        // 流式每 token 全量重绘会卡，节流刷新
        const now = Date.now()
        if (!hooks.onState) return
        if (now - lastPaint < 120) return
        lastPaint = now
        hooks.onState(EV)
      }
    })
  } catch (e) {
    res = { ok: false, error: (e && e.message) || '调用异常' }
  }

  if (EV._turn !== turn) return // 过期响应丢弃
  if (EV._ctl === ctl) EV._ctl = null
  EV.loading = false

  if (!res.ok) {
    EV.error = res.error || '调用失败'
    EV.partial = ''
    // 回滚最后一条 user，允许重试；并恢复上一轮叙事，避免半截残文
    if (EV.history.length && EV.history[EV.history.length - 1].role === 'user') {
      EV.history.pop()
    }
    const lastAsst = [...EV.history].reverse().find(h => h && h.role === 'assistant')
    EV.resultText = (lastAsst && lastAsst.content) || ''
    if (hooks.onState) hooks.onState(EV)
    return
  }

  const text = normalizeText(res.text)
  const json = extractGameJSON(text)
  const narrative = stripJSONBlock(text)

  // history 只存叙事，避免 JSON 撑爆 token
  EV.history.push({ role: 'assistant', content: narrative || text.slice(0, 500) })
  if (EV.history.length > MAX_HISTORY_MSGS) {
    EV.history = EV.history.slice(-MAX_HISTORY_MSGS)
  }
  EV.count += 1

  let changesBrief = null
  if (json) {
    if (Array.isArray(json.options) && json.options.length && !json.end) {
      EV.options = json.options.slice(0, 4).map(o => String(o).slice(0, 40))
    } else {
      EV.options = null
      EV.ended = true
    }
    if (json.end) EV.ended = true
    if (json.changes) {
      try {
        changesBrief = applyChanges(S, json.changes, hooks)
        EV.changesBrief = changesBrief
      } catch (e) {
        EV.error = '数据写入失败'
      }
      S.lastEventText = narrative
    }
  } else {
    EV.options = null
    EV.ended = true
    EV.error = '（未解析到数据块，事件结束）'
  }

  EV.resultText = narrative
  EV.loading = false

  if (hooks.limitOn !== false && EV.count >= MAX_EVENT_CHOICES) {
    EV.ended = true
    EV.options = null
  }

  if (hooks.onDone) hooks.onDone(EV, changesBrief)
  if (hooks.onState) hooks.onState(EV)
}

export function endEvent(EV) {
  if (!EV) return
  if (EV._ctl) {
    try { EV._ctl.abort() } catch (e) { /* ignore */ }
    EV._ctl = null
  }
  EV._turn = (EV._turn || 0) + 1
  return null
}

function trimHistory(history) {
  const arr = Array.isArray(history) ? history : []
  return arr.slice(-MAX_HISTORY_MSGS)
}

function normalizeText(t) {
  if (t == null) return ''
  if (typeof t === 'string') return t
  if (Array.isArray(t)) {
    return t.map(p => (p && typeof p.text === 'string') ? p.text : (typeof p === 'string' ? p : '')).join('')
  }
  return String(t)
}

function stripJSONBlock(text) {
  let s = String(text || '')
    .replace(/```think[\s\S]*?```/gi, '')
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/g, '')

  const rawLines = s.split(/\r?\n/)
  const kept = []
  for (const line of rawLines) {
    const t = line.trim()
    if (!t) {
      if (kept.length) kept.push('')
      continue
    }
    if (/^(Let me|Keep it|I'll|I will|Actually|Maybe|Careful|Choice|Choices|Text|Wait|OK,|Sure,|Fine|Okay|First,|Then,)\b/i.test(t)) continue
    if (/\bdesc\s*[:：]/i.test(t)) continue
    if (/^["“「].*["”」]?\s*—\s*(desc|note)/i.test(t)) continue
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length
    const latin = (t.match(/[A-Za-z]/g) || []).length
    if (latin > 8 && latin >= cjk) continue
    if (cjk < 4 && latin > 4) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

function resolveKey(S) {
  const keys = Array.isArray(S.playerKeys) ? S.playerKeys : []
  if (!keys.length) return null
  const idx = (typeof S.selectedKey === 'number' && keys[S.selectedKey]) ? S.selectedKey : 0
  return keys[idx] || keys[0] || null
}
