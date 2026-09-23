// 背包与物品（中性 type + 包词表显示）
import { LEGACY_TYPE_MAP } from './constants.js'
import { fmtNum } from './util.js'
import { tierColor, packOf } from './progression.js'

export function normalizeType(t) {
  return LEGACY_TYPE_MAP[t] || t || 'special'
}

export function findItem(S, name) {
  return S.inventory.find(x => x.name === name)
}

export function addItem(S, it, n) {
  if (!it || !it.name) return
  const count = Math.max(1, Math.round(Number(n) || 1))
  const type = normalizeType(it.type)
  const ex = S.inventory.find(x =>
    x.name === it.name && x.type === type && x.grade === it.grade && x.realm_index === it.realm_index
  )
  if (ex) ex.count += count
  else S.inventory.push(Object.assign({ name: '未知物品', desc: '', count: 1, type: 'special' }, it, { type, count }))
}

export function removeItem(S, name, n) {
  const ex = findItem(S, name)
  if (!ex) return false
  ex.count -= Math.max(1, Math.round(Number(n) || 1))
  if (ex.count <= 0) S.inventory = S.inventory.filter(x => x !== ex)
  return true
}

export function typeName(S, type, pack) {
  const map = pack && pack.typeNames ? pack.typeNames : {}
  const neutral = normalizeType(type)
  const legacy = { consumable: 'consumable', equip: 'equip', technique: 'technique', material: 'material', special: 'special' }
  // 显示名：优先包词表，再 legacy 中文，再原样
  const display = {
    consumable: '消耗品',
    equip: '装备',
    technique: '秘籍',
    material: '材料',
    special: '特殊'
  }
  // 若包把 pill/artifact/manual 映射了名字
  if (map[type]) return map[type]
  if (map[neutral]) return map[neutral]
  return display[neutral] || type || '物品'
}

export function itemChip(S, it, pack) {
  const type = normalizeType(it.type)
  const techName = (pack && pack.typeNames && pack.typeNames.technique) || '秘籍'
  const consName = (pack && pack.typeNames && pack.typeNames.consumable) || '消耗品'
  const eqName = (pack && pack.typeNames && pack.typeNames.equip) || '装备'
  if (type === 'consumable' || type === 'equip' || type === 'technique') {
    const g = it.grade ? String(it.grade) : ''
    const ri = it.realm_index
    if (ri != null) {
      const tname = pack.tiers[ri] ? pack.tiers[ri].name : ''
      const kind = type === 'equip' ? eqName : type === 'technique' ? techName : consName
      const label = tname + (g ? '·' + g : '') + (type === 'consumable' ? '' : kind)
      return `<span class="gchip" style="color:${tierColor(S, ri)}">${escSafe(label) || escSafe(it.name)}</span>`
    }
  }
  if (type === 'material') return `<span class="gchip">${typeName(S, 'material', pack)}</span>`
  return `<span class="gchip">${typeName(S, type, pack)}</span>`
}

function escSafe(s) {
  return String(s == null ? '' : s)
}

/** 直接使用物品（usable=direct） */
export function useDirectItem(S, it) {
  const eff = it.use_effect
  if (!eff || !eff.type) return { ok: false, msg: '该物品无法直接使用' }
  const v = Number(eff.value) || 0
  const pack = packOf(S)
  const moneyName = (slot) => (pack.lexicon.money && pack.lexicon.money[slot]) || '货币'
  switch (eff.type) {
    case 'progress':
    case 'cultivation':
      S.progress += v
      return { ok: true, msg: `获得 ${fmtNum(v)} ${pack.lexicon.progress || '进度'}` }
    case 'money_main':
    case 'ling_shi':
      S.money.main += v
      return { ok: true, msg: `获得 ${fmtNum(v)} ${moneyName('main')}` }
    case 'money_mid':
    case 'shang_pin':
      S.money.mid += v
      return { ok: true, msg: `获得 ${fmtNum(v)} ${moneyName('mid')}` }
    case 'money_high':
    case 'xian_yuan':
      S.money.high += v
      return { ok: true, msg: `获得 ${fmtNum(v)} ${moneyName('high')}` }
    case 'age_days':
      S.ageDays = Math.max(0, S.ageDays + v)
      return { ok: true, msg: '年龄变化' }
    default:
      return { ok: false, msg: '未知使用效果' }
  }
}
