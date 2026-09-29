// 等级进度：完全由世界观包驱动
// pack.tiers: [{ name, lifespan?, subNames?|null, ... }]
// pack.subNames: 默认小级名
import { clamp } from './util.js'
import { packUi, packFeatures } from './pack-ui.js'

/** 数值守卫：非有限数回退默认值 */
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d)

/** 等级索引守卫：非有限回退 0，并夹取到 [0, tiers.length-1] */
function tierIdx(S, i) {
  const n = tiersOf(S).length
  return Math.max(0, Math.min(n - 1, Math.round(fin(i, 0))))
}

/** 小级下标守卫：非有限回退 0，并夹取到 [0, n-1] */
function subIdx(s, n) {
  return clamp(Math.round(fin(s, 0)), 0, Math.max(0, n - 1))
}

export function packOf(S) {
  // 延迟由 boot 注入；这里通过全局 registry 取
  const reg = globalThis.__AW_PACKS__
  if (!reg) throw new Error('worldviews not registered')
  return reg[S.worldview] || reg[Object.keys(reg)[0]]
}

export function tiersOf(S) {
  return packOf(S).tiers
}

export function tierCount(S) {
  return tiersOf(S).length
}

export function tierName(S, i) {
  const t = tiersOf(S)[i]
  return t ? t.name : '未知'
}

export function subNamesOf(S, tierIndex) {
  const pack = packOf(S)
  const t = tiersOf(S)[tierIndex]
  if (t && Array.isArray(t.subNames) && t.subNames.length) return t.subNames
  return pack.subNames || ['初', '中', '高']
}

export function subCount(S, tierIndex) {
  return subNamesOf(S, tierIndex).length
}

export function tierLabel(S) {
  const ti = tierIdx(S, S.tierIndex)
  const names = subNamesOf(S, ti)
  const sn = names[clamp(Math.round(fin(S.sub, 0)), 0, names.length - 1)] || ''
  return tierName(S, ti) + sn
}

export function tierIndexOfStr(S, str) {
  const tiers = tiersOf(S)
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (String(str).includes(tiers[i].name)) return i
  }
  return null
}

export function lifespanOf(S, i) {
  const t = tiersOf(S)[tierIdx(S, i)]
  if (!t) return 100
  if (t.lifespan === Infinity) return Infinity
  // NaN / 非正寿限回退 100
  const v = Number(t.lifespan)
  return Number.isFinite(v) && v > 0 ? v : 100
}

export function isLifeExpired(S) {
  const pack = packOf(S)
  if (packFeatures(pack).lifespan === false) return false
  return fin(S.ageDays, 0) / 360 > lifespanOf(S, S.tierIndex)
}

/** 境界/等级基准数：第0级=1，每高一级 ×10（可被 pack.powerMode 覆盖） */
export function tierBase(S, i) {
  const pack = packOf(S)
  const idx = tierIdx(S, i)
  if (pack.tierBase) {
    const v = Number(pack.tierBase(idx))
    return Number.isFinite(v) && v > 0 ? v : 1
  }
  return idx <= 0 ? 1 : 10 * Math.pow(10, idx - 1)
}

export function subPowerList(S) {
  const pack = packOf(S)
  const src = Array.isArray(pack.subPower) ? pack.subPower : null
  if (!src || !src.length) return [1, 1.25, 1.6, 1.8]
  // 保持长度与下标语义：非有限/非正值逐项回退 1，不改变下标
  return src.map(v => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 1
  })
}

export function cultReq(S, i, s) {
  const pack = packOf(S)
  if (pack.cultReq) return pack.cultReq(i, s)
  const ti = tierIdx(S, i)
  const n = subCount(S, ti)
  const steps = ti === 0 ? [1, 2, 4] : [1, 2, 4, 4]
  const idx = subIdx(s, n)
  return tierBase(S, ti) * (steps[idx] != null ? steps[idx] : 4)
}

export function playerCultReq(S) {
  const pack = packOf(S)
  let r = cultReq(S, S.tierIndex, S.sub)
  if (pack.talentCultMul && S.talent) {
    const m = pack.talentCultMul(S.talent)
    if (typeof m === 'number') r *= m
  }
  return r
}

/** 年修为增长（包可覆盖） */
export function yearlyCult(S, i) {
  const pack = packOf(S)
  if (pack.yearlyCult) return pack.yearlyCult(i)
  const total = (i === 0 ? 7.2 : 11) * tierBase(S, i)
  // cultYears 缺项/非有限/非正时回退默认年限，避免 total/NaN
  const raw = Array.isArray(pack.cultYears) ? Number(pack.cultYears[i]) : NaN
  const years = Number.isFinite(raw) && raw > 0 ? raw : (i === 0 ? 2 : 20 * Math.pow(4, i - 1))
  return total / Math.max(1, years)
}

export function speedMult(S, i) {
  const pack = packOf(S)
  if (pack.speedMult) return pack.speedMult(i)
  // 低阶不再放慢（原先 i=0 得 0.5，导致同图走 10 天）；NaN 索引回退 0 阶
  return Math.pow(2, Math.max(0, fin(i, 0) - 1))
}

export function basePower(S, i, s) {
  const pack = packOf(S)
  if (pack.basePower) return pack.basePower(i, s)
  const subs = subPowerList(S)
  return tierBase(S, i) * (subs[subIdx(s, subs.length)] || 1)
}

export function tierColor(S, i) {
  const pack = packOf(S)
  if (pack.tierColor) return pack.tierColor(i)
  const n = tierCount(S)
  const r = n > 1 ? i / (n - 1) : 0
  if (r <= 0.33) return 'var(--jade)'
  if (r <= 0.66) return 'var(--blue)'
  return 'var(--gold)'
}

/** 尝试升级（突破/晋升/跃迁…）：返回 {ok, msg, broke} */
export function tryBreakthrough(S) {
  const pack = packOf(S)
  const ui = packUi(pack)
  const prog = (pack.lexicon && pack.lexicon.progress) || '进度'
  const req = playerCultReq(S)
  if (S.progress < req) {
    return { ok: false, msg: ui.advanceFail || (`当前${prog}不足，无法${ui.advanceVerb}`) }
  }
  const maxTier = tierCount(S) - 1
  const names = subNamesOf(S, S.tierIndex)
  S.progress -= req
  if (S.sub < names.length - 1) {
    S.sub += 1
    return { ok: true, broke: false, msg: `${ui.advanceTo} ${tierLabel(S)}` }
  }
  if (S.tierIndex < maxTier) {
    S.tierIndex += 1
    S.sub = 0
    return { ok: true, broke: true, msg: `${ui.advanceTo} ${tierLabel(S)}！` }
  }
  S.progress = 0
  return { ok: true, broke: true, msg: `${ui.advancePeak}（${tierLabel(S)}）` }
}
