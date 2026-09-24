// 自定义世界：导入 JSON / 从作品生成草稿
import { openModal, closeModal, toast } from './modals.js'
import { esc } from '../engine/util.js'
import { validatePackDraft, PACK_DRAFT_PROMPT, packToDraft } from '../engine/worldpack.js'
import { saveCustomPackDraft, deleteCustomPack, loadCustomPackDrafts } from '../engine/custom-packs.js'
import { reloadPacks, listPacks, isBuiltinPack, getPack } from '../worldviews/index.js'
import { callLLM, extractGameJSON } from '../engine/llm.js'

function activeKey(app) {
  const S = app && app.S
  const keys = (S && Array.isArray(S.playerKeys)) ? S.playerKeys : []
  if (!keys.length) return null
  const idx = (typeof S.selectedKey === 'number' && keys[S.selectedKey]) ? S.selectedKey : 0
  return keys[idx] || keys[0] || null
}

function draftFromForm() {
  const title = (document.getElementById('cw-title').value || '').trim()
  const author = (document.getElementById('cw-author').value || '').trim()
  const setting = (document.getElementById('cw-setting').value || '').trim()
  const levels = (document.getElementById('cw-levels').value || '').trim()
  const style = (document.getElementById('cw-style').value || '奇幻冒险').trim()
  return { title, author, setting, levels, style }
}

export function openWorldAuthor(app, { onSaved } = {}) {
  const customs = loadCustomPackDrafts()
  openModal(`
    <h2>自定义世界</h2>
    <p style="font-size:12px;color:var(--dim)">每个自定义世界会出现在欢迎页，拥有独立存档槽。内置六包不受影响。</p>

    <h3>① 从作品生成</h3>
    <label style="color:var(--dim);font-size:12px">书名 / 作品名</label>
    <input id="cw-title" type="text" placeholder="例如 诡秘之主" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">作者（可选）</label>
    <input id="cw-author" type="text" placeholder="例如 爱潜水的乌贼" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">设定摘要（越具体越好）</label>
    <textarea id="cw-setting" rows="4" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="力量体系、地理、主要势力、主角开局处境…"></textarea>
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">等级体系（可选，逗号分隔从低到高）</label>
    <input id="cw-levels" type="text" placeholder="序列九…序列零 / 学徒…半神" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">题材风格</label>
    <input id="cw-style" type="text" value="奇幻冒险" style="width:100%;margin-top:6px">
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-gold" id="cw-gen" type="button">用 AI 生成草稿</button>
      <button class="btn" id="cw-gen-stop" type="button" hidden>取消</button>
    </div>
    <div id="cw-status" style="font-size:12px;color:var(--faint);margin-top:6px">需要先配置 API Key。生成后可编辑 JSON 再保存。</div>

    <h3 style="margin-top:18px">② 粘贴 / 编辑 JSON</h3>
    <textarea id="cw-json" rows="8" style="width:100%;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px;font-size:12px" placeholder='{"id":"my-world","name":"我的世界",…}'></textarea>
    <div class="btn-row">
      <button class="btn" id="cw-validate" type="button">校验</button>
      <button class="btn btn-gold" id="cw-save" type="button">保存世界包</button>
    </div>
    <div id="cw-msg" style="font-size:12px;margin-top:6px;color:var(--faint)"></div>

    <h3 style="margin-top:18px">③ 已保存的自定义世界</h3>
    <div id="cw-list">
      ${customs.length ? customs.map(d => `
        <div class="key-row">
          <label>
            <b>${esc(d.icon || '🌍')} ${esc(d.name || d.id)}</b>
            <span class="masktext">${esc(d.id || '')}</span>
            <span class="masktext">${esc((d.tiers || []).length)} 阶 · ${(d.map || []).length} 地</span>
          </label>
          <button class="btn btn-sm" data-export="${esc(d.id || '')}" type="button">导出</button>
          <button class="btn btn-sm btn-danger" data-del="${esc(d.id || '')}" type="button">删除</button>
        </div>
      `).join('') : '<div class="empty">暂无自定义世界</div>'}
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" data-close type="button">关闭</button>
    </div>
  `)

  const status = document.getElementById('cw-status')
  const msg = document.getElementById('cw-msg')
  const jsonEl = document.getElementById('cw-json')
  let genCtl = null

  document.getElementById('cw-gen').onclick = async () => {
    const f = draftFromForm()
    if (!f.title) { toast('请填写书名/作品名'); return }
    const keyObj = activeKey(app) || firstKeyFallback(app)
    if (!keyObj) {
      status.textContent = '未配置 API Key，请先在顶栏 🔑 API 中配置。'
      return
    }
    const btn = document.getElementById('cw-gen')
    const stop = document.getElementById('cw-gen-stop')
    btn.disabled = true
    stop.hidden = false
    status.textContent = '正在生成世界包草稿…'
    genCtl = new AbortController()
    stop.onclick = () => { try { genCtl.abort() } catch (e) {} }

    const user = `作品：${f.title}${f.author ? '（' + f.author + '）' : ''}
题材风格：${f.style}
设定摘要：${f.setting || '（请根据作品常识补全）'}
等级体系提示：${f.levels || '（请自行设计 5~12 阶）'}

请输出完整世界包 JSON。`
    const res = await callLLM({
      keyObj,
      system: PACK_DRAFT_PROMPT,
      user,
      signal: genCtl.signal
    })
    btn.disabled = false
    stop.hidden = true
    genCtl = null
    if (!res.ok) {
      status.textContent = '生成失败：' + (res.error || '')
      return
    }
    const json = extractGameJSON(res.text)
    if (!json) {
      status.textContent = '未解析到 JSON，请重试或手动粘贴。'
      jsonEl.value = res.text.slice(0, 8000)
      return
    }
    // 稳定 id：避免与内置冲突
    if (!json.id || String(json.id).toLowerCase() === f.title.toLowerCase()) {
      json.id = 'book-' + hashId(f.title)
    }
    if (BUILTIN_HIT(json.id)) json.id = json.id + '-x'
    jsonEl.value = JSON.stringify(json, null, 2)
    const v = validatePackDraft(json)
    if (v.ok) {
      status.textContent = `草稿已生成：${v.pack.name}（${v.pack.tiers.length} 阶 · ${v.pack._decl.map.length} 地）。可编辑后保存。`
      msg.textContent = ''
    } else {
      status.textContent = '草稿需修正：' + v.errors.join('；')
    }
  }

  document.getElementById('cw-validate').onclick = () => {
    const r = parseDraft(jsonEl.value)
    if (!r) { msg.style.color = 'var(--red)'; msg.textContent = 'JSON 解析失败'; return }
    const v = validatePackDraft(r)
    if (v.ok) {
      msg.style.color = 'var(--jade)'
      msg.textContent = `校验通过：${v.pack.name} · ${v.pack.tiers.length} 阶 · 地点 ${v.pack._decl.map.length} · 世界 ${v.pack.worlds.join('/')}`
    } else {
      msg.style.color = 'var(--red)'
      msg.textContent = v.errors.join('；')
    }
  }

  document.getElementById('cw-save').onclick = () => {
    const r = parseDraft(jsonEl.value)
    if (!r) { msg.style.color = 'var(--red)'; msg.textContent = 'JSON 解析失败'; return }
    const saved = saveCustomPackDraft(r)
    if (!saved.ok) {
      msg.style.color = 'var(--red)'
      msg.textContent = (saved.errors || []).join('；') || '保存失败'
      return
    }
    reloadPacks()
    toast('世界包已保存：' + saved.pack.name)
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
      msg.textContent = '已导出到下方文本框，可复制保存。'
    }
  })

  document.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.del
      if (!confirm(`删除自定义世界「${id}」？其存档槽会保留，仅移除世界包。`)) return
      deleteCustomPack(id)
      reloadPacks()
      closeModal()
      openWorldAuthor(app, { onSaved })
      if (onSaved) onSaved(null)
    }
  })
}

function firstKeyFallback(app) {
  try {
    const raw = localStorage.getItem('agentworlds_apikeys_v1')
    const d = raw ? JSON.parse(raw) : null
    if (d && Array.isArray(d.keys) && d.keys.length) return d.keys[d.selected || 0] || d.keys[0]
  } catch (e) { /* ignore */ }
  return null
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
