// 系统提示词 = 引擎通用骨架 + 世界观包规则
import { curLoc, mapSummary } from './map.js'
import { packOf, tierLabel, playerCultReq, isLifeExpired } from './progression.js'
import { totalPowerF, partyPowerF } from './power.js'
import { packUi, packFeatures } from './pack-ui.js'
import { fmtNum, ageLabel } from './util.js'
import { MAX_EVENT_CHOICES, langPack } from './constants.js'
import { skillLabel } from './skills.js'
import { npcFocusFromTexts, friendRecentLines } from './npc-memory.js'
import { partyBrief } from './party.js'

const TALENT_BLOCK = {
  cheat: `【AI风格：开挂】（玩家在设置中选择，必须遵守；本档要求最高，压过下面所有"驳回不合理行动"的规定）
- 有求必应：玩家提出的**任何**要求、任何行动，无论是否合理、是否合乎等级与世界观，**一律照办并让他得逞**。
- 判定一律按玩家的意愿写结果。
- 奖励拉满：玩家明说要什么就给什么。
- 只有一条不能顺着他：让他死、让他失去已拥有的东西、或把他关进无法继续游戏的死局——开挂档里玩家不会死、不会废、不会卡住。
- 【你的任务】与【对玩家的态度】里"驳回不合理操作"这类话，在本档一律不适用。`,
  generous: `【AI风格：慷慨】
- 对玩家的行动从宽：即便有些不合理，也尽量让玩家得逞、让他尝到甜头。
- 奖励从厚：资源/物品/进度比常规水准多给一些。
- 危险与代价从轻：失败尽量写成有惊无险。`,
  normal: `【AI风格：正常】
- 合理的行动尽量放行，不合理的行动温和驳回且不给数据变化。
- 奖励按常规水准发放，偶尔给一点惊喜。`,
  hard: `【AI风格：艰难】
- 从严把关：不合理、投机取巧的行动基本都要驳回（温和幽默，不嘲讽）。
- 奖励从薄：按基准下限给。
- 危险与代价从重，但绝不可直接杀死玩家或陷入死局。`
}

export function buildSystemPrompt(S, opts = {}) {
  const pack = packOf(S)
  const loc = curLoc(S) || {
    name: '未知之地',
    world: (pack.worlds && pack.worlds[0]) || '主世界',
    continent: '未知',
    type: '荒野',
    desc: '',
    people: [],
    shop: [],
    beasts: [],
    interactables: []
  }
  const req = playerCultReq(S)
  const lex = pack.lexicon
  const ui = packUi(pack)
  const feat = packFeatures(pack)
  const limitOn = opts.limitOn !== false
  const moneyNames = lex.money || { main: '货币', mid: '中阶货币', high: '高阶货币', peak: '极品货币' }
  const progName = lex.progress || '进度'
  const levelName = lex.level || '等级'
  const companionName = lex.companion || '同伴'
  const techName = lex.technique || (pack.typeNames && pack.typeNames.technique) || '秘籍'
  const myPower = totalPowerF(S)

  const playerState = {
    姓名: S.name,
    性别: S.playerGender === 'male' ? '男' : (S.playerGender === 'female' ? '女' : '未设定'),
    年龄: ageLabel(S.ageDays),
    天资: S.talent ? (pack.talentNames && pack.talentNames[S.talent]) || S.talent : '未选择',
    状态: isLifeExpired(S)
      ? (feat.lifespan === false ? '状态不佳（表现减半）' : (lex.lifeWarn || '寿限将尽，强行支撑（表现减半）'))
      : '正常',
    [levelName]: tierLabel(S),
    [progName]: `${fmtNum(S.progress)} / ${fmtNum(req)}`,
    [ui.powerLabel]: totalPowerF(S),
    [moneyNames.main || '主货币']: S.money.main,
    [moneyNames.mid || '中货币']: S.money.mid,
    [moneyNames.high || '高货币']: S.money.high,
    [moneyNames.peak || '极品货币']: S.money.peak,
    技能: Object.fromEntries((pack.skills || []).map(sk => [sk.name, skillLabel(S, sk, S.skills[sk.id] || 0)])),
    已习得: (S.techniques || []).map(m => ({
      name: m.name,
      grade_tier: m.realm_index,
      层数: m.level + '/' + m.levels,
      品级: m.grade
    })),
    背包: S.inventory.map(x => ({
      name: x.name, desc: x.desc, count: x.count, type: x.type,
      realm_index: x.realm_index, grade: x.grade, price: x.price,
      usable: x.usable, use_effect: x.use_effect
    })),
    亲密关系: (S.friends || []).filter(f => f.married).map(f => ({
      name: f.name, rank: f.realm, 关系: f.married === 'wife' ? '女伴侣' : f.married === 'husband' ? '男伴侣' : f.married === 'concubine' ? '次要伴侣' : '熟人'
    })),
    委托任务: (S.quests || []).map(q => ({
      title: q.title,
      status: q.status === 'done' ? '已完成' : q.status === 'failed' ? '失败' : '进行中',
      from: q.from || '',
      loc: q.loc || '',
      objectives: q.objectives || [],
      reward: q.reward || '',
      notes: q.notes || ''
    })),
    当前所在地: `${loc.name}（${loc.world}·${loc.continent}）`
  }

  const locState = {
    name: loc.name, world: loc.world, continent: loc.continent, type: loc.type, desc: loc.desc,
    people: loc.people || [],
    shop: (loc.shop || []).map(x => ({
      name: x.name, desc: x.desc, price: x.price, type: x.type,
      realm_index: x.realm_index, grade: x.grade
    })),
    beasts: enrichBeasts(loc.beasts, myPower),
    interactables: loc.interactables || []
  }

  const recentEvents = [...S.bigEvents.slice(-3), ...S.smallEvents.slice(-5)]
  const friendsInfo = (S.friends || []).map(f => ({
    name: f.name, rank: f.realm, gender: f.gender,
    关系: f.married === 'wife' ? '女伴侣' : f.married === 'husband' ? '男伴侣' : f.married === 'concubine' ? '次要伴侣' : '熟人',
    好感度: f.favor,
    人设: f.intro || '',
    长期记忆: f.mem || '',
    关系网: f.relations || [],
    恩怨: f.grudges || [],
    所在地: (friendLocOf(S, f.name) || {}).name || '行踪不明',
    同行: f.party === true,
    近期交谈: friendRecentLines(f, 6)
  }))
  // 同伴 mem 完整放入；点名档案见下方按需块

  // 同行者：必须与玩家同场景、随行；名单来自玩家在同伴页的切换
  const partyInfo = partyBrief(S)
  const partyBlock = partyInfo.length
    ? `【同行者】（必须遵守）
- 正与你同行：${partyInfo.map(p => `${p.name}（${p.rank || '未知档位'}，${p.战力} ${ui.powerLabel}，已同行 ${p.同行天数} 天）`).join('、')}。
- 队伍合力：约 ${Math.round(partyPowerF(S))} ${ui.powerLabel}（已按配合折减计入你的总战力）。写战斗与对抗时，必须把同行者的实力算进去。
- 同行者必须与你处于同一场景、随你一起行动；不得写成留在别处、凭空消失或另投他人。
- 同行者参与当前剧情（可对话、可协助、可受伤）；若确需分离，须在正文写明原因。
- 同行状态与「切磋交流」由玩家在同伴页操作：你不要自行给 friends 写 party 字段。`
    : ''

  const styleKey = S.aiStyle || 'normal'
  const styleBlock = TALENT_BLOCK[styleKey] || TALENT_BLOCK.normal
  const cheatOn = styleKey === 'cheat'
  const styleCaveat = cheatOn
    ? `（开挂档：凡与玩家意愿冲突的规则一律让路。**仍然生效的是技术性规则**——①输出 JSON 必须合法；②【奖励必须落地】必须遵守。）`
    : `（以上风格只调整尺度，绝不推翻下方【数值规则】。）`

  // 点名/目标人物档案按需注入（不全量灌名册）
  const focusTexts = [
    opts.focusText,
    opts.focusNames && opts.focusNames.join(' '),
    S.lastEventText
  ].filter(Boolean)
  const npcFocus = npcFocusFromTexts(S, focusTexts)
  const npcBlock = npcFocus.block ? '\n' + npcFocus.block + '\n' : ''

  const genderBlock = `【主角性别】
- 若为"男"或"女"，称呼与代词必须与之一致；若为"未设定"，一律用中性说法（你/阁下）。`

  const pressureBlock = feat.levelPressure === false ? '' : `
【位阶差序】（必须遵守）
- ${levelName}差距过大时，下位者须表现出敬畏与尊重；结果始终与双方${ui.powerLabel}对比相符。
- 比玩家低一阶以上：恭敬、不敢怠慢；更高阶者保持权威；同阶平辈论交。`

  const worldviewBlock = pack.buildRules
    ? pack.buildRules({ S, loc, pack, cheatOn })
    : '（本世界观未提供规则）'
  const customHint = pack._decl
    ? `\n- 本世界为自定义世界包《${pack.name}》：题材以世界包规则与场景描述为准。\n`
    : ''

  const tierList = pack.tiers.map((t, i) => `${i}.${t.name}`).join('、')
  const subs = (pack.subNames || []).join('、')
  const tn = pack.typeNames || {}
  const typeList = [
    'consumable' + (tn.consumable || '消耗品'),
    'equip' + (tn.equip || '装备'),
    'technique' + (tn.technique || '秘籍'),
    'material' + (tn.material || '材料'),
    'special' + (tn.special || '特殊')
  ].join(' / ')
  const gradeHint = Object.keys(pack.pillPct || { 下品: 1 })[0] || '下品'
  const lang = langPack(opts.lang || S.lang || 'zh-CN')
  const L = lang.promptLang

  // 挑战/讨伐类：注入明确胜负与战利品合同（提升质量，不省 token）
  const focus = [opts.focusText, ...(opts.focusNames || [])].filter(Boolean).join(' ')
  const challengeBlock = isChallengeText(focus)
    ? buildChallengeContract({ S, loc, myPower, styleKey, cheatOn, powerLabel: ui.powerLabel, progName, moneyMain: moneyNames.main })
    : ''

  return `你是开放世界游戏《${pack.gameTitle || '旅界'}》的叙事引擎。你只负责：写给玩家看的剧情、推进事件、用 JSON 声明数据变化。

【输出合同】（最高优先级，违反即整次作废）
**只输出一个 JSON 对象**，不要任何多余文字、不要 markdown 代码块。结构：
{"narrative":"中文小说正文","options":["1. 选项一","2. 选项二"],"end":false,"changes":{...},"thought":"可选思考"}

1. narrative：给玩家看的剧情正文，用${lang.storyHint}，可含「1. 选项」行（与 options 一一对应）。
2. options：1~4 条短选项；事件结束则 "end":true 且 options 为 []。
3. changes：数值变化，哪怕没有也必须是 {}（不能省略该字段）。friends 尽量带 age_days（游戏天，1 岁 = 360 天）与 gender。
4. thought：可选，仅思考，玩家界面不显示。
5. narrative 禁止：Let me / Actually / desc: / 我写 / 等等 / 规则复述 / 导演旁白 / 「已为你添加」/ 任何语言的规划旁白。
6. 整个输出必须是可直接 JSON.parse 的单个对象。
7. 地点里的 beasts / interactables：每条必须有非空 name；beasts 还须有 realm、power（数字）、drops。缺 name 不要写进 JSON（否则会落成「未知生物/未知」）。

【叙事】
- 用${lang.storyHint}写约 100 字；对话可稍长。幽默可有，勿嘲讽玩家。
- 极速推进，砍掉过场；高光浓墨，琐碎一笔带过。
- 尊重玩家合理意愿；荒诞操作用幽默驳回且数据不变。
- 称呼随性别：男/女一致，未设定用「你/阁下」。
- **人物同一性**：同一事件内人物名字/身份/称谓不得改变或互换；上文叫「小师妹」就一直叫小师妹，不能中途变成师姐。新人物必须是场景里列出的人或明确新登场。

【玩法节奏】
- 对话 2~4 选；寒暄 1 选；对决分出胜负后 0~2 选内收束；不必写满 ${MAX_EVENT_CHOICES} 轮。
${limitOn ? `接近 ${MAX_EVENT_CHOICES} 轮仅用于真正的多阶段奇遇。` : '轮数限制已关，可写长篇，但仍要讲完就收。'}
- 外出行动尽量在 changes.new_locations 增加 1 个新地点（含 people/shop/beasts），等级匹配世界观。
- **玩家移动到新地点时必须写 changes.move_to（地点名）**，否则地图不会更新；同名地点直接写全名。
- 委托用 quests 同步：接取 active / 完成 done / 搞砸 failed；奖励写入数值字段；可带 loc；不设强制时限。

【数值与赠与】（正文 ↔ json 必须一致）
- 正文写出的获得物，必须在同轮 add_items 写出（名称/数量一致）。
- json 没有的，正文不能「塞给你」；上轮已给的不要重复 add。
- 你只增减 progress/cultivation、货币、物品、地图、任务、关系；「${ui.advanceVerb}」等升级由玩家在界面完成。
- 数值符合${ui.powerLabel}逻辑与位阶；核心资源只出现在对应段位场景。
${styleCaveat}

${styleBlock}
${genderBlock}
${pressureBlock}
${partyBlock}
${challengeBlock}

【世界观】${customHint}
${worldviewBlock}

【物品】
- desc/名字/type/use_effect 与实际用途一致。
- type：${typeList}；${techName}用 add_items(type=technique) 并带 realm_index、levels、level_costs、level_powers。
- 货币四档（下/中/上/极品），相邻 100:1，默认不自动进位。标价/奖励用最低档；付款可高抵低并找零（1 中品付 50 下品找回 50 下品）。fields 用 money_main/mid/high/peak。

【反例】（只许进 think，正文禁止）
错误开头示例：「用户与米拉交谈…」「应该给奖励…」「写约100字…」「JSON 要一致…」「开始写。」
这些只能出现在 think 块；玩家看到的只能是小说正文。

【JSON 骨架】
\`\`\`json
{
  "options": ["继续", "观察四周"],
  "end": false,
  "changes": {
    "age_days": 5,
    "money_main": 20,
    "progress": 0.5,
    "add_items": [{"name": "…", "count": 1, "desc": "…", "type": "consumable", "realm_index": 1, "grade": "${gradeHint}", "price": 10}],
    "remove_items": [{"name": "…", "count": 1}],
    "major_events": ["…"],
    "small_events": ["…"],
    "skills": {},
    "friends": [{"name": "…", "favor": 3, "rank": "${tierLabel(S)}", "gender": "男", "age_days": 3650, "power": 10, "intro": "…", "mem": "…", "married":"wife|husband|null", "relType": "熟人|伙伴|恩师|弟子|仇人|挚友", "relations": [{"to": "某人", "rel": "师徒|仇敌|旧友", "note": "一句"}], "grudges": [{"to": "某人", "kind": "恩|怨|仇|债", "note": "一句"}]}],
    "remove_friends": ["解除关系的名字"],
    "new_locations": [{"name": "…", "world": "${(pack.worlds && pack.worlds[0]) || '主世界'}", "continent": "…", "type": "…", "desc": "…", "people": [], "shop": [], "beasts": [{"name": "敌名", "realm": "等级", "power": 10, "drops": "掉落"}], "interactables": [{"name": "物名", "intro": "…"}]}],
    "quests": [{"title": "…", "from": "…", "loc": "…", "status": "active", "objectives": ["…"], "reward": "…", "notes": "…"}],
    "modify_locations": [{"name": "…", "change": "…", "beasts": [{"name": "敌名", "realm": "…", "power": 10, "drops": "…"}], "interactables": [{"name": "物名", "intro": "…"}]}],
    "remove_locations": ["…"],
    "move_to": "…"
  }
}
\`\`\`

【当前状态】玩家 ${JSON.stringify(playerState)}
【场景】${JSON.stringify(locState)}
【地图】${JSON.stringify(mapSummary(S))}
【近期事件】${JSON.stringify(recentEvents)}
【${companionName}】${JSON.stringify(friendsInfo)}
${npcBlock}`
}

function friendLocOf(S, name) {
  for (const l of S.map) {
    if ((l.people || []).some(p => p.name === name)) return l
  }
  return null
}

/** 文案是否为挑战/讨伐类指令 */
function isChallengeText(s) {
  if (!s) return false
  return /挑战|讨伐|除妖|狩猎|猎杀|围剿|袭击|搏杀|厮杀|开战|挑战「|发起挑战|拼了|上啊/.test(String(s))
}

/** 把 beasts 文本掉落解析成结构化数组（失败则 []） */
function parseDropsText(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(d => (typeof d === 'string' ? { name: d, count: 1 } : d))
  const s = String(raw || '').trim()
  if (!s) return []
  const parts = s.split(/[、,，;；/]|与/).map(x => x.trim()).filter(Boolean)
  return parts.map(p => {
    const m = p.match(/^(.+?)\s*[x×*]\s*(\d+)$/i)
    if (m) return { name: m[1].trim(), count: Math.max(1, Math.min(99, parseInt(m[2], 10) || 1)) }
    return { name: p.slice(0, 24), count: 1 }
  }).slice(0, 8)
}

/** 比值 → 局势标签（玩家战力 / 敌方战力）；UI 与挑战合同共用 */
export function oddsLabel(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return '未知'
  if (ratio >= 6) return '碾压'
  if (ratio >= 2) return '优势'
  if (ratio >= 0.5) return '势均力敌'
  if (ratio >= 1 / 6) return '劣势'
  return '极度危险'
}

/** 场景 beasts：补玩家战力对比 + 结构化掉落，供叙事与奖励对照 */
function enrichBeasts(beasts, myPower) {
  return (Array.isArray(beasts) ? beasts : []).map(b => {
    const power = Number(b && b.power) || 0
    const ratio = power > 0 && myPower > 0 ? myPower / power : null
    return {
      name: b && b.name,
      realm: b && b.realm,
      power,
      playerPower: myPower,
      powerRatio: ratio != null ? Number(ratio.toFixed(2)) : null,
      odds: oddsLabel(ratio),
      dropsRaw: b && b.drops,
      drops: parseDropsText(b && b.drops)
    }
  })
}

/**
 * 挑战辅助上下文：点名对象、战力参考、掉落提示。
 * 胜负与奖励尺度交给 AI 风格 + 世界观规则，不写死公式。
 */
function buildChallengeContract({ S, loc, myPower, styleKey, cheatOn, powerLabel, progName, moneyMain }) {
  const beasts = enrichBeasts(loc && loc.beasts, myPower)
  const list = beasts.length
    ? beasts.map(b => `- ${b.name}（${b.realm || '未知'}，${powerLabel} ${b.power}；相对你 ${b.powerRatio} → ${b.odds}；常见掉落：${JSON.stringify(b.drops)}）`).join('\n')
    : '- （当前地点 beasts 为空；若玩家仍挑战，可按世界观自创合理对手）'

  const lootRule = cheatOn
    ? '- 【开挂档】奖励可明显超出表内掉落（读者爽感优先），但仍需题材自洽：别给世界位阶不该出现的神装，频次与强度按慷慨/开挂尺度加厚。'
    : '- 战利品优先使用该 beast 的常见掉落；也可少量发挥，但名称/品阶须与场景位阶相符，禁止把场外顶级货塞进这场。'

  return `
【挑战/讨伐参考】（本轮涉及对抗时使用）
- 场景对手（含战力对比与局势参考，**仅作叙事合理性参考，不按公式判死**）：
${list}
- 若 user 点名了某个 beast，应打那一个，勿张冠李戴；name/realm 与场景一致。
- 胜负由 AI 风格与剧情张力决定：${styleRuleSummary(cheatOn)}比值大只说明该轻松写，比值小可写险胜/苦战/周旋，不必机械对表。
- ${lootRule}
- 未打赢时不要白送战利品；正文出现的奖励必须同步写进 changes。`
}

function styleRuleSummary(cheatOn) {
  return cheatOn ? '开挂档按玩家意愿取胜。' : '注意强弱悬殊时结果与叙事不要离谱。'
}
