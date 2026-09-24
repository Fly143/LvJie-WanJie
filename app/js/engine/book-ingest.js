// 整本书 → 分片抽样 → 多次 LLM 提取 → 合并设定
import { callLLM } from './llm.js'

export const CHUNK_CHARS = 3600
export const MAX_SAMPLES = 10
export const MAX_BOOK_CHARS = 400_000

export const EXTRACT_CHUNK_PROMPT = `你是小说设定考据员。阅读下面这「一段」小说原文（可能来自开头/中段/结尾），只提取可核对的世界观事实，输出一个 JSON 代码块：

{
  "era": "时代/世界一句话",
  "power_system": ["力量体系关键词或等级名，从低到高"],
  "places": ["重要地名"],
  "factions": ["组织/宗门/势力"],
  "characters": [{ "name": "名", "role": "身份/定位" }],
  "items": ["重要物品/货币/法宝名"],
  "tone": "文风与题材一句",
  "notes": ["其它对游戏世界观有用的硬设定"]
}

要求：
- 用简体中文；不确定就少写，禁止编造原文没有的等级名
- power_system 尽量按文中出现的从弱到强排列
- 不要输出 JSON 以外内容`

export const MERGE_PROMPT = `你是开放世界游戏世界观架构师。根据下面多段小说摘录的考据 JSON（以及可选的联网补充材料），合并成一份「设定圣经」，供生成游戏世界包。

输出一个 \`\`\`json 代码块：
{
  "setting_bible": "800~1500字，综合时代、力量体系、主要势力、地理、主角常见处境、物品与货币",
  "power_ladder": ["从低到高 5~14 个等级名，统一命名"],
  "money": { "main": "主货币", "mid": "中货币", "high": "高货币" },
  "places_seed": [
    { "name": "地名", "world": "界/区域", "type": "类型", "desc": "一句", "why": "为何适合开局" }
  ],
  "companion_word": "同伴称呼",
  "advance_verb": "升级动词",
  "level_word": "等级称呼",
  "progress_word": "进度/经验称呼",
  "style_rules": ["正向句 5~10 条：题材边界、物品风格、事件类型、位阶写法"],
  "start_scenarios": ["2~4 个开局处境候选"]
}

要求：以原文考据为准，联网材料可补全等级/货币/地名等硬设定；等级命名前后统一；style_rules 只写正向描述。`

/** 粗切章节并抽样：头 / 中 / 尾覆盖成长线 */
export function sampleBookChunks(text) {
  const raw = String(text || '')
  const body = raw.length > MAX_BOOK_CHARS ? raw.slice(0, MAX_BOOK_CHARS) : raw
  const chapters = splitChapters(body)
  const picks = []
  if (chapters.length >= 3) {
    const idx = [
      0,
      1,
      Math.floor(chapters.length * 0.25),
      Math.floor(chapters.length * 0.5),
      Math.floor(chapters.length * 0.75),
      Math.max(0, chapters.length - 3),
      Math.max(0, chapters.length - 2),
      chapters.length - 1
    ]
    const seen = new Set()
    for (const i of idx) {
      const j = Math.max(0, Math.min(chapters.length - 1, i))
      if (seen.has(j)) continue
      seen.add(j)
      picks.push(chapters[j])
      if (picks.length >= MAX_SAMPLES) break
    }
  } else {
    const n = Math.max(1, Math.floor(body.length / CHUNK_CHARS))
    const step = Math.max(1, Math.floor(n / MAX_SAMPLES))
    for (let i = 0; i < n && picks.length < MAX_SAMPLES; i += step) {
      picks.push(body.slice(i * CHUNK_CHARS, i * CHUNK_CHARS + CHUNK_CHARS))
    }
    if (!picks.length) picks.push(body.slice(0, CHUNK_CHARS))
  }
  return {
    chapters: chapters.length,
    samples: picks.map(s => s.slice(0, CHUNK_CHARS)),
    totalChars: body.length
  }
}

export function splitChapters(text) {
  const lines = String(text || '').split(/\r?\n/)
  const marks = []
  const re = /^(第\s*[0-9一二三四五六七八九十百千零两]+\s*[章回节卷幕]|Chapter\s*\d+|CHAPTER\s*\d+)/
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i].trim())) marks.push(i)
  }
  if (marks.length < 4) {
    // 按块切
    const out = []
    for (let i = 0; i < text.length; i += CHUNK_CHARS * 2) {
      out.push(text.slice(i, i + CHUNK_CHARS * 2))
    }
    return out
  }
  const out = []
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i]
    const end = i + 1 < marks.length ? marks[i + 1] : lines.length
    const block = lines.slice(start, end).join('\n')
    out.push(block.length > CHUNK_CHARS ? block.slice(0, CHUNK_CHARS) : block)
  }
  return out
}

function safeJSON(text) {
  try {
    const fence = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i)
    const body = fence ? fence[1].trim() : String(text || '').trim()
    return JSON.parse(body)
  } catch (e) {
    try {
      return JSON.parse(String(text || '').replace(/,\s*([}\]])/g, '$1'))
    } catch (e2) {
      return null
    }
  }
}

/**
 * 整本书提取。onProgress({ step, total, message })
 * @param {object} opt
 * @param {Array} opt.webNotes - 联网补充材料 [{kind,source,text}]
 * @returns {Promise<{ok, bible?, error?, partial?}>}
 */
export async function extractBookFacts({ keyObj, title, author, samples, signal, onProgress, webNotes }) {
  const report = onProgress || (() => {})
  const facts = []
  for (let i = 0; i < samples.length; i++) {
    report({ step: i + 1, total: samples.length + 1, message: `考据原文 ${i + 1}/${samples.length}…` })
    const res = await callLLM({
      keyObj,
      system: EXTRACT_CHUNK_PROMPT,
      user: `作品：${title}${author ? '（' + author + '）' : ''}\n\n片段 ${i + 1}/${samples.length}：\n${samples[i]}`,
      signal
    })
    if (!res.ok) {
      if (res.aborted) return { ok: false, error: '已取消', aborted: true }
      continue
    }
    const j = safeJSON(res.text)
    if (j) facts.push(j)
  }
  if (!facts.length && !(webNotes && webNotes.length)) {
    return { ok: false, error: '未能从原文提取出设定（可减少文本量或检查 API）' }
  }

  report({ step: samples.length + 1, total: samples.length + 1, message: '合并设定圣经…' })
  let webBlock = ''
  if (webNotes && webNotes.length) {
    // 动态 import 会环依赖，这里内联简单拼接
    webBlock = webNotes.map((n, i) => {
      const head = n.kind === 'wiki' ? '维基/百科' : '设定页'
      return `【补充${i + 1}·${head}】${n.source || ''}\n${String(n.text || '').slice(0, 8000)}`
    }).join('\n\n')
  }
  const merge = await callLLM({
    keyObj,
    system: MERGE_PROMPT,
    user: `作品：${title}${author ? '（' + author + '）' : ''}\n多段考据 JSON：\n` + JSON.stringify(facts) +
      (webBlock ? `\n\n联网补充材料（优先与原文一致，可补全未抽到的设定）：\n${webBlock}` : ''),
    signal
  })
  if (!merge.ok) return { ok: false, error: merge.error || '合并失败', aborted: merge.aborted }
  const bible = safeJSON(merge.text)
  if (!bible || !bible.setting_bible) return { ok: false, error: '合并结果不完整' }
  return { ok: true, bible, facts }
}

/** 仅有联网材料时也可直接合并 */
export async function mergeWebOnly({ keyObj, title, author, webNotes, signal, onProgress }) {
  return extractBookFacts({ keyObj, title, author, samples: [], signal, onProgress, webNotes })
}

/** 设定圣经 → 喂给世界包草稿 prompt 的用户消息 */
export function bibleToUserBrief(title, author, bible) {
  const b = bible || {}
  return `作品：${title}${author ? '（' + author + '）' : ''}
以下是从原文提取并合并的设定圣经，请严格据此生成世界包 JSON：

${b.setting_bible || ''}

力量等级（从低到高）：${(b.power_ladder || []).join('、')}
货币：${JSON.stringify(b.money || {})}
等级称呼：${b.level_word || '等级'}；进度称呼：${b.progress_word || '进度'}；升级动词：${b.advance_verb || '晋阶'}；同伴称呼：${b.companion_word || '同伴'}
开局地点种子：
${JSON.stringify(b.places_seed || [], null, 2)}
风格铁律（正向）：
${(b.style_rules || []).map(r => '- ' + r).join('\n')}
开局处境候选：${(b.start_scenarios || []).join(' / ')}
`
}
