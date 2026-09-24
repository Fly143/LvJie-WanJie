// 联网补充设定：百科/维基摘要 + 用户设定页抓取（走 aw:http / fetch）

const UA_HEADERS = {
  'Accept': 'application/json, text/html;q=0.9,*/*;q=0.8'
}

async function httpGet(url, timeoutMs = 25000) {
  const host = globalThis.awHost && globalThis.awHost.http
  if (host && host.request) {
    const r = await host.request({ url, method: 'GET', headers: UA_HEADERS, timeoutMs })
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || '网络错误' }
    return { ok: true, text: r.text || '', status: r.status }
  }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'GET', headers: UA_HEADERS, signal: ctl.signal })
    const text = await res.text()
    return { ok: true, text, status: res.status }
  } catch (e) {
    return { ok: false, error: (e && e.message) || '网络错误' }
  } finally {
    clearTimeout(t)
  }
}

/** 从 HTML 抽正文文本（粗去噪） */
export function htmlToText(html) {
  let s = String(html || '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/&nbsp;/g, ' ')
  s = s.replace(/&amp;/g, '&')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/&quot;/g, '"')
  s = s.replace(/&#\d+;/g, ' ')
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\s{2,}/g, ' ')
  return s.trim()
}

/** 中/英维基百科页面纯文本 */
export async function fetchWikipedia(title) {
  const q = encodeURIComponent(String(title || '').trim())
  if (!q) return { ok: false, error: '缺少书名' }
  const apis = [
    { host: 'zh.wikipedia.org', lang: 'zh' },
    { host: 'en.wikipedia.org', lang: 'en' }
  ]
  for (const api of apis) {
    // 先搜索确认页名
    const searchUrl = `https://${api.host}/w/api.php?action=query&list=search&srsearch=${q}&format=json&utf8=1&srlimit=3`
    const sr = await httpGet(searchUrl)
    if (!sr.ok) continue
    let pageTitle = title
    try {
      const j = JSON.parse(sr.text)
      const hit = j && j.query && j.query.search && j.query.search[0]
      if (hit && hit.title) pageTitle = hit.title
    } catch (e) { /* use raw title */ }

    const extractUrl = `https://${api.host}/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(pageTitle)}&format=json&utf8=1&redirects=1`
    const er = await httpGet(extractUrl)
    if (!er.ok) continue
    try {
      const j = JSON.parse(er.text)
      const pages = j && j.query && j.query.pages
      const page = pages && pages[Object.keys(pages)[0]]
      const text = page && page.extract
      if (text && String(text).trim().length > 80) {
        return {
          ok: true,
          source: api.lang + '.wikipedia.org',
          title: page.title || pageTitle,
          text: String(text).trim().slice(0, 12000)
        }
      }
    } catch (e) { /* next */ }
  }
  return { ok: false, error: '维基未找到条目' }
}

/** 用户提供的设定页 URL */
export async function fetchSettingUrl(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'URL 需以 http(s) 开头' }
  const r = await httpGet(u, 30000)
  if (!r.ok) return r
  const text = htmlToText(r.text).slice(0, 15000)
  if (text.length < 40) return { ok: false, error: '页面正文过短' }
  return { ok: true, text, source: u }
}

/**
 * 汇总联网材料
 * @param {{ title, urls?: string[], onProgress?: Function }} opt
 */
export async function gatherWebLore({ title, urls, onProgress }) {
  const report = onProgress || (() => {})
  const notes = []

  report({ message: '查询百科/维基…' })
  const wiki = await fetchWikipedia(title)
  if (wiki.ok) {
    notes.push({ kind: 'wiki', source: wiki.source, title: wiki.title, text: wiki.text })
    report({ message: `已获取维基《${wiki.title}》${wiki.text.length} 字` })
  } else {
    report({ message: '维基未命中：' + (wiki.error || '') })
  }

  const list = Array.isArray(urls) ? urls.map(s => String(s || '').trim()).filter(Boolean) : []
  for (let i = 0; i < list.length; i++) {
    report({ message: `抓取设定页 ${i + 1}/${list.length}…` })
    const r = await fetchSettingUrl(list[i])
    if (r.ok) {
      notes.push({ kind: 'url', source: list[i], text: r.text })
    } else {
      report({ message: `设定页失败：${r.error || list[i]}` })
    }
  }

  return { ok: notes.length > 0, notes }
}

/** 压进合并提示词的补充块 */
export function webNotesToBlock(notes) {
  if (!Array.isArray(notes) || !notes.length) return ''
  return notes.map((n, i) => {
    const head = n.kind === 'wiki' ? '维基/百科' : '设定页'
    return `【补充${i + 1}·${head}】${n.source || ''}\n${String(n.text || '').slice(0, 8000)}`
  }).join('\n\n')
}
