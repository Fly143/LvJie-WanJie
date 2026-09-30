// 同行（轻量队伍）
// 玩家在同伴页邀请已结识的 NPC 同行；同行者会随玩家移动，并始终出现在当前场景的人物表里。
// 设计要点：
//  - 同行状态存在同伴卡上（f.party / f.partySince），不新增顶层数组，旧档天然兼容
//  - 不依赖 map.js（避免循环引用），地点人物表的增删都在本模块收口
//  - 地点人物表只是「谁在哪」的投影，权威来源仍是 S.friends

import { addFriendHistory } from './npc-memory.js'

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

/** 该 NPC 是否在当前场景（人物表里），或压根没有任何已知位置 */
function locationState(S, name) {
  let somewhere = false
  for (const l of S.map || []) {
    if (!Array.isArray(l.people)) continue
    if (!l.people.some(p => p && p.name === name)) continue
    somewhere = true
    if (l.id === S.currentLoc) return { here: true, somewhere: true }
  }
  return { here: false, somewhere }
}

/**
 * 邀请 / 结束同行。
 * @returns {{ok:boolean, name?:string, on?:boolean, changed?:boolean, reason?:string}}
 *  reason: 'missing'（没有这个人）| 'nothere'（不在同一场景）
 */
export function setParty(S, name, on) {
  const f = findFriend(S, name)
  if (!f) return { ok: false, reason: 'missing' }
  const want = on === undefined ? !(f.party === true) : !!on
  if (!want) {
    if (!f.party) return { ok: true, name: f.name, on: false, changed: false }
    f.party = false
    delete f.partySince
    addFriendHistory(f, '结束了与你的同行')
    return { ok: true, name: f.name, on: false, changed: true }
  }
  if (f.party) return { ok: true, name: f.name, on: true, changed: false }
  const st = locationState(S, f.name)
  // 行踪不明的人（地图上没有位置）也允许邀请；明确在别处则要求同场景
  if (!st.here && st.somewhere) return { ok: false, reason: 'nothere', name: f.name }
  f.party = true
  f.partySince = Number(S.ageDays) || 0
  addFriendHistory(f, '开始与你同行')
  syncPartyTo(S, S.currentLoc)
  return { ok: true, name: f.name, on: true, changed: true }
}

/** 提示词用：同行者简报 */
export function partyBrief(S) {
  return partyMembers(S).map(f => ({
    name: f.name,
    rank: f.realm || '',
    好感: f.favor || 0,
    人设: f.intro || '',
    长期记忆: f.mem || '',
    同行天数: Math.max(0, (Number(S.ageDays) || 0) - (Number(f.partySince) || 0))
  }))
}
