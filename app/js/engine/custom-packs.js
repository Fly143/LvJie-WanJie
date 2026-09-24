// 自定义世界包：localStorage 持久化 + 注册表合并
import { validatePackDraft, packToDraft } from './worldpack.js'

export const CUSTOM_PACKS_KEY = 'agentworlds_custom_packs_v1'

export function loadCustomPackDrafts() {
  try {
    const raw = localStorage.getItem(CUSTOM_PACKS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(x => x && typeof x === 'object') : []
  } catch (e) { return [] }
}

export function loadCustomPacks() {
  const out = []
  for (const draft of loadCustomPackDrafts()) {
    const v = validatePackDraft(draft)
    if (v.ok && v.pack) out.push(v.pack)
  }
  return out
}

export function saveCustomPackDraft(draft) {
  const v = validatePackDraft(draft)
  if (!v.ok) return { ok: false, errors: v.errors }
  const id = v.pack.id
  const list = loadCustomPackDrafts().filter(d => String(d.id || '').toLowerCase() !== id)
  const raw = packToDraft(v.pack)
  list.push(raw)
  try {
    localStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(list))
    return { ok: true, pack: v.pack, id }
  } catch (e) {
    return { ok: false, errors: [(e && e.message) || '保存失败'] }
  }
}

export function deleteCustomPack(id) {
  const key = String(id || '').toLowerCase()
  const list = loadCustomPackDrafts().filter(d => String(d.id || '').toLowerCase() !== key)
  try {
    localStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(list))
    return true
  } catch (e) { return false }
}

export function isCustomPack(id) {
  return loadCustomPackDrafts().some(d => String(d.id || '').toLowerCase() === String(id || '').toLowerCase())
}
