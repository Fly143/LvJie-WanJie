// API 配置条目：归一化 / 匹配 / 表单改动判定
// 纯函数、不依赖 DOM —— 设置面板与冒烟测试共用，保证「切换选用」行为可回归验证

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
