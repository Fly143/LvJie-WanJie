// 同行（轻量队伍）
// 玩家在同伴页邀请已结识的 NPC 同行；同行者会随玩家移动，并始终出现在当前场景的人物表里。
// 设计要点：
//  - 同行状态存在同伴卡上（f.party / f.partySince），不新增顶层数组，旧档天然兼容
//  - 不依赖 map.js（避免循环引用），地点人物表的增删都在本模块收口
//  - 地点人物表只是「谁在哪」的投影，权威来源仍是 S.friends

import { addFriendHistory } from './npc-memory.js'
import { syncFavorToRelations } from './marriage.js'
import { friendPowerF } from './power.js'

/** 每日互动的固定好感收益（每人每天一次） */
export const PARTY_DAILY_FAVOR = 2

/** 分天口径与交谈一致：30 游戏天 = 1 天 */
export function dayKeyOf(S) {
  return String(Math.floor((Number(S && S.ageDays) || 0) / 30))
}

export function partyMembers(S) {
  return (S && Array.isArray(S.friends) ? S.friends : []).filter(f => f && f.party === true)
}

export function partyNames(S) {
  return partyMembers(S).map(f => String(f.name || '')).filter(Boolean)
}

export function isParty(S, name) {
  const f = findFriend(S, name)
  return !!(f && f.party === true)
}

function findFriend(S, name) {
  const n = String(name || '').trim()
  if (!n) return null
  return (S && Array.isArray(S.friends) ? S.friends : []).find(f => f && f.name === n) || null
}

function curLocOf(S) {
  return (S && Array.isArray(S.map) ? S.map : []).find(l => l.id === S.currentLoc)
    || (S && Array.isArray(S.map) ? S.map[0] : null) || null
}

/** 同伴卡 → 地点人物表里的条目（字段与 map.js normPerson 对齐） */
function personOf(f) {
  return {
    name: String(f.name || ''),
    realm: String(f.realm || ''),
    power: Math.abs(Number(f.power) || 0),
    intro: String(f.intro || ''),
    gender: String(f.gender || ''),
    relations: Array.isArray(f.relations) ? f.relations.slice(0, 12) : [],
    grudges: Array.isArray(f.grudges) ? f.grudges.slice(0, 8) : []
  }
}

/**
 * 让所有同行者出现在 locId 地点，并从其它地点的人物表摘掉。
 * 幂等，可每轮调用（保证「同行者一定在场」这个不变量）。
 * @returns {number} 同行的总人数
 */
export function syncPartyTo(S, locId) {
  if (!S || !Array.isArray(S.map)) return 0
  const members = partyMembers(S)
  if (!members.length) return 0
  const target = S.map.find(l => l.id === (locId || S.currentLoc)) || curLocOf(S)
  if (!target) return 0
  if (!Array.isArray(target.people)) target.people = []
  for (const f of members) {
    const name = String(f.name || '')
    if (!name) continue
    for (const l of S.map) {
      if (l === target || !Array.isArray(l.people)) continue
      l.people = l.people.filter(p => !(p && p.name === name))
    }
    const ex = target.people.find(p => p && p.name === name)
    if (ex) Object.assign(ex, personOf(f))
    else target.people.push(personOf(f))
  }
  return members.length
}

/** 该 NPC 是否在当前场景（人物表里）、在哪个地点，或压根没有任何已知位置 */
function locationState(S, name) {
  let somewhere = false
  let locId = null
  for (const l of S.map || []) {
    if (!Array.isArray(l.people)) continue
    if (!l.people.some(p => p && p.name === name)) continue
    if (!somewhere) { somewhere = true; locId = l.id }
    if (l.id === S.currentLoc) return { here: true, somewhere: true, locId: l.id }
  }
  return { here: false, somewhere, locId }
}

/** 邀请时的出发点（解除同行时可选择送回） */
export function originOf(S, f) {
  const id = f && f.partyFromLocId
  if (!id) return null
  const l = (S.map || []).find(x => x.id === id)
  return l ? { id: l.id, name: l.name } : null
}

/** 把 NPC 放回指定地点（先摘干净其它地点的人物表） */
function restoreTo(S, f, locId) {
  const name = String(f.name || '')
  const target = (S.map || []).find(l => l.id === locId)
  if (!target) return false
  for (const l of S.map || []) {
    if (!Array.isArray(l.people)) continue
    l.people = l.people.filter(p => !(p && p.name === name))
  }
  if (!Array.isArray(target.people)) target.people = []
  target.people.push(personOf(f))
  return true
}

/**
 * 邀请 / 结束同行。
 * @param {object} [opts] 结束同行时：`{ returnTo: true }` 把 NPC 送回邀请前的地点
 * @returns {{ok:boolean, name?:string, on?:boolean, changed?:boolean, reason?:string, returned?:boolean, to?:string}}
 *  reason: 'missing'（没有这个人）| 'nothere'（不在同一场景）
 */
export function setParty(S, name, on, opts = {}) {
  const f = findFriend(S, name)
  if (!f) return { ok: false, reason: 'missing' }
  const want = on === undefined ? !(f.party === true) : !!on
  if (!want) return dismissOne(S, f, opts)
  if (f.party) return { ok: true, name: f.name, on: true, changed: false }
  const st = locationState(S, f.name)
  // 行踪不明的人（地图上没有位置）也允许邀请；明确在别处则要求同场景
  if (!st.here && st.somewhere) return { ok: false, reason: 'nothere', name: f.name }
  f.party = true
  f.partySince = Number(S.ageDays) || 0
  // 记住出发点：解除同行时可选择送回（行踪不明者没有出发点）
  f.partyFromLocId = st.somewhere ? st.locId : null
  addFriendHistory(f, '开始与你同行')
  syncPartyTo(S, S.currentLoc)
  return { ok: true, name: f.name, on: true, changed: true }
}

/** 解除单个同行者；opts.returnTo 为真且记得出发点时送回原处，否则留在原地 */
export function dismissOne(S, f, opts = {}) {
  if (!f || !f.party) return { ok: true, name: f && f.name, on: false, changed: false }
  const origin = originOf(S, f)
  const back = opts.returnTo === true && !!origin
  f.party = false
  delete f.partySince
  delete f.partyFromLocId
  if (back) {
    restoreTo(S, f, origin.id)
    addFriendHistory(f, `结束了与你的同行，返回${origin.name}`)
  } else {
    addFriendHistory(f, '结束了与你的同行')
  }
  return { ok: true, name: f.name, on: false, changed: true, returned: back, to: back ? origin.name : '' }
}

/** 解散全队；opts.returnTo 为真时能送回的都送回原处 */
export function dismissAll(S, opts = {}) {
  const list = partyMembers(S)
  const done = []
  for (const f of list) {
    const r = dismissOne(S, f, opts)
    if (r.changed) done.push(r)
  }
  return {
    ok: true,
    count: done.length,
    returned: done.filter(x => x.returned).length,
    names: done.map(x => x.name)
  }
}

/** 提示词用：同行者简报 */
export function partyBrief(S) {
  return partyMembers(S).map(f => ({
    name: f.name,
    rank: f.realm || '',
    战力: Math.round(friendPowerF(S, f)),
    好感: f.favor || 0,
    人设: f.intro || '',
    长期记忆: f.mem || '',
    同行天数: partyDays(S, f)
  }))
}

/** 已同行天数 */
export function partyDays(S, f) {
  if (!f || f.party !== true) return 0
  return Math.max(0, (Number(S.ageDays) || 0) - (Number(f.partySince) || 0))
}

/** 今天还能不能互动（每人每天一次） */
export function canInteractToday(S, f) {
  if (!f || f.party !== true) return false
  return f.lastPartyDay !== dayKeyOf(S)
}

/**
 * 每日互动（切磋/交流）：+好感、写近况；每人每天一次。
 * @returns {{ok:boolean, name?:string, favor?:number, reason?:string}}
 *  reason: 'missing' | 'notparty' | 'today'
 */
export function partyInteract(S, name) {
  const f = findFriend(S, name)
  if (!f) return { ok: false, reason: 'missing' }
  if (f.party !== true) return { ok: false, reason: 'notparty', name: f.name }
  if (f.lastPartyDay === dayKeyOf(S)) return { ok: false, reason: 'today', name: f.name }
  f.lastPartyDay = dayKeyOf(S)
  f.favor = Math.round((Number(f.favor) || 0) + PARTY_DAILY_FAVOR)
  try { syncFavorToRelations(f) } catch (e) { /* ignore */ }
  addFriendHistory(f, '与你切磋交流')
  return { ok: true, name: f.name, favor: PARTY_DAILY_FAVOR }
}
