// 存档 / 账号级 meta / API Key
// 存档按世界观分槽（SLOT_PREFIX + worldview），切换世界=换槽读档
import {
  SAVE_KEY, ACTIVE_WORLD_KEY, SLOT_PREFIX,
  KEYS_KEY, META_KEY, SAVE_VERSION, LEGACY_TYPE_MAP
} from './constants.js'
import { getPack } from '../worldviews/index.js'
import { normalizeApiKey } from './llm.js'

function secretsHost() {
  return (globalThis.awHost && globalThis.awHost.secrets) || null
}

function slotKey(worldview) {
  return SLOT_PREFIX + String(worldview || 'xiuxian')
}

export function getActiveWorld() {
  try { return localStorage.getItem(ACTIVE_WORLD_KEY) || null } catch (e) { return null }
}

export function setActiveWorld(worldview) {
  try { localStorage.setItem(ACTIVE_WORLD_KEY, String(worldview || '')) } catch (e) { /* ignore */ }
}

export function saveGame(S) {
  if (!S) return false
  const world = S.worldview || 'xiuxian'
  // 明文 Key 不入档
  const dump = Object.assign({}, S)
  delete dump.playerKeys
  delete dump.selectedKey
  try {
    localStorage.setItem(slotKey(world), JSON.stringify(Object.assign({}, dump, { _savedAt: Date.now() })))
    setActiveWorld(world)
  } catch (e) {
    console.warn('存档失败', e)
    return false
  }
  try {
    // 宿主加密仓可用时，明文 Key 不镜像进 localStorage
    const host = secretsHost()
    if (!(host && host.save)) {
      localStorage.setItem(KEYS_KEY, JSON.stringify({
        keys: S.playerKeys || [],
        selected: S.selectedKey
      }))
    }
    persistPlayerKeysAsync(S)
  } catch (e) { /* ignore */ }
  saveMeta({
    playerKeyReward: !!S.playerKeyReward
  })
  return true
}

function persistPlayerKeysAsync(S) {
  const payload = { keys: S.playerKeys || [], selected: S.selectedKey }
  const host = secretsHost()
  if (host && host.save) {
    Promise.resolve(host.save(payload)).catch(e => console.warn('密钥保存失败', e))
    return
  }
  try { localStorage.setItem(KEYS_KEY, JSON.stringify(payload)) } catch (e) { /* ignore */ }
}

export function loadPlayerKeys() {
  try {
    const d = JSON.parse(localStorage.getItem(KEYS_KEY))
    if (d && Array.isArray(d.keys)) return d
    return null
  } catch (e) { return null }
}

/** 从宿主加密仓载入（异步）；并写回 localStorage 供同步读取 */
export async function hydratePlayerKeysFromHost() {
  const host = secretsHost()
  if (!host || !host.load) return loadPlayerKeys()
  try {
    const d = await host.load()
    if (d && Array.isArray(d.keys)) {
      try { localStorage.setItem(KEYS_KEY, JSON.stringify(d)) } catch (e) { /* ignore */ }
      return d
    }
  } catch (e) { /* ignore */ }
  return loadPlayerKeys()
}

export async function clearPlayerKeysStore() {
  const host = secretsHost()
  if (host && host.clear) {
    try { await host.clear() } catch (e) { /* ignore */ }
  }
  try { localStorage.removeItem(KEYS_KEY) } catch (e) { /* ignore */ }
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

export function loadSave(worldview) {
  try {
    const world = worldview || getActiveWorld() || peekLegacyWorld()
    if (!world && !worldview) {
      // 兼容：无 active 时读旧单槽/任一槽
      const legacy = loadSlotRaw(SAVE_KEY)
      if (legacy) return adoptLegacy(legacy)
      const any = listSlots()[0]
      return any ? loadSave(any.id) : null
    }
    const s = loadSlotRaw(slotKey(world))
    if (s) {
      setActiveWorld(world)
      return migrateSave(s)
    }
    // 目标槽没有 → 试旧单槽（仅当 worldview 匹配）
    const legacy = loadSlotRaw(SAVE_KEY)
    if (legacy && (!legacy.worldview || legacy.worldview === world)) {
      return adoptLegacy(legacy)
    }
    return null
  } catch (e) { return null }
}

function loadSlotRaw(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || typeof s !== 'object' || !s.map) return null
    return s
  } catch (e) { return null }
}

function peekLegacyWorld() {
  const legacy = loadSlotRaw(SAVE_KEY)
  return (legacy && legacy.worldview) || null
}

function adoptLegacy(legacy) {
  const world = legacy.worldview || 'xiuxian'
  try {
    localStorage.setItem(slotKey(world), JSON.stringify(legacy))
    localStorage.removeItem(SAVE_KEY)
    setActiveWorld(world)
  } catch (e) { /* ignore */ }
  return migrateSave(legacy)
}

/** 各世界观是否有档，供选择界面展示 */
export function listSlots() {
  const out = []
  const seen = new Set()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(SLOT_PREFIX)) continue
      const id = k.slice(SLOT_PREFIX.length)
      const raw = loadSlotRaw(k)
      if (!raw) continue
      seen.add(id)
      out.push(slotSummary(id, raw))
    }
  } catch (e) { /* ignore */ }
  const legacy = loadSlotRaw(SAVE_KEY)
  if (legacy) {
    const id = legacy.worldview || 'xiuxian'
    if (!seen.has(id)) out.push(slotSummary(id, legacy))
  }
  out.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return out
}

function slotSummary(id, s) {
  return {
    id,
    name: s.name || '',
    worldview: s.worldview || id,
    tierIndex: s.tierIndex || 0,
    sub: s.sub || 0,
    ageDays: s.ageDays || 0,
    levelText: null, // UI 用 pack 词表渲染
    updatedAt: s._savedAt || 0
  }
}

export function deleteSave(worldview) {
  const world = worldview || getActiveWorld()
  if (!world) return
  try { localStorage.removeItem(slotKey(world)) } catch (e) { /* ignore */ }
  try {
    const legacy = loadSlotRaw(SAVE_KEY)
    if (legacy && (legacy.worldview || 'xiuxian') === world) {
      localStorage.removeItem(SAVE_KEY)
    }
  } catch (e) { /* ignore */ }
  if (getActiveWorld() === world) {
    try { localStorage.removeItem(ACTIVE_WORLD_KEY) } catch (e) { /* ignore */ }
  }
}

/** 导出全部分槽存档（不含 API Key） */
export function exportSaveBundle() {
  const slots = {}
  for (const s of listSlots()) {
    const raw = loadSlotRaw(slotKey(s.id)) || loadSlotRaw(SAVE_KEY)
    if (!raw) continue
    const dump = Object.assign({}, raw)
    delete dump.playerKeys
    delete dump.selectedKey
    slots[s.id] = dump
  }
  return {
    format: 'agentworlds_saves',
    version: 1,
    exportedAt: new Date().toISOString(),
    activeWorld: getActiveWorld(),
    slots
  }
}

/** 导入分槽存档；默认覆盖同名槽 */
export function importSaveBundle(bundle, { overwrite = true } = {}) {
  if (!bundle || typeof bundle !== 'object') return { ok: false, error: '无效备份文件' }
  const slots = bundle.slots && typeof bundle.slots === 'object' ? bundle.slots : null
  if (!slots) return { ok: false, error: '缺少 slots' }
  let n = 0
  for (const [id, raw] of Object.entries(slots)) {
    if (!raw || typeof raw !== 'object' || !raw.map) continue
    const key = slotKey(raw.worldview || id)
    if (!overwrite && loadSlotRaw(key)) continue
    try {
      localStorage.setItem(key, JSON.stringify(raw))
      n++
    } catch (e) { /* skip */ }
  }
  if (bundle.activeWorld) setActiveWorld(bundle.activeWorld)
  return { ok: n > 0, count: n, error: n ? null : '没有可导入的存档' }
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
  if (!s.techniques) s.techniques = []
  if (!Array.isArray(s.techniques)) s.techniques = []
  if (!Array.isArray(s.friends)) s.friends = []
  if (!Array.isArray(s.inventory)) s.inventory = []
  if (!Array.isArray(s.bigEvents)) s.bigEvents = []
  if (!Array.isArray(s.smallEvents)) s.smallEvents = []
  if (!Array.isArray(s.quests)) s.quests = []
  if (!s.skills || typeof s.skills !== 'object') s.skills = {}
  if (s.factionRep == null) s.factionRep = 0
  if (s.giftChoice === undefined) s.giftChoice = null
  // 旧 type → 中性 type
  const LEGACY = LEGACY_TYPE_MAP
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
  // 旧档内嵌 Key → 迁入独立密钥仓，并从存档剥离
  if (Array.isArray(s.playerKeys) && s.playerKeys.length) {
    const kd = loadPlayerKeys()
    const merged = normalizeKeysList(s.playerKeys)
    if (merged.length) {
      const payload = {
        keys: merged,
        selected: (typeof s.selectedKey === 'number' ? s.selectedKey : 0)
      }
      try { localStorage.setItem(KEYS_KEY, JSON.stringify(payload)) } catch (e) { /* ignore */ }
      persistPlayerKeysAsync({ playerKeys: payload.keys, selectedKey: payload.selected })
    } else if (kd) {
      // keep existing
    }
  }
  delete s.playerKeys
  delete s.selectedKey
  // 恢复 keys 到运行时（从 KEYS_KEY）
  const restored = loadPlayerKeys()
  if (restored && Array.isArray(restored.keys)) {
    s.playerKeys = restored.keys
    s.selectedKey = typeof restored.selected === 'number' ? restored.selected : 0
    normalizePlayerKeys(s)
  } else {
    s.playerKeys = []
    s.selectedKey = 0
  }
  // 修 _locSeq 与既有 ai_loc_N 冲突
  let maxSeq = 0
  if (Array.isArray(s.map)) {
    for (const l of s.map) {
      const m = /^ai_loc_(\d+)$/.exec(String(l && l.id || ''))
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]) || 0)
    }
  }
  s._locSeq = Math.max(Number(s._locSeq) || 0, maxSeq)
  s.version = SAVE_VERSION
  s._savedAt = Number(s._savedAt) || Date.now()
  return s
}

function normalizeKeysList(keys) {
  return (Array.isArray(keys) ? keys : [])
    .map(k => normalizeApiKey(k) || null)
    .filter(Boolean)
}

export function hasSave(worldview) {
  if (worldview) {
    if (loadSlotRaw(slotKey(worldview))) return true
    const legacy = loadSlotRaw(SAVE_KEY)
    return !!(legacy && (legacy.worldview || 'xiuxian') === worldview)
  }
  return !!loadSlotRaw(SAVE_KEY) || listSlots().length > 0
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
    quests: [],
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
    bgmTrack: 'handpan',
    aiStyle: 'normal',
    playerGender: '',
    dialogLimit: true,
    giftChoice: null,
    _locSeq: 0
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
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (k.startsWith(SLOT_PREFIX) || k === SAVE_KEY || k === ACTIVE_WORLD_KEY)) {
        localStorage.removeItem(k)
      }
    }
    localStorage.removeItem(KEYS_KEY)
    localStorage.removeItem(META_KEY)
  } catch (e) { /* ignore */ }
  clearPlayerKeysStore()
}

/** 只删指定世界观槽；API Key / meta 保留 */
export function resetSaveKeepMeta(worldview) {
  deleteSave(worldview || getActiveWorld() || 'xiuxian')
}
