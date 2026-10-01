// 技能/技艺等级（由包定义列表）
import { packOf } from './progression.js'

export function skillRank(r) {
  return Math.max(0, Math.round(Number(r) || 0))
}

export function skillLabel(S, sk, r) {
  const pack = packOf(S)
  r = skillRank(r)
  // 0 级 = 尚未习得（新开档技艺列表全是 0，不能显示成“初级XX师”）
  if (r <= 0) return '未习'
  const tiers = pack.tiers
  const startTier = pack.skillStartTier != null ? pack.skillStartTier : 1
  const ri = startTier + Math.floor(r / 3)
  const g = r % 3
  const tname = tiers[Math.min(ri, tiers.length - 1)].name
  const prof = sk.prof || (sk.name + '师')
  const grades = (pack.skillGrades) || ['初级', '中级', '高级']
  return tname + '级' + prof + '（' + grades[g] + '）'
}

export function skillMaxRank(S) {
  const pack = packOf(S)
  const startTier = pack.skillStartTier != null ? pack.skillStartTier : 1
  return Math.max(0, (pack.tiers.length - 1 - startTier)) * 3 + 2
}

