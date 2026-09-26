// 婚姻系统：可多伴侣（后宫）
import { packFeatures } from './pack-ui.js'

export const PROPOSE_MIN_FAVOR = 50

export function marriageEnabled(pack) {
  return packFeatures(pack).marriage !== false
}

export function haremEnabled(pack) {
  // 默认允许后宫；包可 features.harem=false 强制单偶
  return packFeatures(pack).harem !== false
}

export function spouseLabel(f, pack) {
  if (!f || !f.married) return ''
  const word = (pack && pack.lexicon && pack.lexicon.spouse) || '伴侣'
  if (f.married === 'wife') return '女' + word
  if (f.married === 'husband') return '男' + word
  return word
}

export function spouseWord(pack) {
  return (pack && pack.lexicon && pack.lexicon.spouse) || '伴侣'
}

export function proposeWord(pack) {
  return (pack && pack.lexicon && pack.lexicon.propose) || '求婚'
}

export function divorceWord(pack) {
  return (pack && pack.lexicon && pack.lexicon.divorce) || '解除关系'
}

export function marriedList(S) {
  return (S && S.friends || []).filter(f => f && f.married)
}

export function canPropose(f, S, pack) {
  if (!f || !marriageEnabled(pack)) return false
  if (f.married) return false
  if (!haremEnabled(pack) && marriedList(S).length > 0) return false
  return (Number(f.favor) || 0) >= PROPOSE_MIN_FAVOR
}

export function propose(S, friend, pack) {
  if (!S || !friend) return { ok: false, msg: '无效对象' }
  const favor = Number(friend.favor) || 0
  if (favor < PROPOSE_MIN_FAVOR) {
    return { ok: false, msg: `好感不足（需 ${PROPOSE_MIN_FAVOR}）` }
  }
  if (friend.married) return { ok: false, msg: '对方已有' + spouseWord(pack) }
  if (!haremEnabled(pack) && marriedList(S).length > 0) {
    return { ok: false, msg: '此界仅可有一位' + spouseWord(pack) }
  }
  const spouse = friend.gender === '男' ? 'husband' : 'wife'
  friend.married = spouse
  friend.favor = favor + 10
  friend.mem = friend.mem ? (friend.mem + '；与你结为' + spouseWord(pack) + '。') : ('与你结为' + spouseWord(pack) + '。')
  const list = marriedList(S).map(x => x.name)
  S.spouses = list
  return { ok: true, msg: `与${friend.name}结为${spouseWord(pack)}` }
}

export function divorce(S, friend, pack) {
  if (!S || !friend || !friend.married) return { ok: false, msg: '未处于婚姻关系' }
  friend.married = null
  friend.favor = Math.max(0, (Number(friend.favor) || 0) - 20)
  S.spouses = marriedList(S).map(x => x.name)
  return { ok: true, msg: `与${friend.name}${divorceWord(pack)}` }
}
