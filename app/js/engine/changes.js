// 应用 AI 返回的 changes JSON
import { addItem, removeItem, normalizeType } from './inventory.js'
import { applyNewLocations, applyModifyLocations, applyRemoveLocations, moveByName } from './map.js'
import { fmtNum, ageLabel } from './util.js'
import { packOf, tierLabel } from './progression.js'

/**
 * @returns {{major:string[], minor:string[]}} 弹窗用变更摘要
 */
export function applyChanges(S, ch, hooks = {}) {
  const major = []
  const minor = []
  if (!ch || typeof ch !== 'object') return { major, minor }

  const pack = packOf(S)
  const moneyName = (slot) => (pack.lexicon.money && pack.lexicon.money[slot]) || '货币'
  const progName = pack.lexicon.progress || '进度'

  if (ch.age_days) {
    const d = Math.round(Number(ch.age_days) || 0)
    if (d) {
      S.ageDays = Math.max(0, S.ageDays + d)
      minor.push(`年龄 ${d > 0 ? '+' : ''}${d} 天`)
    }
  }

  // 货币：兼容旧字段名
  const moneyAdd = [
    ['main', ['ling_shi', 'money_main', 'currency', 'money']],
    ['mid', ['shang_pin', 'money_mid']],
    ['high', ['xian_yuan', 'money_high']]
  ]
  for (const [slot, keys] of moneyAdd) {
    for (const k of keys) {
      if (ch[k] != null) {
        const v = Math.round(Number(ch[k]) || 0)
        if (v) {
          const next = (S.money[slot] || 0) + v
          // 货币不为负；扣超持有则扣到 0
          if (next < 0) {
            const actual = -(S.money[slot] || 0)
            S.money[slot] = 0
            if (actual) minor.push(`${moneyName(slot)} ${fmtNum(actual)}`)
          } else {
            S.money[slot] = next
            minor.push(`${moneyName(slot)} ${v > 0 ? '+' : ''}${fmtNum(v)}`)
          }
        }
        break
      }
    }
  }

  if (ch.cultivation != null || ch.progress != null) {
    const v = Number(ch.cultivation != null ? ch.cultivation : ch.progress) || 0
    if (v) {
      S.progress = Math.max(0, S.progress + v)
      minor.push(`${progName} ${v > 0 ? '+' : ''}${fmtNum(v)}`)
    }
  }

  if (Array.isArray(ch.add_items)) {
    for (const raw of ch.add_items) {
      if (!raw || !raw.name) continue
      const it = Object.assign({}, raw, { type: normalizeType(raw.type) })
      addItem(S, it, raw.count || 1)
      major.push(`获得 ${raw.name}×${raw.count || 1}`)
    }
  }

  if (Array.isArray(ch.remove_items)) {
    for (const raw of ch.remove_items) {
      if (!raw || !raw.name) continue
      if (removeItem(S, raw, raw.count || 1)) {
        minor.push(`失去 ${raw.name}${raw.count > 1 ? '×' + raw.count : ''}`)
      }
    }
  }

  if (Array.isArray(ch.major_events)) {
    for (const e of ch.major_events) {
      if (!e) continue
      S.bigEvents.push({ age: ageLabel(S.ageDays), text: String(e) })
      major.push(String(e))
    }
    if (S.bigEvents.length > 200) S.bigEvents = S.bigEvents.slice(-200)
  }
  if (Array.isArray(ch.small_events)) {
    for (const e of ch.small_events) {
      if (!e) continue
      S.smallEvents.push({ age: ageLabel(S.ageDays), text: String(e) })
      minor.push(String(e))
    }
    if (S.smallEvents.length > 200) S.smallEvents = S.smallEvents.slice(-200)
  }
  // 兼容 major_event / small_event 单数
  if (ch.major_event) {
    S.bigEvents.push({ age: ageLabel(S.ageDays), text: String(ch.major_event) })
    major.push(String(ch.major_event))
    if (S.bigEvents.length > 200) S.bigEvents = S.bigEvents.slice(-200)
  }
  if (ch.small_event) {
    S.smallEvents.push({ age: ageLabel(S.ageDays), text: String(ch.small_event) })
    minor.push(String(ch.small_event))
    if (S.smallEvents.length > 200) S.smallEvents = S.smallEvents.slice(-200)
  }

  if (ch.skills && typeof ch.skills === 'object') {
    for (const [k, v] of Object.entries(ch.skills)) {
      const key = skillKeyFor(S, pack, k)
      if (!key) continue
      const d = Math.round(Number(v) || 0)
      if (d) {
        S.skills[key] = Math.max(0, (S.skills[key] || 0) + d)
        const sk = pack.skills.find(x => x.id === key)
        minor.push(`${sk ? sk.name : k} +${d}`)
      }
    }
  }

  if (Array.isArray(ch.friends)) {
    for (const raw of ch.friends) {
      if (!raw || !raw.name) continue
      let f = S.friends.find(x => x.name === raw.name)
      const rankStr = String(raw.realm || raw.rank || tierLabel(S))
      if (!f) {
        f = {
          name: String(raw.name),
          realm: rankStr,
          gender: raw.gender === '女' ? '女' : raw.gender === '男' ? '男' : '',
          power: Number(raw.power) || 0,
          intro: String(raw.intro || ''),
          mem: String(raw.mem || ''),
          favor: 0,
          lastDay: '',
          talkCount: 0,
          history: [],
          married: raw.married || null,
          relations: normRelList(raw.relations),
          grudges: normGList(raw.grudges)
        }
        S.friends.push(f)
        major.push(`结识 ${f.name}`)
      } else {
        if (raw.realm || raw.rank) f.realm = String(raw.realm || raw.rank)
        if (raw.power != null) f.power = Number(raw.power) || f.power
        if (raw.intro) f.intro = String(raw.intro)
        if (raw.mem) f.mem = String(raw.mem)
        if (raw.married !== undefined) f.married = raw.married
        if (raw.gender) f.gender = raw.gender
        if (raw.relations != null) f.relations = mergeRelList(f.relations, raw.relations)
        if (raw.grudges != null) f.grudges = mergeGList(f.grudges, raw.grudges)
      }
      if (raw.favor != null) {
        const d = Number(raw.favor) || 0
        f.favor = (f.favor || 0) + d
        if (d) minor.push(`${f.name} 好感 ${d > 0 ? '+' : ''}${d}`)
      }
      if (Array.isArray(f.history) && f.history.length > 50) {
        f.history = f.history.slice(-50)
      }
    }
  }

  if (Array.isArray(ch.remove_friends)) {
    for (const n of ch.remove_friends) {
      S.friends = S.friends.filter(f => f.name !== n)
    }
  }

  applyNewLocations(S, ch.new_locations)
  applyModifyLocations(S, ch.modify_locations)
  applyRemoveLocations(S, ch.remove_locations, pack)
  if (ch.move_to) moveByName(S, String(ch.move_to))

  if (ch.faction_rep != null) {
    const v = Math.round(Number(ch.faction_rep) || 0)
    S.factionRep = (S.factionRep || 0) + v
    if (v) minor.push(`声望 ${v > 0 ? '+' : ''}${v}`)
  }

  // 不允许 AI 直接改等级
  if (ch.tierIndex != null || ch.realmIndex != null || ch.tier != null) {
    // 忽略
  }

  return { major, minor }
}

function skillKeyFor(S, pack, k) {
  if (pack.skills.some(s => s.id === k)) return k
  const hit = pack.skills.find(s => s.name === k)
  return hit ? hit.id : null
}

function normRelList(list) {
  if (!Array.isArray(list)) return []
  return list.slice(0, 12).map(r => {
    if (!r) return null
    if (typeof r === 'string') return { to: String(r), rel: '相关', note: '' }
    return {
      to: String(r.to || r.name || r.target || ''),
      rel: String(r.rel || r.relation || r.type || '相关').slice(0, 12),
      note: String(r.note || r.desc || '').slice(0, 40)
    }
  }).filter(r => r && r.to)
}

function normGList(list) {
  if (!Array.isArray(list)) return []
  return list.slice(0, 8).map(g => {
    if (!g) return null
    if (typeof g === 'string') return { to: '', kind: '怨', note: String(g).slice(0, 40) }
    const kindRaw = String(g.kind || g.type || '怨')
    const kind = /恩/.test(kindRaw) ? '恩' : /仇/.test(kindRaw) ? '仇' : /债/.test(kindRaw) ? '债' : '怨'
    return {
      to: String(g.to || g.name || g.target || ''),
      kind,
      note: String(g.note || g.desc || g.reason || '').slice(0, 40)
    }
  }).filter(Boolean)
}

function mergeRelList(oldList, raw) {
  const base = Array.isArray(oldList) ? oldList.slice() : []
  const add = normRelList(raw)
  for (const r of add) {
    const i = base.findIndex(x => x.to === r.to)
    if (i >= 0) base[i] = r
    else base.push(r)
  }
  return base.slice(0, 12)
}

function mergeGList(oldList, raw) {
  const base = Array.isArray(oldList) ? oldList.slice() : []
  const add = normGList(raw)
  for (const g of add) {
    const i = base.findIndex(x => x.to === g.to && x.kind === g.kind)
    if (i >= 0) base[i] = g
    else base.push(g)
  }
  return base.slice(0, 8)
}
