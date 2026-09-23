// AI 事件状态机
import { buildSystemPrompt } from './prompt.js'
import { callLLM, extractGameJSON } from './llm-bridge.js'
import { applyChanges } from './changes.js'
import { MAX_EVENT_CHOICES } from './constants.js'

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
    _ctl: null
  }
}

/**
 * 发送一轮。S 为存档，hooks 用于渲染回调。
 */
export async function runEventTurn(S, EV, userContent, hooks = {}) {
  EV.loading = true
  EV.error = ''
  if (hooks.onState) hooks.onState(EV)

  const keyObj = resolveKey(S)
  if (!keyObj) {
    EV.loading = false
    EV.error = '请先在设置中配置 API Key（🔑 切换API Key）'
    if (hooks.onState) hooks.onState(EV)
    return
  }

  const system = buildSystemPrompt(S, {
    limitOn: hooks.limitOn !== false,
    cheatUnlocked: !!hooks.cheatUnlocked
  })

  EV.history.push({ role: 'user', content: userContent })

  const ctl = new AbortController()
  EV._ctl = ctl
  const res = await callLLM({
    keyObj,
    system,
    user: userContent,
    history: EV.history.slice(0, -1),
    signal: ctl.signal
  })

  if (EV._ctl === ctl) EV._ctl = null
  EV.loading = false

  if (!res.ok) {
    EV.error = res.error || '调用失败'
    // 回滚最后一条 user，允许重试
    EV.history.pop()
    if (hooks.onState) hooks.onState(EV)
    return
  }

  const text = res.text || ''
  const json = extractGameJSON(text)
  const narrative = stripJSONBlock(text)

  EV.history.push({ role: 'assistant', content: text })
  EV.count += 1

  let changesBrief = null
  if (json) {
    if (Array.isArray(json.options) && json.options.length && !json.end) {
      EV.options = json.options.slice(0, 4).map(String)
    } else {
      EV.options = null
      EV.ended = !!json.end || !json.options
    }
    if (json.end) EV.ended = true
    if (json.changes) {
      changesBrief = applyChanges(S, json.changes, hooks)
      EV.changesBrief = changesBrief
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
  }
  return null
}

function stripJSONBlock(text) {
  return String(text || '')
    .replace(/```json\s*[\s\S]*?```/gi, '')
    .replace(/```\s*[\s\S]*?```/g, '')
    .trim()
}

function resolveKey(S) {
  const keys = Array.isArray(S.playerKeys) ? S.playerKeys : []
  if (!keys.length) return null
  const idx = (typeof S.selectedKey === 'number' && keys[S.selectedKey]) ? S.selectedKey : 0
  return keys[idx] || keys[0] || null
}
