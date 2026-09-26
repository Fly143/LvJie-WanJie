// 主入口：引导、欢迎页选世界观、全局状态
import { listPacks, getPack, defaultPackId, isBuiltinPack } from './worldviews/index.js'
import { loadSave, newGame, saveGame, resetSaveKeepMeta, hydratePlayerKeysFromHost, normalizePlayerKeys, listSlots, hasSave, getActiveWorld, setActiveWorld, deleteSave, applyGlobalPrefs, loadPackOrder, savePackOrder, movePackId } from './engine/state.js'
import { esc, ageLabelShort, fmtNum } from './engine/util.js'
import {
  tierLabel, tierColor, isLifeExpired, playerCultReq, tryBreakthrough
} from './engine/progression.js'
import { totalPowerF } from './engine/power.js'
import { curLoc } from './engine/map.js'
import { startEvent, runEventTurn, endEvent } from './engine/event.js'
import { applyThemeTokens } from './engine/theme.js'
import { renderScene, renderMap, renderProfile, renderFriends, renderBag, renderSettings, renderQuests } from './ui/render.js'
import { openModal, closeModal, toast, centerToast } from './ui/modals.js'
import { openKeyModal, openHelp } from './ui/settings-panels.js'
import { openWorldAuthor } from './ui/world-author.js'
import { initBgm, playBgm, hydrateCustomBgm, showGamePlay } from './ui/bgm.js'
import { BGM_MAP_TRACK, BGM_DEFAULT_TRACK, BGM_DEFAULT_TABS } from './engine/constants.js'
import { packUi, packFeatures } from './engine/pack-ui.js'

export const app = {
  S: null,
  TAB: 'scene',
  EV: null,
  selectedPack: defaultPackId(),
  cheatUnlocked: false,
  packMoreOpen: false
}

const RENDERS = {
  scene: renderScene,
  map: renderMap,
  profile: renderProfile,
  friends: renderFriends,
  quests: renderQuests,
  bag: renderBag,
  settings: renderSettings
}

export function getPackNow() {
  return getPack((app.S && app.S.worldview) || app.selectedPack)
}

export function save() {
  if (app.S) saveGame(app.S)
}

export function setTab(t) {
  app.TAB = t
  document.body.classList.toggle('menu', false)
  document.querySelectorAll('.navbtn').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === t)
  })
  // 主玩法页：尊重显式「无音乐」('')，否则用存档/默认曲
  try {
    if (app.S && BGM_DEFAULT_TABS.includes(t)) {
      const raw = Object.prototype.hasOwnProperty.call(app.S, 'bgmTrack') ? app.S.bgmTrack : null
      const want = raw == null ? ((t === 'map' && BGM_MAP_TRACK) || BGM_DEFAULT_TRACK) : raw
      playBgm(want)
    }
  } catch (e) { /* music optional */ }
  renderMain()
}

export function backToMenu() {
  document.body.classList.add('menu')
}

export function renderMain() {
  const fn = RENDERS[app.TAB] || renderScene
  fn(app, { save, setTab, refreshAll, openModal, closeModal, toast, centerToast, startFlow })
}

export function refreshAll() {
  renderHeader()
  renderPlayerCard()
  renderMain()
}

function applyTheme(pack) {
  if (!pack) return
  applyThemeTokens(pack)
  applyNavLabels(pack)
  const logo = document.getElementById('hdr-logo')
  if (logo) logo.textContent = `${pack.icon} ${pack.name} · Agent万象`
  document.title = (pack.gameTitle || pack.name) + ' · Agent万象'
}

function renderHeader() {
  const pack = getPackNow()
  const S = app.S
  if (!S || !pack) return
  const money = pack.lexicon.money.main
  document.getElementById('hdr-money').textContent = fmtNum(S.money.main) + ' ' + money
  const loc = curLoc(S)
  document.getElementById('hdr-who').textContent =
    `${S.name} · ${tierLabel(S)} · ${loc ? loc.name : ''}`
}

function renderPlayerCard() {
  const pack = getPackNow()
  const S = app.S
  const el = document.getElementById('pcard')
  if (!S || !pack) { el.innerHTML = ''; return }
  const req = playerCultReq(S)
  const pct = req > 0 ? Math.min(100, (S.progress / req) * 100) : 0
  const full = pct >= 100
  const feat = packFeatures(pack)
  const ui = packUi(pack)
  const expired = feat.lifespan !== false && isLifeExpired(S)
  const money = pack.lexicon.money
  el.innerHTML = `
    <div class="pname">${esc(S.name)}</div>
    <div style="margin-top:4px">
      <span class="realmchip" style="color:${tierColor(S, S.tierIndex)};border-color:${tierColor(S, S.tierIndex)}">${esc(tierLabel(S))}</span>
      ${expired ? `<span class="lifestatus">${esc(ui.lifeWarn || '⚠ 寿限将尽')}</span>` : ''}
    </div>
    <div class="bar${full ? ' full' : ''}"><div style="width:${pct}%"></div></div>
    <div class="pgrid" style="margin-top:8px">
      <div class="row"><span class="k">年龄</span><span class="v">${esc(ageLabelShort(S.ageDays))}</span></div>
      <div class="row"><span class="k">${esc(ui.powerLabel)}</span><span class="v">${fmtNum(totalPowerF(S))}</span></div>
      <div class="row"><span class="k">${esc(money.main)}</span><span class="v">${fmtNum(S.money.main)}</span></div>
      <div class="row"><span class="k">${esc(pack.lexicon.progress)}</span><span class="v">${fmtNum(S.progress)} / ${fmtNum(req)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-gold btn-sm" id="btn-break" type="button" ${pct < 100 ? 'disabled' : ''}>${esc(ui.advanceBtn)}</button>
    </div>
  `
  const br = document.getElementById('btn-break')
  if (br) br.onclick = doBreakthrough
}

function doBreakthrough() {
  const pack = getPackNow()
  const ui = packUi(pack)
  const r = tryBreakthrough(app.S)
  if (!r.ok) { toast(esc(r.msg)); return }
  app.S.bigEvents.push({ age: ageLabelShort(app.S.ageDays), text: r.msg })
  save()
  centerToast(esc(ui.advanceSuccessTitle || '成功') + '<br><span style="font-size:22px">' + esc(r.msg) + '</span>')
  refreshAll()
}

export function startFlow(kind, content, target) {
  if (!app.S) return
  if (app.EV) {
    endEvent(app.EV)
    app.EV = null
  }
  app.EV = startEvent(kind, content, target)
  app.TAB = 'scene'
  document.body.classList.remove('menu')
  renderMain()
  const ev = app.EV
  runEventTurn(app.S, ev, content, {
    limitOn: app.S.dialogLimit,
    cheatUnlocked: app.cheatUnlocked,
    onState: () => {
      if (app.EV === ev) renderMain()
    },
    onDone: (e, brief) => {
      save()
      if (brief && brief.major && brief.major.length) {
        toast(brief.major.map(m => '⭐ ' + esc(m)).join('<br>'), 4500)
      } else if (brief && brief.minor && brief.minor.length) {
        toast(brief.minor.slice(0, 4).map(m => esc(m)).join(' · '))
      }
      renderHeader()
      renderPlayerCard()
    }
  })
}

/* ---------- 欢迎页 ---------- */
function setShell(mode) {
  const w = document.getElementById('welcome')
  const hdr = document.getElementById('hdr')
  const appEl = document.getElementById('app')
  if (mode === 'game') {
    w.hidden = true
    w.style.display = 'none'
    hdr.hidden = false
    hdr.style.display = ''
    appEl.hidden = false
    appEl.style.display = ''
    document.body.classList.add('menu')
  } else {
    w.hidden = false
    w.style.display = ''
    hdr.hidden = true
    hdr.style.display = 'none'
    appEl.hidden = true
    appEl.style.display = 'none'
  }
}

function slotMeta(packId) {
  const hit = listSlots().find(s => s.id === packId)
  if (!hit) return null
  const pack = getPack(packId)
  try {
    // 用 progression 的展示需要 S；这里做轻量摘要
    const names = (pack && pack.subNames) || ['初', '中', '高']
    const tiers = (pack && pack.tiers) || []
    const t = tiers[hit.tierIndex] || { name: '' }
    const sn = names[Math.min(hit.sub, names.length - 1)] || ''
    return { ...hit, levelText: (t.name || '') + sn }
  } catch (e) {
    return hit
  }
}

function renderWelcome() {
  const root = document.getElementById('welcome')
  root.hidden = false
  root.style.display = ''
  const savedOrder = loadPackOrder()
  const all = listPacks()
  const packs = [...all].sort((a, b) => {
    const ca = isBuiltinPack(a.id) ? 1 : 0
    const cb = isBuiltinPack(b.id) ? 1 : 0
    if (ca !== cb) return ca - cb
    const ia = savedOrder.indexOf(a.id)
    const ib = savedOrder.indexOf(b.id)
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1
      if (ib < 0) return -1
      return ia - ib
    }
    return 0
  })
  const sel = app.selectedPack
  const q = (app.packFilter || '').trim().toLowerCase()
  const filtered = q
    ? packs.filter(p => ((p.name || '') + (p.tagline || '') + p.id).toLowerCase().includes(q))
    : packs

  const cardHtml = (p) => {
    const slot = slotMeta(p.id)
    return `
          <div class="pack-card ${p.id === sel ? 'on' : ''}" data-id="${p.id}" style="--pk:${p.theme.accent};background:${p.theme.cardBg || p.theme.panel}">
            <div class="picon">${esc(p.icon)}</div>
            <div class="pname">${esc(p.name)}</div>
            <div class="ptag">${esc(p.tagline)}</div>
            <div class="pchip">${esc(p.lexicon.level)} · ${esc(p.lexicon.progress)}</div>
            <div class="pmeta">${esc((p.worlds || []).join(' / '))} · ${(p.tiers || []).length} 阶</div>
            <div class="psave">${slot
              ? `💾 ${esc(slot.name)} · ${esc(slot.levelText || '')}`
              : '新开旅程'}</div>
            <div class="btn-row" style="margin-top:6px">
              <button class="btn btn-sm" data-pack-up="${esc(p.id)}" type="button" title="上移">▲</button>
              <button class="btn btn-sm" data-pack-down="${esc(p.id)}" type="button" title="下移">▼</button>
            </div>
          </div>
        `
  }

  root.innerHTML = `
    <div class="wbox">
      <div class="wtitle">${esc(getPack(sel).gameTitle || getPack(sel).name || 'Agent万象')}</div>
      <div class="wsub">${esc(getPack(sel).welcomeSub || getPack(sel).tagline || 'AI 驱动的多世界观开放世界')}</div>
      <div class="wactions" style="margin-top:12px;margin-bottom:8px;flex-direction:row;justify-content:center;gap:8px">
        <input id="w-filter" type="text" placeholder="搜索世界…" value="${esc(app.packFilter || '')}" style="max-width:240px">
      </div>
      <div id="pack-scroll">
        <div id="pack-grid">
          ${filtered.map(cardHtml).join('') || '<div class="empty">无匹配世界</div>'}
        </div>
      </div>
      <div class="wactions">
        <div class="name-row">
          <input id="w-name" type="text" maxlength="12" placeholder="新档角色名（继续旧档可留空）" value="">
        </div>
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-gold" id="w-start" type="button">进入世界</button>
          <button class="btn" id="w-new" type="button" hidden>新开一局</button>
          <button class="btn" id="w-author" type="button">🛠 自定义世界</button>
        </div>
        <div class="hint">各世界观存档互不影响。卡片上可排序；顶栏「🌐 世界观」随时切换。</div>
      </div>
    </div>
  `

  const startBtn = document.getElementById('w-start')
  const newBtn = document.getElementById('w-new')
  const nameEl = document.getElementById('w-name')

  function syncActions() {
    const p = getPack(app.selectedPack)
    const slot = slotMeta(app.selectedPack)
    if (slot) {
      startBtn.textContent = `继续 · ${slot.name}（${slot.levelText || ''}）`
      newBtn.hidden = false
      newBtn.textContent = '新开一局'
      nameEl.placeholder = '新档角色名（继续旧档可留空）'
    } else {
      startBtn.textContent = (p && p.lexicon && p.lexicon.startBtn) || '进入所选世界'
      newBtn.hidden = true
      nameEl.placeholder = '角色名（可留空）'
    }
  }

  root.querySelectorAll('.pack-card').forEach(card => {
    card.onclick = () => {
      app.selectedPack = card.dataset.id
      root.querySelectorAll('.pack-card').forEach(c => c.classList.toggle('on', c.dataset.id === app.selectedPack))
      applyTheme(getPack(app.selectedPack))
      syncActions()
      const pp = getPack(app.selectedPack)
      const tt = root.querySelector('.wtitle')
      const ts = root.querySelector('.wsub')
      if (tt) tt.textContent = pp.gameTitle || pp.name || 'Agent万象'
      if (ts) ts.textContent = pp.welcomeSub || pp.tagline || ''
    }
  })

  root.querySelectorAll('[data-pack-up]').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation()
      const ids = [...root.querySelectorAll('.pack-card')].map(c => c.dataset.id)
      const id = b.dataset.packUp
      const i = ids.indexOf(id)
      if (i > 0) {
        const tmp = ids[i]; ids[i] = ids[i - 1]; ids[i - 1] = tmp
        savePackOrder(ids)
        const sc = document.getElementById('pack-scroll')
        const top = sc ? sc.scrollTop : 0
        renderWelcome()
        const sc2 = document.getElementById('pack-scroll')
        if (sc2) sc2.scrollTop = top
      }
    }
  })
  root.querySelectorAll('[data-pack-down]').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation()
      const ids = [...root.querySelectorAll('.pack-card')].map(c => c.dataset.id)
      const id = b.dataset.packDown
      const i = ids.indexOf(id)
      if (i >= 0 && i < ids.length - 1) {
        const tmp = ids[i]; ids[i] = ids[i + 1]; ids[i + 1] = tmp
        savePackOrder(ids)
        const sc = document.getElementById('pack-scroll')
        const top = sc ? sc.scrollTop : 0
        renderWelcome()
        const sc2 = document.getElementById('pack-scroll')
        if (sc2) sc2.scrollTop = top
      }
    }
  })

  const filterEl = document.getElementById('w-filter')
  if (filterEl) {
    filterEl.oninput = () => {
      app.packFilter = filterEl.value || ''
      renderWelcome()
      const f2 = document.getElementById('w-filter')
      if (f2) {
        f2.focus()
        const n = f2.value.length
        try { f2.setSelectionRange(n, n) } catch (e) { /* ignore */ }
      }
    }
  }

  startBtn.onclick = () => {
    const id = app.selectedPack
    if (hasSave(id)) {
      const S = loadSave(id)
      if (S) {
        setActiveWorld(id)
        showGame(S)
        toast(`已载入《${esc(getPack(id).name)}》存档`)
        return
      }
    }
    const name = (nameEl.value || '').trim()
    startNewGame(name, id)
  }

  newBtn.onclick = () => {
    const id = app.selectedPack
    const slot = slotMeta(id)
    openModal(`
      <h2>新开一局？</h2>
      <p>将覆盖《${esc(getPack(id).name)}》的现有存档${slot ? `（${esc(slot.name)} · ${esc(slot.levelText || '')}）` : ''}。其它世界存档与 API Key 不受影响。</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" data-close type="button">取消</button>
        <button class="btn btn-danger" id="w-do-new" type="button">覆盖并新开</button>
      </div>
    `)
    document.getElementById('w-do-new').onclick = () => {
      closeModal()
      deleteSave(id)
      const name = (nameEl.value || '').trim()
      startNewGame(name, id)
    }
  }

  document.getElementById('w-author').onclick = () => {
    openWorldAuthor(app, {
      onSaved: () => {
        setShell('welcome')
        renderWelcome()
      }
    })
  }

  syncActions()
  applyTheme(getPack(sel))
}

function startNewGame(name, packId) {
  try {
    app.S = newGame(name, packId)
    save()
    try { playBgm(app.S.bgmTrack) } catch (e) { /* music optional */ }
    setShell('game')
    applyTheme(getPack(packId))
    refreshAll()
    firstGuide(app.S)
  } catch (e) {
    console.error(e)
    toast('进入世界失败：' + esc(e && e.message || e))
  }
}

function showGame(S) {
  try { applyGlobalPrefs(S) } catch (e) { /* ignore */ }
  app.S = S
  app.selectedPack = S.worldview || defaultPackId()
  setShell('game')
  applyTheme(getPack(S.worldview))
  try {
    const rawBgm = Object.prototype.hasOwnProperty.call(S, 'bgmTrack') ? S.bgmTrack : null
    const track = (rawBgm === 'handpan' || rawBgm === 'universe') ? (BGM_DEFAULT_TRACK || 'm027') : (rawBgm == null ? (BGM_DEFAULT_TRACK || 'm027') : rawBgm)
    showGamePlay(S)
  } catch (e) { /* music optional */ }
  refreshAll()
}

function firstGuide(S) {
  if (S.guideDone) return
  toast(`欢迎来到《${esc(getPack(S.worldview).name)}》世界。左侧选择功能，场景内点行动与 AI 互动。`, 6000)
  S.guideDone = true
  save()
}

/* ---------- 顶栏 ---------- */
function bindHeader() {
  document.getElementById('btn-key').onclick = () => openKeyModal(app, { save, refreshAll })
  document.getElementById('btn-help').onclick = () => openHelp(app)
  document.getElementById('btn-worlds').onclick = () => {
    if (app.S) save()
    if (app.EV) { endEvent(app.EV); app.EV = null }
    app.S = null
    app.selectedPack = getActiveWorld() || (app.selectedPack) || defaultPackId()
    setShell('welcome')
    renderWelcome()
  }
  document.querySelectorAll('.navbtn').forEach(b => {
    b.onclick = () => setTab(b.dataset.tab)
  })
  document.getElementById('backbtn').onclick = backToMenu
}

function applyNavLabels(pack) {
  const nav = (pack && pack.lexicon && pack.lexicon.nav) || {}
  const map = {
    scene: nav.scene,
    map: nav.map,
    profile: nav.profile,
    friends: nav.friends,
    quests: (nav && nav.quests) || '任务',
    bag: nav.bag,
    settings: nav.settings
  }
  Object.keys(map).forEach(id => {
    const el = document.getElementById('nav-' + id)
    if (!el) return
    const icon = { scene: '📍', map: '🗺️', profile: '👤', friends: '🤝', quests: '📜', bag: '🎒', settings: '⚙️' }[id]
    if (map[id]) el.textContent = `${icon} ${map[id]}`
  })
}

function boot() {
  bindHeader()
  initBgm()
  hydrateCustomBgm().catch(() => {})
  const existing = loadSave()
  if (existing) {
    showGame(existing)
    firstGuide(existing)
  } else {
    app.selectedPack = getActiveWorld() || defaultPackId()
    setShell('welcome')
    renderWelcome()
  }
  // 从宿主加密仓补齐 API Key（异步，不阻塞 UI）
  hydratePlayerKeysFromHost().then(kd => {
    if (!app.S) return
    if (kd && Array.isArray(kd.keys) && kd.keys.length) {
      app.S.playerKeys = kd.keys
      app.S.selectedKey = typeof kd.selected === 'number' ? kd.selected : 0
      normalizePlayerKeys(app.S)
    }
  }).catch(() => { /* optional */ })
}

window.addEventListener('beforeunload', () => {
  try { if (app.S) save() } catch (e) { /* ignore */ }
})

boot()
window.__AW_APP__ = app
