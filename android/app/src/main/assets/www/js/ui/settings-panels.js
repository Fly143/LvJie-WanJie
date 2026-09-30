// 设置面板：自定义 API Key（chat / response）
import { openModal, closeModal, toast, confirmModal } from './modals.js'
import { normalizeApiKey, endpointOf, maskKey, listModels, testConnection } from '../engine/llm.js'
import { esc } from '../engine/util.js'
import { t } from '../engine/i18n.js'
import { setKeysCache, loadPlayerKeys } from '../engine/state.js'
import { normBase, sameKeyEntry, formDirty } from '../engine/keyprofile.js'
import { ensureZenReady, zenConfig, isZenBase, readZenCache, zenUsageToday, ZEN_BASE, ZEN_KEY, ZEN_NAME, ZEN_PREFERRED, ZEN_DAILY_LIMIT } from '../engine/zen.js'

const STYLE_HELP = {
  chat: t('styleHelpChat'),
  response: t('styleHelpResp')
}

export function openKeyModal(app, { save, refreshAll, mode } = {}) {
  const S = app.S
  const store = loadKeyStore()
  // S 有 keys 用 S；否则用 store。selected 两边对齐
  let selected = 0
  if (S && Array.isArray(S.playerKeys) && S.playerKeys.length && typeof S.selectedKey === 'number') {
    selected = S.selectedKey
  } else if (typeof store.selected === 'number') {
    selected = store.selected
  }
  const keys = S && Array.isArray(S.playerKeys) && S.playerKeys.length ? S.playerKeys : (store.keys || [])
  const useStandalone = !(S && Array.isArray(S.playerKeys) && S.playerKeys.length)

  const rows = keys.map((k, i) => {
    const n = normalizeApiKey(k) || k
    const style = (n.apiStyle === 'response') ? 'response' : 'chat'
    return `
      <div class="key-row">
        <label>
          <input type="radio" name="selkey" value="${i}" ${selected === i ? 'checked' : ''}>
          <span class="key-lines">
            <span class="key-top">
              <b>${esc(n.name || t('cfgN') + (i + 1))}</b>
              <span class="ctype">${style === 'response' ? 'response' : 'chat'}</span>
          ${isZenBase(n.baseUrl) ? `<span class="ctype">${t('zenBuiltinBadge')}</span>` : ''}
            </span>
            <span class="key-sub">
              <span class="masktext">${esc(n.model || '')}</span>
              <span class="masktext key-state">${(n.key || n.value) ? t('savedHidden') : t('unset')}</span>
            </span>
          </span>
        </label>
        <button class="btn btn-sm btn-danger" data-del="${i}" type="button">${t('delete')}</button>
      </div>
    `
  }).join('')

  let cur = keys[selected] && normalizeApiKey(keys[selected])
  const curStyle = (cur && cur.apiStyle === 'response') ? 'response' : 'chat'

  // 两种使用方式：内置免费 / 自定义（默认跟随当前选中的配置）
  const zenActive = isZenBase(cur && cur.baseUrl)
  const zenMode = mode === 'zen' ? true : mode === 'custom' ? false : zenActive

  // 内置免费面板：已探测到的免费模型（含当前可用的那个）
  const _zc = readZenCache()
  const _zlist = []
  for (const m of [].concat(_zc.working || [], _zc.free || [], cur && zenActive ? [cur.model] : [], ZEN_PREFERRED)) {
    if (m && !_zlist.includes(m)) _zlist.push(m)
  }
  const zenPick = _zc.working || (zenActive ? cur.model : '') || _zlist[0] || ''
  const zenOptions = _zlist.map(m => `<option value="${esc(m)}" ${m === zenPick ? 'selected' : ''}>${esc(m)}</option>`).join('')
  const zenStatusText = _zc.working
    ? t('zenReady') + _zc.working + (_zc.at ? '（' + new Date(_zc.at).toLocaleTimeString() + '）' : '')
    : t('zenHint')

  /** 把一条配置写入并设为当前（独立 Key 库 / 存档内 keys 两种情况） */
  function activate(rec) {
    if (!S || useStandalone) {
      persistKeysStandalone(rec, null, rec.key || '')
    } else {
      S.playerKeys = S.playerKeys || []
      let i = S.playerKeys.findIndex(k => sameKeyEntry(k, rec))
      if (i >= 0) S.playerKeys[i] = Object.assign({}, S.playerKeys[i], rec)
      else { S.playerKeys.push(rec); i = S.playerKeys.length - 1 }
      S.selectedKey = i
    }
    save()
    refreshAll()
  }

  openModal(`
    <h2>${t('apiSettings')}</h2>
    ${globalThis.__AW_KEYS_PLAINTEXT__ === true ? `<div style="margin:8px 0;padding:10px;border:1px solid var(--red);border-radius:8px;color:var(--red);font-size:12px">⚠ 当前环境不支持密钥加密存储（safeStorage 不可用），API Key 以明文保存在本机，请注意设备安全</div>` : ''}
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-sm ${zenMode ? 'btn-gold' : ''}" id="mode-zen" type="button">${t('zenModeFree')}</button>
      <button class="btn btn-sm ${zenMode ? '' : 'btn-gold'}" id="mode-custom" type="button">${t('zenModeCustom')}</button>
    </div>

    <div id="zen-panel" style="display:${zenMode ? '' : 'none'}">
      <div style="font-size:12px;color:var(--faint);margin-top:10px">${t('zenHint')}</div>
      <div id="k-zen-quota" style="margin-top:8px;padding:8px 10px;border:1px solid var(--line2);border-radius:8px;font-size:12px;color:var(--dim);line-height:1.6"></div>
      <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('zenModelPick')}</label>
      <select id="zen-model" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px">
        ${zenOptions}
      </select>
      <div style="font-size:12px;color:var(--faint);margin-top:6px" id="k-zen-status">${zenStatusText}</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-gold" id="k-zen" type="button">${t('zenEnable')}</button>
        <button class="btn btn-sm" id="k-zen-test" type="button">${t('zenTest')}</button>
        <button class="btn" data-close type="button">${t('close')}</button>
      </div>
    </div>

    <div id="custom-panel" style="display:${zenMode ? 'none' : ''}">
    ${rows || `<div class="empty">${t('noApi')}</div>`}

    <h3 style="margin-top:16px">${t('addUpdate')}</h3>
    <label style="color:var(--dim);font-size:12px">${t('proto')}</label>
    <select id="k-style" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px">
      <option value="chat" ${curStyle === 'chat' ? 'selected' : ''}>chat — Chat Completions</option>
      <option value="response" ${curStyle === 'response' ? 'selected' : ''}>response — Responses API</option>
    </select>
    <div style="font-size:12px;color:var(--faint);margin-top:6px" id="k-style-help">${STYLE_HELP[curStyle]}</div>

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('baseUrl')}</label>
    <input id="k-base" type="text" placeholder="${t('kBasePh')}" value="${esc(cur ? (cur.baseUrl || '') : '')}">

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('apiKey')}</label>
    <input id="k-value" type="password" placeholder="sk-…" autocomplete="off" value="">

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('noteName')}</label>
    <input id="k-name" type="text" placeholder="${t('kNamePh')}" value="${esc(cur ? (cur.name || '') : '')}">

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('model')}</label>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <input id="k-model" type="text" style="margin-top:0;flex:1" placeholder="${t('kModelPh')}" value="${esc(cur ? (cur.model || '') : '')}">
      <button class="btn btn-sm" id="k-refresh" type="button" title="GET {Base URL}/models">${t('refreshModels')}</button>
    </div>
    <select id="k-model-list" style="width:100%;margin-top:8px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px;display:none">
      <option value="">${t('pickFromList')}</option>
    </select>
    <div style="font-size:12px;color:var(--faint);margin-top:4px" id="k-model-hint">${t('modelHint')}</div>

    <div style="font-size:12px;color:var(--faint);margin-top:10px" id="k-preview"></div>

    <div class="btn-row">
      <button class="btn btn-gold" id="k-add" type="button">${t('saveUse')}</button>
      <button class="btn" data-close type="button">${t('close')}</button>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-sm" id="k-test" type="button">${t('testConn')}</button>
      <span style="font-size:12px;color:var(--faint);align-self:center" id="k-test-status"></span>
    </div>
    </div>
  `)

  const selStyle = document.getElementById('k-style')
  const help = document.getElementById('k-style-help')
  const baseEl = document.getElementById('k-base')
  const modelEl = document.getElementById('k-model')
  const valEl = document.getElementById('k-value')
  const nameEl = document.getElementById('k-name')
  const preview = document.getElementById('k-preview')
  const refreshBtn = document.getElementById('k-refresh')
  const modelList = document.getElementById('k-model-list')
  const modelHint = document.getElementById('k-model-hint')

  function currentKey() {
    return valEl.value.trim() || (cur && (cur.key || cur.value)) || ''
  }

  modelList.onchange = () => {
    const v = modelList.value
    if (!v) return
    modelEl.value = v
    if (!nameEl.value.trim()) nameEl.value = v
    refreshPreview()
  }

  refreshBtn.onclick = async () => {
    const baseUrl = baseEl.value.trim()
    const key = currentKey()
    if (!baseUrl) { toast(t('fillBaseUrlKey')); return }
    if (!key) { toast(t('fillApiKey')); return }
    refreshBtn.disabled = true
    const old = refreshBtn.textContent
    refreshBtn.textContent = t('pulling')
    modelHint.textContent = t('requestingModels')
    const r = await listModels({ baseUrl, key })
    refreshBtn.disabled = false
    refreshBtn.textContent = old
    if (!r.ok) {
      modelHint.innerHTML = `<span style="color:var(--red)">${t('fetchFailPrefix')}${esc(r.error || '')}</span>`
      toast(t('fetchFail'))
      return
    }
    const models = r.models || []
    modelList.innerHTML = `<option value="">— ${t('modelListN')} ${models.length} ${t('modelListPick')} —</option>` +
      models.map(id => `<option value="${esc(id)}" ${id === modelEl.value ? 'selected' : ''}>${esc(id)}</option>`).join('')
    modelList.style.display = ''
    modelHint.innerHTML = `${t('fetchedModels')} ${models.length} ${t('fetchedModels2')}（${esc(r.url || '')}）。${t('pickOrType')}`
    toast(`${t('fetchedN')} ${models.length}${t('modelsN')}`)
  }

  function refreshPreview() {
    help.textContent = STYLE_HELP[selStyle.value] || ''
    const fake = {
      baseUrl: baseEl.value.trim(),
      key: currentKey(),
      model: modelEl.value.trim(),
      apiStyle: selStyle.value
    }
    const n = normalizeApiKey(fake)
    preview.textContent = n
      ? t('reqAddr') + endpointOf(n)
      : t('reuseKeyHint')
  }
  selStyle.onchange = refreshPreview
  baseEl.oninput = refreshPreview
  modelEl.oninput = refreshPreview
  valEl.oninput = refreshPreview
  refreshPreview()

  // 切换已保存配置时把表单同步成那一条，否则「保存并选用」会拿旧表单内容匹配回原来那条
  function syncFormToEntry(i) {
    const src = keys[i] ? (normalizeApiKey(keys[i]) || keys[i]) : null
    cur = src
    selStyle.value = (src && src.apiStyle === 'response') ? 'response' : 'chat'
    baseEl.value = src ? (src.baseUrl || '') : ''
    modelEl.value = src ? (src.model || '') : ''
    nameEl.value = src ? (src.name || '') : ''
    valEl.value = ''
    refreshPreview()
  }

  document.getElementById('k-add').onclick = async () => {
    const apiStyle = selStyle.value === 'response' ? 'response' : 'chat'
    const baseUrl = baseEl.value.trim().replace(/\/+$/, '')
    const model = modelEl.value.trim()
    const keyInput = valEl.value.trim()
    const name = nameEl.value.trim() || model || t('selfDefault')
    const selNow = (S && typeof S.selectedKey === 'number') ? S.selectedKey : selected
    if (!baseUrl || !model) {
      toast(t('fillBaseModel'))
      return
    }
    // 表单没改动 → 只是「切换选用」，不要再按旧表单内容 upsert（否则会把选择改回原来那条）
    const dirty = formDirty({ baseUrl, model, name, apiStyle, key: keyInput }, cur)
    if (!dirty) {
      const pick = (typeof selected === 'number') ? selected : 0
      if (!S || useStandalone) {
        selectKeyStandalone(pick)
      } else {
        S.selectedKey = pick
      }
      save()
      refreshAll()
      closeModal()
      toast(t('apiSaved'))
      return
    }
    let key = keyInput
    if (!key) {
      // 更新已有配置时允许不重填 Key
      const old = typeof selNow === 'number' ? keys[selNow] : null
      key = (old && (old.key || old.value)) || ''
    }
    if (!key) {
      toast(t('fillApiKey'))
      return
    }
    const rec = { name, baseUrl, key, model, apiStyle }
    if (!S || useStandalone) {
      // 欢迎页 / 无 keys 存档：写入全局 Key 库
      persistKeysStandalone(rec, selNow, keyInput)
      save()
      refreshAll()
      closeModal()
      toast(t('apiSaved'))
      return
    }
    S.playerKeys = S.playerKeys || []
    // 同 base+model+协议 才更新；chat / response 分条保存
    let upsert = S.playerKeys.findIndex(k => sameKeyEntry(k, rec))
    if (upsert < 0 && !keyInput && typeof selNow === 'number' && S.playerKeys[selNow]) {
      upsert = selNow
    } else if (upsert < 0 && keyInput && typeof selNow === 'number' && S.playerKeys[selNow]
      && keyInput === (S.playerKeys[selNow].key || S.playerKeys[selNow].value)
      && sameKeyEntry(S.playerKeys[selNow], rec)) {
      upsert = selNow
    }
    if (upsert >= 0) {
      const old = S.playerKeys[upsert] || {}
      S.playerKeys[upsert] = Object.assign({}, old, rec, {
        key: rec.key || old.key || old.value || ''
      })
      S.selectedKey = upsert
    } else {
      S.playerKeys.push(rec)
      S.selectedKey = S.playerKeys.length - 1
    }
    if (typeof S.selectedKey === 'number' && S.playerKeys[S.selectedKey]) {
      // 保持选用
    } else {
      S.selectedKey = S.playerKeys.length - 1
    }
    save()
    refreshAll()
    closeModal()
    toast(t('apiSaved'))
  }

  // —— 测试连接：按当前表单发一次最小请求（未填模型则退化为拉模型列表） ——
  const testBtn = document.getElementById('k-test')
  const testStatus = document.getElementById('k-test-status')
  if (testBtn) {
    testBtn.onclick = async () => {
      const apiStyle = selStyle.value === 'response' ? 'response' : 'chat'
      const baseUrl = baseEl.value.trim()
      const model = modelEl.value.trim()
      const key = currentKey()
      if (!baseUrl) { toast(t('fillBaseUrlKey')); return }
      if (!key) { toast(t('fillApiKey')); return }
      const old = testBtn.textContent
      testBtn.disabled = true
      testBtn.textContent = t('testing')
      if (testStatus) testStatus.textContent = ''
      let r
      try {
        r = await testConnection({ baseUrl, key, model, apiStyle })
      } catch (e) {
        r = { ok: false, ms: 0, error: (e && e.message) || '失败' }
      }
      testBtn.disabled = false
      testBtn.textContent = old
      const ms = Math.round(Number(r.ms) || 0)
      const detail = r.reply
        ? ' · ' + r.reply
        : (r.count != null ? ' · ' + r.count + t('modelsN') : '')
      const msg = r.ok
        ? (t('testOk') + ' · ' + ms + 'ms' + detail + (r.switched ? ' · ' + t('zenReady') + r.switched : ''))
        : (t('testFail') + (r.error || ''))
      if (testStatus) testStatus.textContent = msg
      toast(msg)
    }
  }

  document.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      const i = Number(b.dataset.del)
      if (!S || useStandalone) {
        deleteKeyStandalone(i)
        save()
        closeModal()
        openKeyModal(app, { save, refreshAll })
        return
      }
      S.playerKeys = S.playerKeys || []
      S.playerKeys.splice(i, 1)
      if (S.selectedKey === i) S.selectedKey = 0
      else if (typeof S.selectedKey === 'number' && S.selectedKey > i) S.selectedKey -= 1
      if (!S.playerKeys.length) S.selectedKey = 0
      save()
      closeModal()
      openKeyModal(app, { save, refreshAll })
    }
  })

  // —— 内置免费 / 自定义 两个模式切换 ——
  const zenPanel = document.getElementById('zen-panel')
  const customPanel = document.getElementById('custom-panel')
  const modeZenBtn = document.getElementById('mode-zen')
  const modeCustomBtn = document.getElementById('mode-custom')
  const setMode = (z) => {
    if (zenPanel) zenPanel.style.display = z ? '' : 'none'
    if (customPanel) customPanel.style.display = z ? 'none' : ''
    if (modeZenBtn) modeZenBtn.classList.toggle('btn-gold', z)
    if (modeCustomBtn) modeCustomBtn.classList.toggle('btn-gold', !z)
  }
  if (modeZenBtn) modeZenBtn.onclick = () => setMode(true)
  if (modeCustomBtn) modeCustomBtn.onclick = () => setMode(false)
  setMode(zenMode)

  // —— 内置免费通道：探测 / 启用（免费模型会被上游更换，故先探测再取第一个通的） ——
  const zenStatus = document.getElementById('k-zen-status')
  const zenModelEl = document.getElementById('zen-model')
  const zenQuotaEl = document.getElementById('k-zen-quota')
  const refreshQuota = () => {
    if (!zenQuotaEl) return
    zenQuotaEl.innerHTML = '⚡ ' + t('zenQuotaLabel') + ' ' + ZEN_DAILY_LIMIT + ' ' + t('zenPerDay') +
      t('zenResetNext') + t('zenShared') + ' · ' + t('zenUsedToday') + ' ' + zenUsageToday().count +
      '<br>' + t('zenQuotaTip')
  }
  refreshQuota()
  const fillZenModels = (list, active) => {
    if (!zenModelEl) return
    const arr = []
    for (const m of [].concat(active || [], list || [])) if (m && !arr.includes(m)) arr.push(m)
    zenModelEl.innerHTML = arr.map(m => `<option value="${esc(m)}" ${m === active ? 'selected' : ''}>${esc(m)}</option>`).join('')
  }
  const runZenProbe = async () => {
    if (zenStatus) zenStatus.textContent = t('zenProbing')
    const r = await ensureZenReady({
      force: true,
      onStatus: (m) => { if (zenStatus) zenStatus.textContent = m }
    })
    refreshQuota()
    return r
  }
  const zenBtn = document.getElementById('k-zen')
  if (zenBtn) {
    zenBtn.onclick = async () => {
      let model = (zenModelEl && zenModelEl.value) || ''
      if (!model) {
        const r = await runZenProbe()
        if (!r.ok) {
          if (zenStatus) zenStatus.textContent = t('zenUnavailable')
          toast(t('zenUnavailable'))
          return
        }
        model = r.model
        fillZenModels(readZenCache().free, model)
      }
      activate(zenConfig(model))
      const msg = t('zenEnabled') + model
      if (zenStatus) zenStatus.textContent = msg
      toast(msg)
      closeModal()
    }
  }
  const zenTestBtn = document.getElementById('k-zen-test')
  if (zenTestBtn) {
    zenTestBtn.onclick = async () => {
      const r = await runZenProbe()
      const msg = r.ok ? (t('zenReady') + r.model) : t('zenUnavailable')
      if (zenStatus) zenStatus.textContent = msg
      if (r.ok) fillZenModels(readZenCache().free, r.model)
      toast(msg)
    }
  }

  document.querySelectorAll('input[name=selkey]').forEach(r => {    r.onchange = () => {
      if (!r.checked) return
      const idx = Number(r.value)
      syncFormToEntry(idx)
      if (!S || useStandalone) {
        selectKeyStandalone(idx)
        selected = idx
        save()
        refreshAll()
        return
      }
      S.selectedKey = idx
      selected = idx
      save()
      refreshAll()
    }
  })
}

/**
 * 启动时确保「内置免费通道」可用并作为默认。
 * - 已配置用户自己的 Key 且未选中内置通道 → 什么都不做（尊重用户配置）
 * - 否则探测免费模型：通了的第一个写回 Key 库并选中（免费名单会被上游随机更换）
 * @returns {Promise<{ok:boolean, enabled:boolean, model?:string, reason?:string, error?:string}>}
 */
export async function ensureBuiltinZenDefault({ onStatus } = {}) {
  let store
  try { store = loadKeyStore() } catch (e) { store = { keys: [], selected: 0 } }
  const keys = Array.isArray(store.keys) ? store.keys.slice() : []
  const zenIdx = keys.findIndex(k => isZenBase(k && k.baseUrl))
  const userKeys = keys.filter(k => !isZenBase(k && k.baseUrl))
  const selectedIsZen = zenIdx >= 0 && Number(store.selected) === zenIdx
  if (userKeys.length && !selectedIsZen) return { ok: true, enabled: false, reason: 'has-user-key' }

  // 启动自动启用：每次拉名单（/models 不耗额度），名单没变就跳过连接测试，只有名单变了才重新测
  const r = await ensureZenReady({ force: false, onStatus })
  if (!r.ok) return { ok: false, enabled: false, error: r.error || '不可用' }
  const rec = zenConfig(r.model)
  const next = keys.slice()
  let idx = next.findIndex(k => isZenBase(k && k.baseUrl))
  if (idx >= 0) next[idx] = Object.assign({}, next[idx], rec)
  else { next.push(rec); idx = next.length - 1 }
  writeKeyStore({ keys: next, selected: idx })
  return { ok: true, enabled: true, model: r.model, index: idx }
}

export function openHelp(app) {  const S = app.S
  const pack = S ? (globalThis.__AW_PACKS__[S.worldview]) : null
  const ui = pack && pack.ui ? pack.ui : { advanceBtn: t('advance') }
  openModal(`
    <h2>${t('helpTitle')}${esc(pack ? pack.name : t('brand'))}</h2>
    <p>${esc(pack ? pack.tagline : '')}</p>
    <p>1. ${t('helpP1')} <b>🔑 API</b> ${t('helpP1b')} <b>chat</b> ${t('helpP1c')} <b>response</b>。</p>
    <p>2. ${t('helpP2')} <b>${t('navScene')}</b> ${t('helpP2b')}</p>
    <p>3. ${t('helpP3')} <b>${esc(pack ? pack.lexicon.progress : t('progressWord'))}</b> ${t('helpP3b')} <b>${esc(ui.advanceBtn)}</b> ${t('helpP3c')}${esc(pack ? pack.lexicon.level : t('levelWord'))}。</p>
    <p>4. <b>🌐 ${t('worlds')}</b> ${t('helpP4')}</p>
    <p>5. ${t('api')} <b>🔑</b> ${t('helpP5')}</p>
    <p style="color:var(--faint);font-size:12px">${t('helpProto')}</p>
    <div class="btn-row"><button class="btn btn-gold" data-close type="button">${t('ok')}</button></div>
  `)
}

function persistKeysStandalone(rec, selNow, keyInput) {
  try {
    const data = loadKeyStore()
    // 同 base+model+协议 才更新；chat/response 即便同 Key 也各存一条
    let idx = data.keys.findIndex(k => sameKeyEntry(k, rec))
    if (idx < 0 && !keyInput && typeof selNow === 'number' && data.keys[selNow]) {
      idx = selNow // 沿用原 Key 的编辑
    }
    if (idx >= 0) {
      const old = data.keys[idx] || {}
      data.keys[idx] = Object.assign({}, old, rec, {
        key: rec.key || old.key || old.value || ''
      })
      data.selected = idx
    } else {
      data.keys.push(rec)
      data.selected = data.keys.length - 1
    }
    writeKeyStore(data)
  } catch (e) { /* ignore */ }
}

function deleteKeyStandalone(i) {
  try {
    const data = loadKeyStore()
    data.keys.splice(i, 1)
    if (data.selected === i) data.selected = 0
    else if (typeof data.selected === 'number' && data.selected > i) data.selected -= 1
    if (!data.keys.length) data.selected = 0
    writeKeyStore(data)
  } catch (e) { /* ignore */ }
}

function selectKeyStandalone(idx) {
  try {
    const data = loadKeyStore()
    if (data.keys[idx]) data.selected = idx
    writeKeyStore(data)
  } catch (e) { /* ignore */ }
}

let _keyStoreCache = null

function writeKeyStore(data) {
  // 内存缓存：同步读取必须走这里
  _keyStoreCache = { keys: (data.keys || []).slice(), selected: data.selected }
  try { setKeysCache(data) } catch (e) { /* ignore */ }
  const host = (typeof window !== 'undefined' && window.awHost && window.awHost.secrets) || null
  if (host && host.save) {
    // 宿主加密仓可用时绝不写明文 localStorage；仅写入成功后才删本地副本，
    // 失败则保留副本并告警，避免密钥静默丢失
    host.save(data).then(() => {
      try { localStorage.removeItem('agentworlds_apikeys_v1') } catch (e) { /* ignore */ }
    }).catch(() => {
      toast('API Key 已更新，但写入加密仓失败，本地副本已保留')
    })
    return
  }
  try { localStorage.setItem('agentworlds_apikeys_v1', JSON.stringify(data)) } catch (e) { /* ignore */ }
}

function loadKeyStore() {
  if (_keyStoreCache && Array.isArray(_keyStoreCache.keys)) return _keyStoreCache
  // 引擎缓存（hydrate 后）优先，避免两套库不一致
  try {
    const kd = loadPlayerKeys()
    if (kd && Array.isArray(kd.keys) && kd.keys.length) {
      _keyStoreCache = { keys: kd.keys.slice(), selected: kd.selected }
      return _keyStoreCache
    }
  } catch (e) { /* ignore */ }
  const host = (typeof window !== 'undefined' && window.awHost && window.awHost.secrets) || null
  try {
    const raw = localStorage.getItem('agentworlds_apikeys_v1')
    if (raw) {
      const d = JSON.parse(raw)
      if (!Array.isArray(d.keys)) d.keys = []
      _keyStoreCache = d
      // 宿主可用时把明文一次性迁入加密仓并删除
      if (host && host.save) {
        host.save(d).then(() => {
          try { localStorage.removeItem('agentworlds_apikeys_v1') } catch (e) { /* ignore */ }
        }).catch(() => { /* ignore */ })
      }
      return d
    }
  } catch (e) { /* ignore */ }
  return _keyStoreCache || { keys: [], selected: 0 }
}
