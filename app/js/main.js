// 主入口：引导、欢迎页选世界观、全局状态
import { listPacks, getPack, defaultPackId } from './worldviews/index.js'
import { loadSave, newGame, saveGame, resetSaveKeepMeta } from './engine/state.js'
import { esc, ageLabelShort, fmtNum } from './engine/util.js'
import {
  tierLabel, tierColor, isLifeExpired, playerCultReq, tryBreakthrough
} from './engine/progression.js'
import { totalPowerF } from './engine/power.js'
import { curLoc } from './engine/map.js'
import { startEvent, runEventTurn, endEvent } from './engine/event.js'
import { applyThemeTokens } from './engine/theme.js'
import { renderScene, renderMap, renderProfile, renderFriends, renderBag, renderSettings } from './ui/render.js'
import { openModal, closeModal, toast, centerToast } from './ui/modals.js'
import { openKeyModal, openHelp } from './ui/settings-panels.js'
import { initBgm, playBgm } from './ui/bgm.js'
import { packUi, packFeatures } from './engine/pack-ui.js'

export const app = {
  S: null,
  TAB: 'scene',
  EV: null,
  selectedPack: defaultPackId(),
  cheatUnlocked: false
}

const RENDERS = {
  scene: renderScene,
  map: renderMap,
  profile: renderProfile,
  friends: renderFriends,
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
    <div class="pgrid" style="margin-top:6px">
      <div class="row"><span class="k">年龄</span><span class="v">${ageLabelShort(S.ageDays)}</span></div>
      <div class="row"><span class="k">${esc(ui.powerLabel)}</span><span class="v">${fmtNum(totalPowerF(S))}</span></div>
      <div class="row"><span class="k">${esc(money.main)}</span><span class="v">${fmtNum(S.money.main)}</span></div>
      <div class="row"><span class="k">${esc(pack.lexicon.progress)}</span><span class="v">${fmtNum(S.progress)}/${fmtNum(req)}</span></div>
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
  if (!r.ok) { toast(r.msg); return }
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

function renderWelcome() {
  const root = document.getElementById('welcome')
  root.hidden = false
  root.style.display = ''
  const packs = listPacks()
  const sel = app.selectedPack
  root.innerHTML = `
    <div class="wbox">
      <div class="wtitle">Agent万象</div>
      <div class="wsub">AI 驱动的多世界观开放世界 — 选择你要进入的世界</div>
      <div id="pack-grid">
        ${packs.map(p => `
          <div class="pack-card ${p.id === sel ? 'on' : ''}" data-id="${p.id}" style="--pk:${p.theme.accent};background:${p.theme.cardBg || p.theme.panel}">
            <div class="picon">${p.icon}</div>
            <div class="pname">${esc(p.name)}</div>
            <div class="ptag">${esc(p.tagline)}</div>
            <div class="pchip">${esc(p.lexicon.level)} · ${esc(p.lexicon.progress)}</div>
            <div class="pmeta">${(p.worlds || []).join(' / ')} · ${(p.tiers || []).length} 阶</div>
          </div>
        `).join('')}
      </div>
      <div class="wactions">
        <div class="name-row">
          <input id="w-name" type="text" maxlength="12" placeholder="角色名（可留空）" value="">
        </div>
        <button class="btn btn-gold" id="w-start" type="button">${esc(getPack(sel).lexicon.startBtn || '进入所选世界')}</button>
        <div class="hint">存档与所选世界观绑定。点顶栏「🌐 世界观」可换世界重开。</div>
      </div>
    </div>
  `
  root.querySelectorAll('.pack-card').forEach(card => {
    card.onclick = () => {
      app.selectedPack = card.dataset.id
      root.querySelectorAll('.pack-card').forEach(c => c.classList.toggle('on', c.dataset.id === app.selectedPack))
      applyTheme(getPack(app.selectedPack))
    }
  })
  document.getElementById('w-start').onclick = () => {
    const name = (document.getElementById('w-name').value || '').trim()
    startNewGame(name, app.selectedPack)
  }
  const startBtn = document.getElementById('w-start')
  root.querySelectorAll('.pack-card').forEach(card => {
    const orig = card.onclick
    card.addEventListener('click', () => {
      const p = getPack(app.selectedPack)
      if (p && startBtn) startBtn.textContent = p.lexicon.startBtn || '进入所选世界'
    })
  })
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
  } catch (e) {
    console.error(e)
    toast('进入世界失败：' + esc(e && e.message || e))
  }
}

function showGame(S) {
  app.S = S
  app.selectedPack = S.worldview || defaultPackId()
  setShell('game')
  applyTheme(getPack(S.worldview))
  try { playBgm(S.bgmTrack) } catch (e) { /* music optional */ }
  refreshAll()
}

function firstGuide(S) {
  if (S.guideDone) return
  toast(`欢迎来到《${getPack(S.worldview).name}》世界。左侧选择功能，场景内点行动与 AI 互动。`, 6000)
  S.guideDone = true
  save()
}

/* ---------- 顶栏 ---------- */
function bindHeader() {
  document.getElementById('btn-key').onclick = () => openKeyModal(app, { save, refreshAll })
  document.getElementById('btn-help').onclick = () => openHelp(app)
  document.getElementById('btn-worlds').onclick = () => {
    openModal(`
      <h2>切换世界观</h2>
      <p>将清空当前进度并以新世界观重新开局。API Key 会保留。</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" data-close>取消</button>
        <button class="btn btn-danger" id="go-wipe-world">确认重开</button>
      </div>
    `)
    document.getElementById('go-wipe-world').onclick = () => {
      resetSaveKeepMeta()
      closeModal()
      location.reload()
    }
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
    bag: nav.bag,
    settings: nav.settings
  }
  Object.keys(map).forEach(id => {
    const el = document.getElementById('nav-' + id)
    if (!el) return
    const icon = { scene: '📍', map: '🗺️', profile: '👤', friends: '🤝', bag: '🎒', settings: '⚙️' }[id]
    if (map[id]) el.textContent = `${icon} ${map[id]}`
  })
}

function boot() {
  bindHeader()
  initBgm()
  const existing = loadSave()
  if (existing) {
    showGame(existing)
    firstGuide(existing)
  } else {
    setShell('welcome')
    renderWelcome()
  }
}

boot()
window.__AW_APP__ = app
