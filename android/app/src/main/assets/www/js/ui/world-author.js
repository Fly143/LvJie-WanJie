// 自定义世界：导入 JSON / 从作品或整本小说生成草稿
import { openModal, closeModal, toast } from './modals.js'
import { openKeyModal } from './settings-panels.js'
import { esc } from '../engine/util.js'
import { loadPlayerKeys } from '../engine/state.js'
import { t } from '../engine/i18n.js'
import { validatePackDraft, PACK_DRAFT_PROMPT, packToDraft } from '../engine/worldpack.js'
import { saveCustomPackDraft, deleteCustomPack, loadCustomPackDrafts, hasCustomPack } from '../engine/custom-packs.js'
import { reloadPacks, getPack, isBuiltinPack } from '../worldviews/index.js'
import { callLLM, extractGameJSON, MAX_TOKENS_DRAFT } from '../engine/llm.js'
import { sampleBookChunks, extractBookFacts, bibleToUserBrief, mergeWebOnly, buildCharacterSeeds, npcSeedsToBrief } from '../engine/book-ingest.js'
import { gatherWebLore, webNotesToBlock, fetchCharacterLore } from '../engine/book-web.js'

function activeKey(app) {
  const S = app && app.S
  const keys = (S && Array.isArray(S.playerKeys)) ? S.playerKeys : []
  if (keys.length) {
    const idx = (typeof S.selectedKey === 'number' && keys[S.selectedKey]) ? S.selectedKey : 0
    return keys[idx] || keys[0] || null
  }
  return firstKeyFallback()
}

function firstKeyFallback() {
  // 1) 引擎密钥仓（含内存缓存 / hydrate 结果）
  try {
    const kd = loadPlayerKeys()
    if (kd && Array.isArray(kd.keys) && kd.keys.length) {
      return kd.keys[kd.selected || 0] || kd.keys[0]
    }
  } catch (e) { /* ignore */ }
  // 2) localStorage 兼容旧数据
  try {
    const raw = localStorage.getItem('agentworlds_apikeys_v1')
    const d = raw ? JSON.parse(raw) : null
    if (d && Array.isArray(d.keys) && d.keys.length) return d.keys[d.selected || 0] || d.keys[0]
  } catch (e) { /* ignore */ }
  return null
}

function draftFromForm() {
  const title = (document.getElementById('cw-title').value || '').trim()
  const author = (document.getElementById('cw-author').value || '').trim()
  const setting = (document.getElementById('cw-setting').value || '').trim()
  const levels = (document.getElementById('cw-levels').value || '').trim()
  const style = (document.getElementById('cw-style').value || t('waStyleDef')).trim()
  const bookText = (document.getElementById('cw-book') ? document.getElementById('cw-book').value : '') || ''
  const urlsRaw = (document.getElementById('cw-urls') ? document.getElementById('cw-urls').value : '') || ''
  const useWeb = document.getElementById('cw-web')
    ? document.getElementById('cw-web').checked
    : true
  const useWiki = document.getElementById('cw-wiki')
    ? document.getElementById('cw-wiki').checked
    : false
  const urls = urlsRaw.split(/[\s,，]+/).map(s => s.trim()).filter(Boolean)
  return { title, author, setting, levels, style, bookText: bookText.trim(), useWeb, useWiki, urls }
}

export function openWorldAuthor(app, { onSaved } = {}) {
  const customs = loadCustomPackDrafts()
  if (!activeKey(app) && !firstKeyFallback()) {
    try {
      toast(t('waNeedKey'))
      openKeyModal(app, { save: () => {}, refreshAll: () => {} })
    } catch (e) { /* ignore */ }
  }
  openModal(`
    <h2>${t('waTitle')}</h2>
    <p style="font-size:12px;color:var(--dim)">${t('waHint')}</p>
    <p style="font-size:12px;color:var(--gold);background:rgba(212,175,55,.10);border:1px solid rgba(212,175,55,.28);border-radius:8px;padding:8px 10px;margin:8px 0">💡 ${t('waAnyWork')}</p>

    <h3>${t('waStep1')}</h3>
    <label style="color:var(--dim);font-size:12px">${t('waBookTitle')}</label>
    <input id="cw-title" type="text" placeholder="${t('waAnyWorkPh')}" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">${t('waAuthor')}</label>
    <input id="cw-author" type="text" placeholder="${t('waAuthorPh')}" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">${t('waSetting')}</label>
    <textarea id="cw-setting" rows="3" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="${t('waSettingPh')}"></textarea>
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">${t('waLevels')}</label>
    <input id="cw-levels" type="text" placeholder="${t('waLevelsPh')}" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">${t('waStyle')}</label>
    <input id="cw-style" type="text" value="${t('waStyleDef')}" style="width:100%;margin-top:6px">
    <label style="display:block;margin-top:10px;font-size:12px;color:var(--dim)">
      <input id="cw-web" type="checkbox" checked> ${t('waWeb')}
    </label>
    <label style="display:block;margin-top:4px;font-size:12px;color:var(--dim)">
      <input id="cw-wiki" type="checkbox"> ${t('waWiki')}
    </label>
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:8px">${t('waUrls')}</label>
    <input id="cw-urls" type="text" placeholder="${t('waUrlsPh')}" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('waNovel')}</label>
    <input id="cw-file" type="file" accept=".txt,.md,text/plain" style="margin-top:6px;font-size:12px">
    <div id="cw-file-info" style="font-size:12px;color:var(--faint);margin-top:4px">${t('waFileHint')}</div>
    <textarea id="cw-book" rows="4" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px;font-size:12px" placeholder="${t('waBookPh2')}"></textarea>

    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-gold" id="cw-gen" type="button">${t('waGenSmart')}</button>
      <button class="btn" id="cw-gen-stop" type="button" hidden>${t('waCancel')}</button>
    </div>
    <p style="font-size:11px;color:var(--faint);margin:6px 0 0">${t('waGenSmartHint')}</p>
    <div id="cw-progress-panel" hidden style="margin-top:12px;border:1px solid rgba(212,175,55,.35);background:rgba(212,175,55,.08);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px">
        <b id="cw-progress-title" style="color:var(--gold)">${t('waProgIdle')}</b>
        <span id="cw-progress-time" style="color:var(--faint);font-variant-numeric:tabular-nums">0s</span>
      </div>
      <div style="height:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;margin-top:8px">
        <div id="cw-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#d4af37,#e8c46a);transition:width .35s"></div>
      </div>
      <ol id="cw-step-list" style="list-style:none;padding:0;margin:10px 0 0;display:flex;flex-direction:column;gap:6px">
        ${['web','lore','npc','draft'].map((s, i) => `
          <li id="cw-step-${s}" data-step="${s}" data-state="idle" style="display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.4">
            <span class="cw-step-mark" style="flex:0 0 auto;width:18px;text-align:center;color:var(--faint)">○</span>
            <span style="flex:1 1 auto;min-width:0">
              <span class="cw-step-label">${i + 1}. ${t('step_' + s)}</span>
              <span class="cw-step-detail" style="display:block;color:var(--faint);font-size:11px;word-break:break-word"></span>
            </span>
            <span class="cw-step-state" style="flex:0 0 auto;color:var(--faint);font-size:11px"></span>
          </li>
        `).join('')}
      </ol>
      <div id="cw-status" style="font-size:12px;color:var(--dim);margin-top:10px;word-break:break-word">${t('waFlow')}</div>
    </div>

    <h3 style="margin-top:18px">${t('waStep2')}</h3>
    <textarea id="cw-json" rows="8" style="width:100%;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px;font-size:12px" placeholder='${t('waJsonPh')}'></textarea>
    <div class="btn-row">
      <button class="btn" id="cw-validate" type="button">${t('waValidate')}</button>
      <button class="btn btn-gold" id="cw-save" type="button">${t('waSavePack')}</button>
    </div>
    <div id="cw-msg" style="font-size:12px;margin-top:6px;color:var(--faint)"></div>

    <h3 style="margin-top:18px">${t('waStep3')}</h3>
    <div id="cw-list">
      ${customs.length ? customs.map(d => `
        <div class="key-row">
          <label>
            <b>${esc(d.icon || '🌍')} ${esc(d.name || d.id)}</b>
            <span class="masktext">${esc(d.id || '')}</span>
            <span class="masktext">${esc((d.tiers || []).length)} ${t('waTiers')} · ${(d.map || []).length} ${t('waLands')}</span>
          </label>
          <button class="btn btn-sm" data-export="${esc(d.id || '')}" type="button">${t('waExport')}</button>
          <button class="btn btn-sm btn-danger" data-del="${esc(d.id || '')}" type="button">${t('waDelete')}</button>
        </div>
      `).join('') : `<div class="empty">${t('waNone')}</div>`}
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" data-close type="button">${t('waClose')}</button>
    </div>
  `)

  const status = document.getElementById('cw-status')
  const msg = document.getElementById('cw-msg')
  const jsonEl = document.getElementById('cw-json')
  const bookEl = document.getElementById('cw-book')
  const fileInfo = document.getElementById('cw-file-info')
  let genCtl = null

  document.getElementById('cw-file').onchange = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (f.size > 8 * 1024 * 1024) {
      fileInfo.textContent = t('waFileBig')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      bookEl.value = text.length > 400000 ? text.slice(0, 400000) : text
      const ch = sampleBookChunks(bookEl.value)
      fileInfo.textContent = `${t('waLoaded')} ${f.name}（${text.length} ${t('waChars')}）· ${t('waAbout')} ${ch.chapters} ${t('waChapters')} · ${t('waWillSample')} ${ch.samples.length} ${t('waPieces')}`
    }
    reader.onerror = () => { fileInfo.textContent = t('waReadFail') }
    reader.readAsText(f, 'utf-8')
  }

  document.getElementById('cw-gen').onclick = () => runGenerate()

  const STEP_IDS = ['web', 'lore', 'npc', 'draft']
  const stepEl = (id) => document.getElementById('cw-step-' + id)
  let genStartedAt = 0
  let genTimer = null
  let genHb = null

  const fmtSec = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + (s % 60) + 's'
  }

  const setStep = (id, state, detail) => {
    const el = stepEl(id)
    if (!el) return
    const marks = { idle: '○', run: '…', done: '✓', err: '✗', skip: '–' }
    const colors = {
      idle: 'var(--faint)',
      run: 'var(--gold)',
      done: 'var(--jade)',
      err: 'var(--red)',
      skip: 'var(--faint)'
    }
    const labels = {
      idle: t('step_wait'),
      run: t('step_run'),
      done: t('step_ok'),
      err: t('step_fail'),
      skip: t('step_skip')
    }
    el.dataset.state = state
    const mark = el.querySelector('.cw-step-mark')
    const st = el.querySelector('.cw-step-state')
    const dt = el.querySelector('.cw-step-detail')
    const c = colors[state] || colors.idle
    if (mark) { mark.textContent = marks[state] || '○'; mark.style.color = c }
    if (st) { st.textContent = labels[state] || ''; st.style.color = c }
    if (dt) dt.textContent = detail || ''
    el.style.opacity = state === 'idle' ? '0.55' : '1'
  }

  const setProgress = (pct, msg) => {
    const panel = document.getElementById('cw-progress-panel')
    const bar = document.getElementById('cw-progress-bar')
    const st = document.getElementById('cw-status')
    if (panel) panel.hidden = false
    if (bar && pct != null) {
      bar.style.width = Math.max(0, Math.min(100, pct)) + '%'
      bar.style.background = 'linear-gradient(90deg,#d4af37,#e8c46a)'
    }
    if (st && msg != null) {
      st.style.color = 'var(--dim)'
      st.textContent = msg
    }
  }

  const setProgressTitle = (text) => {
    const el = document.getElementById('cw-progress-title')
    if (el) el.textContent = text
  }

  const startGenClock = () => {
    genStartedAt = Date.now()
    stopGenClock()
    const tick = () => {
      const el = document.getElementById('cw-progress-time')
      if (el) el.textContent = fmtSec(Date.now() - genStartedAt)
    }
    tick()
    genTimer = setInterval(tick, 1000)
    setProgressTitle(t('waProgRunning'))
  }

  const stopGenClock = () => {
    if (genTimer) { clearInterval(genTimer); genTimer = null }
    if (genHb) { clearInterval(genHb); genHb = null }
  }

  const failStep = (id, errMsg) => {
    setStep(id, 'err', errMsg || '')
    setProgressTitle(t('waProgFail'))
    const st = document.getElementById('cw-status')
    if (st) {
      st.style.color = 'var(--red)'
      st.textContent = t('waFailAt') + '「' + t('step_' + id) + '」' + (errMsg ? '：' + errMsg : '')
    }
    const bar = document.getElementById('cw-progress-bar')
    if (bar) bar.style.background = 'var(--red)'
    stopGenClock()
    const el = document.getElementById('cw-progress-time')
    if (el && genStartedAt) el.textContent = fmtSec(Date.now() - genStartedAt)
  }

  const finishOk = (msg) => {
    setProgress(100, null)
    setProgressTitle(t('waProgDone'))
    const st = document.getElementById('cw-status')
    if (st) {
      st.style.color = 'var(--jade)'
      st.textContent = msg
    }
    const bar = document.getElementById('cw-progress-bar')
    if (bar) bar.style.background = 'var(--jade)'
    stopGenClock()
    const el = document.getElementById('cw-progress-time')
    if (el && genStartedAt) el.textContent = fmtSec(Date.now() - genStartedAt)
  }

  const resetSteps = () => {
    STEP_IDS.forEach(s => setStep(s, 'idle'))
    const bar = document.getElementById('cw-progress-bar')
    if (bar) {
      bar.style.width = '0%'
      bar.style.background = 'linear-gradient(90deg,#d4af37,#e8c46a)'
    }
    const st = document.getElementById('cw-status')
    if (st) {
      st.style.color = 'var(--dim)'
      st.textContent = t('waFlow')
    }
    setProgressTitle(t('waProgRunning'))
  }

  async function runGenerate() {
    const f = draftFromForm()
    if (!f.title && !f.bookText && !f.urls.length) { toast(t('waNeedFill')); return }
    const title = f.title || t('waUntitled')
    const keyObj = activeKey(app)
    if (!keyObj) {
      status.textContent = t('waNoKeyHint')
      toast(t('waNeedKey2'))
      try {
        closeModal()
        openKeyModal(app, { save: () => {}, refreshAll: () => {} })
      } catch (e) { /* ignore */ }
      return
    }
    const btn = document.getElementById('cw-gen')
    const stop = document.getElementById('cw-gen-stop')
    btn.disabled = true
    stop.hidden = false
    resetSteps()
    startGenClock()
    const panel = document.getElementById('cw-progress-panel')
    if (panel) {
      panel.hidden = false
      try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } catch (e) { /* ignore */ }
    }
    genCtl = new AbortController()
    stop.onclick = () => {
      try { genCtl.abort() } catch (e) {}
      setProgressTitle(t('waCancelled'))
      STEP_IDS.forEach(s => {
        const el = stepEl(s)
        if (el && el.dataset.state === 'run') setStep(s, 'err', t('waCancelled'))
      })
      const st = document.getElementById('cw-status')
      if (st) {
        st.style.color = 'var(--red)'
        st.textContent = t('waCancelled')
      }
      stopGenClock()
      btn.disabled = false
      stop.hidden = true
    }

    try {
      let webNotes = []
      const wantWeb = !!(f.useWeb || f.urls.length)
      if (wantWeb) {
        setStep('web', 'run', t('step_web_run'))
        setProgress(8, t('step_web_run'))
        const g = await gatherWebLore({
          title,
          urls: f.urls,
          useWiki: f.useWiki,
          onProgress: (p) => {
            const hits = (p && p.hits) || 0
            const done = (p && p.done) || 0
            const total = (p && p.total) || 1
            const pct = 8 + Math.min(22, hits * 6 + (done / Math.max(1, total)) * 8)
            setProgress(pct, p.message || '')
            setStep('web', 'run', p.message || '')
          }
        })
        webNotes = g.ok ? g.notes : []
        if (!webNotes.length) {
          setStep('web', 'err', t('waWebEmpty'))
          setProgress(30, t('waWebEmpty'))
        } else {
          setStep('web', 'done', t('step_web_done') + ' · ' + webNotes.length + t('waWebNotes'))
          setProgress(32, t('step_web_done'))
        }
      } else {
        setStep('web', 'skip', t('step_web_skip'))
        setProgress(32, t('step_web_skip'))
      }

      const hasBook = f.bookText.length >= 800
      if (!hasBook && !webNotes.length && !f.setting) {
        failStep('lore', t('waNeedSrc'))
        return
      }

      let user
      if (hasBook || webNotes.length) {
        const ch = hasBook ? sampleBookChunks(f.bookText) : { samples: [], chapters: 0, totalChars: 0 }
        setStep('lore', 'run', hasBook
          ? `${ch.totalChars} ${t('waChars')} · ${t('waSample')} ${ch.samples.length} ${t('waSample2')}`
          : t('waWebMerge'))
        setProgress(36, hasBook
          ? `${ch.totalChars} ${t('waChars')} · ${t('waSample')} ${ch.samples.length} ${t('waSample2')}`
          : t('waWebMerge'))
        const onLoreProgress = (p) => {
          const msg = (p && p.message) || ''
          const step = (p && p.step) || 1
          const total = (p && p.total) || 1
          const pct = 36 + Math.min(18, (step / Math.max(1, total)) * 18)
          setProgress(pct, msg)
          setStep('lore', 'run', msg)
        }
        const ex = hasBook
          ? await extractBookFacts({
              keyObj,
              title,
              author: f.author,
              samples: ch.samples,
              signal: genCtl.signal,
              webNotes,
              onProgress: onLoreProgress
            })
          : await mergeWebOnly({
              keyObj,
              title,
              author: f.author,
              webNotes,
              signal: genCtl.signal,
              onProgress: onLoreProgress
            })
        if (!ex.ok) {
          if (ex.aborted) {
            setProgressTitle(t('waCancelled'))
            setStep('lore', 'err', t('waCancelled'))
            const st = document.getElementById('cw-status')
            if (st) { st.style.color = 'var(--red)'; st.textContent = t('waCancelled') }
            stopGenClock()
          } else {
            failStep('lore', (ex.error || ''))
          }
          return
        }
        user = bibleToUserBrief(title, f.author, ex.bible)
        if (f.levels) user += `\n用户补充等级提示：${f.levels}`
        if (f.setting) user += `\n用户补充设定：${f.setting}`
        // webNotes 已并入设定圣经，此处不再重复拼贴，省 token

        setStep('lore', 'done', t('step_lore_done'))
        setProgress(55, t('step_lore_done'))

        // 人物 → NPC 种子
        try {
          setStep('npc', 'run', t('waNpcSeed'))
          setProgress(60, t('waNpcSeed'))
          const chs = await buildCharacterSeeds({
            keyObj,
            title,
            facts: ex.facts || [],
            bible: ex.bible,
            samples: hasBook ? ch.samples : [],
            signal: genCtl.signal,
            useWeb: f.useWeb || f.urls.length > 0,
            fetchCharacterLore,
            onProgress: (p) => {
              const msg = (p && p.message) || ''
              setProgress(60 + Math.min(12, ((p && p.step) || 1) * 3), msg)
              setStep('npc', 'run', msg)
            }
          })
          if (chs.ok && chs.npc_seeds.length) {
            user += npcSeedsToBrief(chs.npc_seeds)
            setStep('npc', 'done', `${t('waNpcSeeded')} ${chs.npc_seeds.length} ${t('waNpcSeeded2')}`)
            setProgress(72, `${t('waNpcSeeded')} ${chs.npc_seeds.length} ${t('waNpcSeeded2')}`)
          } else if (!chs.ok && chs.aborted) {
            setStep('npc', 'err', t('waCancelled'))
            setProgressTitle(t('waCancelled'))
            const st = document.getElementById('cw-status')
            if (st) { st.style.color = 'var(--red)'; st.textContent = t('waCancelled') }
            stopGenClock()
            return
          } else {
            setStep('npc', 'skip', t('waNpcNone'))
            setProgress(72, t('waNpcNone'))
          }
        } catch (e) {
          // 人物失败不阻断出包
          console.warn('npc seeds', e)
          setStep('npc', 'err', (e && e.message) || '')
        }

        setProgress(75, t('waMerged'))
      } else {
        user = `作品：${title}${f.author ? '（' + f.author + '）' : ''}
题材风格：${f.style}
设定摘要：${f.setting || '（请根据作品常识补全）'}
等级体系提示：${f.levels || '（请自行设计 5~12 阶）'}

请输出完整世界包 JSON。`
        setStep('lore', 'done', t('waSimpleInput'))
        setStep('npc', 'skip', t('step_skip'))
        setProgress(70, t('waGenDraft'))
      }

      setStep('draft', 'run', t('waGenDraft'))
      setProgress(82, t('waGenDraft'))
      const draftT0 = Date.now()
      genHb = setInterval(() => {
        const sec = Math.floor((Date.now() - draftT0) / 1000)
        setProgress(82 + Math.min(14, sec / 4), t('waGenDraft') + ' (' + sec + 's)')
        setStep('draft', 'run', t('waGenDraft') + ' (' + sec + 's)')
      }, 1500)
      let res
      try {
        res = await callLLM({
          keyObj,
          system: PACK_DRAFT_PROMPT,
          user,
          signal: genCtl.signal,
          maxTokens: MAX_TOKENS_DRAFT
        })
      } finally {
        if (genHb) { clearInterval(genHb); genHb = null }
      }
      if (!res.ok) {
        failStep('draft', res.error || '')
        return
      }
      const json = extractGameJSON(res.text)
      if (!json) {
        failStep('draft', t('waNoJson'))
        jsonEl.value = res.text.slice(0, 12000)
        return
      }
      if (!json.id || getPack(json.id) || hasCustomPack(json.id)) {
        json.id = 'book-' + hashId(title) + '-' + String(Date.now()).slice(-5)
      }
      if (BUILTIN_HIT(json.id)) json.id = json.id + '-x'
      jsonEl.value = JSON.stringify(json, null, 2)
      const v = validatePackDraft(json)
      if (v.ok) {
        setStep('draft', 'done', t('step_draft_done'))
        finishOk(`${t('waDraftOk')}${v.pack.name}（${v.pack.tiers.length} ${t('waTiers')} · ${v.pack._decl.map.length} ${t('waLands')}）。${t('waEditable')}`)
        msg.textContent = ''
      } else {
        failStep('draft', v.errors.join('; '))
        const st = document.getElementById('cw-status')
        if (st) st.textContent = t('waDraftNeedFix') + v.errors.join('; ')
      }
    } finally {
      btn.disabled = false
      stop.hidden = true
      genCtl = null
    }
  }

  document.getElementById('cw-validate').onclick = () => {
    const r = parseDraft(jsonEl.value)
    if (!r) { msg.style.color = 'var(--red)'; msg.textContent = t('waJsonFail'); return }
    const v = validatePackDraft(r)
    if (v.ok) {
      msg.style.color = 'var(--jade)'
      msg.textContent = `${t('waValidateOk')}${v.pack.name} · ${v.pack.tiers.length} ${t('waTiers')} · ${v.pack._decl.map.length} ${t('waLands')} · ${v.pack.worlds.join('/')}`
    } else {
      msg.style.color = 'var(--red)'
      msg.textContent = v.errors.join('；')
    }
  }

  document.getElementById('cw-save').onclick = () => {
    const r = parseDraft(jsonEl.value)
    if (!r) { msg.style.color = 'var(--red)'; msg.textContent = t('waJsonFail'); return }
    let saved = saveCustomPackDraft(r, { overwrite: false })
    if (saved.needConfirm) {
      if (!confirm(t('waOverwrite'))) return
      saved = saveCustomPackDraft(r, { overwrite: true })
    }
    if (!saved.ok) {
      msg.style.color = 'var(--red)'
      msg.textContent = (saved.errors || []).join('；') || t('waSaveFail')
      return
    }
    reloadPacks()
    toast(t('waSaved') + saved.pack.name)
    closeModal()
    if (onSaved) onSaved(saved.pack)
  }

  document.querySelectorAll('[data-export]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.export
      const draft = loadCustomPackDrafts().find(d => String(d.id || '').toLowerCase() === String(id).toLowerCase())
      if (!draft) return
      jsonEl.value = JSON.stringify(draft, null, 2)
      msg.style.color = 'var(--dim)'
      msg.textContent = t('waExported')
    }
  })

  document.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.del
      if (!confirm(t('waDelConfirm') + id + t('waDelConfirm2'))) return
      deleteCustomPack(id)
      reloadPacks()
      closeModal()
      openWorldAuthor(app, { onSaved })
      if (onSaved) onSaved(null)
    }
  })
}

function BUILTIN_HIT(id) {
  return !!getPack(id) && isBuiltinPack(id)
}

function hashId(s) {
  let h = 0
  const x = String(s || 'w')
  for (let i = 0; i < x.length; i++) h = ((h << 5) - h + x.charCodeAt(i)) | 0
  return Math.abs(h).toString(36).slice(0, 6)
}

function parseDraft(text) {
  try {
    const t = String(text || '').trim()
    if (!t) return null
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const body = fence ? fence[1].trim() : t
    return JSON.parse(body)
  } catch (e) {
    try {
      return JSON.parse(String(text).replace(/,\s*([}\]])/g, '$1'))
    } catch (e2) {
      return null
    }
  }
}

export { packToDraft }
