// 各 Tab 渲染
import { esc, fmtNum, ageLabelShort } from '../engine/util.js'
import {
  tierLabel, tierColor, playerCultReq, isLifeExpired
} from '../engine/progression.js'
import { totalPowerF, powerBreakdown, consumableEffect } from '../engine/power.js'
import { curLoc, travel, gateReason, travelDays } from '../engine/map.js'
import { skillLabel } from '../engine/skills.js'
import { addItem, normalizeType, typeName, itemChip, useDirectItem } from '../engine/inventory.js'
import { packUi, packFeatures, sceneActionsOf } from '../engine/pack-ui.js'
import { sanitizeManualData, manualDesc, forgetOldTechniques } from '../engine/techniques.js'
import { relationLines } from '../engine/npc-memory.js'
import { questMarkers, questStatusLabel } from '../engine/quests.js'

function relBlock(person) {
  const lines = relationLines(person)
  if (!lines.length) return ''
  return '<div class="cdim">' + lines.map(l => esc(l)).join('<br>') + '</div>'
}
import { AI_STYLES, AI_STYLE_ORDER, PLAYER_GENDERS, MAX_TALK_PER_DAY } from '../engine/constants.js'
import { allBgmTracks, addLocalBgmFiles, removeLocalBgm, playBgm } from './bgm.js'
import { runEventTurn, endEvent } from '../engine/event.js'
import { openModal } from './modals.js'
import { openHelp } from './settings-panels.js'

export function renderScene(app, api) {
  const S = app.S
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const loc = curLoc(S) || { name: '未知', world: '', continent: '', type: '', desc: '', people: [], shop: [], beasts: [], interactables: [], notes: [] }
  const EV = app.EV

  let evHtml = ''
  if (EV) {
    if (EV.loading && !EV.resultText) {
      evHtml = `<div class="ev-box"><div class="ev-head"><span>AI 叙事中</span><span class="loading-dot">●●●</span></div>
        <div class="ev-text">正在生成……</div></div>`
    } else if (EV.resultText) {
      const opts = (EV.options || []).map((o, i) =>
        `<button class="btn ev-opt" data-opt="${i}" type="button">${i + 1}. ${esc(o)}</button>`
      ).join('')
      evHtml = `
        <div class="ev-box">
          <div class="ev-head">
            <span>${esc(EV.kind || '事件')} · 第 ${EV.count} 轮</span>
            <span><button class="btn btn-sm" id="ev-end" type="button">结束事件</button></span>
          </div>
          <div class="ev-text">${esc(EV.resultText)}</div>
          ${EV.error ? `<div class="ev-head" style="color:var(--red);margin-top:8px">${esc(EV.error)}</div>` : ''}
          ${EV.loading ? `<div class="ev-text loading-dot" style="margin-top:8px">生成中…</div>` : opts}
          ${!EV.loading && (!EV.options || !EV.options.length) ? `<div class="btn-row"><button class="btn" id="ev-close" type="button">关闭</button></div>` : ''}
          <div class="ev-input-row">
            <div class="ev-label-row"><span style="color:var(--dim);font-size:12px">自由行动</span></div>
            <input class="ev-input" id="ev-free" type="text" placeholder="描述你想做的事…" ${EV.loading ? 'disabled' : ''}>
            <div class="btn-row"><button class="btn btn-gold btn-sm" id="ev-send" type="button" ${EV.loading ? 'disabled' : ''}>发送</button></div>
          </div>
          <div class="ai-note">剧情由 AI 实时合成，可能存在虚构或错误</div>
        </div>`
    } else if (EV.error) {
      evHtml = `<div class="ev-box"><div class="ev-head" style="color:var(--red)">${esc(EV.error)}</div>
        <div class="btn-row">
          <button class="btn" id="ev-retry" type="button">重试</button>
          <button class="btn" id="ev-close" type="button">关闭</button>
        </div></div>`
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
        ${actions.map(a => `<button class="btn" data-act="${a.id}" type="button">${a.label}</button>`).join('')}
      </div>
    </div>
    ${evHtml}
    <div class="panel">
      <h3>场景中的人</h3>
      <div class="grid">
        ${(loc.people || []).map(p => `
          <div class="card">
            <div class="cname">${esc(p.name)}</div>
            <div class="crealm">${esc(p.realm || p.rank || '')}</div>
            <div class="cdesc">${esc(p.intro || '')}</div>
            ${relBlock(p)}
            <div class="cbtn"><button class="btn btn-sm" data-talk="${esc(p.name)}" type="button">${esc(pack.ui && pack.ui.talkBtn || '交谈')}</button></div>
          </div>
        `).join('') || '<div class="empty">此处无人</div>'}
      </div>
    </div>
    <div class="panel">
      <h3>附近威胁</h3>
      <div class="grid">
        ${(loc.beasts || []).map(b => `
          <div class="card">
            <div class="cname">${esc(b.name)}</div>
            <div class="crealm">${esc(b.realm || '')} · ${esc(ui.powerLabel)} ${fmtNum(b.power || 0)}</div>
            <div class="cdim">掉落：${esc(b.drops || '无')}</div>
            <div class="cbtn"><button class="btn btn-sm btn-danger" data-hunt="${esc(b.name)}" type="button">${esc(pack.ui && pack.ui.fightBtn || '挑战')}</button></div>
          </div>
        `).join('') || '<div class="empty">暂无明显威胁</div>'}
      </div>
    </div>
    ${(loc.shop || []).length ? `
    <div class="panel">
      <h3>此处交易</h3>
      ${(loc.shop || []).map((it, idx) => `
        <div class="shop-row">
          <span class="sname">${esc(it.name)}</span>
          <span class="sdesc">${esc(it.desc || '')}</span>
          <span class="ctype">${esc(typeName(S, it.type, pack))}</span>
          <span class="sprice">${fmtNum(it.price || 0)} ${esc(pack.lexicon.money.main)}</span>
          <button class="btn btn-sm" data-buy="${idx}" type="button">购买</button>
        </div>
      `).join('')}
    </div>` : ''}
    ${(loc.interactables || []).length ? `
    <div class="panel">
      <h3>可交互</h3>
      ${(loc.interactables || []).map((x, i) => `
        <div class="shop-row">
          <span class="sname">${esc(x.name)}</span>
          <span class="sdesc">${esc(x.intro || '')}</span>
          <button class="btn btn-sm" data-inter="${i}" type="button">查看</button>
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
    b.onclick = () => contEvent(app, api, `我与「${b.dataset.talk}」交谈。`)
  })
  main.querySelectorAll('[data-hunt]').forEach(b => {
    b.onclick = () => contEvent(app, api, `我挑战「${b.dataset.hunt}」！`)
  })
  main.querySelectorAll('[data-inter]').forEach(b => {
    b.onclick = () => {
      const x = loc.interactables[Number(b.dataset.inter)]
      contEvent(app, api, `我查看/互动「${x.name}」：${x.intro || ''}`)
    }
  })
  main.querySelectorAll('[data-buy]').forEach(b => {
    b.onclick = () => {
      const it = loc.shop[Number(b.dataset.buy)]
      if (S.money.main < (it.price || 0)) {
        api.toast(pack.lexicon.money.main + '不足')
        return
      }
      S.money.main -= it.price || 0
      addItem(S, it, 1)
      api.save()
      api.toast(`购得 ${esc(it.name)}`)
      api.refreshAll()
    }
  })

  main.querySelectorAll('[data-opt]').forEach(b => {
    b.onclick = () => {
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
  const endB = document.getElementById('ev-end')
  const closeB = document.getElementById('ev-close')
  const retryB = document.getElementById('ev-retry')
  const finish = () => { endEvent(app.EV); app.EV = null; api.refreshAll() }
  if (endB) endB.onclick = finish
  if (closeB) closeB.onclick = finish
  if (retryB) retryB.onclick = () => {
    const last = [...(app.EV.history || [])].reverse().find(m => m.role === 'user')
    const text = last ? last.content : '继续。'
    app.EV.error = ''
    contEvent(app, api, text, true)
  }
}

function contEvent(app, api, content, isRetry) {
  if (!app.EV || app.EV.ended || isRetry) {
    if (app.EV && isRetry) {
      // keep history, just re-run
      const ev = app.EV
      ev.loading = true
      ev.error = ''
      runEventTurn(app.S, ev, content, {
        limitOn: app.S.dialogLimit,
        cheatUnlocked: app.cheatUnlocked,
        onState: () => { if (app.EV === ev) api.refreshAll() },
        onDone: (e, brief) => {
          api.save()
          if (brief && brief.major && brief.major.length) api.toast(brief.major.map(m => '⭐ ' + esc(m)).join('<br>'))
          api.refreshAll()
        }
      })
      api.refreshAll()
      return
    }
    api.startFlow('自由行动', content)
    return
  }
  // 继续当前事件
  const ev = app.EV
  runEventTurn(app.S, ev, content, {
    limitOn: app.S.dialogLimit,
    cheatUnlocked: app.cheatUnlocked,
    onState: () => { if (app.EV === ev) api.refreshAll() },
    onDone: (e, brief) => {
      api.save()
      if (brief && brief.major && brief.major.length) api.toast(brief.major.map(m => '⭐ ' + esc(m)).join('<br>'))
      else if (brief && brief.minor && brief.minor.length) api.toast(brief.minor.slice(0, 4).map(esc).join(' · '))
      api.refreshAll()
    }
  })
  ev.loading = true
  api.refreshAll()
}

export function renderMap(app, api) {
  const S = app.S
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const markers = questMarkers(S)
  const worlds = pack.worlds || []
  const byWorld = {}
  for (const l of S.map) {
    const w = l.world || '主世界'
    byWorld[w] = byWorld[w] || {}
    const c = l.continent || '未知'
    byWorld[w][c] = byWorld[w][c] || []
    byWorld[w][c].push(l)
  }

  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.map)}</h3>
      <div class="loc-desc">当前所在：<b style="color:var(--accent)">${esc((curLoc(S) || {}).name || '')}</b></div>
      ${worlds.map(w => `
        <div class="world-sec">
          <div class="world-title map-h" data-w="${esc(w)}"><span>${esc(w)}</span><span class="tag">▾</span></div>
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
                      <div class="cname">${esc(l.name)} ${cur ? '· 当前' : ''}${markers.get(l.name) ? ' <span class="ctype">📜任务</span>' : ''}</div>
                      <div class="cdim">${esc(l.type)} · 约 ${days} 天${markers.get(l.name) ? ' · ' + esc(markers.get(l.name).join('、')) : ''}</div>
                      <div class="cdesc">${esc(l.desc || '')}</div>
                      ${gate ? `<div class="lock">🔒 ${esc(gate)}</div>` : ''}
                    </div>
                    ${cur ? '' : `<button class="btn btn-sm" data-go="${esc(l.name)}" type="button" ${gate ? 'disabled' : ''}>前往</button>`}
                  </div>
                `
              }).join('')}
            `).join('') || '<div class="empty">无地点</div>'}
          </div>
        </div>
      `).join('')}
    </div>
  `

  main.querySelectorAll('.map-h').forEach(h => {
    h.onclick = () => {
      const body = main.querySelector(`[data-wbody="${CSS.escape(h.dataset.w)}"]`)
      if (body) body.classList.toggle('hide')
    }
  })
  main.querySelectorAll('[data-go]').forEach(b => {
    b.onclick = () => {
      const r = travel(S, b.dataset.go)
      if (!r.ok) { api.toast(esc(r.msg)); return }
      if (app.EV) { endEvent(app.EV); app.EV = null }
      api.save()
      api.centerToast(esc(r.msg))
      api.refreshAll()
      api.setTab('scene')
    }
  })
}

export function renderProfile(app, api) {
  const S = app.S
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
        <span style="color:var(--dim)">年龄</span><b>${ageLabelShort(S.ageDays)}</b>
      </div>
      <div class="row" style="display:flex;justify-content:space-between">
        <span style="color:var(--dim)">${esc(ui.powerLabel)}</span><b>${fmtNum(totalPowerF(S))}</b>
      </div>
      <div class="row" style="display:flex;justify-content:space-between">
        <span style="color:var(--dim)">声望</span><b>${fmtNum(S.factionRep || 0)}</b>
      </div>
      <h4>${esc(ui.powerLabel)}构成</h4>
      <div class="skill-row"><span class="k">基础</span><span class="v">${fmtNum(bd.base)}</span></div>
      <div class="skill-row"><span class="k">装备</span><span class="v">${fmtNum(bd.art)}</span></div>
      <div class="skill-row"><span class="k">${esc(pack.lexicon.technique)}</span><span class="v">${fmtNum(bd.manual)}</span></div>
      <div class="skill-row"><span class="k">关系</span><span class="v">${fmtNum(bd.spouse)}</span></div>
      <h4>${esc(pack.lexicon.skill)}</h4>
      ${(pack.skills || []).map(sk => `
        <div class="skill-row"><span class="k">${esc(sk.name)}</span><span class="v">${esc(skillLabel(S, sk, S.skills[sk.id] || 0))}</span></div>
      `).join('')}
      <h4>${esc(pack.lexicon.technique)}</h4>
      ${(S.techniques || []).length
        ? S.techniques.map(m => `<div class="skill-row"><span class="k">${esc(m.name)}</span><span class="v">${m.level}/${m.levels} · ${esc(m.grade || '')}</span></div>`).join('')
        : '<div class="empty">尚未习得</div>'}
      <h4>已知 ${esc(pack.lexicon.level)}表</h4>
      <div style="font-size:12px;color:var(--dim);line-height:1.8">
        ${pack.tiers.map((t, i) => `<span style="color:${i === S.tierIndex ? 'var(--accent)' : 'inherit'}">${i + 1}.${esc(t.name)}</span>`).join(' · ')}
      </div>
    </div>
  `
}

export function renderFriends(app, api) {
  const S = app.S
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.friends)}</h3>
      <div class="btn-row">
        <button class="btn" id="fr-new" type="button">✨ 结识新${esc(pack.lexicon.companion)}</button>
      </div>
      <div class="grid" style="margin-top:12px">
        ${(S.friends || []).map((f, i) => `
          <div class="card">
            <div class="cname">${esc(f.name)} ${f.gender ? `<span class="ctype">${esc(f.gender)}</span>` : ''}</div>
            <div class="crealm">${esc(f.realm || '')} · 好感 ${fmtNum(f.favor || 0)}</div>
            <div class="cdesc">${esc(f.intro || '')}</div>
            ${f.mem ? `<div class="cdim">记忆：${esc(f.mem)}</div>` : ''}
            ${relBlock(f)}
            <div class="cbtn">
              <button class="btn btn-sm" data-chat="${i}" type="button">交谈</button>
              ${f.married ? `<span class="ctype">${f.married === 'wife' ? '伴侣' : '次要'}</span>` : ''}
            </div>
          </div>
        `).join('') || '<div class="empty">尚无同伴，去场景中结识吧</div>'}
      </div>
      <div class="ai-note">每天最多与同一位${esc(pack.lexicon.companion)}交谈 ${MAX_TALK_PER_DAY} 次</div>
    </div>
  `
  const nb = document.getElementById('fr-new')
  if (nb) nb.onclick = () => api.startFlow('结识', `我想要结识一位新的${pack.lexicon.companion}。`)
  main.querySelectorAll('[data-chat]').forEach(b => {
    b.onclick = () => {
      const f = S.friends[Number(b.dataset.chat)]
      api.startFlow('交谈', `我与「${f.name}」交谈。背景：${f.intro || ''}。记忆：${f.mem || '无'}`)
    }
  })
}

export function renderQuests(app, api) {
  const S = app.S
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  const quests = S.quests || []
  const active = quests.filter(q => q.status === 'active')
  const done = quests.filter(q => q.status === 'done')
  const failed = quests.filter(q => q.status === 'failed')
  const card = (q) => `
    <div class="card" style="margin-bottom:8px">
      <div class="cname">${esc(q.title)} <span class="ctype">${questStatusLabel(q.status)}</span></div>
      ${q.from ? `<div class="crealm">委托人：${esc(q.from)}${q.loc ? ' · 📍' + esc(q.loc) : ''}</div>` : (q.loc ? `<div class="crealm">📍 ${esc(q.loc)}</div>` : '')}
      ${q.desc ? `<div class="cdesc">${esc(q.desc)}</div>` : ''}
      ${(q.objectives || []).length ? `<div class="cdim">目标：${q.objectives.map(o => esc(o)).join('；')}</div>` : ''}
      ${q.reward ? `<div class="cdim">奖励：${esc(q.reward)}</div>` : ''}
      ${q.notes ? `<div class="cdim">进度：${esc(q.notes)}</div>` : ''}
    </div>
  `
  main.innerHTML = `
    <div class="panel">
      <h3>📜 任务 / 委托</h3>
      ${active.length
        ? active.map(card).join('')
        : '<div class="empty">暂无进行中的委托，可在剧情里接取</div>'}
      ${done.length ? `<h4 style="margin-top:12px">已完成 ${done.length}</h4>` + done.map(card).join('') : ''}
      ${failed.length ? `<h4 style="margin-top:12px">失败 ${failed.length}</h4>` + failed.map(card).join('') : ''}
      <div class="ai-note" style="margin-top:10px">带 📍 的委托会在地图标点；开放世界无强制时限，随时可推进。</div>
    </div>
  `
  void pack
  void api
}

export function renderBag(app, api) {
  const S = app.S
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.bag)} <span class="tag">${S.inventory.length} 类</span></h3>
      ${S.inventory.map((it, i) => {
        const type = normalizeType(it.type)
        return `
          <div class="bag-item" style="margin-bottom:8px">
            <div class="bicon">${type === 'consumable' ? '🧪' : type === 'equip' ? '🗡️' : type === 'technique' ? '📜' : type === 'material' ? '📦' : '🎁'}</div>
            <div class="bmain">
              <div class="bname">${esc(it.name)} ${itemChip(S, it, pack)} <span class="bcount">×${it.count || 1}</span></div>
              <div class="bdesc">${esc(it.desc || '')}</div>
              ${it.price != null ? `<div class="cdim">价值 ${fmtNum(it.price)} ${esc(pack.lexicon.money.main)}</div>` : ''}
            </div>
            <div class="bbtns">
              ${it.usable === 'direct' ? `<button class="btn btn-sm btn-gold" data-use="${i}" type="button">使用</button>` : ''}
              ${it.usable === 'ai' ? `<button class="btn btn-sm" data-useai="${i}" type="button">AI 互动</button>` : ''}
              ${normalizeType(it.type) === 'technique' ? `<button class="btn btn-sm" data-learn="${i}" type="button">研习</button>` : ''}
              <button class="btn btn-sm" data-sell="${i}" type="button">出售</button>
            </div>
          </div>
        `
      }).join('') || '<div class="empty">背包空空如也</div>'}
    </div>
  `
  main.querySelectorAll('[data-use]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.use)
      const it = S.inventory[i]
      if (!it) return
      // 优先走标准 use_effect；消耗品且带等级时给进度
      let handled = false
      if (it.use_effect) {
        const r = useDirectItem(S, it)
        if (r.ok) { api.toast(esc(r.msg)); handled = true }
      }
      if (!handled && normalizeType(it.type) === 'consumable' && it.realm_index != null) {
        const eff = consumableEffect(S, it)
        S.progress += eff
        api.toast(`${esc(it.name)}：${esc(pack.lexicon.progress)} +${fmtNum(eff)}`)
        handled = true
      }
      if (!handled) { api.toast('使用后暂无效果'); return }
      it.count = (it.count || 1) - 1
      if (it.count <= 0) S.inventory.splice(i, 1)
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-learn]').forEach(b => {
    b.onclick = () => {
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
        api.toast('已经会了')
        return
      }
      S.techniques = S.techniques || []
      S.techniques.push(rec)
      forgetOldTechniques(S, t => api.toast(esc(t)))
      it.count = (it.count || 1) - 1
      if (it.count <= 0) S.inventory.splice(i, 1)
      api.toast(`研习《${esc(rec.name)}》成功`)
      api.save()
      api.refreshAll()
    }
  })
  main.querySelectorAll('[data-useai]').forEach(b => {
    b.onclick = () => {
      const it = S.inventory[Number(b.dataset.useai)]
      api.startFlow('使用物品', `我使用「${it.name}」：${it.desc || ''}`)
    }
  })
  main.querySelectorAll('[data-sell]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.sell)
      const it = S.inventory[i]
      const gain = Math.floor((it.price || 0) * 0.5)
      S.money.main += gain
      it.count = (it.count || 1) - 1
      if (it.count <= 0) S.inventory.splice(i, 1)
      api.toast(`售出 ${esc(it.name)}，+${fmtNum(gain)} ${esc(pack.lexicon.money.main)}`)
      api.save()
      api.refreshAll()
    }
  })
}

export function renderSettings(app, api) {
  const S = app.S
  const pack = globalThis.__AW_PACKS__[S.worldview]
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="panel">
      <h3>${esc(pack.lexicon.nav.settings)}</h3>
      <h4>AI 风格</h4>
      <div class="btn-row">
        ${AI_STYLE_ORDER.map(k => `
          <button class="btn btn-sm ${S.aiStyle === k ? 'btn-gold' : ''}" data-style="${k}" type="button">${AI_STYLES[k].name}</button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:6px">${esc(AI_STYLES[S.aiStyle] ? AI_STYLES[S.aiStyle].desc : '')}</div>

      <h4>主角性别</h4>
      <div class="btn-row">
        ${PLAYER_GENDERS.map(g => `
          <button class="btn btn-sm ${S.playerGender === g.v ? 'btn-gold' : ''}" data-gender="${g.v}" type="button">${g.name}</button>
        `).join('')}
      </div>

      <h4>对话轮数限制</h4>
      <div class="btn-row">
        <button class="btn btn-sm ${S.dialogLimit ? 'btn-gold' : ''}" data-limit="1" type="button">开启</button>
        <button class="btn btn-sm ${!S.dialogLimit ? 'btn-gold' : ''}" data-limit="0" type="button">关闭</button>
      </div>

      <h4>背景音乐</h4>
      <div class="btn-row">
        ${allBgmTracks().map(t => `
          <button class="btn btn-sm ${(S.bgmTrack || '') === t.id ? 'btn-gold' : ''}" data-bgm="${t.id}" type="button">${esc(t.name)}</button>
        `).join('')}
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn btn-sm" id="bgm-add" type="button">➕ 本地音乐</button>
        <input id="bgm-file" type="file" accept=".mp3,.wav,.ogg,.m4a,.mid,.midi" multiple hidden>
        ${allBgmTracks().filter(t => t.custom).map(t => `
          <button class="btn btn-sm btn-danger" data-bgm-del="${esc(t.id)}" type="button">删 ${esc(t.name)}</button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:4px">支持 mp3/wav/mid 等；自定义曲保存在本机浏览器库，不进游戏目录。</div>

      <h4>API</h4>
      <div class="btn-row">
        <button class="btn" id="set-key" type="button">🔑 切换 API Key</button>
        <button class="btn" id="set-help" type="button">📖 帮助</button>
      </div>

      <h4>存档</h4>
      <div class="btn-row">
        <button class="btn" id="set-export" type="button">导出存档 JSON</button>
        <button class="btn" id="set-import" type="button">导入存档 JSON</button>
        <input id="set-import-file" type="file" accept=".json,application/json" hidden>
        <button class="btn btn-danger" id="set-reset" type="button">重置本世界观存档</button>
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:8px">
        当前世界：${esc(pack.name)} · 存档版本 v${S.version}<br>
        API Key 独立保存，重置存档会保留。
      </div>
    </div>
  `

  main.querySelectorAll('[data-style]').forEach(b => {
    b.onclick = () => { S.aiStyle = b.dataset.style; api.save(); api.refreshAll() }
  })
  main.querySelectorAll('[data-gender]').forEach(b => {
    b.onclick = () => { S.playerGender = b.dataset.gender; api.save(); api.refreshAll() }
  })
  main.querySelectorAll('[data-limit]').forEach(b => {
    b.onclick = () => { S.dialogLimit = b.dataset.limit === '1'; api.save(); api.refreshAll() }
  })
  main.querySelectorAll('[data-bgm]').forEach(b => {
    b.onclick = () => {
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
        api.toast('已添加 ' + added.length + ' 首本地音乐')
        api.refreshAll()
      } else {
        api.toast('未添加（仅支持 mp3/wav/ogg/m4a/mid）')
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
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'agentworlds-saves-' + Date.now() + '.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
      api.toast('已导出存档（不含 API Key）')
    })
  }
  document.getElementById('set-import').onclick = () => {
    document.getElementById('set-import-file').click()
  }
  document.getElementById('set-import-file').onchange = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result || ''))
        import('../engine/state.js').then(m => {
          const r = m.importSaveBundle(bundle)
          if (!r.ok) { api.toast(r.error || '导入失败'); return }
          api.toast('已导入 ' + r.count + ' 个世界存档')
          location.reload()
        })
      } catch (err) {
        api.toast('JSON 解析失败')
      }
    }
    reader.readAsText(f, 'utf-8')
    e.target.value = ''
  }
  document.getElementById('set-reset').onclick = () => {
    openModal(`
      <h2>重置存档？</h2>
      <div class="warn">将删除《${esc(pack.name)}》这一世界的进度并回到选择页。其它世界存档与 API Key 保留。</div>
      <div class="btn-row">
        <button class="btn" data-close type="button">取消</button>
        <button class="btn btn-danger" id="do-reset" type="button">确认重置</button>
      </div>
    `)
    document.getElementById('do-reset').onclick = () => {
      import('../engine/state.js').then(m => {
        m.resetSaveKeepMeta(S.worldview)
        location.reload()
      })
    }
  }
}
