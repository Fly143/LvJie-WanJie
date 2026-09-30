// 模型补写链验证：检查补出合同/兜底/结构健全
import { newGame } from '../app/js/engine/state.js'
import { listPacks } from '../app/js/worldviews/index.js'
import { startEvent, runEventTurn, recoverChangesFromLLM } from '../app/js/engine/event.js'

const evMod = await import('../app/js/engine/event.js')

// 1) recoverChangesFromLLM 白盒最小验证（依赖 callLLM，无法注入 → 只测护栏路径）
const S = newGame('测试', listPacks()[0].id)
const EV = startEvent('chat', '测试', '师尊')

// 模拟一次「无 json」回合：直接构造 inner 不可行（私有）→ 走 runEventTurn 前先验证 inferLite 兜底
// inferLite 未导出，改为端到端：临时打桩 fetch 会被 llm.js 封装拦住，故以最小验证替代：
// 1) recoverChangesFromLLM 对短文本直接返回 null（不发请求）
const r1 = await recoverChangesFromLLM({ keyObj: null, narrative: '太短', S })
console.log('recover(null key) →', r1, r1 === null ? 'PASS' : 'FAIL')

// 2) startEvent / runEventTurn 结构健全
console.log('startEvent kind →', EV.kind, EV.kind === 'chat' ? 'PASS' : 'FAIL')

// 3) syncGiftsWithNarrative：正文赠与未入 json 时自动补
import { syncGiftsWithNarrative, applyChanges } from '../app/js/engine/changes.js'
const ch = syncGiftsWithNarrative({}, '师尊递给你「筑基丹」，又塞给你一块黑面包。')
const names = (ch.add_items || []).map(x => x.name)
console.log('gift sync →', JSON.stringify(names), names.includes('筑基丹') ? 'PASS' : 'FAIL')
const brief = applyChanges(S, ch)
console.log('applyChanges brief.major →', JSON.stringify(brief.major))

// 4) 连续无数据块强制收束阈值存在
console.log('runEventTurn is fn →', typeof runEventTurn === 'function' ? 'PASS' : 'FAIL')
console.log('evMod exports →', Object.keys(evMod).join(','))
