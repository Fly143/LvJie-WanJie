// API 配置条目：归一化 / 匹配 / 表单改动判定 / 写入列表
// 纯函数、不依赖 DOM —— 设置面板与冒烟测试共用，保证「切换选用」行为可回归验证

import { isZenBase } from './zen.js'
import { normalizeApiKey } from './llm.js'

export function normBase(u) {
  return String(u || '').trim().replace(/\/+$/, '')
}

export function styleOf(k) {
  return (k && (k.apiStyle === 'response' || k.style === 'response')) ? 'response' : 'chat'
}

/** 是否同一条配置：base（忽略结尾斜杠）+ model + 协议 都一致 */
export function sameKeyEntry(a, b) {
  if (!a || !b) return false
  return normBase(a.baseUrl) === normBase(b.baseUrl)
    && String(a.model || '') === String(b.model || '')
    && styleOf(a) === styleOf(b)
}

/** 这条配置是不是「内置免费通道」（内置通道不占用自定义列表） */
export function isZenEntry(k) {
  const n = normalizeApiKey(k) || k || {}
  return isZenBase(n.baseUrl || k.baseUrl)
}

/**
 * 把一条配置写入列表，返回 { list, index }：
 * - 同 base + model + 协议 → 更新原条目
 * - 内置免费通道（同一个 base）**只保留一条**：切换内置模型时更新那一条，不再新增
 *   （否则每换一次模型就往「已保存」里加一条）
 * - keyInput 为空且指定了 selNow 时，视为「沿用原 Key 的编辑」
 */
export function upsertKeyEntry(list, rec, { selNow = -1, keyInput = '' } = {}) {
  const arr = Array.isArray(list) ? list.slice() : []
  let idx = arr.findIndex(k => sameKeyEntry(k, rec))
  if (idx < 0 && isZenEntry(rec)) idx = arr.findIndex(k => isZenEntry(k))
  if (idx < 0 && !keyInput && selNow >= 0 && arr[selNow]) idx = selNow
  if (idx >= 0) {
    const old = arr[idx] || {}
    arr[idx] = Object.assign({}, old, rec, { key: rec.key || old.key || old.value || '' })
    return { list: arr, index: idx }
  }
  arr.push(rec)
  return { list: arr, index: arr.length - 1 }
}

/**
 * 表单是否被改动过。
 * 未改动时「保存并选用」只切换选用、不做 upsert；否则会拿打开弹窗时的旧表单内容
 * 匹配回原来那条配置，把玩家刚做的切换改回去（表现为「切换不生效」）。
 */
export function formDirty(form, cur) {
  if (!form) return false
  if (String(form.key || '').trim()) return true
  if (!cur) return !!(String(form.baseUrl || '').trim() || String(form.model || '').trim())
  return normBase(form.baseUrl) !== normBase(cur.baseUrl)
    || String(form.model || '') !== String(cur.model || '')
    || String(form.name || '') !== String(cur.name || '')
    || styleOf(form) !== styleOf(cur)
}
