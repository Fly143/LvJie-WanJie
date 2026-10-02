// 地图：旅行、解锁、AI 扩图
import { packOf, speedMult } from './progression.js'
import { normalizeUseEffect, normalizeItemType, normalizeUsable } from './worldpack.js'
import { syncPartyTo } from './party.js'
import { advanceFriendDays } from './npc-memory.js'

export function curLoc(S) {
  return (S && S.map && S.map.find(l => l.id === S.currentLoc)) || (S && S.map && S.map[0]) || null
}

export function genLocId(S) {
  S._locSeq = (S._locSeq || 0) + 1
  return 'ai_loc_' + S._locSeq
}

/** 包定义的通行门槛：pack.gateRules(c, t) => null | 字符串原因 */
export function gateReason(S, from, to) {
  const pack = packOf(S)
  if (pack.gateRules) {
    const r = pack.gateRules(from, to, S)
    if (r) return r
  }
  return null
}

/**
 * 旅行：直接同步返回 {ok, days, msg}（事件叙事由 AI 层负责）
 * 简化版：旅行立即到达，天数记入 ageDays；由调用方决定是否走 AI。
 */
export function travel(S, targetName) {
  const c = curLoc(S)
  const t = S.map.find(l => l.name === targetName)
  if (!t) return { ok: false, msg: '没有这个地方' }
  if (c && c.id === t.id) return { ok: false, msg: '你已在此处' }
  const gate = gateReason(S, c || {}, t)
  if (gate) return { ok: false, msg: gate }

  const days = travelDays(S, c || {}, t)
  S.currentLoc = t.id
  S.ageDays += days
  advanceFriendDays(S, days) // 同伴/已结识 NPC 一起变老
  syncPartyTo(S, t.id) // 同行者随行
  return { ok: true, days, msg: `前往 ${t.name}（${days} 天）` }
}

export function travelDays(S, c, t) {
  if (!c || !t) return 0
  if (c.id === t.id) return 0
  const pack = packOf(S)
  if (pack.travelDays) return pack.travelDays(S, c, t)
  const speed = Math.max(1, speedMult(S, S.tierIndex))
  const nameNear = (a, b) => {
    const x = String(a || ''), y = String(b || '')
    return x.includes(y) || y.includes(x)
  }
  let raw = 2
  if (c.world && t.world && c.world !== t.world) {
    raw = pack.crossWorldDays ? pack.crossWorldDays(c.world, t.world) : 60
  } else if (c.continent && t.continent && c.continent !== t.continent) {
    raw = 8
  } else if (nameNear(c.name, t.name)) {
    raw = 1 // 同一据点内部（青云宗 ↔ 青云宗演武场）
  }
  return Math.max(0, Math.round(raw / speed))
}

/** AI 新增地点落库 */
export function applyNewLocations(S, arr) {
  if (!Array.isArray(arr)) return 0
  const pack = packOf(S)
  let n = 0
  for (const raw of arr.slice(0, 6)) {
    if (!raw || !raw.name) continue
    const exist = S.map.find(l => l.name === raw.name)
    if (exist) {
      // 同名已有地点：合并 beasts / interactables / people（剧情补当前地点时走这条）
      if (Array.isArray(raw.beasts)) {
        exist.beasts = exist.beasts || []
        for (const b of raw.beasts.slice(0, 8)) {
          const nb = normBeast(b)
          if (!nb) continue
          const ex = exist.beasts.find(x => x.name === nb.name)
          if (ex) Object.assign(ex, nb)
          else exist.beasts.push(nb)
        }
      }
      if (Array.isArray(raw.interactables)) {
        exist.interactables = exist.interactables || []
        for (const x of raw.interactables.slice(0, 8)) {
          const nm = String((x && x.name) || '').trim().slice(0, 24)
          if (!nm) continue
          const item = { name: nm, intro: String((x && x.intro) || '').slice(0, 80) }
          const ex = exist.interactables.find(i => i.name === nm)
          if (ex) Object.assign(ex, item)
          else exist.interactables.push(item)
        }
      }
      continue
    }
    if (S.map.length >= 80) break
    const cur = curLoc(S) || {}
    const world = normalizeWorld(pack, raw.world, cur.world)
    const continent = String(raw.continent || cur.continent || '未知地域')
    const loc = {
      id: genLocId(S),
      name: String(raw.name),
      world,
      continent,
      type: String(raw.type || '荒野'),
      desc: String(raw.desc || ''),
      people: Array.isArray(raw.people) ? raw.people.map(normPerson) : [],
      shop: Array.isArray(raw.shop) ? raw.shop.map(x => normShop(S, pack, x)) : [],
      beasts: (Array.isArray(raw.beasts) ? raw.beasts.map(normBeast) : []).filter(Boolean),
      interactables: (Array.isArray(raw.interactables)
        ? raw.interactables
            .map(x => ({
              name: String((x && x.name) || '').trim().slice(0, 24),
              intro: String((x && x.intro) || '').slice(0, 80)
            }))
            .filter(x => x.name)
        : []),
      notes: []
    }
    // 物品境界上限
    if (Array.isArray(loc.shop)) {
      for (const it of loc.shop) clampItemTier(S, pack, loc, it)
    }
    S.map.push(loc)
    n++
  }
  return n
}

function normalizeWorld(pack, w, fallback) {
  const worlds = pack.worlds || []
  if (w && worlds.includes(String(w))) return String(w)
  return fallback || (worlds[0] || '主世界')
}

function normPerson(p) {
  const power = Math.abs(Number(p.power) || 0)
  return {
    name: String(p.name || '无名氏').slice(0, 24),
    realm: String(p.realm || '').slice(0, 24),
    power: Math.min(1e7, power),
    intro: String(p.intro || '').slice(0, 200),
    gender: p.gender === '女' ? '女' : p.gender === '男' ? '男' : String(p.gender || '').slice(0, 8),
    relations: Array.isArray(p.relations) ? p.relations.filter(r => r && typeof r === 'object' && r.to).slice(0, 12) : [],
    grudges: Array.isArray(p.grudges) ? p.grudges.filter(g => g && typeof g === 'object').slice(0, 8) : []
  }
}

function normShop(S, pack, x) {
  const ri = x.realm_index != null ? Number(x.realm_index) : NaN
  return {
    name: String(x.name || '未知商品').slice(0, 24),
    desc: String(x.desc || '').slice(0, 80),
    type: normalizeItemType(x.type),
    realm_index: Number.isFinite(ri) ? Math.round(ri) : undefined,
    grade: x.grade != null ? String(x.grade) : undefined,
    price: Math.max(0, Math.round(Number(x.price) || 0)),
    usable: normalizeUsable(x.usable),
    use_effect: normalizeUseEffect(x.use_effect),
    levels: x.levels,
    level_costs: x.level_costs,
    level_powers: x.level_powers
  }
}

function normBeast(b) {
  if (!b) return null
  const name = String(b.name || '').trim().slice(0, 24)
  if (!name || name === '未知生物') return null
  return {
    name,
    realm: String(b.realm || '').slice(0, 24),
    power: Math.max(0, Number(b.power) || 0),
    drops: String(b.drops || '').slice(0, 80)
  }
}

export function worldMaxTier(S, pack, world) {
  if (pack.worldMaxTier && pack.worldMaxTier[world] != null) return pack.worldMaxTier[world]
  return pack.tiers.length - 1
}

function clampItemTier(S, pack, loc, it) {
  if (it.realm_index == null) return
  const max = worldMaxTier(S, pack, loc.world)
  const min = 0
  it.realm_index = Math.max(min, Math.min(max, Math.round(it.realm_index)))
}

export function applyModifyLocations(S, arr) {
  if (!Array.isArray(arr)) return
  for (const raw of arr.slice(0, 10)) {
    if (!raw || !raw.name) continue
    const loc = S.map.find(l => l.name === raw.name)
    if (!loc) continue
    if (raw.change) {
      loc.notes = loc.notes || []
      loc.notes.push(String(raw.change).slice(0, 200))
      if (loc.notes.length > 30) loc.notes = loc.notes.slice(-30)
      loc.desc = (loc.desc ? loc.desc + ' ' : '') + String(raw.change).slice(0, 200)
      if (loc.desc.length > 2000) loc.desc = loc.desc.slice(-2000)
    }
    if (Array.isArray(raw.people)) {
      for (const p of raw.people.slice(0, 10)) {
        if (!p || !p.name) continue
        const ex = loc.people.find(x => x.name === p.name)
        if (ex) Object.assign(ex, normPerson(p))
        else loc.people.push(normPerson(p))
      }
    }
    if (Array.isArray(raw.shop)) {
      for (const s of raw.shop.slice(0, 10)) {
        if (!s || !s.name) continue
        const it = normShop(S, packOf(S), s)
        clampItemTier(S, packOf(S), loc, it)
        const ex = loc.shop.find(x => x.name === s.name)
        if (ex) Object.assign(ex, it)
        else loc.shop.push(it)
      }
    }
    // LLM 可对当前地点补 beasts / interactables（带 name 才收）
    if (Array.isArray(raw.beasts)) {
      loc.beasts = loc.beasts || []
      for (const b of raw.beasts.slice(0, 8)) {
        const nb = normBeast(b)
        if (!nb) continue
        const ex = loc.beasts.find(x => x.name === nb.name)
        if (ex) Object.assign(ex, nb)
        else loc.beasts.push(nb)
      }
    }
    if (Array.isArray(raw.interactables)) {
      loc.interactables = loc.interactables || []
      for (const x of raw.interactables.slice(0, 8)) {
        const name = String((x && x.name) || '').trim().slice(0, 24)
        if (!name) continue
        const item = { name, intro: String((x && x.intro) || '').slice(0, 80) }
        const ex = loc.interactables.find(i => i.name === name)
        if (ex) Object.assign(ex, item)
        else loc.interactables.push(item)
      }
    }
  }
}

export function applyRemoveLocations(S, names, pack) {
  if (!Array.isArray(names) || !S.map) return
  const startLoc = pack && pack.startLoc
  for (const n of names.slice(0, 10)) {
    const loc = S.map.find(l => l.name === n)
    if (!loc) continue
    if (loc.id === S.currentLoc) continue
    if (startLoc && loc.id === startLoc) continue
    if (S.map.length <= 1) continue
    S.map = S.map.filter(l => l.id !== loc.id)
  }
  if (!S.map.some(l => l.id === S.currentLoc) && S.map[0]) S.currentLoc = S.map[0].id
}

export function moveByName(S, name) {
  const t = S.map.find(l => l.name === name)
  if (t) S.currentLoc = t.id
}

export function mapSummary(S) {
  return S.map.map(l => ({
    name: l.name,
    world: l.world,
    continent: l.continent,
    type: l.type
  }))
}
