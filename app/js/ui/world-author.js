// 自定义世界：导入 JSON / 从作品或整本小说生成草稿
import { openModal, closeModal, toast } from './modals.js'
import { esc } from '../engine/util.js'
import { validatePackDraft, PACK_DRAFT_PROMPT, packToDraft } from '../engine/worldpack.js'
import { saveCustomPackDraft, deleteCustomPack, loadCustomPackDrafts } from '../engine/custom-packs.js'
import { reloadPacks, getPack, isBuiltinPack } from '../worldviews/index.js'
import { callLLM, extractGameJSON } from '../engine/llm.js'
import { sampleBookChunks, extractBookFacts, bibleToUserBrief, mergeWebOnly } from '../engine/book-ingest.js'
import { gatherWebLore, webNotesToBlock } from '../engine/book-web.js'

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
  const style = (document.getElementById('cw-style').value || '奇幻冒险').trim()
  const bookText = (document.getElementById('cw-book') ? document.getElementById('cw-book').value : '') || ''
  const urlsRaw = (document.getElementById('cw-urls') ? document.getElementById('cw-urls').value : '') || ''
  const useWeb = document.getElementById('cw-web')
    ? document.getElementById('cw-web').checked
    : true
  const urls = urlsRaw.split(/[\s,，]+/).map(s => s.trim()).filter(Boolean)
  return { title, author, setting, levels, style, bookText: bookText.trim(), useWeb, urls }
}

export function openWorldAuthor(app, { onSaved } = {}) {
  const customs = loadCustomPackDrafts()
  openModal(`
    <h2>自定义世界</h2>
    <p style="font-size:12px;color:var(--dim)">每个自定义世界会出现在欢迎页，拥有独立存档槽。内置六包不受影响。</p>

    <h3>① 从作品 / 整本小说生成</h3>
    <label style="color:var(--dim);font-size:12px">书名 / 作品名</label>
    <input id="cw-title" type="text" placeholder="例如 诡秘之主" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">作者（可选）</label>
    <input id="cw-author" type="text" placeholder="例如 爱潜水的乌贼" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">设定摘要（没原文时必填；有原文可留空）</label>
    <textarea id="cw-setting" rows="3" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="力量体系、地理、主要势力、主角开局处境…"></textarea>
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">等级体系（可选，逗号分隔从低到高）</label>
    <input id="cw-levels" type="text" placeholder="序列九…序列零 / 学徒…半神" style="width:100%;margin-top:6px">
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:10px">题材风格</label>
    <input id="cw-style" type="text" value="奇幻冒险" style="width:100%;margin-top:6px">
    <label style="display:block;margin-top:10px;font-size:12px;color:var(--dim)">
      <input id="cw-web" type="checkbox" checked> 先联网查百科/维基补充设定（可补未抽到章节的硬设定）
    </label>
    <label style="color:var(--dim);font-size:12px;display:block;margin-top:8px">设定页 URL（可选，空格/逗号分隔多个）</label>
    <input id="cw-urls" type="text" placeholder="https://…wiki / 设定帖链接" style="width:100%;margin-top:6px">
    <div class="btn-row" style="margin-top:10px">
      <button class="btn" id="cw-web-only" type="button">仅联网补设定并出草稿</button>
    </div>

    <label style="color:var(--dim);font-size:12px;display:block;margin-top:12px">小说原文（.txt 整本 / 多章粘贴）</label>
    <input id="cw-file" type="file" accept=".txt,.md,text/plain" style="margin-top:6px;font-size:12px">
    <div id="cw-file-info" style="font-size:12px;color:var(--faint);margin-top:4px">支持 TXT/MD。超长文本会自动抽样开头/中段/结尾章节做考据，不是全文直塞模型。</div>
    <textarea id="cw-book" rows="4" style="width:100%;margin-top:6px;background:#0d1526;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:8px;font-size:12px" placeholder="也可直接粘贴原文…"></textarea>

    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-gold" id="cw-gen" type="button">AI 提取并生成草稿</button>
      <button class="btn" id="cw-gen-stop" type="button" hidden>取消</button>
    </div>
    <div id="cw-status" style="font-size:12px;color:var(--faint);margin-top:6px">需要先配置 API Key。流程：联网补充（可选）→ 原文抽样考据 → 合并设定 → 生成世界包。</div>

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
  const bookEl = document.getElementById('cw-book')
  const fileInfo = document.getElementById('cw-file-info')
  let genCtl = null

  document.getElementById('cw-file').onchange = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (f.size > 8 * 1024 * 1024) {
      fileInfo.textContent = '文件过大（>8MB），请截取正文部分。'
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      bookEl.value = text.length > 400000 ? text.slice(0, 400000) : text
      const ch = sampleBookChunks(bookEl.value)
      fileInfo.textContent = `已载入 ${f.name}（${text.length} 字）· 约 ${ch.chapters} 章/块 · 将抽样 ${ch.samples.length} 片考据`
    }
    reader.onerror = () => { fileInfo.textContent = '读取文件失败' }
    reader.readAsText(f, 'utf-8')
  }

  document.getElementById('cw-gen').onclick = () => runGenerate({ webOnly: false })
  document.getElementById('cw-web-only').onclick = () => runGenerate({ webOnly: true })

  async function runGenerate({ webOnly }) {
    const f = draftFromForm()
    if (!f.title && !f.bookText && !f.urls.length) { toast('请填写书名、原文或设定 URL'); return }
    const title = f.title || '未命名作品'
    const keyObj = activeKey(app)
    if (!keyObj) {
      status.textContent = '未配置 API Key，请先在顶栏 🔑 API 中配置。'
      return
    }
    const btn = document.getElementById('cw-gen')
    const stop = document.getElementById('cw-gen-stop')
    btn.disabled = true
    document.getElementById('cw-web-only').disabled = true
    stop.hidden = false
    genCtl = new AbortController()
    stop.onclick = () => { try { genCtl.abort() } catch (e) {} }

    try {
      let webNotes = []
      if (f.useWeb || webOnly || f.urls.length) {
        const g = await gatherWebLore({
          title,
          urls: f.urls,
          onProgress: (p) => { status.textContent = p.message || '' }
        })
        webNotes = g.ok ? g.notes : []
        if (!webNotes.length) status.textContent = '联网无结果，继续本地材料…'
      }

      const hasBook = f.bookText.length >= 800
      if (!hasBook && !webNotes.length && !f.setting) {
        status.textContent = '请提供原文、设定 URL，或填写设定摘要。'
        return
      }

      let user
      if (hasBook || webNotes.length) {
        const ch = hasBook ? sampleBookChunks(f.bookText) : { samples: [], chapters: 0, totalChars: 0 }
        status.textContent = hasBook
          ? `原文 ${ch.totalChars} 字 · 抽样 ${ch.samples.length} 片考据…`
          : '仅用联网/补充材料合并设定…'
        const ex = hasBook
          ? await extractBookFacts({
              keyObj,
              title,
              author: f.author,
              samples: ch.samples,
              signal: genCtl.signal,
              webNotes,
              onProgress: (p) => { status.textContent = p.message }
            })
          : await mergeWebOnly({
              keyObj,
              title,
              author: f.author,
              webNotes,
              signal: genCtl.signal,
              onProgress: (p) => { status.textContent = p.message }
            })
        if (!ex.ok) {
          status.textContent = '提取失败：' + (ex.error || '')
          return
        }
        user = bibleToUserBrief(title, f.author, ex.bible)
        if (webNotes.length) {
          user += `\n\n联网补充（已用于合并，生成时仍以设定圣经为准）：\n${webNotesToBlock(webNotes).slice(0, 4000)}`
        }
        if (f.levels) user += `\n用户补充等级提示：${f.levels}`
        if (f.setting) user += `\n用户补充设定：${f.setting}`
        status.textContent = '设定已合并，正在生成世界包…'
      } else {
        user = `作品：${title}${f.author ? '（' + f.author + '）' : ''}
题材风格：${f.style}
设定摘要：${f.setting || '（请根据作品常识补全）'}
等级体系提示：${f.levels || '（请自行设计 5~12 阶）'}

请输出完整世界包 JSON。`
        status.textContent = '正在生成世界包草稿…'
      }

      const res = await callLLM({
        keyObj,
        system: PACK_DRAFT_PROMPT,
        user,
        signal: genCtl.signal
      })
      if (!res.ok) {
        status.textContent = '生成失败：' + (res.error || '')
        return
      }
      const json = extractGameJSON(res.text)
      if (!json) {
        status.textContent = '未解析到 JSON，已把输出放进编辑框，请手动整理。'
        jsonEl.value = res.text.slice(0, 12000)
        return
      }
      if (!json.id || getPack(json.id)) {
        json.id = 'book-' + hashId(title)
        if (getPack(json.id)) json.id = json.id + '-' + String(Date.now()).slice(-4)
      }
      if (BUILTIN_HIT(json.id)) json.id = json.id + '-x'
      jsonEl.value = JSON.stringify(json, null, 2)
      const v = validatePackDraft(json)
      if (v.ok) {
        status.textContent = `草稿已生成：${v.pack.name}（${v.pack.tiers.length} 阶 · 地点 ${v.pack._decl.map.length}）。可编辑后保存。`
        msg.textContent = ''
      } else {
        status.textContent = '草稿需修正：' + v.errors.join('；')
      }
    } finally {
      btn.disabled = false
      document.getElementById('cw-web-only').disabled = false
      stop.hidden = true
      genCtl = null
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
