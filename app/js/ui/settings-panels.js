// 设置面板：自定义 API Key（chat / response）
import { openModal, closeModal, toast } from './modals.js'
import { normalizeApiKey, endpointOf, maskKey, listModels } from '../engine/llm.js'
import { esc } from '../engine/util.js'

const STYLE_HELP = {
  chat: 'Chat Completions（OpenAI / 兼容网关常见）：POST …/chat/completions',
  response: 'Responses API（OpenAI 新版）：POST …/responses'
}

export function openKeyModal(app, { save, refreshAll }) {
  const S = app.S
  let selected = S && typeof S.selectedKey === 'number' ? S.selectedKey : 0
  const store = loadKeyStore()
  const keys = S && Array.isArray(S.playerKeys) && S.playerKeys.length ? S.playerKeys : (store.keys || [])

  const rows = keys.map((k, i) => {
    const n = normalizeApiKey(k) || k
    const style = (n.apiStyle === 'response') ? 'response' : 'chat'
    return `
      <div class="key-row">
        <label>
          <input type="radio" name="selkey" value="${i}" ${selected === i ? 'checked' : ''}>
          <b>${esc(n.name || '配置' + (i + 1))}</b>
          <span class="ctype">${style === 'response' ? 'response' : 'chat'}</span>
          <span class="masktext">${esc(n.model || '')}</span>
          <span class="masktext">${(n.key || n.value) ? '已保存 · 不显示' : '未设置'}</span>
        </label>
        <button class="btn btn-sm btn-danger" data-del="${i}" type="button">删除</button>
      </div>
    `
  }).join('')

  const cur = keys[selected] && normalizeApiKey(keys[selected])
  const curStyle = (cur && cur.apiStyle === 'response') ? 'response' : 'chat'

  openModal(`
    <h2>API 设置</h2>
    ${rows || '<div class="empty">尚未配置 API</div>'}

    <h3 style="margin-top:16px">添加 / 更新</h3>
    <label style="color:var(--dim);font-size:12px">协议</label>
    <select id="k-style" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px">
      <option value="chat" ${curStyle === 'chat' ? 'selected' : ''}>chat — Chat Completions</option>
      <option value="response" ${curStyle === 'response' ? 'selected' : ''}>response — Responses API</option>
    </select>
    <div style="font-size:12px;color:var(--faint);margin-top:6px" id="k-style-help">${STYLE_HELP[curStyle]}</div>

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">Base URL</label>
    <input id="k-base" type="text" placeholder="例如 https://api.openai.com/v1 或 https://your-gateway/v1" value="${esc(cur ? (cur.baseUrl || '') : '')}">

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">API Key</label>
    <input id="k-value" type="password" placeholder="sk-…" autocomplete="off" value="">

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">备注名（可选）</label>
    <input id="k-name" type="text" placeholder="我的 OpenAI / 公司网关…" value="${esc(cur ? (cur.name || '') : '')}">

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">模型</label>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <input id="k-model" type="text" style="margin-top:0;flex:1" placeholder="例如 gpt-4.1-mini / glm-4-flash / deepseek-chat" value="${esc(cur ? (cur.model || '') : '')}">
      <button class="btn btn-sm" id="k-refresh" type="button" title="GET {Base URL}/models">刷新模型列表</button>
    </div>
    <select id="k-model-list" style="width:100%;margin-top:8px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px;display:none">
      <option value="">— 从下方列表选择 —</option>
    </select>
    <div style="font-size:12px;color:var(--faint);margin-top:4px" id="k-model-hint">可手填模型名，或点「刷新模型列表」从接口拉取后选用。</div>

    <div style="font-size:12px;color:var(--faint);margin-top:10px" id="k-preview"></div>

    <div class="btn-row">
      <button class="btn btn-gold" id="k-add" type="button">保存并选用</button>
      <button class="btn" data-close type="button">关闭</button>
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
    if (!baseUrl) { toast('请先填写 Base URL'); return }
    if (!key) { toast('请先填写 API Key'); return }
    refreshBtn.disabled = true
    const old = refreshBtn.textContent
    refreshBtn.textContent = '拉取中…'
    modelHint.textContent = '正在请求模型列表…'
    const r = await listModels({ baseUrl, key })
    refreshBtn.disabled = false
    refreshBtn.textContent = old
    if (!r.ok) {
      modelHint.innerHTML = `<span style="color:var(--red)">拉取失败：${esc(r.error || '')}</span>`
      toast('模型列表拉取失败')
      return
    }
    const models = r.models || []
    modelList.innerHTML = `<option value="">— 共 ${models.length} 个，选择填入 —</option>` +
      models.map(id => `<option value="${esc(id)}" ${id === modelEl.value ? 'selected' : ''}>${esc(id)}</option>`).join('')
    modelList.style.display = ''
    modelHint.innerHTML = `已拉取 ${models.length} 个模型（${esc(r.url || '')}）。下拉选择或继续手填。`
    toast(`模型列表：${models.length} 个`)
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
      ? '请求地址：' + endpointOf(n)
      : '请填写 Base URL、模型；Key 为空时若已有配置则沿用原 Key。'
  }
  selStyle.onchange = refreshPreview
  baseEl.oninput = refreshPreview
  modelEl.oninput = refreshPreview
  valEl.oninput = refreshPreview
  refreshPreview()

  document.getElementById('k-add').onclick = () => {
    const apiStyle = selStyle.value === 'response' ? 'response' : 'chat'
    const baseUrl = baseEl.value.trim().replace(/\/+$/, '')
    const model = modelEl.value.trim()
    const keyInput = valEl.value.trim()
    const name = nameEl.value.trim() || model || '自定义'
    const selNow = (S && typeof S.selectedKey === 'number') ? S.selectedKey : selected
    if (!baseUrl || !model) {
      toast('请填写 Base URL 与模型')
      return
    }
    let key = keyInput
    if (!key) {
      // 更新已有配置时允许不重填 Key
      const old = typeof selNow === 'number' ? keys[selNow] : null
      key = (old && (old.key || old.value)) || ''
    }
    if (!key) {
      toast('请填写 API Key')
      return
    }
    const rec = { name, baseUrl, key, model, apiStyle }
    if (!S) {
      // 欢迎页配置：写入全局 Key 库，不依赖存档
      persistKeysStandalone(rec, selNow, keyInput)
      save()
      refreshAll()
      closeModal()
      toast('API 已保存')
      return
    }
    S.playerKeys = S.playerKeys || []
    if (typeof selNow === 'number' && S.playerKeys[selNow] && !keyInput) {
      // 覆盖当前条目（沿用原 Key）
      S.playerKeys[selNow] = rec
    } else if (typeof selNow === 'number' && S.playerKeys[selNow] && keyInput && keyInput === (S.playerKeys[selNow].key || S.playerKeys[selNow].value)) {
      S.playerKeys[selNow] = rec
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
    toast('API 已保存')
  }

  document.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.del)
      if (!S) {
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

  document.querySelectorAll('input[name=selkey]').forEach(r => {
    r.onchange = () => {
      if (!r.checked) return
      const idx = Number(r.value)
      if (!S) {
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

export function openHelp(app) {
  const S = app.S
  const pack = S ? (globalThis.__AW_PACKS__[S.worldview]) : null
  const ui = pack && pack.ui ? pack.ui : { advanceBtn: '升级' }
  openModal(`
    <h2>帮助 · ${esc(pack ? pack.name : '旅界')}</h2>
    <p>${esc(pack ? pack.tagline : '')}</p>
    <p>1. 在顶栏 <b>🔑 API</b> 配置自定义接口：Base URL + Key + 模型，协议选 <b>chat</b> 或 <b>response</b>。</p>
    <p>2. 在 <b>当前场景</b> 选择行动或输入自由行动，由 AI 实时生成剧情与数据变化。</p>
    <p>3. 攒够 <b>${esc(pack ? pack.lexicon.progress : '进度')}</b> 后点 <b>${esc(ui.advanceBtn)}</b> 提升${esc(pack ? pack.lexicon.level : '等级')}。</p>
    <p>4. <b>🌐 世界观</b> 切换世界；各世界存档独立，切换即读档。</p>
    <p>5. 顶栏 <b>🔑 API</b> 可配置/切换多组接口；Key 保存在本机，删档会保留。</p>
    <p style="color:var(--faint);font-size:12px">协议说明：chat → /chat/completions；response → /responses。内容由 AI 生成；存档在本机。桌面版 Key 经系统加密存储；安卓版为应用内本机存储，请勿在共用设备上保存他人 Key。</p>
    <div class="btn-row"><button class="btn btn-gold" data-close type="button">知道了</button></div>
  `)
}

function persistKeysStandalone(rec, selNow, keyInput) {
  try {
    const data = loadKeyStore()
    const exists = data.keys[selNow]
    if (exists) data.keys[selNow] = rec
    else {
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

function writeKeyStore(data) {
  const host = window.awHost && window.awHost.secrets
  if (host && host.save) {
    host.save(data).then(() => {
      try { localStorage.removeItem('agentworlds_apikeys_v1') } catch (e) { /* ignore */ }
    }).catch(() => {
      try { localStorage.setItem('agentworlds_apikeys_v1', JSON.stringify(data)) } catch (e) { /* ignore */ }
    })
    return
  }
  try { localStorage.setItem('agentworlds_apikeys_v1', JSON.stringify(data)) } catch (e) { /* ignore */ }
}

function loadKeyStore() {
  try {
    const raw = localStorage.getItem('agentworlds_apikeys_v1')
    const d = raw ? JSON.parse(raw) : { keys: [], selected: 0 }
    if (!Array.isArray(d.keys)) d.keys = []
    return d
  } catch (e) {
    return { keys: [], selected: 0 }
  }
}
