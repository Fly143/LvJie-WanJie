// 各 Tab 渲染
import { esc, fmtNum, ageLabel, ageLabelShort, normalizeMoney, spendMoney, stripOptPrefix } from '../engine/util.js'
import {
  tierLabel, tierColor, playerCultReq, isLifeExpired
} from '../engine/progression.js'
import { totalPowerF, powerBreakdown, consumableEffect, partyPowerF, friendPowerF } from '../engine/power.js'
import { curLoc, travel, gateReason, travelDays } from '../engine/map.js'
import { skillLabel } from '../engine/skills.js'
import { addItem, normalizeType, typeName, itemChip, useDirectItem } from '../engine/inventory.js'
import { toggleEquip, equipSummary, ensureEquipFlags } from '../engine/equip.js'
import { packUi, packFeatures, sceneActionsOf } from '../engine/pack-ui.js'
import { sanitizeManualData, manualDesc, forgetOldTechniques } from '../engine/techniques.js'
import { relationLines, addFriendHistory, friendRecentLines } from '../engine/npc-memory.js'
import { setParty, isParty, partyMembers, partyDays, canInteractToday, partyInteract, dismissAll, originOf } from '../engine/party.js'
import { questMarkers, questStatusLabel } from '../engine/quests.js'
import { propose, divorce, canPropose, showPropose, genderMatchesPref, marriageEnabled, proposeWord, divorceWord, spouseLabel, spouseWord, marriedList, PROPOSE_MIN_FAVOR, addGrudge, removeGrudge } from '../engine/marriage.js'

function favorColor(v) {
  const n = Number(v) || 0
  if (n < 0) return 'var(--red)'
  if (n >= 80) return 'var(--gold, #e8c46a)'
  return 'inherit'
}

function relBlock(person) {
  const lines = relationLines(person)
  if (!lines.length) return ''
  return '<div class="cdim">' + lines.map(l => esc(l)).join('<br>') + '</div>'
}
import { AI_STYLES, AI_STYLE_ORDER, PLAYER_GENDERS, MAX_TALK_PER_DAY, LANGUAGE_OPTIONS } from '../engine/constants.js'
import { allBgmTracks, addLocalBgmFiles, removeLocalBgm, playBgm } from './bgm.js'
import { runEventTurn, endEvent } from '../engine/event.js'
import { openModal, closeModal, confirmModal } from './modals.js'
import { upgradeSelect } from './picker.js'
import { t, uiLangName } from '../engine/i18n.js'
import { openHelp } from './settings-panels.js'
import { oddsLabel } from '../engine/prompt.js'

export function renderScene(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const loc = curLoc(S) || { name: t('unknown'), world: '', continent: '', type: '', desc: '', people: [], shop: [], beasts: [], interactables: [], notes: [] }
  const EV = app.EV

  let evHtml = ''
  if (EV) {
    if (EV.loading && !EV.resultText) {
      evHtml = `<div class="ev-box"><div class="ev-head"><span>${t('evGenerating')}</span><span class="loading-dot">●●●</span></div>
        <div class="ev-text">${t('loading')}</div></div>`
    } else if (EV.resultText) {
      const opts = (EV.options || []).map((o, i) =>
        `<button class="btn ev-opt" data-opt="${i}" type="button">${i + 1}. ${esc(stripOptPrefix(o))}</button>`
      ).join('')
      evHtml = `
        <div class="ev-box">
          <div class="ev-head">
            <span>${esc(EV.kind || t('evKind'))} · ${t('roundN')} ${EV.count} ${t('round')}</span>
            <span><button class="btn btn-sm" id="ev-end" type="button">${t('endEvent')}</button></span>
          </div>
          <div class="ev-text">${esc(EV.resultText)}</div>
          ${EV.error ? `<div class="ev-head" style="color:var(--red);margin-top:8px">${esc(EV.error)}</div>` : ''}
          ${EV.loading ? `<div class="ev-text loading-dot" style="margin-top:8px">${t('gen')}</div>` : opts}
          ${!EV.loading && (!EV.options || !EV.options.length) ? `<div class="btn-row"><button class="btn" id="ev-close" type="button">${t('close')}</button></div>` : ''}
          <div class="ev-input-row">
            <div class="ev-label-row"><span style="color:var(--dim);font-size:12px">${t('freeAction')}</span></div>
            <input class="ev-input" id="ev-free" type="text" placeholder="${t('freePlaceholder')}" ${EV.loading ? 'disabled' : ''}>
            <div class="btn-row"><button class="btn btn-gold btn-sm" id="ev-send" type="button" ${EV.loading ? 'disabled' : ''}>${t('send')}</button></div>
          </div>
          <div class="ai-note">${t('aiNote')}</div>
        </div>`
    } else if (EV.error) {
      evHtml = `<div class="ev-box"><div class="ev-head" style="color:var(--red)">${esc(EV.error)}</div>
        <div class="btn-row">
          <button class="btn" id="ev-retry" type="button">${t('retry')}</button>
          <button class="btn" id="ev-close" type="button">${t('close')}</button>
        </div></div>`
    }
    // 内置免费通道额度/限流：红字之外再弹一次提示，避免剧情中途失败看不出原因（每轮只弹一次）
    if (EV.quota && EV._quotaToasted !== EV._turn) {
      EV._quotaToasted = EV._turn
      try { api.toast(EV.error || t('zenUnavailable')) } catch (e) { /* ignore */ }
    }
  }

  const ui = packUi(pack)
  const feat = packFeatures(pack)
  const actions = sceneActionsOf(pack)

  main.innerHTML = `
    <div class="panel">
      <div class="loc-head">
        <span class="loc-name">${esc(loc.name)}</span>
        <span class="loc-meta">${esc(loc.world)} · ${esc(loc.continent)} · ${esc(loc.type)}</span>
      </div>
      <div class="loc-desc">${esc(loc.desc || '')}</div>
      ${(loc.notes || []).slice(-3).map(n => `<div class="loc-note">※ ${esc(n)}</div>`).join('')}
      <div class="btn-row">
        ${actions.map(a => {
          const ak = 'act_' + a.id
          const al = t(ak)
          const label = al !== ak ? al : a.label
          return `<button class="btn" data-act="${esc(a.id)}" type="button">${esc(label)}</button>`
        }).join('')}
      </div>
    </div>
    ${evHtml}
    <div class="panel" id="free-act-panel">
      <div class="ev-label-row"><span style="color:var(--dim);font-size:12px">${t('freeAction')}</span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="ev-input" id="scene-free" type="text" placeholder="${t('freePlaceholder')}" style="flex:1">
        <button class="btn btn-gold btn-sm" id="scene-free-send" type="button">${t('send')}</button>
      </div>
    </div>
    <div class="panel">
      <h3>${t('peopleHere')}</h3>
      <div class="grid">
        ${(loc.people || []).map(p => `
          <div class="card">
            <div class="cname"><button class="btn btn-sm" data-npcinfo="${esc(p.name)}" type="button" style="background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer">${esc(p.name)}</button></div>
            <div class="crealm">${esc(p.realm || p.rank || '')}</div>
            <div class="cdesc">${esc(p.intro || '')}</div>
            ${p.gender ? `<div class="cdim">${t('genderPrefix')}${esc(p.gender)}</div>` : ''}
            ${relBlock(p)}
            <div class="cbtn"><button class="btn btn-sm" data-talk="${esc(p.name)}" type="button">${esc(pack.ui && pack.ui.talkBtn || t('talkBtn'))}</button></div>
          </div>
        `).join('') || `<div class="empty">${t('noPeople')}</div>`}
      </div>
    </div>
    <div class="panel">
      <h3>${t('threats')}</h3>
      <div class="grid">
        ${(loc.beasts || []).map(b => {
          const myPow = totalPowerF(S)
          const bp = Number(b.power) || 0
          const ratio = bp > 0 ? myPow / bp : null
          const odds = oddsLabel(ratio)
          return `
          <div class="card">
            <div class="cname">${esc(b.name)}</div>
            <div class="crealm">${esc(b.realm || '')} · ${esc(ui.powerLabel)} ${fmtNum(b.power || 0)}${odds !== '未知' ? ` · ${esc(odds)}` : ''}</div>
            <div class="cdim">${t('drops')}${esc(b.drops || t('none'))}</div>
            <div class="cbtn"><button class="btn btn-sm btn-danger" data-hunt="${esc(b.name)}" type="button">${esc(pack.ui && pack.ui.fightBtn || t('fightBtn'))}</button></div>
          </div>`
        }).join('') || `<div class="empty">${t('noThreats')}</div>`}
      </div>
    </div>
    ${(loc.shop || []).length ? `
    <div class="panel">
      <h3>${t('tradeHere')}</h3>
      ${(loc.shop || []).map((it, idx) => `
        <div class="shop-row">
          <span class="sname">${esc(it.name)}</span>
          <span class="sdesc">${esc(it.desc || '')}</span>
          <span class="ctype">${esc(typeName(S, it.type, pack))}</span>
          <span class="sprice">${fmtNum(it.price || 0)} ${esc(pack.lexicon.money.main)}</span>
          <button class="btn btn-sm" data-buy="${idx}" type="button">${t('buy')}</button>
        </div>
      `).join('')}
    </div>` : ''}
    ${(loc.interactables || []).length ? `
    <div class="panel">
      <h3>${t('interact')}</h3>
      ${(loc.interactables || []).map((x, i) => `
        <div class="shop-row">
          <span class="sname">${esc(x.name)}</span>
          <span class="sdesc">${esc(x.intro || '')}</span>
          <button class="btn btn-sm" data-inter="${i}" type="button">${t('view')}</button>
        </div>
      `).join('')}
    </div>` : ''}
  `

  const ACT_PROMPTS = {}
  actions.forEach(a => { ACT_PROMPTS[a.id] = a.prompt || a.label })

  main.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => contEvent(app, api, ACT_PROMPTS[b.dataset.act] || b.textContent)
  })
  main.querySelectorAll('[data-talk]').forEach(b => {
    b.onclick = () => contEvent(app, api, t('youSaid') + b.dataset.talk + t('youSaidTalk'))
  })
  main.querySelectorAll('[data-hunt]').forEach(b => {
    b.onclick = () => contEvent(app, api, t('youChallenge') + b.dataset.hunt + t('youChallenge2'))
  })
  main.querySelectorAll('[data-inter]').forEach(b => {
    b.onclick = async () => {
      const x = loc.interactables[Number(b.dataset.inter)]
      contEvent(app, api, t('youView') + x.name + t('youView2') + (x.intro || ''))
    }
  })
  main.querySelectorAll('[data-buy]').forEach(b => {
    b.onclick = async () => {
      const it = loc.shop[Number(b.dataset.buy)]
      const pay = spendMoney(S, it.price || 0)
      if (!pay.ok) {
        api.toast((pack.lexicon.money && pack.lexicon.money.main || '') + t('notEnough'))
        return
      }
      addItem(S, it, 1)
      api.save()
      api.toast(`${t('bought')} ${it.name}`)
      api.refreshAll()
    }
  })

  main.querySelectorAll('[data-opt]').forEach(b => {
    b.onclick = async () => {
      const i = Number(b.dataset.opt)
      const label = (app.EV.options || [])[i]
      if (label != null) contEvent(app, api, label)
    }
  })
  const send = document.getElementById('ev-send')
  const free = document.getElementById('ev-free')
  if (send && free) {
    const doSend = () => {
      const v = free.value.trim()
      if (!v) return
      contEvent(app, api, v)
    }
    send.onclick = doSend
    free.onkeydown = e => { if (e.key === 'Enter') doSend() }
  }
  const sf = document.getElementById('scene-free')
  const ss = document.getElementById('scene-free-send')
  if (sf && ss) {
    const doScene = () => {
      const v = sf.value.trim()
      if (!v) return
      if (app.EV && app.EV.loading) return
      sf.value = ''
      contEvent(app, api, v)
    }
    ss.onclick = doScene
    sf.onkeydown = e => { if (e.key === 'Enter') doScene() }
    if (app.EV && app.EV.loading) sf.disabled = true
  }
  const endB = document.getElementById('ev-end')
  const closeB = document.getElementById('ev-close')
  const retryB = document.getElementById('ev-retry')
  const finish = () => { endEvent(app.EV); app.EV = null; api.refreshAll() }
  if (endB) endB.onclick = finish
  if (closeB) closeB.onclick = finish
  if (retryB) retryB.onclick = () => {
    const last = [...(app.EV.history || [])].reverse().find(m => m.role === 'user')
    const text = last ? last.content : t('contStory')
    app.EV.error = ''
    contEvent(app, api, text, true)
  }
}

function scrollEventTop() {
  try {
    // 只回整页顶，不要把剧情框顶到视口（那样会停在中间）
    const main = document.getElementById('main')
    if (main) main.scrollTop = 0
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0)
  } catch (e) { /* ignore */ }
}

function contEvent(app, api, content, isRetry) {
  if (!app.EV || app.EV.ended || isRetry) {
    if (app.EV && isRetry) {
      // keep history, just re-run
      const ev = app.EV
      ev.loading = true
      ev.error = ''
      scrollEventTop()
      runEventTurn(app.S, ev, content, {
        limitOn: app.S.dialogLimit,
        onState: () => {
          if (app.EV !== ev) return
          // 回调可能在 renderScene 之外触发：显式取 #main，勿依赖隐式全局 main
          const mainEl = document.getElementById('main')
          const box = mainEl ? mainEl.querySelector('.ev-text') : null
          if (box && ev.resultText) {
            box.textContent = ev.resultText
            return
          }
          api.refreshAll()
        },
        onDone: (e, brief) => {
          api.save()
          if (brief && brief.major && brief.major.length) api.toastHtml(brief.major.map(m => '⭐ ' + esc(m)).join('<br>'))
          api.refreshAll()
        }
      })
      api.refreshAll()
      return
    }
    api.startFlow(t('freeActionFlow'), content)
    return
  }
  // 继续当前事件
  const ev = app.EV
  ev.loading = true
  ev.error = ''
  ev.partial = ''
  ev.resultText = ''
  scrollEventTop()
  runEventTurn(app.S, ev, content, {
    limitOn: app.S.dialogLimit,
    onState: () => {
      if (app.EV !== ev) return
      // 回调可能在 renderScene 之外触发：显式取 #main，勿依赖隐式全局 main
      const mainEl = document.getElementById('main')
      const box = mainEl ? mainEl.querySelector('.ev-text') : null
      if (box && ev.resultText) {
        box.textContent = ev.resultText
        return
      }
      api.refreshAll()
      if (ev.loading && !ev.resultText) scrollEventTop()
    },
    onDone: (e, brief) => {
      api.save()
      if (brief && brief.major && brief.major.length) api.toastHtml(brief.major.map(m => '⭐ ' + esc(m)).join('<br>'))
      else if (brief && brief.minor && brief.minor.length) api.toastHtml(brief.minor.slice(0, 4).map(esc).join(' · '))
      api.refreshAll()
    }
  })
  api.refreshAll()
  scrollEventTop()
}

export function renderMap(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const markers = questMarkers(S)
  const worlds = pack.worlds || []
  const byWorld = {}
  for (const l of S.map) {
    const w = l.world || t('mainWorld')
    byWorld[w] = byWorld[w] || {}
    const c = l.continent || t('unknownPlace')
    byWorld[w][c] = byWorld[w][c] || []
    byWorld[w][c].push(l)
  }

  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.map)}</h3>
      <div class="loc-desc">${t('at')}<b style="color:var(--accent)">${esc((curLoc(S) || {}).name || '')}</b></div>
      ${worlds.map(w => `
        <div class="world-sec">
          <div class="world-title map-h" data-w="${esc(w)}"><span>${esc(w)}</span><span class="tag map-caret">▾</span></div>
          <div class="map-body" data-wbody="${esc(w)}">
            ${Object.keys(byWorld[w] || {}).map(cont => `
              <div class="cont-title">${esc(cont)}</div>
              ${(byWorld[w][cont] || []).map(l => {
                const cur = l.id === S.currentLoc
                const gate = gateReason(S, curLoc(S) || {}, l)
                const days = travelDays(S, curLoc(S) || {}, l)
                return `
                  <div class="card loc-card ${cur ? 'cur' : ''}" style="margin-bottom:8px">
                    <div class="linfo">
                      <div class="cname">${esc(l.name)} ${cur ? t('hereMark') : ''}${markers.get(l.name) ? ' <span class="ctype">' + t('questMark') + '</span>' : ''}</div>
                      <div class="cdim">${esc(l.type)} · ${cur ? t('here') : t('aboutDays') + days + t('days')}${markers.get(l.name) ? ' · ' + esc(markers.get(l.name).join('、')) : ''}</div>
                      <div class="cdesc">${esc(l.desc || '')}</div>
                      ${gate ? `<div class="lock">🔒 ${esc(gate)}</div>` : ''}
                    </div>
                    ${cur ? '' : `<button class="btn btn-sm" data-go="${esc(l.name)}" type="button" ${gate ? 'disabled' : ''}>${t('go')}</button>`}
                  </div>
                `
              }).join('')}
            `).join('') || `<div class="empty">${t('noLocs')}</div>`}
          </div>
        </div>
      `).join('')}
    </div>
  `

  main.querySelectorAll('.map-h').forEach(h => {
    h.onclick = () => {
      const body = main.querySelector(`[data-wbody="${CSS.escape(h.dataset.w)}"]`)
      if (body) {
        body.classList.toggle('hide')
        const car = h.querySelector('.map-caret')
        if (car) car.textContent = body.classList.contains('hide') ? '▸' : '▾'
      }
    }
  })
  main.querySelectorAll('[data-go]').forEach(b => {
    b.onclick = async () => {
      const r = travel(S, b.dataset.go)
      if (!r.ok) { api.toast(r.msg); return }
      if (app.EV) { endEvent(app.EV); app.EV = null }
      api.save()
      api.centerToast(r.msg)
      api.refreshAll()
      api.setTab('scene')
    }
  })
}

export function renderProfile(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const bd = powerBreakdown(S)
  const req = playerCultReq(S)
  const ui = packUi(pack)

  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.profile)}</h3>
      <div class="pname" style="font-family:STKaiti,KaiTi,serif;font-size:22px;color:var(--accent)">${esc(S.name)}</div>
      <div class="row" style="display:flex;justify-content:space-between;margin-top:8px">
        <span style="color:var(--dim)">${esc(pack.lexicon.level)}</span>
        <b style="color:${tierColor(S, S.tierIndex)}">${esc(tierLabel(S))}</b>
      </div>
      <div class="row" style="display:flex;justify-content:space-between">
        <span style="color:var(--dim)">${esc(pack.lexicon.progress)}</span>
        <b>${fmtNum(S.progress)} / ${fmtNum(req)}</b>
      </div>
      <div class="row" style="display:flex;justify-content:space-between">
        <span style="color:var(--dim)">${t('age')}</span><b>${ageLabelShort(S.ageDays)}</b>
      </div>
      <div class="row" style="display:flex;justify-content:space-between">
        <span style="color:var(--dim)">${esc(ui.powerLabel)}</span><b>${fmtNum(totalPowerF(S))}</b>
      </div>
      <div class="row" style="display:flex;justify-content:space-between">
        <span style="color:var(--dim)">${t('rep')}</span><b>${fmtNum(S.factionRep || 0)}</b>
      </div>
      <h4>${esc(ui.powerLabel)}${t('breakdown')}</h4>
      <div class="skill-row"><span class="k">${t('base')}</span><span class="v">${fmtNum(bd.base)}</span></div>
      <div class="skill-row"><span class="k">${t('equip')}</span><span class="v">${fmtNum(bd.art)}</span></div>
      <div class="skill-row"><span class="k">${esc(pack.lexicon.technique)}</span><span class="v">${fmtNum(bd.manual)}</span></div>
      <div class="skill-row"><span class="k">${t('fromRel')}</span><span class="v">${fmtNum(bd.spouse)}</span></div>
      <div class="skill-row"><span class="k">${t('fromParty')}</span><span class="v">${fmtNum(bd.party)}</span></div>
      <h4>${t('equipped')}</h4>
      ${(() => {
        const eq = equipSummary(S)
        return eq.length
          ? eq.map(e => {
              const tname = (e.realm_index != null && pack.tiers[e.realm_index]) ? pack.tiers[e.realm_index].name : ''
              return `<div class="skill-row"><span class="k">${esc(e.name)}</span><span class="v">${esc(e.grade || '')}${tname ? ' · ' + esc(tname) : ''}</span></div>`
            }).join('')
          : `<div class="empty">${t('noEquip')}</div>`
      })()}
      <h4>${esc(pack.lexicon.skill)}</h4>
      ${(() => {
        const learned = (pack.skills || []).filter(sk => (Number(S.skills[sk.id]) || 0) > 0)
        if (!learned.length) return `<div class="empty">${t('noSkills')}</div>`
        return learned.map(sk => `
        <div class="skill-row"><span class="k">${esc(sk.name)}</span><span class="v">${esc(skillLabel(S, sk, S.skills[sk.id] || 0))}</span></div>
      `).join('')
      })()}
      <h4>${esc(pack.lexicon.technique)}</h4>
      ${(S.techniques || []).length
        ? S.techniques.map(m => `<div class="skill-row"><span class="k">${esc(m.name)}</span><span class="v">${m.level}/${m.levels} · ${esc(m.grade || '')}</span></div>`).join('')
        : `<div class="empty">${t('learned')}</div>`}
      <h4>${t('tierList')}</h4>
      <div style="font-size:12px;color:var(--dim);line-height:1.8">
        ${pack.tiers.map((t, i) => `<span style="color:${i === S.tierIndex ? 'var(--accent)' : 'inherit'}">${i + 1}.${esc(t.name)}</span>`).join(' · ')}
      </div>
    </div>
  `
}

export function renderFriends(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const ui = packUi(pack)
  const main = document.getElementById('main')
  const cur = curLoc(S) || {}
  const feat = packFeatures(pack)
  const friendAt = (f) => {
    // 同行者视为与玩家同场景（位置由同行状态决定，不看地图投影）
    if (f && f.party === true) return { name: (cur && cur.name) || '', here: true }
    const hit = (S.map || []).some(l => (l.people || []).some(p => p && p.name === f.name))
    if (hit) {
      const l = (S.map || []).find(x => (x.people || []).some(p => p && p.name === f.name))
      return { name: (l && l.name) || '', here: !!(l && l.id === S.currentLoc) }
    }
    return { name: t('unknownLoc'), here: false }
  }
  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.friends)}</h3>
      <div class="btn-row">
        <button class="btn" id="fr-new" type="button">✨ ${t('meetNew')}${esc(pack.lexicon.companion)}</button>
      </div>
      <h3 style="margin-top:16px">⚔️ ${t('partyTitle')} <span class="ctype">${t('partyPower')} ${fmtNum(partyPowerF(S))}</span></h3>
      ${partyMembers(S).length ? `
      <div class="btn-row" style="margin-top:6px">
        <button class="btn btn-sm" id="party-dismiss-all" type="button">${t('partyDismissAll')}</button>
      </div>
      <div class="grid" style="margin-top:8px">
        ${partyMembers(S).map(f => {
          const days = partyDays(S, f)
          const canTalk = canInteractToday(S, f)
          const recent = friendRecentLines(f, 1)[0] || ''
          return `
          <div class="card">
            <div class="cname"><button class="btn btn-sm" data-npcinfo="${esc(f.name)}" type="button" style="background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer">${esc(f.name)}</button> <span class="ctype">${t('partyOn')}</span></div>
            <div class="crealm">${esc(f.realm || '')} · ${esc(ui.powerLabel)} ${fmtNum(Math.round(friendPowerF(S, f)))} · <span style="color:${favorColor(f.favor)}">${t('favor')} ${fmtNum(f.favor || 0)}</span></div>
            <div class="cdim">${t('partyDays')} ${fmtNum(days)} ${t('dayUnit')}${recent ? ' · ' + esc(recent) : ''}</div>
            <div class="cbtn">
              <button class="btn btn-sm ${canTalk ? 'btn-gold' : ''}" data-ptalk="${esc(f.name)}" type="button" ${canTalk ? '' : 'disabled'}>${canTalk ? t('partyTalk') : t('partyTalkDone')}</button>
              <button class="btn btn-sm" data-pdismiss="${esc(f.name)}" type="button">${t('partyLeave')}</button>
            </div>
          </div>`
        }).join('')}
      </div>
      <div class="ai-note">${t('partyTalkHint')}</div>` : `<div class="empty">${t('partyNone')}</div>`}
      <h3 style="margin-top:16px">${esc(pack.lexicon.nav.friends)}</h3>
      <div class="grid" style="margin-top:12px">
        ${(S.friends || []).map((f, i) => {
          const at = friendAt(f)
          return `
          <div class="card">
            <div class="cname"><button class="btn btn-sm" data-npcinfo="${esc(f.name)}" type="button" style="background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer">${esc(f.name)}</button> ${f.gender ? `<span class="ctype">${esc(f.gender)}</span>` : ''}${f.party ? `<span class="ctype">${t('partyOn')}</span>` : ''}</div>
            <div class="crealm">${esc(f.realm || '')} · <span style="color:${favorColor(f.favor)}">${t('favor')} ${fmtNum(f.favor || 0)}</span>${f.ageDays != null ? ' · ' + ageLabel(f.ageDays) : ''}${f.relType ? ' · ' + esc(f.relType) : ''}</div>
            <div class="cdim">📍 ${esc(at.name)}${at.here ? t('curScene') : ''}</div>
            <div class="cdesc">${esc(f.intro || '')}</div>
            ${f.mem ? `<div class="cdim">${t('mem')}${esc(f.mem)}</div>` : ''}
            ${relBlock(f)}
            ${true ? `<div class="btn-row" style="margin-top:4px">
              <button class="btn btn-sm" data-grudge="${i}" type="button">${t('grudgeAdd')}</button>
              ${(f.grudges || []).length ? `<button class="btn btn-sm" data-ungudge="${i}" type="button">${t('grudgeDel')}</button>` : ''}
            </div>` : ''}
            <div class="cbtn">
              <button class="btn btn-sm ${at.here ? 'btn-gold' : ''}" data-chat="${i}" type="button" title="${at.here ? t('faceTalk') : (feat.talkRemote ? t('msg') : t('needSameScene'))}">${at.here ? t('chat') : (feat.talkRemote ? t('msg') : t('notNearby'))}</button>
              <button class="btn btn-sm ${f.party ? '' : 'btn-gold'}" data-party="${i}" type="button">${f.party ? t('partyLeave') : t('partyInvite')}</button>
              ${marriageEnabled(pack) ? (f.married
                ? `<button class="btn btn-sm" data-divorce="${i}" type="button">${esc(divorceWord(pack))}</button>`
                : (showPropose(f, pack, S.marriagePref) ? `<button class="btn btn-sm" data-marry="${i}" type="button">💍 ${esc(proposeWord(pack))}</button>` : '')) : ''}
              ${(packFeatures(pack).marriage !== false && f.married) ? `<span class="ctype">${esc(spouseLabel(f, pack))}</span>` : ''}
            </div>
          </div>
        `}).join('') || `<div class="empty">${t('noCompanions')}</div>`}
      </div>
      <div class="ai-note">${t('talkDaily')}${esc(pack.lexicon.companion)}${t('talkTimes')} ${MAX_TALK_PER_DAY} ${t('times')}${feat.talkRemote ? t('talkRemoteHint') : t('needSameSceneLong')}</div>
    </div>
  `
  const nb = document.getElementById('fr-new')
  if (nb) nb.onclick = () => api.startFlow(t('meetFlow'), t('youMeet') + pack.lexicon.companion + '。')
  main.querySelectorAll('[data-grudge]').forEach(b => {
    b.onclick = async () => {
      const f = S.friends[Number(b.dataset.grudge)]
      if (!f) return
      openModal(`
        <h2>${t('grudgeTitle')}</h2>
        <label style="color:var(--dim);font-size:12px">${t('target')}</label>
        <input id="gr-to" value="${t('player')}">
        <label style="color:var(--dim);font-size:12px">${t('kind')}</label>
        <select id="gr-kind">
          <option value="怨">${t('grudgeKindYuan')}</option>
          <option value="恩">${t('grudgeKindEn')}</option>
          <option value="仇">${t('grudgeKindChou')}</option>
          <option value="债">${t('grudgeKindZhai')}</option>
        </select>
        <label style="color:var(--dim);font-size:12px">${t('note')}</label>
        <input id="gr-note" placeholder="${t('notePh')}">
        <div class="btn-row">
          <button class="btn btn-gold" id="gr-ok" type="button">${t('save')}</button>
          <button class="btn" data-close type="button">${t('cancel')}</button>
        </div>
      `)
      upgradeSelect(document.getElementById('gr-kind'), { title: t('kind') })
      document.getElementById('gr-ok').onclick = () => {
        addGrudge(f, document.getElementById('gr-to').value || t('player'), document.getElementById('gr-kind').value, document.getElementById('gr-note').value)
        closeModal()
        api.toast(t('grudgeAdded'))
        api.save()
        api.refreshAll()
      }
    }
  })
  main.querySelectorAll('[data-ungudge]').forEach(b => {
    b.onclick = async () => {
      const f = S.friends[Number(b.dataset.ungudge)]
      if (!f) return
      const list = f.grudges || []
      if (!list.length) return
      if (list.length === 1) {
        removeGrudge(f, 0)
        api.toast(t('grudgeRemoved'))
        api.save()
        api.refreshAll()
        return
      }
      openModal(`
        <h2>${t('grudgePick')}</h2>
        <div class="cbox">
          ${list.map((g, gi) => `
            <button class="btn btn-sm" data-grm="${gi}" type="button" style="display:block;width:100%;text-align:left;margin:6px 0">
              ${esc(g.kind || t('grudgeKindYuan'))} · ${esc(g.to || t('player'))} ${g.note ? '— ' + esc(g.note) : ''}
            </button>
          `).join('')}
        </div>
        <div class="btn-row"><button class="btn" data-close type="button">${t('cancel')}</button></div>
      `)
      document.querySelectorAll('[data-grm]').forEach(btn => {
        btn.onclick = () => {
          removeGrudge(f, Number(btn.dataset.grm))
          closeModal()
          api.toast(t('grudgeRemoved'))
          api.save()
          api.refreshAll()
        }
      })
    }
  })
  main.querySelectorAll('[data-npcinfo]').forEach(b => {
    b.onclick = async () => {
      const name = b.dataset.npcinfo
      const friend = (S.friends || []).find(x => x.name === name)
      const loc = curLoc(S) || {}
      const person = (loc.people || []).find(x => x.name === name)
        || (S.map || []).flatMap(l => (l.people || []).map(p => ({ ...p, _at: l.name }))).find(x => x.name === name)
      const src = friend || person || {}
      const at = person && person._at ? person._at : (friend ? (friendAt(friend).name || '') : '')
      openModal(`
        <h2>${esc(name)}</h2>
        <div class="row"><span>${t('genderLabel')}</span><span class="v">${esc(src.gender || t('notSet'))}</span></div>
        <div class="row"><span>${t('rank')}</span><span class="v">${esc(src.realm || src.rank || '')}</span></div>
        <div class="row"><span>${t('power')}</span><span class="v">${fmtNum(src.power || 0)}</span></div>
        ${src.favor != null ? `<div class="row"><span>${t('favor')}</span><span class="v" style="color:${favorColor(src.favor)}">${fmtNum(src.favor)}</span></div>` : ''}
        ${src.relType ? `<div class="row"><span>${t('relation')}</span><span class="v">${esc(src.relType)}</span></div>` : ''}
        ${at ? `<div class="row"><span>${t('location')}</span><span class="v">${esc(at)}</span></div>` : ''}
        ${src.intro ? `<div class="cdesc" style="margin-top:8px">${esc(src.intro)}</div>` : ''}
        ${src.mem ? `<div class="cdim">${t('mem')}${esc(src.mem)}</div>` : ''}
        ${relBlock(src)}
        <div class="btn-row"><button class="btn" data-close type="button">${t('close')}</button></div>
      `)
    }
  })
  main.querySelectorAll('[data-marry]').forEach(b => {
    b.onclick = async () => {
      const f = S.friends[Number(b.dataset.marry)]
      if (!f) return
      const okGo = await confirmModal(t('confirmPropose') + ' ' + f.name + ' ' + proposeWord(pack) + t('confirmPropose2'), { title: '💍 ' + proposeWord(pack) })
      if (!okGo) return
      const res = propose(S, f, pack)
      if (res && res.code === 'low_favor') {
        api.startFlow(
          t('proposeRejectFlow'),
          t('youPropose') + ' ' + f.name + ' ' + proposeWord(pack) + '，' + t('proposeRejectWhy') + '（' + t('favor') + ' ' + fmtNum(res.favor || 0) + '/' + fmtNum(res.need || 50) + '）。' + t('proposeRejectAsk')
        )
      } else if (res && res.ok) {
        api.startFlow(
          t('proposeAcceptFlow'),
          t('youPropose') + ' ' + f.name + ' ' + proposeWord(pack) + '，' + t('proposeAcceptWhy') + '。' + t('proposeAcceptAsk')
        )
      } else {
        api.toast(res.msg)
      }
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-divorce]').forEach(b => {
    b.onclick = async () => {
      const f = S.friends[Number(b.dataset.divorce)]
      if (!f) return
      const okGo = await confirmModal(t('confirmDivorce') + ' ' + f.name + ' ' + divorceWord(pack) + t('confirmPropose2'), { title: divorceWord(pack) })
      if (!okGo) return
      const res = divorce(S, f, pack)
      api.toast(res.msg)
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-chat]').forEach(b => {
    b.onclick = async () => {
      const f = S.friends[Number(b.dataset.chat)]
      if (!f) return
      const at = friendAt(f)
      if (!at.here) {
        if (!feat.talkRemote) {
          api.toast(t('notInScene') + (cur.name || '') + t('notInScene2'))
          return
        }
        const dayKey2 = String(Math.floor(S.ageDays / 30))
        if (f.lastDay !== dayKey2) { f.lastDay = dayKey2; f.talkCount = 0 }
        if ((f.talkCount || 0) >= MAX_TALK_PER_DAY) {
          api.toast(t('talkLimit1') + f.name + t('talkLimit2'))
          return
        }
        f.talkCount = (f.talkCount || 0) + 1
        addFriendHistory(f, '与你远程联络')
        api.save()
        api.startFlow(
          t('msg'),
          t('youMsgA') + f.name + t('youMsgB') + at.name + t('youMsgC') + (f.intro || '') + t('youMsgD') + (f.mem || t('memNone')) + t('youMsgE'),
          f.name
        )
        return
      }
      const dayKey = String(Math.floor(S.ageDays / 30))
      if (f.lastDay !== dayKey) { f.lastDay = dayKey; f.talkCount = 0 }
      if ((f.talkCount || 0) >= MAX_TALK_PER_DAY) {
        api.toast(t('talkLimit1') + f.name + t('chatLimit2'))
        return
      }
      f.talkCount = (f.talkCount || 0) + 1
      addFriendHistory(f, '在' + (cur.name || t('herePlace')) + '与你交谈')
      api.save()
      api.startFlow(
        t('chat'),
        t('youChatA') + (cur.name || t('herePlace')) + t('youChatB') + f.name + t('youChatC') + (f.intro || '') + t('youMsgD') + (f.mem || t('memNone')),
        f.name
      )
    }
  })
  // 结束同行：可选择「留在原地」或「返回原处」（记得出发点时才给返回选项）
  const askDismiss = (f) => {
    const origin = originOf(S, f)
    const canBack = !!(origin && origin.id !== S.currentLoc)
    openModal(`
      <h2>${t('partyLeave')}</h2>
      <p style="color:var(--text)">${esc(f.name)}</p>
      <div class="btn-row">
        <button class="btn btn-gold" data-dmode="stay" type="button">${t('partyStayHere')}</button>
        ${canBack ? `<button class="btn" data-dmode="back" type="button">${t('partyBackTo')}${esc(origin.name)}</button>` : ''}
        <button class="btn" data-close type="button">${t('cancel')}</button>
      </div>
    `)
    document.querySelectorAll('[data-dmode]').forEach(b => {
      b.onclick = () => {
        const r = setParty(S, f.name, false, { returnTo: b.dataset.dmode === 'back' })
        closeModal()
        api.toast(r.returned ? (f.name + t('partyReturned') + r.to) : (f.name + t('partyLeft')))
        api.save()
        api.refreshAll()
      }
    })
  }

  main.querySelectorAll('[data-party]').forEach(b => {
    b.onclick = () => {
      const f = S.friends[Number(b.dataset.party)]
      if (!f) return
      if (f.party === true) { askDismiss(f); return }
      const r = setParty(S, f.name, true)
      if (!r.ok) {
        api.toast(r.reason === 'nothere' ? t('partyNeedSame') : t('partyMissing'))
        return
      }
      api.toast(r.name + (r.on ? t('partyJoined') : t('partyLeft')))
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-pdismiss]').forEach(b => {
    b.onclick = () => {
      const f = (S.friends || []).find(x => x && x.name === b.dataset.pdismiss)
      if (!f) { api.toast(t('partyMissing')); return }
      askDismiss(f)
    }
  })
  const allBtn = document.getElementById('party-dismiss-all')
  if (allBtn) {
    allBtn.onclick = () => {
      openModal(`
        <h2>${t('partyDismissAll')}</h2>
        <p style="color:var(--text)">${t('partyDismissAllWarn')}</p>
        <div class="btn-row">
          <button class="btn btn-gold" data-allmode="stay" type="button">${t('partyStayHere')}</button>
          <button class="btn" data-allmode="back" type="button">${t('partyBackOrigin')}</button>
          <button class="btn" data-close type="button">${t('cancel')}</button>
        </div>
      `)
      document.querySelectorAll('[data-allmode]').forEach(b => {
        b.onclick = () => {
          const r = dismissAll(S, { returnTo: b.dataset.allmode === 'back' })
          closeModal()
          api.toast(r.count + t('partyDismissedN'))
          api.save()
          api.refreshAll()
        }
      })
    }
  }
  main.querySelectorAll('[data-ptalk]').forEach(b => {
    b.onclick = () => {
      const r = partyInteract(S, b.dataset.ptalk)
      if (!r.ok) {
        api.toast(r.reason === 'today' ? t('partyTalkDone') : t('partyMissing'))
        return
      }
      api.toast(r.name + t('partyTalkOk') + ' ' + t('favor') + ' +' + r.favor)
      api.save()
      api.refreshAll()
    }
  })
}

export function renderMarriage(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const enabled = marriageEnabled(pack)
  const spouseW = spouseWord(pack)
  const spouses = marriedList(S)
  const candidates = (S.friends || []).filter(f => f && !f.married && genderMatchesPref(f, S.marriagePref))
    .sort((a, b) => (b.favor || 0) - (a.favor || 0))
    .slice(0, 12)

  main.innerHTML = `
    <div class="panel">
      <h3>💍 ${esc(spouseW)}</h3>
      ${!enabled ? `<div class="empty">${t('marriageOff')}</div>` : `
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0 4px;font-size:12px;color:var(--dim)">
          <span>${t('marriagePrefLabel')}</span>
          <button class="btn btn-sm ${!S.marriagePref ? 'btn-gold' : ''}" data-mpref="" type="button">${t('prefAny')}</button>
          <button class="btn btn-sm ${S.marriagePref === 'female' ? 'btn-gold' : ''}" data-mpref="female" type="button">${t('prefFemale')}</button>
          <button class="btn btn-sm ${S.marriagePref === 'male' ? 'btn-gold' : ''}" data-mpref="male" type="button">${t('prefMale')}</button>
        </div>`}
      ${!enabled ? '' : ''}
      ${enabled && !spouses.length ? `<div class="empty">${t('noSpouse')}</div>` : ''}
      <div class="grid">
        ${spouses.map((f, i) => `
          <div class="card">
            <div class="cname"><button class="btn btn-sm" data-npcinfo="${esc(f.name)}" type="button" style="background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer">${esc(f.name)}</button> <span class="ctype">${esc(spouseLabel(f, pack))}</span></div>
            <div class="crealm">${esc(f.realm || '')} · ${t('favor')} ${fmtNum(f.favor || 0)}</div>
            ${f.mem ? `<div class="cdim">${t('mem')}${esc(f.mem)}</div>` : ''}
            <div class="cbtn"><button class="btn btn-sm" data-mdiv="${i}" type="button">${esc(divorceWord(pack))}</button></div>
          </div>
        `).join('')}
      </div>
      ${enabled && candidates.length ? `
        <h4 style="margin-top:14px">${t('canPropose')}</h4>
        <div class="grid">
          ${candidates.map(f => {
            const idx = (S.friends || []).indexOf(f)
            const ok = true
            return `
              <div class="card">
                <div class="cname"><button class="btn btn-sm" data-npcinfo="${esc(f.name)}" type="button" style="background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer">${esc(f.name)}</button></div>
                <div class="crealm">${esc(f.realm || '')} · ${t('favor')} ${fmtNum(f.favor || 0)}${f.gender ? ' · ' + esc(f.gender) : ''}${f.ageDays != null ? ' · ' + ageLabel(f.ageDays) : ''}</div>
                <div class="cbtn">
                  <button class="btn btn-sm btn-gold" data-mpropose="${idx}" type="button">💍 ${esc(proposeWord(pack))}</button>
                </div>
              </div>
            `
          }).join('')}
        </div>
      ` : ''}
      <div class="ai-note" style="margin-top:10px">${t('marriageNote')}</div>
    </div>
  `

  main.querySelectorAll('[data-mpref]').forEach(b => {
    b.onclick = async () => {
      S.marriagePref = b.dataset.mpref || ''
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-mpropose]').forEach(b => {
    b.onclick = async () => {
      const f = S.friends[Number(b.dataset.mpropose)]
      if (!f) return
      const okGo = await confirmModal(t('confirmPropose') + ' ' + f.name + ' ' + proposeWord(pack) + t('confirmPropose2'), { title: '💍 ' + proposeWord(pack) })
      if (!okGo) return
      const res = propose(S, f, pack)
      if (res && res.code === 'low_favor') {
        api.startFlow(
          t('proposeRejectFlow'),
          t('youPropose') + ' ' + f.name + ' ' + proposeWord(pack) + '，' + t('proposeRejectWhy') + '（' + t('favor') + ' ' + fmtNum(res.favor || 0) + '/' + fmtNum(res.need || 50) + '）。' + t('proposeRejectAsk')
        )
      } else if (res && res.ok) {
        api.startFlow(
          t('proposeAcceptFlow'),
          t('youPropose') + ' ' + f.name + ' ' + proposeWord(pack) + '，' + t('proposeAcceptWhy') + '。' + t('proposeAcceptAsk')
        )
      } else {
        api.toast(res.msg)
      }
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-mdiv]').forEach(b => {
    b.onclick = async () => {
      const f = spouses[Number(b.dataset.mdiv)]
      if (!f) return
      const okGo = await confirmModal(t('confirmDivorce') + ' ' + f.name + ' ' + divorceWord(pack) + t('confirmPropose2'), { title: divorceWord(pack) })
      if (!okGo) return
      const res = divorce(S, f, pack)
      api.toast(res.msg)
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-npcinfo]').forEach(b => {
    b.onclick = async () => {
      const name = b.dataset.npcinfo
      const friend = (S.friends || []).find(x => x.name === name)
      if (!friend) return
      openModal(`
        <h2>${esc(friend.name)}</h2>
        <div class="row"><span>${t('favor')}</span><span class="v">${fmtNum(friend.favor || 0)}</span></div>
        ${friend.mem ? `<div class="cdim">${t('mem')}${esc(friend.mem)}</div>` : ''}
        <div class="btn-row"><button class="btn" data-close type="button">${t('close')}</button></div>
      `)
    }
  })
}

export function renderQuests(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const quests = S.quests || []
  const active = quests.filter(q => q.status === 'active')
  const done = quests.filter(q => q.status === 'done')
  const failed = quests.filter(q => q.status === 'failed')
  const card = (q) => `
    <div class="card" style="margin-bottom:8px">
      <div class="cname">${esc(q.title)} <span class="ctype">${questStatusLabel(q.status)}</span></div>
      ${q.from ? `<div class="crealm">${t('questGiver')}${esc(q.from)}${q.loc ? ' · 📍' + esc(q.loc) : ''}</div>` : (q.loc ? `<div class="crealm">📍 ${esc(q.loc)}</div>` : '')}
      ${q.desc ? `<div class="cdesc">${esc(q.desc)}</div>` : ''}
      ${(q.objectives || []).length ? `<div class="cdim">${t('objectives')}${q.objectives.map(o => esc(o)).join('；')}</div>` : ''}
      ${q.reward ? `<div class="cdim">${t('rewardLabel')}${esc(q.reward)}</div>` : ''}
      ${q.notes ? `<div class="cdim">${t('progressLabel')}${esc(q.notes)}</div>` : ''}
    </div>
  `
  main.innerHTML = `
    <div class="panel">
      <h3>📜 ${t('questsTitle')}</h3>
      ${active.length
        ? active.map(card).join('')
        : `<div class="empty">${t('noQuests')}</div>`}
      ${done.length ? `<h4 style="margin-top:12px">${t('doneN2')} ${done.length}</h4>` + done.map(card).join('') : ''}
      ${failed.length ? `<h4 style="margin-top:12px">${t('failedN2')} ${failed.length}</h4>` + failed.map(card).join('') : ''}
      <div class="ai-note" style="margin-top:10px">${t('questNote')}</div>
    </div>
  `
  void pack
  void api
}

export function renderBag(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.bag)} <span class="tag">${S.inventory.length} ${t('typesN')}</span></h3>
      ${S.inventory.map((it, i) => {
        const type = normalizeType(it.type)
        return `
          <div class="bag-item" style="margin-bottom:8px">
            <div class="bicon">${type === 'consumable' ? '🧪' : type === 'equip' ? '🗡️' : type === 'technique' ? '📜' : type === 'material' ? '📦' : '🎁'}</div>
            <div class="bmain">
              <div class="bname">${esc(it.name)} ${itemChip(S, it, pack)} <span class="bcount">×${it.count || 1}</span></div>
              <div class="bdesc">${esc(it.desc || '')}</div>
              ${it.price != null ? `<div class="cdim">${t('value')} ${fmtNum(it.price)} ${esc(pack.lexicon.money.main)}</div>` : ''}
            </div>
            <div class="bbtns">
              ${it.usable === 'direct' ? `<button class="btn btn-sm btn-gold" data-use="${i}" type="button">${t('useBtn')}</button>` : ''}
              ${it.usable === 'ai' ? `<button class="btn btn-sm" data-useai="${i}" type="button">${t('aiBtn')}</button>` : ''}
              ${normalizeType(it.type) === 'equip' ? `<button class="btn btn-sm ${it.equipped ? 'btn-gold' : ''}" data-equip="${i}" type="button">${it.equipped ? t('unequipBtn') : t('equipBtn')}</button>` : ''}
              ${normalizeType(it.type) === 'equip' && it.equipped && (it.grade == null || it.realm_index == null) ? `<span class="ctype" title="${t('noBonusHint')}">${t('noBonus')}</span>` : ''}
              ${normalizeType(it.type) === 'technique' ? `<button class="btn btn-sm" data-learn="${i}" type="button">${t('learnBtn')}</button>` : ''}
              <button class="btn btn-sm" data-sell="${i}" type="button">${t('sellBtn')}</button>
            </div>
          </div>
        `
      }).join('') || `<div class="empty">${t('emptyBag')}</div>`}
    </div>
  `
  main.querySelectorAll('[data-equip]').forEach(b => {
    b.onclick = async () => {
      const i = Number(b.dataset.equip)
      const it = S.inventory[i]
      if (!it) return
      ensureEquipFlags(S)
      const res = toggleEquip(S, it)
      if (res.msg) api.toast(res.msg)
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-use]').forEach(b => {
    b.onclick = async () => {
      const i = Number(b.dataset.use)
      const it = S.inventory[i]
      if (!it) return
      // 优先走标准 use_effect；消耗品且带等级时给进度
      let handled = false
      if (it.use_effect) {
        const r = useDirectItem(S, it)
        if (r.ok) { api.toast(r.msg); handled = true }
      }
      if (!handled && normalizeType(it.type) === 'consumable' && it.realm_index != null) {
        const eff = consumableEffect(S, it)
        S.progress += eff
        api.toast(`${it.name}：${pack.lexicon.progress} +${fmtNum(eff)}`)
        handled = true
      }
      if (!handled) { api.toast(t('noEffect')); return }
      it.count = (it.count || 1) - 1
      if (it.count <= 0) S.inventory.splice(i, 1)
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-learn]').forEach(b => {
    b.onclick = async () => {
      const i = Number(b.dataset.learn)
      const it = S.inventory[i]
      if (!it) return
      const data = sanitizeManualData(S, {
        realm_index: it.realm_index != null ? it.realm_index : S.tierIndex,
        levels: it.levels,
        level_costs: it.level_costs,
        level_powers: it.level_powers
      })
      const rec = {
        name: it.name,
        realm_index: it.realm_index != null ? it.realm_index : S.tierIndex,
        grade: it.grade || data.grade,
        levels: data.levels,
        level_costs: data.level_costs,
        level_powers: data.level_powers,
        level: 0,
        desc: manualDesc(S, {
          realm_index: it.realm_index != null ? it.realm_index : S.tierIndex,
          grade: it.grade || data.grade,
          levels: data.levels,
          level_costs: data.level_costs,
          level_powers: data.level_powers
        })
      }
      if ((S.techniques || []).some(m => m.name === rec.name && m.realm_index === rec.realm_index)) {
        api.toast(t('alreadyKnown'))
        return
      }
      S.techniques = S.techniques || []
      S.techniques.push(rec)
      forgetOldTechniques(S, t => api.toast(t))
      it.count = (it.count || 1) - 1
      if (it.count <= 0) S.inventory.splice(i, 1)
      api.toast(t('learnOkA') + rec.name + t('learnOkB'))
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-useai]').forEach(b => {
    b.onclick = async () => {
      const it = S.inventory[Number(b.dataset.useai)]
      api.startFlow(t('useItemFlow'), t('youUse') + it.name + t('youUse2') + (it.desc || ''))
    }
  })
  main.querySelectorAll('[data-sell]').forEach(b => {
    // sell-guards

    b.onclick = async () => {
      const i = Number(b.dataset.sell)
      const it = S.inventory[i]
      if (!it) return
      const gain = Math.floor((Number(it.price) || 0) * 0.5)
      if (it.equipped) {
        if (!(await confirmModal('「' + it.name + '」' + t('soldEq')))) return
      } else if (gain <= 0) {
        if (!(await confirmModal('「' + it.name + '」' + t('discardQ')))) return
      } else if (!(await confirmModal(t('sellQ1') + ' ' + it.name + t('sellQ2') + ' ' + gain + t('sellQ3')))) {
        return
      }
      S.money.main += gain
      normalizeMoney(S)
      if (it.equipped) it.equipped = false
      it.count = (it.count || 1) - 1
      if (it.count <= 0) S.inventory.splice(i, 1)
      api.toast(t('soldA') + ' ' + it.name + '，+' + fmtNum(gain) + ' ' + pack.lexicon.money.main)
      api.save()
      api.refreshAll()
    }
  })
}

export function renderSettings(app, api) {
  const S = app.S
  if (!S) return
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.settings)}</h3>
      <h4>${t('storyLang')}</h4>
      <div class="btn-row">
        ${LANGUAGE_OPTIONS.map(l => `
          <button class="btn btn-sm ${(S.lang || 'zh-CN') === l.id ? 'btn-gold' : ''}" data-lang="${l.id}" type="button">${esc(uiLangName(l.id))}</button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--faint);margin-bottom:6px">${t('storyLangHint')}</div>

      <h4>${t('aiStyle')}</h4>
      <div class="btn-row">
        ${AI_STYLE_ORDER.map(k => `
          <button class="btn btn-sm ${S.aiStyle === k ? 'btn-gold' : ''}" data-style="${k}" type="button">${AI_STYLES[k].name}</button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:6px">${esc(AI_STYLES[S.aiStyle] ? AI_STYLES[S.aiStyle].desc : '')}</div>

      <h4>${t('gender')}</h4>
      <div class="btn-row">
        ${PLAYER_GENDERS.map(g => `
          <button class="btn btn-sm ${S.playerGender === g.v ? 'btn-gold' : ''}" data-gender="${g.v}" type="button">${g.name}</button>
        `).join('')}
      </div>

      <h4>${t('dialogLimit')}</h4>
      <div style="font-size:12px;color:var(--faint);margin-bottom:4px">${t('dialogLimitOn')}</div>
      <div class="btn-row">
        <button class="btn btn-sm ${S.dialogLimit ? 'btn-gold' : ''}" data-limit="1" type="button">${t('on')}</button>
        <button class="btn btn-sm ${!S.dialogLimit ? 'btn-gold' : ''}" data-limit="0" type="button">${t('off')}</button>
      </div>

      <h4>${t('bgm')}</h4>
      <div class="bgm-group-label">${t('builtin')}</div>
      <div class="btn-row">
        ${allBgmTracks().filter(t => !t.custom).map(t => `
          <button class="btn btn-sm ${(S.bgmTrack || '') === t.id ? 'btn-gold' : ''}" data-bgm="${t.id}" type="button">${esc(t.name)}${(S.bgmTrack || '') === t.id ? ' ●' : ''}</button>
        `).join('')}
      </div>
      ${allBgmTracks().some(t => t.custom) ? `
      <div class="bgm-group-label" style="margin-top:8px">${t('custom')}</div>
      <div class="btn-row">
        ${allBgmTracks().filter(t => t.custom).map(t => `
          <button class="btn btn-sm ${(S.bgmTrack || '') === t.id ? 'btn-gold' : ''}" data-bgm="${t.id}" type="button">${esc(t.name)}${(S.bgmTrack || '') === t.id ? ' ●' : ''}</button>
          <button class="btn btn-sm btn-danger" data-bgm-del="${esc(t.id)}" type="button">×</button>
        `).join('')}
      </div>` : ''}
      <div class="btn-row" style="margin-top:6px">
        <button class="btn btn-sm" id="bgm-add" type="button">➕ ${t('localMusic')}</button>
        <input id="bgm-file" type="file" accept=".mp3,.wav,.ogg,.m4a,.mid,.midi" multiple hidden>
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:4px">${t('localMusicHint')}</div>

      <h4>API</h4>
      <div class="btn-row">
        <button class="btn" id="set-key" type="button">🔑 ${t('switchApiKey')}</button>
        <button class="btn" id="set-help" type="button">📖 ${t('help')}</button>
      </div>

      <h4>${t('saves')}</h4>
      <div class="btn-row">
        <button class="btn" id="set-export" type="button">${t('exportSave')}</button>
        <button class="btn" id="set-import" type="button">${t('importSave')}</button>
        <input id="set-import-file" type="file" accept=".json,application/json" hidden>
        <button class="btn btn-danger" id="set-reset" type="button">${t('resetSave')}</button>
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:8px">
        ${t('curWorld')}${esc(pack.name)} · ${t('saveVer')} v${S.version}<br>
        ${t('keyKeepHint')}
      </div>
    </div>
  `

  main.querySelectorAll('[data-lang]').forEach(b => {
    b.onclick = async () => {
      S.lang = b.dataset.lang
      api.save()
      api.refreshAll()
      try {
        if (typeof window !== 'undefined' && window.__AW_LANG__) window.__AW_LANG__(b.dataset.lang)
      } catch (e) { /* ignore */ }
    }
  })
  main.querySelectorAll('[data-style]').forEach(b => {
    b.onclick = async () => { S.aiStyle = b.dataset.style; api.save(); api.refreshAll() }
  })
  main.querySelectorAll('[data-gender]').forEach(b => {
    b.onclick = async () => { S.playerGender = b.dataset.gender; api.save(); api.refreshAll() }
  })
  main.querySelectorAll('[data-limit]').forEach(b => {
    b.onclick = async () => { S.dialogLimit = b.dataset.limit === '1'; api.save(); api.refreshAll() }
  })
  main.querySelectorAll('[data-bgm]').forEach(b => {
    b.onclick = async () => {
      S.bgmTrack = b.dataset.bgm
      playBgm(S.bgmTrack)
      api.save()
      api.refreshAll()
    }
  })
  const bgmAdd = document.getElementById('bgm-add')
  const bgmFile = document.getElementById('bgm-file')
  if (bgmAdd && bgmFile) {
    bgmAdd.onclick = () => bgmFile.click()
    bgmFile.onchange = async (e) => {
      const added = await addLocalBgmFiles(e.target.files)
      e.target.value = ''
      if (added.length) {
        api.toast(t('addedMusic') + ' ' + added.length + t('songs'))
        api.refreshAll()
      } else {
        api.toast(t('noMusicAdded'))
      }
    }
  }
  main.querySelectorAll('[data-bgm-del]').forEach(b => {
    b.onclick = async () => {
      await removeLocalBgm(b.dataset.bgmDel)
      if (S.bgmTrack === b.dataset.bgmDel) {
        S.bgmTrack = ''
        api.save()
      }
      api.refreshAll()
    }
  })
  document.getElementById('set-key').onclick = () => {
    import('./settings-panels.js').then(m => m.openKeyModal(app, { save: api.save, refreshAll: api.refreshAll }))
  }
  document.getElementById('set-help').onclick = () => openHelp(app)
  document.getElementById('set-export').onclick = () => {
    import('../engine/state.js').then(m => {
      const bundle = m.exportSaveBundle()
      const n = Object.keys(bundle.slots || {}).length
      if (!n) { api.toast(t('exportNoSave')); return }
      const fname = 'agentworlds-saves-' + new Date().toISOString().slice(0, 10) + '.json'
      const text = JSON.stringify(bundle, null, 2)
      const finish = (where) => {
        openModal(`
          <h2>${t('exportedTitle')}</h2>
          <div style="margin:8px 0">${t('exportedN')}${n}${t('worldSaves')}</div>
          <div class="warn" style="word-break:break-all">${where}</div>
          <div style="font-size:12px;color:var(--faint);margin:8px 0">${t('exportedNoKey')}</div>
          <div class="btn-row">
            <button class="btn" data-close type="button">${t('ok')}</button>
          </div>
        `)
        api.toast(t('exported'))
      }
      // Electron / Android：写入并回报真实路径
      const host = globalThis.awHost
      if (host && host.save && typeof host.save.saveText === 'function') {
        Promise.resolve(host.save.saveText('AgentWorlds/' + fname, text)).then(res => {
          if (res && res.ok) finish(`${t('exportedPath')}${res.path || res}`)
          else finish(`${t('testFail')}${(res && res.error) || 'save failed'}`)
        }).catch(() => finish(`${t('testFail')}saveText exception`))
        return
      }
      // 浏览器：触发下载；WebView 可能被拦截，明确提示
      try {
        const blob = new Blob([text], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fname
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
          URL.revokeObjectURL(a.href)
          a.remove()
        }, 3000)
        finish(`${t('exportedInBrowser')}（${fname}）。若文件管理器无此文件，请改用桌面版导出或系统分享。`)
      } catch (e) {
        finish(`${t('testFail')}${(e && e.message) || 'download failed'}`)
      }
    })
  }
  document.getElementById('set-import').onclick = () => {
    // 主线程只信用户在文件框里的选择；裸 click 在打包后可能被拦截而静默无反应
    const inp = document.getElementById('set-import-file')
    try {
      if (typeof inp.showPicker === 'function') { inp.showPicker(); return }
    } catch (e) { /* 回退 click */ }
    inp.click()
    // 双保险：pick/click 均未弹框时给出提示而非无声失败
    clearTimeout(bindSettings._importHint)
    bindSettings._importHint = setTimeout(() => {
      if (!document.getElementById('set-import-file')) return
      if (!bindSettings._importPicked) api.toast(t('importNoDialog'))
    }, 1200)
  }
  document.getElementById('set-import-file').addEventListener('click', (e) => {
    // 用户确实看到并触碰了文件框 → 不再提示
    bindSettings._importPicked = true
    clearTimeout(bindSettings._importHint)
  })
  document.getElementById('set-import-file').onchange = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result || ''))
        import('../engine/state.js').then(m => {
          const r = m.importSaveBundle(bundle)
          if (!r.ok) { api.toast(r.error || t('importFail')); return }
          api.toast(t('imported') + ' ' + r.count + t('worldSaves'))
          api.refreshAll()
        })
      } catch (err) {
        api.toast(t('jsonFail'))
      }
    }
    reader.readAsText(f, 'utf-8')
    e.target.value = ''
    bindSettings._importPicked = false
  }
  document.getElementById('set-reset').onclick = () => {
    openModal(`
      <h2>${t('resetTitle')}</h2>
      <div class="warn">${t('resetWarnA')}${esc(pack.name)}${t('resetWarnB')}</div>
      <div class="btn-row">
        <button class="btn" data-close type="button">${t('cancel')}</button>
        <button class="btn btn-danger" id="do-reset" type="button">${t('confirmReset')}</button>
      </div>
    `)
    document.getElementById('do-reset').onclick = () => {
      import('../engine/state.js').then(m => {
        // 删档 + 换新档 + 全量刷新；全程不 reload，打包后 location.reload 可能整页白屏
        m.resetSaveKeepMeta(S.worldview)
        const name = S.name
        const world = S.worldview
        app.S = m.newGame(name, world)
        api.save()
        api.refreshAll()
        api.toast(t('resetDone'))
      })
    }
  }
}
