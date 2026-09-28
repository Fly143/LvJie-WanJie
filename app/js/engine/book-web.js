// 联网补充设定：国内优先（萌娘/百度百科），维基作可选回退；用户设定页 URL

const UA_HEADERS = {
  'Accept': 'application/json, text/html;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; AgentWorlds/0.1; +local)'
}

async function httpGet(url, timeoutMs = 25000, signal) {
  const host = globalThis.awHost && globalThis.awHost.http
  if (host && host.request) {
    try {
      const r = await host.request({ url, method: 'GET', headers: UA_HEADERS, timeoutMs })
      if (signal && signal.aborted) return { ok: false, error: '已取消', aborted: true }
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || '网络错误' }
      return { ok: true, text: r.text || '', status: r.status }
    } catch (e) {
      return { ok: false, error: (e && e.message) || '网络错误' }
    }
  }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  const onAbort = () => ctl.abort()
  if (signal) {
    if (signal.aborted) { clearTimeout(t); return { ok: false, error: '已取消', aborted: true } }
    signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const res = await fetch(url, { method: 'GET', headers: UA_HEADERS, signal: ctl.signal })
    const text = await res.text()
    return { ok: true, text, status: res.status }
  } catch (e) {
    return { ok: false, error: (e && e.message) || '网络错误', aborted: !!(signal && signal.aborted) }
  } finally {
    clearTimeout(t)
    if (signal) signal.removeEventListener('abort', onAbort)
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

function looksBlocked(text) {
  const s = String(text || '')
  if (s.length < 80) return true
  return /验证码|访问异常|安全验证|禁止访问|Access Denied|Just a moment/i.test(s.slice(0, 800))
}

function mediaWikiExtract(jsonText) {
  try {
    const j = JSON.parse(jsonText)
    const pages = j && j.query && j.query.pages
    if (!pages) return null
    const page = pages[Object.keys(pages)[0]]
    const text = page && page.extract
    if (text && String(text).trim().length > 80) {
      return {
        title: page.title || '',
        text: String(text).trim().slice(0, 14000)
      }
    }
  } catch (e) { /* not json */ }
  return null
}

/** 萌娘百科（国内可访问，网文/ACG 条目多） */
export async function fetchMoegirl(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  // list=search 会 401；opensearch 可用
  const osUrl = 'https://zh.moegirl.org.cn/api.php?action=opensearch&search=' + encodeURIComponent(name) + '&format=json&limit=5&namespace=0'
  const os = await httpGet(osUrl)
  let pageTitle = name
  if (os.ok) {
    try {
      const j = JSON.parse(os.text)
      const list = (j && j[1]) || []
      if (list.length) {
        const exact = list.find(t => String(t).trim() === name) || list[0]
        pageTitle = exact
      }
    } catch (e) { /* keep raw */ }
  }
  return extractMoegirlPage(pageTitle)
}

async function extractMoegirlPage(pageTitle) {
  const extractUrl = 'https://zh.moegirl.org.cn/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=' + encodeURIComponent(pageTitle) + '&format=json&utf8=1&redirects=1'
  const er = await httpGet(extractUrl)
  if (!er.ok) return er
  const hit = mediaWikiExtract(er.text)
  if (!hit) return { ok: false, error: '萌娘百科未找到条目' }
  return { ok: true, source: 'zh.moegirl.org.cn', title: hit.title, text: hit.text }
}

/** 百度百科（接口卡片 + 条目页，失败则跳过） */
export async function fetchBaiduBaike(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const cardUrl = 'https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_length=1200&bk_key=' + encodeURIComponent(name)
  const card = await httpGet(cardUrl)
  if (card.ok && !looksBlocked(card.text)) {
    try {
      const j = JSON.parse(card.text)
      const abstract = j && (j.abstract || j.abs || j.description || '')
      const titleHit = (j && (j.title || j.key)) || name
      const desc = (j && (j.desc || '')) + ''
      const body = [desc, String(abstract)].filter(Boolean).join('\n')
      if (body.length > 60) {
        return {
          ok: true,
          source: 'baike.baidu.com',
          title: titleHit,
          text: body.slice(0, 5000)
        }
      }
    } catch (e) { /* fallthrough */ }
  }
  const pageUrl = 'https://baike.baidu.com/item/' + encodeURIComponent(name)
  const page = await httpGet(pageUrl, 30000)
  if (!page.ok) return { ok: false, error: '百度百科不可达' }
  const text = htmlToText(page.text)
  if (looksBlocked(text)) return { ok: false, error: '百度百科拦截或正文过短' }
  return { ok: true, source: 'baike.baidu.com', title: name, text: text.slice(0, 10000) }
}

/** 中/英维基百科（部分网络不可达，作回退） */
export async function fetchWikipedia(title) {
  const q = encodeURIComponent(String(title || '').trim())
  if (!q) return { ok: false, error: '缺少书名' }
  const apis = [
    { host: 'zh.wikipedia.org', lang: 'zh' },
    { host: 'en.wikipedia.org', lang: 'en' }
  ]
  for (const api of apis) {
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
    const hit = mediaWikiExtract(er.text)
    if (hit) {
      return { ok: true, source: api.lang + '.wikipedia.org', title: hit.title, text: hit.text }
    }
  }
  return { ok: false, error: '维基未找到或不可达' }
}

/** 任意 MediaWiki 站：搜标题并抽正文 */
async function mediaWikiSearchExtract(host, title, sourceLabel) {
  const q = encodeURIComponent(String(title || '').trim())
  if (!q) return { ok: false, error: '缺少条目名' }
  const searchUrl = `https://${host}/api.php?action=query&list=search&srsearch=${q}&format=json&utf8=1&srlimit=3`
  const sr = await httpGet(searchUrl)
  if (!sr.ok) return sr
  let pageTitle = title
  try {
    const j = JSON.parse(sr.text)
    const hit = j && j.query && j.query.search && j.query.search[0]
    if (hit && hit.title) pageTitle = hit.title
  } catch (e) { /* keep raw */ }
  const extractUrl = `https://${host}/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(pageTitle)}&format=json&utf8=1&redirects=1`
  const er = await httpGet(extractUrl)
  if (!er.ok) return er
  const hit = mediaWikiExtract(er.text)
  if (!hit) return { ok: false, error: (sourceLabel || host) + ' 未找到条目' }
  return { ok: true, source: host, title: hit.title, text: hit.text }
}

/** 萌娘相关页（Title/世界历史、Title/神灵 等子页） */
export async function fetchMoegirlExtra(title, mainTitle, max = 2) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const osUrl = 'https://zh.moegirl.org.cn/api.php?action=opensearch&search=' + encodeURIComponent(name) + '&format=json&limit=8&namespace=0'
  const os = await httpGet(osUrl)
  if (!os.ok) return { ok: false, error: '萌娘搜索不可达' }
  let titles = []
  try {
    const j = JSON.parse(os.text)
    const list = (j && j[1]) || []
    const main = String(mainTitle || name || '').trim()
    titles = list.map(t => String(t || '').trim()).filter(Boolean).filter(t => t !== main).slice(0, max)
  } catch (e) { return { ok: false, error: '萌娘搜索解析失败' } }
  if (!titles.length) return { ok: false, error: '萌娘无相关页' }
  const notes = []
  for (const pageTitle of titles) {
    const r = await extractMoegirlPage(pageTitle)
    if (r.ok && r.text && r.text.length > 120) {
      notes.push({ kind: 'wiki', source: 'zh.moegirl.org.cn', title: r.title, text: r.text.slice(0, 8000) })
    }
    if (notes.length >= max) break
  }
  if (!notes.length) return { ok: false, error: '萌娘相关页无正文' }
  return { ok: true, notes }
}

/** Bangumi（ACG 条目库，公开 API，适合游戏/动画/轻小说） */
export async function fetchBangumiLore(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const q = encodeURIComponent(name)
  const searchUrl = `https://api.bgm.tv/search/subject/${q}?limit=5&type=2&responseGroup=medium`
  const sr = await httpGet(searchUrl)
  if (!sr.ok) return { ok: false, error: 'Bangumi 不可达' }
  let items = []
  try {
    const j = JSON.parse(sr.text)
    items = (j && j.list) || []
  } catch (e) { return { ok: false, error: 'Bangumi 解析失败' } }
  if (!items.length) return { ok: false, error: 'Bangumi 未命中' }
  // 优先名完全匹配
  items.sort((a, b) => {
    const an = ((a.name_cn || a.name || '') === name) ? 0 : 1
    const bn = ((b.name_cn || b.name || '') === name) ? 0 : 1
    return an - bn
  })
  const it = items[0]
  const summary = String(it.summary || '').trim()
  if (summary.length < 80) {
    // 再拉 subject 详情
    const detail = await httpGet('https://api.bgm.tv/subject/' + it.id + '?responseGroup=medium')
    if (detail.ok) {
      try {
        const d = JSON.parse(detail.text)
        const s2 = String((d && d.summary) || '').trim()
        if (s2.length > summary.length) {
          return {
            ok: true,
            source: 'bgm.tv',
            title: d.name_cn || d.name || name,
            text: s2.slice(0, 8000)
          }
        }
      } catch (e) { /* fallthrough */ }
    }
  }
  if (summary.length < 60) return { ok: false, error: 'Bangumi 正文过短' }
  return {
    ok: true,
    source: 'bgm.tv',
    title: it.name_cn || it.name || name,
    text: summary.slice(0, 8000)
  }
}

/** AniList（ACG 条目库，GraphQL，漫画/动画简介） */
export async function fetchAniListLore(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const query = `query ($search: String, $type: MediaType) {
    Page(page: 1, perPage: 4) {
      media(search: $search, type: $type, sort: SEARCH_MATCH) {
        id format
        title { romaji english native }
        description(asHtml: false)
        genres
        siteUrl
      }
    }
  }`
  const types = ['MANGA', 'ANIME']
  let best = null
  for (const type of types) {
    let res
    try {
      res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'AgentWorlds/0.1'
        },
        body: JSON.stringify({ query, variables: { search: name, type } }),
        signal: (globalThis.awHost && globalThis.awHost.http && globalThis.awHost.http.request) ? undefined : AbortSignal.timeout(20000)
      })
      const text = await res.text()
      if (!res.ok) continue
      let list = []
      try {
        const j = JSON.parse(text)
        list = (j && j.data && j.data.Page && j.data.Page.media) || []
      } catch (e) { continue }
      for (const m of list) {
        const desc = String((m && m.description) || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
        const titles = [m && m.title && m.title.native, m && m.title && m.title.english, m && m.title && m.title.romaji].filter(Boolean).map(s => String(s).trim())
        const exact = titles.some(t => t === name)
        const score = (exact ? 100 : 0) + Math.min(80, Math.floor(desc.length / 20)) + (type === 'MANGA' ? 5 : 0)
        if (!best || score > best.score) {
          best = { score, title: titles[0] || name, text: desc.trim(), source: 'anilist.co', genres: (m && m.genres) || [] }
        }
      }
      if (best && best.score >= 100) break
    } catch (e) { /* next type */ }
  }
  if (!best || !best.text || best.text.length < 80) {
    return { ok: false, error: 'AniList 未命中或正文过短' }
  }
  const head = best.genres.length ? '类型：' + best.genres.join('、') + '\n' : ''
  return {
    ok: true,
    source: best.source,
    title: best.title,
    text: (head + best.text).slice(0, 8000)
  }
}

/** Fandom 同人站：按作品名找 wiki 并抽条目 */
export async function fetchFandomLore(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const q = encodeURIComponent(name)
  const searchUrl = `https://community.fandom.com/api/v1/Search/Community?query=${q}&limit=5&minimal=true`
  const sr = await httpGet(searchUrl)
  if (!sr.ok) return { ok: false, error: 'Fandom 搜索不可达' }
  let domains = []
  try {
    const j = JSON.parse(sr.text)
    const items = (j && (j.items || j.results)) || []
    domains = items.map(it => {
      const raw = (it && (it.domain || it.url || it.subdomain || '')) + ''
      return raw.replace(/^https?:\/\//, '').split('/')[0].trim()
    }).filter(d => d && /\.fandom\.com$/i.test(d))
  } catch (e) { return { ok: false, error: 'Fandom 搜索解析失败' } }
  if (!domains.length) return { ok: false, error: 'Fandom 无匹配 wiki' }
  for (const host of domains.slice(0, 3)) {
    const hit = await mediaWikiSearchExtract(host, name, 'Fandom')
    if (hit && hit.ok) return hit
    // 换更短关键词再试
    const short = name.split(/[（(·・\s]/)[0]
    if (short && short !== name) {
      const hit2 = await mediaWikiSearchExtract(host, short, 'Fandom')
      if (hit2 && hit2.ok) return hit2
    }
  }
  return { ok: false, error: 'Fandom 未找到正文' }
}

/** 灰机 Wiki（中文同人/游戏站群） */
export async function fetchHuijiLore(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const q = encodeURIComponent(name)
  // 1) 灰机全站搜索（若开放）
  const tryUrls = [
    `https://www.huijiwiki.com/api/search/global?q=${q}&limit=5`,
    `https://www.huijiwiki.com/api.php?action=query&list=search&srsearch=${q}&format=json&utf8=1&srlimit=5`
  ]
  for (const u of tryUrls) {
    const r = await httpGet(u)
    if (!r.ok || looksBlocked(r.text)) continue
    try {
      const j = JSON.parse(r.text)
      // global search: { results: [{ site, title, ... }] } 或 MediaWiki search
      const results = j.results || (j.query && j.query.search) || []
      if (!results.length) continue
      const notes = []
      for (const it of results.slice(0, 3)) {
        const pageTitle = it.title || it.page || it.name
        const site = it.site || it.wiki || it.domain || ''
        let host = String(site).replace(/^https?:\/\//, '').split('/')[0]
        if (!host && it.url) host = String(it.url).replace(/^https?:\/\//, '').split('/')[0]
        if (!host) host = 'www.huijiwiki.com'
        if (host && !/huijiwiki\.com$/i.test(host)) continue
        const extractUrl = `https://${host}/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(pageTitle)}&format=json&utf8=1&redirects=1`
        const er = await httpGet(extractUrl)
        if (!er.ok) continue
        const hit = mediaWikiExtract(er.text)
        if (hit && hit.text.length > 120) {
          notes.push({ kind: 'wiki', source: host, title: hit.title, text: hit.text.slice(0, 8000) })
          if (notes.length >= 2) break
        }
      }
      if (notes.length) return { ok: true, notes }
    } catch (e) { /* next */ }
  }
  // 2) 常见中文同人站群兜底：直接在主站搜
  const hit = await mediaWikiSearchExtract('www.huijiwiki.com', name, '灰机')
  if (hit && hit.ok) return hit
  return { ok: false, error: '灰机未命中' }
}

/** 用户提供的设定页 URL */
export async function fetchSettingUrl(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'URL 需以 http(s) 开头' }
  // MediaWiki API JSON 直接解析
  if (/api\.php/i.test(u) && /format=json/i.test(u)) {
    const r = await httpGet(u, 30000)
    if (!r.ok) return r
    const hit = mediaWikiExtract(r.text)
    if (hit) return { ok: true, text: hit.text, source: u, title: hit.title }
    const text = String(r.text || '').slice(0, 15000)
    if (text.length > 40) return { ok: true, text, source: u }
    return { ok: false, error: '接口未返回可用正文' }
  }
  const r = await httpGet(u, 30000)
  if (!r.ok) return r
  const text = htmlToText(r.text)
  if (looksBlocked(text)) return { ok: false, error: '页面被拦截或正文过短' }
  return { ok: true, text: text.slice(0, 15000), source: u }
}

/**
 * 汇总联网材料：国内信源优先
 * @param {{ title, urls?: string[], onProgress?: Function, useWiki?: boolean }} opt
 */
export async function gatherWebLore({ title, urls, onProgress, useWiki }) {
  const report = onProgress || (() => {})
  const notes = []
  const attempts = []

  // 国内信源优先；维基是独立可选源（勾选即查，不是失败回退）
  const sources = [
    { name: '萌娘百科', fn: () => fetchMoegirl(title) },
    { name: '百度百科', fn: () => fetchBaiduBaike(title) },
    { name: '萌娘相关页', fn: () => fetchMoegirlExtra(title, title, 2) },
    { name: 'Bangumi', fn: () => fetchBangumiLore(title) },
    { name: 'AniList', fn: () => fetchAniListLore(title) },
    { name: 'Fandom', fn: () => fetchFandomLore(title) },
    { name: '灰机Wiki', fn: () => fetchHuijiLore(title) }
  ]
  if (useWiki) {
    sources.push({ name: '维基百科', fn: () => fetchWikipedia(title) })
  }

  const list = Array.isArray(urls) ? urls.map(s => String(s || '').trim()).filter(Boolean) : []
  const totalTasks = sources.length + list.length
  let doneTasks = 0
  const reportNow = (message) => {
    doneTasks += 1
    report({ message, hits: notes.length, done: doneTasks, total: totalTasks })
  }

  for (const s of sources) {
    if (!title) break
    report({ message: `查询${s.name}…`, hits: notes.length, done: doneTasks, total: totalTasks })
    try {
      const r = await s.fn()
      attempts.push({ name: s.name, ok: r.ok, detail: r.ok ? (r.title || '') : (r.error || '') })
      if (r.ok) {
        const multi = Array.isArray(r.notes) ? r.notes : [{ kind: 'wiki', source: r.source, title: r.title, text: r.text }]
        multi.filter(Boolean).forEach(n => {
          if (n && n.text) notes.push(n)
        })
        const label = multi[0] && multi[0].title ? multi[0].title : (r.title || title)
        reportNow(`已获取${s.name}《${label}》${multi.length} 条`)
        // 不提前 break：百科之外的同人/设定站也要跑，补齐世界观
      } else {
        reportNow(`${s.name}：${r.error || '未命中'}`)
      }
    } catch (e) {
      attempts.push({ name: s.name, ok: false, detail: e && e.message })
      reportNow(`${s.name}：${(e && e.message) || '异常'}`)
    }
  }

  for (let i = 0; i < list.length; i++) {
    report({ message: `抓取设定页 ${i + 1}/${list.length}…`, hits: notes.length, done: doneTasks, total: totalTasks })
    const r = await fetchSettingUrl(list[i])
    if (r.ok) {
      notes.push({ kind: 'url', source: list[i], text: r.text })
      reportNow(`设定页已抓取（${r.text.length} 字）`)
    } else {
      reportNow(`设定页失败：${r.error || list[i]}`)
    }
  }

  return { ok: notes.length > 0, notes, attempts }
}

/** 角色条目查询：作品名+人名 / 人名 */
export async function fetchCharacterLore(name, workTitle) {
  const n = String(name || '').trim()
  if (!n || n.length > 12) return { ok: false, error: '人名无效' }
  const queries = [
    workTitle ? `${n}（${workTitle}）` : n,
    workTitle ? `${n} ${workTitle}` : n,
    n
  ]
  const notes = []
  for (const q of queries) {
    try {
      const m = await fetchMoegirl(q)
      if (m.ok && m.text.length > 100) {
        notes.push({ kind: 'char', source: m.source, title: m.title, text: m.text.slice(0, 4000) })
      }
    } catch (e) { /* next */ }
    if (notes.length) break
    try {
      const b = await fetchBaiduBaike(q)
      if (b.ok && b.text.length > 100) {
        notes.push({ kind: 'char', source: b.source, title: b.title, text: b.text.slice(0, 3000) })
      }
    } catch (e) { /* next */ }
    if (notes.length) break
  }
  return notes.length
    ? { ok: true, name: n, notes }
    : { ok: false, name: n, error: '未找到角色条目' }
}

/** 压进合并提示词的补充块 */
export function webNotesToBlock(notes) {
  if (!Array.isArray(notes) || !notes.length) return ''
  return notes.map((n, i) => {
    const head = n.kind === 'wiki' ? '百科/条目' : (n.kind === 'char' ? '角色条目' : '设定页')
    return `【补充${i + 1}·${head}】${n.source || ''}\n${String(n.text || '').slice(0, 8000)}`
  }).join('\n\n')
}
