// 按需 NPC 记忆：从存档检索命中人物，注入系统提示词
// 不做全量名册进 prompt；只在点名/当前场景时带档案

/**
 * 建索引：friends + 全图 people
 * @returns {Map<string, object>} 小写名 → 卡片
 */
export function buildNpcIndex(S) {
  const idx = new Map()
  if (!S) return idx
  const add = (name, card) => {
    const n = String(name || '').trim()
    if (!n || n.length < 2) return
    const key = n.toLowerCase()
    if (!idx.has(key)) idx.set(key, card)
  }
  for (const f of S.friends || []) {
    add(f.name, {
      kind: 'friend',
      name: f.name,
      realm: f.realm || '',
      power: f.power != null ? f.power : null,
      gender: f.gender || '',
      favor: f.favor || 0,
      married: f.married || null,
      intro: f.intro || '',
      mem: f.mem || '',
      at: friendLocName(S, f.name),
      recent: Array.isArray(f.history) ? f.history.slice(-4) : []
    })
  }
  for (const loc of S.map || []) {
    for (const p of loc.people || []) {
      if (!p || !p.name) continue
      add(p.name, {
        kind: 'scene_npc',
        name: p.name,
        realm: p.realm || '',
        power: p.power != null ? p.power : null,
        gender: p.gender || '',
        intro: p.intro || '',
        at: loc.name,
        world: loc.world || '',
        favor: null,
        mem: '',
        recent: []
      })
    }
    for (const b of loc.beasts || []) {
      if (!b || !b.name) continue
      add(b.name, {
        kind: 'beast',
        name: b.name,
        realm: b.realm || '',
        power: b.power != null ? b.power : null,
        intro: b.drops ? `掉落：${b.drops}` : '',
        at: loc.name,
        world: loc.world || '',
        favor: null,
        mem: '',
        recent: []
      })
    }
  }
  return idx
}

function friendLocName(S, name) {
  for (const l of S.map || []) {
    if ((l.people || []).some(p => p && p.name === name)) return l.name
  }
  return null
}

/** 从文本里挑出已知名字（长名优先，避免短名误匹配） */
export function matchNpcNames(text, index) {
  const s = String(text || '')
  if (!s || !index || !index.size) return []
  const hits = []
  const keys = [...index.keys()].sort((a, b) => b.length - a.length)
  let rest = s
  for (const key of keys) {
    const name = index.get(key).name
    if (!name) continue
    if (rest.includes(name) || rest.toLowerCase().includes(key)) {
      hits.push(name)
      // 去掉已命中片段，减少「张小明」吃掉「张三」类干扰
      rest = rest.split(name).join(' ')
    }
    if (hits.length >= 8) break
  }
  return hits
}

/** 把命中卡片压成提示词块 */
export function focusNpcBlock(index, names) {
  const list = []
  for (const n of names || []) {
    const card = index.get(String(n || '').toLowerCase())
    if (card && !list.some(x => x.name === card.name)) list.push(card)
    if (list.length >= 8) break
  }
  if (!list.length) return ''
  return `【相关人物档案】（按需注入，说话做事要与这些人设一致）
${list.map(c => {
    const bits = []
    bits.push(`- ${c.name}`)
    if (c.realm) bits.push(`档位：${c.realm}`)
    if (c.power != null) bits.push(`战力：${c.power}`)
    if (c.gender) bits.push(`性别：${c.gender}`)
    if (c.favor != null) bits.push(`好感：${c.favor}`)
    if (c.married) bits.push('关系：伴侣')
    if (c.at) bits.push(`出没：${c.at}`)
    if (c.intro) bits.push(`人设：${c.intro}`)
    if (c.mem) bits.push(`长期记忆：${c.mem}`)
    if (c.recent && c.recent.length) {
      bits.push(`近况：${c.recent.map(h => typeof h === 'string' ? h : (h && h.text) || '').filter(Boolean).join('；')}`)
    }
    return bits.join(' · ')
  }).join('\n')}`
}

/**
 * 生成提示词用：当前场景人 + 点名命中
 * @param {object} S 存档
 * @param {string[]} texts 用于扫名字的文本（玩家输入/事件目标等）
 */
export function npcFocusFromTexts(S, texts) {
  const index = buildNpcIndex(S)
  const blob = (texts || []).filter(Boolean).join('\n')
  const names = matchNpcNames(blob, index)
  // 当前场景 people 本身已在 locState；这里只补「不在现场但被点名」的
  const cur = curPeopleNames(S)
  const focusNames = names.filter(n => !cur.includes(n))
  const block = focusNpcBlock(index, names) // 全量命中（含现场，档案更完整）
  return { index, names, focusNames, block }
}

function curPeopleNames(S) {
  const loc = (S && S.map && S.map.find(l => l.id === S.currentLoc)) || (S && S.map && S.map[0])
  return ((loc && loc.people) || []).map(p => p && p.name).filter(Boolean)
}
