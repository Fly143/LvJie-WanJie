const fs = require('fs')
const path = 'D:/DS/AgentWorlds/app/js/engine/book-web.js'
let src = fs.readFileSync(path, 'utf8')

// --- replace fetchMoegirl ---
const moegirlStart = src.indexOf('export async function fetchMoegirl(title)')
const moegirlEnd = src.indexOf('/** 百度百科')
if (moegirlStart < 0 || moegirlEnd < 0) {
  console.error('moegirl block missing', moegirlStart, moegirlEnd)
  process.exit(1)
}
const newMoegirl = `export async function fetchMoegirl(title) {
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

`

// --- replace fetchMoegirlExtra .. before mediaWikiSearchExtract or fetchFandom ---
// Find current fetchMoegirlExtra function and replace through fetchFandomLore start
const extraStart = src.indexOf('/** 萌娘相关页')
const fandomStart = src.indexOf('/** Fandom')
if (extraStart < 0 || fandomStart < 0) {
  console.error('extra/fandom missing', extraStart, fandomStart)
  process.exit(1)
}
const newExtra = `/** 萌娘相关页（Title/世界历史、Title/神灵 等子页） */
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
  const searchUrl = \`https://api.bgm.tv/search/subject/\${q}?limit=5&type=2&responseGroup=medium\`
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

`

src = src.slice(0, moegirlStart) + newMoegirl + src.slice(moegirlEnd)
// re-find after first splice
const extraStart2 = src.indexOf('/** 萌娘相关页')
const fandomStart2 = src.indexOf('/** Fandom')
if (extraStart2 < 0 || fandomStart2 < 0 || fandomStart2 < extraStart2) {
  console.error('extra/fandom after splice', extraStart2, fandomStart2)
  process.exit(1)
}
src = src.slice(0, extraStart2) + newExtra + src.slice(fandomStart2)
console.log('fetchers replaced')

// --- sources list ---
if (!src.includes("name: 'Bangumi'")) {
  const oldSrc = `    { name: '萌娘百科', fn: () => fetchMoegirl(title) },
    { name: '百度百科', fn: () => fetchBaiduBaike(title) },
    { name: '萌娘相关页', fn: () => fetchMoegirlExtra(title, title, 2) },
    { name: 'Fandom', fn: () => fetchFandomLore(title) },
    { name: '灰机Wiki', fn: () => fetchHuijiLore(title) }`
  const newSrc = `    { name: '萌娘百科', fn: () => fetchMoegirl(title) },
    { name: '百度百科', fn: () => fetchBaiduBaike(title) },
    { name: '萌娘相关页', fn: () => fetchMoegirlExtra(title, title, 2) },
    { name: 'Bangumi', fn: () => fetchBangumiLore(title) },
    { name: 'Fandom', fn: () => fetchFandomLore(title) },
    { name: '灰机Wiki', fn: () => fetchHuijiLore(title) }`
  if (!src.includes(oldSrc)) {
    console.error('sources pattern missing')
    // try looser
    const i = src.indexOf("{ name: '萌娘百科'")
    console.error(src.slice(i, i + 400))
    process.exit(1)
  }
  src = src.replace(oldSrc, newSrc)
  console.log('sources updated')
}

fs.writeFileSync(path, src, 'utf8')
console.log('written', src.length)
