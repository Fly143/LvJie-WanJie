// 存档 / 账号级 meta / API Key 独立存储
import { SAVE_KEY, KEYS_KEY, META_KEY, SAVE_VERSION } from './constants.js'
import { getPack } from '../worldviews/index.js'

export function saveGame(S) {
  if (!S) return
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)) } catch (e) { console.warn('存档失败', e) }
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify({
      keys: S.playerKeys || [],
      selected: S.selectedKey
    }))
  } catch (e) { /* ignore */ }
  saveMeta({
    playerKeyReward: !!S.playerKeyReward
  })
}

export function loadPlayerKeys() {
  try {
    const d = JSON.parse(localStorage.getItem(KEYS_KEY))
    if (d && Array.isArray(d.keys)) return d
    return null
  } catch (e) { return null }
}

export function loadMeta() {
  try {
    const d = JSON.parse(localStorage.getItem(META_KEY))
    return (d && typeof d === 'object') ? d : null
  } catch (e) { return null }
}

export function saveMeta(o) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(Object.assign(loadMeta() || {}, o)))
  } catch (e) { /* ignore */ }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || typeof s !== 'object' || !s.map) return null
    return migrateSave(s)
  } catch (e) { return null }
}

/** 载入时补齐/净化字段，保证多世界观旧档可用 */
function migrateSave(s) {
  if (!s.worldview) s.worldview = 'xiuxian'
  if (!s.money || typeof s.money !== 'object') {
    s.money = {
      main: Number(s.lingShi) || Number(s.money) || 0,
      mid: Number(s.shangPin) || 0,
      high: Number(s.xianYuan) || 0
    }
  } else {
    s.money.main = Number(s.money.main) || 0
    s.money.mid = Number(s.money.mid) || 0
    s.money.high = Number(s.money.high) || 0
  }
  if (s.tierIndex == null) s.tierIndex = Number(s.realmIndex) || 0
  if (s.sub == null) s.sub = 0
  if (s.progress == null) s.progress = Number(s.cultivation) || 0
  if (!Array.isArray(s.techniques)) s.techniques = []
  if (!Array.isArray(s.friends)) s.friends = []
  if (!Array.isArray(s.inventory)) s.inventory = []
  if (!s.skills || typeof s.skills !== 'object') s.skills = {}
  if (s.factionRep == null) s.factionRep = 0
  if (s.giftChoice === undefined) s.giftChoice = null
  // 旧 type → 中性 type
  const LEGACY = { pill: 'consumable', artifact: 'equip', manual: 'technique', material: 'material', other: 'special' }
  s.inventory.forEach(it => {
    if (it && LEGACY[it.type]) it.type = LEGACY[it.type]
    if (it && it.count == null) it.count = 1
  })
  if (Array.isArray(s.map)) {
    s.map.forEach(l => {
      if (Array.isArray(l.shop)) l.shop.forEach(it => {
        if (it && LEGACY[it.type]) it.type = LEGACY[it.type]
      })
    })
  }
  if (Array.isArray(s.playerKeys)) {
    // 载入时也跑一遍 key 归一
  }
  if (s.selectedKey == null) s.selectedKey = 0
  s.version = SAVE_VERSION
  return s
}

export function hasSave() {
  return !!loadSave()
}

/**
 * 新开局。packId 必须是已注册世界观。
 * 通用字段 + 包提供的初始内容。
 */
export function newGame(name, packId) {
  const pack = getPack(packId)
  if (!pack) throw new Error('未知世界观: ' + packId)

  const kd = loadPlayerKeys()
  const meta = loadMeta() || {}
  const init = pack.createInitState ? pack.createInitState() : {}

  const S = Object.assign({
    name: name || pack.defaultName || (pack.lexicon && pack.lexicon.defaultName) || '无名旅者',
    guideDone: false,
    version: SAVE_VERSION,
    worldview: pack.id,
    ageDays: init.ageDays != null ? init.ageDays : 3600,
    // 中性三级货币：main / mid / high（包决定叫什么）
    money: Object.assign({ main: 0, mid: 0, high: 0 }, init.money || {}),
    // 等级进度（包决定叫什么）
    tierIndex: init.tierIndex != null ? init.tierIndex : 0,
    sub: init.sub != null ? init.sub : 0,
    progress: init.progress != null ? init.progress : 0,
    inventory: [],
    bigEvents: [],
    smallEvents: [],
    map: pack.createMap(),
    currentLoc: pack.startLoc,
    skills: Object.fromEntries((pack.skills || []).map(sk => [sk.id, 0])),
    techniques: [],
    friends: [],
    factionRep: 0,
    playerKeys: (kd && Array.isArray(kd.keys)) ? kd.keys : [],
    selectedKey: (kd && typeof kd.selected === 'number') ? kd.selected : 0,
    playerKeyReward: !!meta.playerKeyReward,
    lastEventText: '',
    talent: null,
    medY: 0, medM: 0, medD: 10,
    talent: null,
    bgmTrack: 'handpan',
    aiStyle: 'normal',
    playerGender: '',
    dialogLimit: true,
    giftChoice: null
  }, init.state || {})

  if (Array.isArray(init.startInventory)) {
    for (const it of init.startInventory) {
      S.inventory.push(Object.assign({ count: 1 }, it))
    }
  }
  if (Array.isArray(init.startEvents)) {
    S.bigEvents = init.startEvents.slice()
  } else {
    S.bigEvents = [{
      age: '10岁0月0天',
      text: init.startText || (pack.lexicon.startText || '故事开始了。')
    }]
  }

  normalizePlayerKeys(S)
  return S
}

export function normalizePlayerKeys(S) {
  if (!S || !Array.isArray(S.playerKeys)) return
  S.playerKeys = S.playerKeys
    .map(k => {
      if (!k || typeof k !== 'object') return null
      const apiStyle = k.apiStyle === 'response' ? 'response' : 'chat'
      const baseUrl = k.baseUrl || k.url || ''
      const key = k.key || k.value || ''
      const model = k.model || ''
      const name = k.name || model || '自定义'
      if (!baseUrl && k.provider && k.value) {
        const legacy = {
          zhipu: 'https://open.bigmodel.cn/api/paas/v4',
          deepseek: 'https://api.deepseek.com',
          qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        }
        const b = legacy[k.provider] || ''
        return b ? { name, baseUrl: b, key: k.value, model, apiStyle: 'chat' } : null
      }
      return { name, baseUrl, key, model, apiStyle }
    })
    .filter(Boolean)
  if (typeof S.selectedKey !== 'number' || !S.playerKeys[S.selectedKey]) {
    S.selectedKey = 0
  }
}

export function wipeAll() {
  try {
    localStorage.removeItem(SAVE_KEY)
    localStorage.removeItem(KEYS_KEY)
    localStorage.removeItem(META_KEY)
  } catch (e) { /* ignore */ }
}

export function resetSaveKeepMeta() {
  try { localStorage.removeItem(SAVE_KEY) } catch (e) { /* ignore */ }
}
