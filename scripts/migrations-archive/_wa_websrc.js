const fs = require('fs')
const path = 'D:/DS/AgentWorlds/app/js/engine/book-web.js'
let src = fs.readFileSync(path, 'utf8')

// 1) 在 fetchSettingUrl 前插入扩展信源
const insertBefore = '/** 用户提供的设定页 URL */'
const extraFns = `/** 任意 MediaWiki 站：搜标题并抽正文 */
async function mediaWikiSearchExtract(host, title, sourceLabel) {
  const q = encodeURIComponent(String(title || '').trim())
  if (!q) return { ok: false, error: '缺少条目名' }
  const searchUrl = \`https://\${host}/api.php?action=query&list=search&srsearch=\${q}&format=json&utf8=1&srlimit=3\`
  const sr = await httpGet(searchUrl)
  if (!sr.ok) return sr
  let pageTitle = title
  try {
    const j = JSON.parse(sr.text)
    const hit = j && j.query && j.query.search && j.query.search[0]
    if (hit && hit.title) pageTitle = hit.title
  } catch (e) { /* keep raw */ }
  const extractUrl = \`https://\${host}/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=\${encodeURIComponent(pageTitle)}&format=json&utf8=1&redirects=1\`
  const er = await httpGet(extractUrl)
  if (!er.ok) return er
  const hit = mediaWikiExtract(er.text)
  if (!hit) return { ok: false, error: (sourceLabel || host) + ' 未找到条目' }
  return { ok: true, source: host, title: hit.title, text: hit.text }
}

/** 萌娘相关页（角色/世界观等，排除主条目） */
export async function fetchMoegirlExtra(title, mainTitle, max = 2) {
  const q = encodeURIComponent(String(title || '').trim())
  if (!q) return { ok: false, error: '缺少书名' }
  const searchUrl = \`https://zh.moegirl.org.cn/api.php?action=query&list=search&srsearch=\${q}&format=json&utf8=1&srlimit=8\`
  const sr = await httpGet(searchUrl)
  if (!sr.ok) return sr
  let titles = []
  try {
    const j = JSON.parse(sr.text)
    const hits = (j && j.query && j.query.search) || []
    const main = String(mainTitle || title || '').trim().toLowerCase()
    titles = hits.map(h => h && h.title).filter(Boolean).filter(t => {
      const s = String(t).toLowerCase()
      return s !== main && !s.startsWith(main + '（') && s !== title
    }).slice(0, max)
  } catch (e) { return { ok: false, error: '萌娘搜索解析失败' } }
  if (!titles.length) return { ok: false, error: '萌娘无相关页' }
  const notes = []
  for (const pageTitle of titles) {
    const extractUrl = \`https://zh.moegirl.org.cn/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=\${encodeURIComponent(pageTitle)}&format=json&utf8=1&redirects=1\`
    const er = await httpGet(extractUrl)
    if (!er.ok) continue
    const hit = mediaWikiExtract(er.text)
    if (hit && hit.text.length > 120) {
      notes.push({ kind: 'wiki', source: 'zh.moegirl.org.cn', title: hit.title, text: hit.text.slice(0, 8000) })
    }
    if (notes.length >= max) break
  }
  if (!notes.length) return { ok: false, error: '萌娘相关页无正文' }
  return { ok: true, notes }
}

/** Fandom 同人站：按作品名找 wiki 并抽条目 */
export async function fetchFandomLore(title) {
  const name = String(title || '').trim()
  if (!name) return { ok: false, error: '缺少书名' }
  const q = encodeURIComponent(name)
  const searchUrl = \`https://community.fandom.com/api/v1/Search/Community?query=\${q}&limit=5&minimal=true\`
  const sr = await httpGet(searchUrl)
  if (!sr.ok) return { ok: false, error: 'Fandom 搜索不可达' }
  let domains = []
  try {
    const j = JSON.parse(sr.text)
    const items = (j && (j.items || j.results)) || []
    domains = items.map(it => {
      const d = it && (it.domain || it.url || '')
      return String(d).replace(/^https?:\\/\\//, '').replace(/\\/$/, '')
    }).filter(d => d && /fandom\\.com$/i.test(d.split('/')[0] + (d.includes('.') ? '' : '')) || /\\.fandom\\.com/i.test(d))
  } catch (e) { return { ok: false, error: 'Fandom 搜索解析失败' } }
  // domain 字段有时是域名、有时是 URL
  domains = domains.map(d => d.replace(/^https?:\\/\\//, '').split('/')[0]).filter(Boolean)
  if (!domains.length) return { ok: false, error: 'Fandom 无匹配 wiki' }
  for (const host of domains.slice(0, 3)) {
    const hit = await mediaWikiSearchExtract(host, name, 'Fandom')
    if (hit && hit.ok) return hit
    // 换更短关键词再试
    const short = name.split(/[（(·・\\s]/)[0]
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
    \`https://www.huijiwiki.com/api/search/global?q=\${q}&limit=5\`,
    \`https://www.huijiwiki.com/api.php?action=query&list=search&srsearch=\${q}&format=json&utf8=1&srlimit=5\`
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
        let host = String(site).replace(/^https?:\\/\\//, '').split('/')[0]
        if (!host && it.url) host = String(it.url).replace(/^https?:\\/\\//, '').split('/')[0]
        if (!host) host = 'www.huijiwiki.com'
        if (host && !/huijiwiki\\.com$/i.test(host)) continue
        const extractUrl = \`https://\${host}/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=\${encodeURIComponent(pageTitle)}&format=json&utf8=1&redirects=1\`
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

/** 用户提供的设定页 URL */`

if (!src.includes('fetchFandomLore')) {
  const idx = src.indexOf(insertBefore)
  if (idx < 0) {
    console.error('insert point not found')
    process.exit(1)
  }
  src = src.slice(0, idx) + extraFns + src.slice(idx + insertBefore.length)
  console.log('inserted extra fetchers')
} else {
  console.log('fetchers already present')
}

// 2) gatherWebLore：支持 notes 数组 + 扩展信源
const oldSources = `  // 国内信源优先；维基是独立可选源（勾选即查，不是失败回退）
  const sources = [
    { name: '萌娘百科', fn: () => fetchMoegirl(title) },
    { name: '百度百科', fn: () => fetchBaiduBaike(title) }
  ]
  if (useWiki) {
    sources.push({ name: '维基百科', fn: () => fetchWikipedia(title) })
  }`

const newSources = `  // 国内信源优先；维基是独立可选源（勾选即查，不是失败回退）
  // 百科之后补同人/设定站：萌娘相关页、Fandom、灰机
  const sources = [
    { name: '萌娘百科', fn: () => fetchMoegirl(title) },
    { name: '百度百科', fn: () => fetchBaiduBaike(title) },
    { name: '萌娘相关页', fn: () => fetchMoegirlExtra(title, title, 2) },
    { name: 'Fandom', fn: () => fetchFandomLore(title) },
    { name: '灰机Wiki', fn: () => fetchHuijiLore(title) }
  ]
  if (useWiki) {
    sources.push({ name: '维基百科', fn: () => fetchWikipedia(title) })
  }`

if (!src.includes('萌娘相关页')) {
  if (!src.includes(oldSources)) {
    console.error('sources block not found')
    process.exit(1)
  }
  src = src.replace(oldSources, newSources)
  console.log('updated sources')
}

const oldPush = `      if (r.ok) {
        notes.push({ kind: 'wiki', source: r.source, title: r.title, text: r.text })
        reportNow(\`已获取\${s.name}《\${r.title || title}》\${r.text.length} 字\`)`

const newPush = `      if (r.ok) {
        const multi = Array.isArray(r.notes) ? r.notes : [{ kind: 'wiki', source: r.source, title: r.title, text: r.text }]
        multi.filter(Boolean).forEach(n => {
          if (n && n.text) notes.push(n)
        })
        const label = multi[0] && multi[0].title ? multi[0].title : (r.title || title)
        reportNow(\`已获取\${s.name}《\${label}》\${multi.length} 条\`)`

if (!src.includes('const multi = Array.isArray(r.notes)')) {
  if (!src.includes(oldPush)) {
    console.error('push block not found')
    process.exit(1)
  }
  src = src.replace(oldPush, newPush)
  console.log('updated push')
}

// cnHits 逻辑：扩展源也算命中，但国内两份即停只针对萌娘/百度
const oldCn = `        const cnHits = notes.filter(n => n.source && !/wikipedia/i.test(n.source)).length
        if (s.name !== '维基百科' && cnHits >= 2) break`
const newCn = `        const cnHits = notes.filter(n => n.source && !/wikipedia|fandom\\.com/i.test(n.source)).length
        // 萌娘+百度两份够用时停；扩展同人站仍会跑完（补齐设定）
        if ((s.name === '萌娘百科' || s.name === '百度百科') && cnHits >= 2) break`

if (src.includes(oldCn)) {
  src = src.replace(oldCn, newCn)
  console.log('updated cnHits')
}

fs.writeFileSync(path, src, 'utf8')
console.log('done, length', src.length)
