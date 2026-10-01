// 设置面板：自定义 API Key（chat / response）
import { openModal, closeModal, toast, confirmModal } from './modals.js'
import { normalizeApiKey, endpointOf, maskKey, listModels, testConnection } from '../engine/llm.js'
import { esc } from '../engine/util.js'
import { t } from '../engine/i18n.js'
import { setKeysCache, loadPlayerKeys } from '../engine/state.js'
import { formDirty, upsertKeyEntry, isZenEntry } from '../engine/keyprofile.js'
import { ensureZenReady, zenConfig, isZenBase, readZenCache, zenUsageToday, ZEN_BASE, ZEN_KEY, ZEN_NAME, ZEN_DAILY_LIMIT } from '../engine/zen.js'
import { PROVIDER_PRESETS, presetSteps, findPreset } from '../engine/providers.js'
import { upgradeSelect, setSelectVisible, openPicker } from './picker.js'

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

  // 「已保存」只列玩家自己添加的接口：内置免费通道在「内置免费」tab 里管理，
  // 不占用这里（也不会因为换模型而多出一条）
  const customEntries = keys.map((k, i) => ({ n: normalizeApiKey(k) || k, i })).filter(x => !isZenBase(x.n.baseUrl))
  const savedCount = customEntries.length
  const rows = customEntries.map(({ n, i }) => {
    const style = (n.apiStyle === 'response') ? 'response' : 'chat'
    return `
      <div class="key-row">
        <label>
          <input type="radio" name="selkey" value="${i}" ${selected === i ? 'checked' : ''}>
          <span class="key-lines">
            <span class="key-top">
              <b>${esc(n.name || t('cfgN') + (i + 1))}</b>
              <span class="ctype">${style === 'response' ? 'response' : 'chat'}</span>
            </span>
            <span class="key-sub">
              <span class="masktext">${esc(n.model || '')}</span>
              <span class="masktext key-state">${(n.key || n.value) ? t('savedHidden') : t('unset')}</span>
            </span>
          </span>
        </label>
        <button class="btn btn-sm" data-edit="${i}" type="button">${t('edit')}</button>
        <button class="btn btn-sm btn-danger" data-del="${i}" type="button">${t('delete')}</button>
      </div>
    `
  }).join('')

  // 当前正在使用的那条配置（决定默认 tab / 内置标记 / 内置面板选中项）
  const active = keys[selected] && normalizeApiKey(keys[selected])
  // 「自定义接口」是一张**空白新增表单**：点「已保存」里的「编辑」才会载入已有配置
  let cur = null
  const curStyle = (cur && cur.apiStyle === 'response') ? 'response' : 'chat'

  // 默认落在哪个 tab：跟随当前配置（内置通道 → 内置免费；有自定义配置 → 已保存；都没有 → 服务商预设）
  const zenActive = isZenBase(active && active.baseUrl)
  const initialTab = mode === 'zen' ? 'zen'
    : mode === 'preset' ? 'preset'
      : mode === 'saved' || mode === 'custom' ? (mode === 'custom' ? 'custom' : 'saved')
        : (zenActive ? 'zen' : (keys.length ? 'saved' : 'preset'))

  // 内置免费面板：模型列表完全来自探测结果（不硬编码任何模型名）
  const _zc = readZenCache()
  const _zlist = []
  for (const m of [].concat(_zc.working || [], _zc.free || [], zenActive && active ? [active.model] : [])) {
    if (m && !_zlist.includes(m)) _zlist.push(m)
  }
  const zenPick = _zc.working || (zenActive && active ? active.model : '') || _zlist[0] || ''
  const zenOptions = _zlist.map(m => `<option value="${esc(m)}" ${m === zenPick ? 'selected' : ''}>${esc(m)}</option>`).join('')
  const zenStatusText = _zc.working
    ? t('zenReady') + _zc.working + (_zc.at ? '（' + new Date(_zc.at).toLocaleTimeString() + '）' : '')
    : t('zenHint')
  // 当前在用的配置名（用于在面板里说明「现在用的不是内置通道」）
  const activeName = (active && (active.name || active.model)) || t('unset')
  // 当前正在用的配置是否就是某个服务商预设
  const activePreset = (active && findPreset(active.baseUrl)) || null

  /** 把一条配置写入并设为当前（独立 Key 库 / 存档内 keys 两种情况） */
  function activate(rec) {
    if (!S || useStandalone) {
      persistKeysStandalone(rec, null, rec.key || '')
    } else {
      // 内置免费通道只保留一条：换模型时更新那一条，不会越存越多
      const r = upsertKeyEntry(S.playerKeys || [], rec)
      S.playerKeys = r.list
      S.selectedKey = r.index
    }
    save()
    refreshAll()
  }

  openModal(`
    <h2>${t('apiSettings')}</h2>
    ${globalThis.__AW_KEYS_PLAINTEXT__ === true ? `<div style="margin:8px 0;padding:10px;border:1px solid var(--red);border-radius:8px;color:var(--red);font-size:12px">⚠ 当前环境不支持密钥加密存储（safeStorage 不可用），API Key 以明文保存在本机，请注意设备安全</div>` : ''}
    <div class="btn-row" style="margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-sm" id="mode-zen" type="button">${t('zenModeFree')}${zenActive ? ' ✓' : ''}</button>
      <button class="btn btn-sm" id="mode-preset" type="button">${t('tabPreset')}</button>
      <button class="btn btn-sm" id="mode-saved" type="button">${t('tabSaved')}${savedCount ? ' (' + savedCount + ')' : ''}</button>
      <button class="btn btn-sm" id="mode-custom" type="button">${t('tabCustom')}</button>
    </div>

    <div id="zen-panel" style="display:none">
      <div style="font-size:12px;color:var(--faint);margin-top:10px">${t('zenHint')}</div>
      <div id="k-zen-active" style="margin-top:8px;padding:8px 10px;border:1px solid var(--line2);border-radius:8px;font-size:12px;color:${zenActive ? 'var(--accent)' : 'var(--dim)'};line-height:1.6">
        ${zenActive ? '✓ ' + t('zenInUse') + (active && active.model ? '：' + esc(active.model) : '') : t('zenNotInUse') + esc(activeName)}
      </div>
      <div id="k-zen-quota" style="margin-top:8px;padding:8px 10px;border:1px solid var(--line2);border-radius:8px;font-size:12px;color:var(--dim);line-height:1.6"></div>
      <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('zenModelPick')}</label>
      <select id="zen-model" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px">
        ${zenOptions}
      </select>
      <div style="font-size:12px;color:var(--faint);margin-top:6px" id="k-zen-status">${zenStatusText}</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-gold" id="k-zen" type="button">${t('zenEnable')}</button>
        <button class="btn btn-sm" id="k-zen-refresh" type="button">${t('refreshModels')}</button>
        <button class="btn btn-sm" id="k-zen-test" type="button">${t('testConn')}</button>
        <button class="btn" data-close type="button">${t('close')}</button>
      </div>
    </div>

    <div id="preset-panel" style="display:none">
      <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('presetPick')}</label>
      <select id="k-preset" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px">
        ${PROVIDER_PRESETS.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.tag ? ' · ' + esc(p.tag) : ''}</option>`).join('')}
      </select>
      <div style="font-size:12px;color:var(--faint);margin-top:6px" id="k-preset-hint">${t('providerPresetHint')}</div>
      <div id="k-preset-active" style="margin-top:8px;padding:8px 10px;border:1px solid var(--line2);border-radius:8px;font-size:12px;color:${activePreset ? 'var(--accent)' : 'var(--dim)'};line-height:1.6">
        ${activePreset ? '✓ ' + t('presetInUse') + '：' + esc(activePreset.name) + (active && active.model ? ' · ' + esc(active.model) : '') : t('presetNotInUse') + esc(activeName)}
      </div>
      <div id="k-preset-box" style="margin-top:8px;padding:8px 10px;border:1px solid var(--line2);border-radius:8px;font-size:12px;color:var(--dim);line-height:1.7"></div>
      <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('apiKey')}</label>
      <input id="k-preset-key" type="password" placeholder="sk-…" autocomplete="off" value="">
      <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">${t('model')}</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input id="k-preset-model" type="text" style="margin-top:0;flex:1" placeholder="${t('presetModelPh')}" value="">
        <button class="btn btn-sm" id="k-preset-pick" type="button">${t('pickOne')}</button>
        <button class="btn btn-sm" id="k-preset-refresh" type="button" title="GET {Base URL}/models">${t('refreshModels')}</button>
      </div>
      <div id="k-preset-model-hint" style="font-size:12px;color:var(--faint);margin-top:4px"></div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-gold" id="k-preset-save" type="button">${t('saveUse')}</button>
        <button class="btn btn-sm" id="k-preset-test" type="button">${t('testConn')}</button>
        <span style="font-size:12px;color:var(--faint);align-self:center" id="k-preset-test-status"></span>
      </div>
      <div class="btn-row" style="margin-top:10px"><button class="btn" data-close type="button">${t('close')}</button></div>
    </div>

    <div id="saved-panel" style="display:none">
      <div style="margin-top:8px">${rows || `<div class="empty">${t('noApi')}</div>`}</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-sm" id="k-saved-test" type="button">${t('testConn')}</button>
        <span style="font-size:12px;color:var(--faint);align-self:center" id="k-saved-test-status"></span>
        <button class="btn" data-close type="button">${t('close')}</button>
      </div>
    </div>

    <div id="custom-panel" style="display:none">
    <h3>${t('addUpdate')}</h3>
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

  // 原生 <select> 在 Android WebView 里展开的是系统弹层（白底系统字体），与暗色主题不搭，
  // 统一换成应用内自绘下拉：隐藏原生控件，选择结果照旧写回 select 并派发 change。
  upgradeSelect(selStyle, { title: t('proto') })
  upgradeSelect(modelList, { title: t('model') })
  upgradeSelect(document.getElementById('zen-model'), { title: t('zenModelPick') })
  upgradeSelect(document.getElementById('k-preset'), { title: t('presetPick') })
  setSelectVisible(modelList, false)

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
    setSelectVisible(modelList, true)
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
      : (baseEl.value.trim() || modelEl.value.trim() ? t('reuseKeyHint') : t('customFormHint'))
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
    const r = upsertKeyEntry(S.playerKeys || [], rec, {
      selNow: typeof selNow === 'number' ? selNow : -1,
      keyInput
    })
    S.playerKeys = r.list
    S.selectedKey = r.index
    save()
    refreshAll()
    closeModal()
    toast(t('apiSaved'))
  }

  // —— 服务商预设：下拉选择（不再全铺开），自动展示该家信息与教程，玩家只需粘 Key ——
  const presetSel = document.getElementById('k-preset')
  const presetBox = document.getElementById('k-preset-box')
  const presetKeyEl = document.getElementById('k-preset-key')
  const presetHint = document.getElementById('k-preset-hint')
  const presetModelEl = document.getElementById('k-preset-model')
  const presetPickBtn = document.getElementById('k-preset-pick')
  let presetModelOptions = []
  const presetModelHint = document.getElementById('k-preset-model-hint')
  const presetRefreshBtn = document.getElementById('k-preset-refresh')

  const currentPreset = () => (presetSel && PROVIDER_PRESETS.find(p => p.id === presetSel.value)) || PROVIDER_PRESETS[0]

  function renderPreset({ clearKey } = {}) {
    const p = currentPreset()
    if (!p) return
    if (presetHint) presetHint.textContent = t('providerPresetHint')
    if (clearKey && presetKeyEl) presetKeyEl.value = ''
    // 所有服务商一律不预填模型，刷新后由玩家在弹层自选
    if (presetModelEl) presetModelEl.value = ''
    presetModelOptions = (p.models || []).slice()
    if (presetModelHint) presetModelHint.textContent = t('presetAutoModelHint')
    if (!presetBox) return
    presetBox.innerHTML =
      `<b>${esc(p.name)}</b>${p.tag ? ' · ' + esc(p.tag) : ''}${p.note ? ' —— ' + esc(p.note) : ''}` +
      // 教程默认折叠：需要时再点开，避免一屏全是步骤
      `<details style="margin-top:6px"><summary style="cursor:pointer;color:var(--accent)">${t('providerShowSteps')}</summary>` +
      `<div style="margin-top:4px">${presetSteps(p).map(s => esc(s)).join('<br>')}</div>` +
      `<div style="margin-top:6px">${t('providerGetKey')}` +
      `<input type="text" readonly value="${esc(p.keyUrl)}" style="margin-top:4px;font-size:12px"></div>` +
      `</details>`
  }

  // 刷新模型列表：拉取**全部**模型进下拉，**不写入**模型框
  let presetFetching = false
  let presetFetchedFor = ''
  async function fetchPresetModels({ auto } = {}) {
    const p = currentPreset()
    const key = (presetKeyEl && presetKeyEl.value.trim()) || ''
    if (presetFetching) return
    if (!key) { if (!auto) toast(t('fillApiKey')); return }
    presetFetching = true
    if (presetModelHint) presetModelHint.textContent = t('requestingModels')
    const r = await listModels({ baseUrl: p.baseUrl, key })
    presetFetching = false
    if (!r.ok) {
      if (presetModelHint) presetModelHint.innerHTML = `<span style="color:var(--red)">${t('fetchFailPrefix')}${esc(r.error || '')}</span>`
      if (!auto) toast(t('fetchFail'))
      return
    }
    const items = r.items && r.items.length ? r.items : (r.models || []).map(id => ({ id, created: 0 }))
    // 版本号高的排前（v4.1 先于无版本别名 flash），再按 id
    const ordered = items.slice().sort((a, b) => {
      const va = versionRank(String(a.id))
      const vb = versionRank(String(b.id))
      if (va !== vb) return vb - va
      return String(a.id).localeCompare(String(b.id))
    })
    presetModelOptions = ordered.map(x => String(x.id))
    presetFetchedFor = p.id
    if (presetModelHint) {
      presetModelHint.textContent = `${t('fetchedModels')} ${ordered.length} ${t('fetchedModels2')} · ${t('pickOne')}`
    }
    if (!auto) {
      toast(`${t('fetchedN')} ${ordered.length}${t('modelsN')}`)
      openModelPicker()
    }
  }

  function versionRank(id) {
    const m = /(?:^|[^\d.])v?(\d+(?:\.\d+)?)/i.exec(id)
    return m ? Number(m[1]) : 0
  }

  function openModelPicker() {
    if (!presetModelOptions.length) {
      fetchPresetModels({ auto: false })
      return
    }
    openPicker({
      title: t('model'),
      options: presetModelOptions.map(id => ({ value: id, label: id })),
      current: (presetModelEl && presetModelEl.value) || '',
      onPick: (v) => {
        if (presetModelEl) presetModelEl.value = v
      }
    })
  }

  // 先定位选中项并同步自绘按钮，再绑定 onchange（避免打开面板就触发清空）
  if (presetSel && activePreset) presetSel.value = activePreset.id
  if (presetSel && presetSel.__awBtn) {
    const opt = presetSel.options[presetSel.selectedIndex]
    if (opt) {
      presetSel.__awBtn.innerHTML = `<span class="fs-label">${esc(opt.textContent)}</span><span class="caret">▾</span>`
    }
  }
  renderPreset({ clearKey: true })
  if (presetSel) presetSel.onchange = () => { presetFetchedFor = ''; renderPreset({ clearKey: true }) }
  if (presetRefreshBtn) presetRefreshBtn.onclick = () => fetchPresetModels({ auto: false })
  if (presetPickBtn) presetPickBtn.onclick = () => openModelPicker()
  if (presetKeyEl) {
    // 粘完 Key 自动拉一次列表（缓存选项，不写模型框）
    presetKeyEl.onblur = () => {
      const p = currentPreset()
      if (p && presetKeyEl.value.trim() && presetFetchedFor !== p.id) fetchPresetModels({ auto: true })
    }
  }


  const presetSaveBtn = document.getElementById('k-preset-save')
  if (presetSaveBtn) {
    presetSaveBtn.onclick = () => {
      const p = currentPreset()
      const key = (presetKeyEl && presetKeyEl.value.trim()) || ''
      const model = (presetModelEl && presetModelEl.value.trim()) || ''
      if (!key) { toast(t('fillApiKey')); return }
      if (!model) { toast(t('fillModel')); return }
      activate({
        name: p.name,
        baseUrl: p.baseUrl,
        key,
        model,
        apiStyle: p.apiStyle === 'response' ? 'response' : 'chat'
      })
      closeModal()
      toast(t('apiSaved'))
    }
  }

  const presetTestBtn = document.getElementById('k-preset-test')
  const presetTestStatus = document.getElementById('k-preset-test-status')
  if (presetTestBtn) {
    presetTestBtn.onclick = async () => {
      const p = currentPreset()
      const key = (presetKeyEl && presetKeyEl.value.trim()) || ''
      const model = (presetModelEl && presetModelEl.value.trim()) || ''
      if (!key) { toast(t('fillApiKey')); return }
      const old = presetTestBtn.textContent
      presetTestBtn.disabled = true
      presetTestBtn.textContent = t('testing')
      if (presetTestStatus) presetTestStatus.textContent = ''
      let r
      try {
        r = await testConnection({
          baseUrl: p.baseUrl,
          key,
          model,
          apiStyle: p.apiStyle === 'response' ? 'response' : 'chat'
        })
      } catch (e) {
        r = { ok: false, ms: 0, error: (e && e.message) || '失败' }
      }
      presetTestBtn.disabled = false
      presetTestBtn.textContent = old
      const ms = Math.round(Number(r.ms) || 0)
      const msg = r.ok
        ? (t('testOk') + ' · ' + ms + 'ms' + (r.reply ? ' · ' + r.reply : ''))
        : (t('testFail') + (r.error || ''))
      if (presetTestStatus) presetTestStatus.textContent = msg
      toast(msg)
    }
  }

  // 已保存列表的「编辑」：把该条载入「自定义接口」tab 后再改
  document.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.edit)
      syncFormToEntry(i)
      selected = i
      setMode('custom')
      toast(t('loadedToCustom'))
    }
  })

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
  // 四个 tab：内置免费 / 服务商预设 / 已保存 / 自定义接口
  const PANEL_IDS = { zen: 'zen-panel', preset: 'preset-panel', saved: 'saved-panel', custom: 'custom-panel' }
  const panelEls = {}
  const modeBtns = {}
  for (const k of Object.keys(PANEL_IDS)) {
    panelEls[k] = document.getElementById(PANEL_IDS[k])
    modeBtns[k] = document.getElementById('mode-' + k)
  }
  const setMode = (m) => {
    const want = PANEL_IDS[m] ? m : 'preset'
    for (const k of Object.keys(PANEL_IDS)) {
      if (panelEls[k]) panelEls[k].style.display = (k === want) ? '' : 'none'
      if (modeBtns[k]) modeBtns[k].classList.toggle('btn-gold', k === want)
    }
  }
  for (const k of Object.keys(PANEL_IDS)) if (modeBtns[k]) modeBtns[k].onclick = () => setMode(k)
  setMode(initialTab)

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
  // 打开面板时拉一次名单：没有名单、或名单超过 5 分钟就刷新
  // —— GET /models 不消耗额度，只有需要重新确认可用模型时才会做连接测试
  const _zcNow = readZenCache()
  const _zenStale = !((_zcNow.free || []).length) || (Date.now() - (_zcNow.at || 0) > 5 * 60 * 1000)
  if (_zenStale) {
    ensureZenReady({ force: false, onStatus: (m) => { if (zenStatus) zenStatus.textContent = m } })
      .then((r) => {
        const err = r && (r.listErr || r.error)
        if (r && r.ok && r.model) {
          fillZenModels(readZenCache().free, r.model)
          if (zenStatus) {
            zenStatus.textContent = (r.listErr ? t('zenListFail') + r.listErr + ' · ' : '') + t('zenReady') + r.model
          }
        } else if (err && zenStatus) {
          zenStatus.textContent = t('zenListFail') + err
        }
      })
      .catch(() => { /* ignore */ })
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
      let model = (zenModelEl && zenModelEl.value) || ''
      if (!model) {
        const probed = await runZenProbe()
        model = probed.ok ? probed.model : ''
      }
      if (!model) {
        const msg = t('zenUnavailable')
        if (zenStatus) zenStatus.textContent = msg
        toast(msg)
        return
      }
      const old = zenTestBtn.textContent
      zenTestBtn.disabled = true
      zenTestBtn.textContent = t('testing')
      try {
        const r = await testConnection({
          baseUrl: ZEN_BASE,
          key: ZEN_KEY,
          model,
          apiStyle: 'chat'
        })
        const msg = r.ok ? (t('testOk') + model) : (t('testFail') + (r.error || ''))
        if (zenStatus) zenStatus.textContent = msg
        toast(msg)
      } catch (e) {
        const msg = t('testFail') + ((e && e.message) || '')
        if (zenStatus) zenStatus.textContent = msg
        toast(msg)
      }
      zenTestBtn.disabled = false
      zenTestBtn.textContent = old
    }
  }
  const zenRefreshBtn = document.getElementById('k-zen-refresh')
  if (zenRefreshBtn) {
    zenRefreshBtn.onclick = async () => {
      const r = await runZenProbe()
      const msg = r.ok ? t('fetchedModels') + ' ' + (r.model || '') : t('zenUnavailable')
      if (zenStatus) zenStatus.textContent = msg
      if (r.ok) fillZenModels(readZenCache().free, r.model)
      toast(msg)
    }
  }

  // 已保存：对当前选中的那条配置测一次连通
  const savedTestBtn = document.getElementById('k-saved-test')
  const savedTestStatus = document.getElementById('k-saved-test-status')
  if (savedTestBtn) {
    savedTestBtn.onclick = async () => {
      const checked = document.querySelector('input[name=selkey]:checked')
      const idx = checked ? Number(checked.value) : selected
      const raw = keys[idx]
      const n = raw && normalizeApiKey(raw)
      if (!n || !(n.key || n.value)) {
        if (savedTestStatus) savedTestStatus.textContent = t('fillApiKey')
        toast(t('fillApiKey'))
        return
      }
      const old = savedTestBtn.textContent
      savedTestBtn.disabled = true
      savedTestBtn.textContent = t('testing')
      if (savedTestStatus) savedTestStatus.textContent = ''
      try {
        const r = await testConnection({
          baseUrl: n.baseUrl,
          key: n.key || n.value,
          model: n.model,
          apiStyle: n.apiStyle === 'response' ? 'response' : 'chat'
        })
        const msg = r.ok ? t('testOk') + (r.model || n.model || '') : (t('testFail') + (r.error || ''))
        if (savedTestStatus) savedTestStatus.textContent = msg
        toast(msg)
      } catch (e) {
        const msg = t('testFail') + ((e && e.message) || '')
        if (savedTestStatus) savedTestStatus.textContent = msg
        toast(msg)
      }
      savedTestBtn.disabled = false
      savedTestBtn.textContent = old
    }
  }

  // 切换当前使用的那条配置：只改选用状态，**不动自定义接口的空白表单**
  // （要修改某条请到「已保存」里点「编辑」，那时才会载入表单）
  document.querySelectorAll('input[name=selkey]').forEach(r => {
    r.onchange = () => {
      if (!r.checked) return
      const idx = Number(r.value)
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
    // 同 base+model+协议 才更新；chat/response 即便同 Key 也各存一条；
    // 内置免费通道只保留一条（切换模型时更新，不再新增）
    const r = upsertKeyEntry(data.keys, rec, { selNow: typeof selNow === 'number' ? selNow : -1, keyInput })
    data.keys = r.list
    data.selected = r.index
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
