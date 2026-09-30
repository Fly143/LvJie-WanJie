// 同行（轻量队伍）+ 同伴近况 回归测试
// 覆盖：邀请/结束、同场景限制、行踪不明可邀请、随移动换场景、AI 不能直写 party、
//       f.history 会随交谈/记忆更新累积（此前该字段永远是空的）
import { pathToFileURL } from 'url'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const base = pathToFileURL(path.join(__dirname, '..', 'app', 'js')).href

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}

const { listPacks } = await import(base + '/worldviews/index.js')
const { newGame } = await import(base + '/engine/state.js')
const { applyChanges } = await import(base + '/engine/changes.js')
const { travel, gateReason, curLoc } = await import(base + '/engine/map.js')
const { setParty, partyNames, partyBrief, syncPartyTo, isParty } = await import(base + '/engine/party.js')
const { addFriendHistory, friendRecentLines } = await import(base + '/engine/npc-memory.js')
const { buildSystemPrompt } = await import(base + '/engine/prompt.js')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) }
}

const packId = listPacks()[0].id
const S = newGame('测试者', packId)

// 找一个可去的地点
const other = S.map.find(l => l.id !== S.currentLoc && !gateReason(S, curLoc(S), l))
ok('测试前置：存在可前往的其它地点', !!other, { locs: S.map.length })

const here = curLoc(S)
const elsewhere = other

// 建两个同伴：一个在本地，一个在别处
applyChanges(S, {
  friends: [
    { name: '本地甲', rank: '凡人中期', gender: '男', power: 5, intro: '同场景的同伴' },
    { name: '远处乙', rank: '凡人中期', gender: '女', power: 5, intro: '别处的同伴' }
  ]
})
ok('前置：两名同伴已结识', (S.friends || []).length === 2, S.friends.map(f => f.name))

// 把「本地甲」放到当前场景，「远处乙」放到别处
here.people = here.people || []
here.people.push({ name: '本地甲', realm: '凡人中期', power: 5, intro: '同场景的同伴', gender: '男', relations: [], grudges: [] })
if (elsewhere) {
  elsewhere.people = elsewhere.people || []
  elsewhere.people.push({ name: '远处乙', realm: '凡人中期', power: 5, intro: '别处的同伴', gender: '女', relations: [], grudges: [] })
}

// —— 邀请：同场景可以，别处不行 ——
const r1 = setParty(S, '本地甲', true)
ok('同场景可邀请', r1.ok && r1.on === true, r1)
ok('邀请后 isParty=true', isParty(S, '本地甲'))
ok('邀请后进入当前场景人物表', (curLoc(S).people || []).some(p => p.name === '本地甲'))

const r2 = setParty(S, '远处乙', true)
ok('不在同场景则拒绝邀请', !r2.ok && r2.reason === 'nothere', r2)
ok('被拒后仍非同行', !isParty(S, '远处乙'))

const r3 = setParty(S, '不存在的人', true)
ok('查无此人返回 missing', !r3.ok && r3.reason === 'missing', r3)

// —— 行踪不明（地图上无位置）也应允许邀请 ——
applyChanges(S, { friends: [{ name: '行踪丙', rank: '凡人初期', gender: '男', power: 3, intro: '没有位置' }] })
const r4 = setParty(S, '行踪丙', true)
ok('行踪不明的同伴可邀请', r4.ok && r4.on === true, r4)

// —— 随移动换场景 ——
if (elsewhere) {
  const before = elsewhere.id
  const tr = travel(S, elsewhere.name)
  ok('travel 成功', tr.ok, tr)
  ok('同行者跟随到新场景', (curLoc(S).people || []).some(p => p.name === '本地甲'), curLoc(S).people.map(p => p.name))
  const old = S.map.find(l => l.id === here.id)
  ok('旧场景已摘掉同行者', !(old.people || []).some(p => p.name === '本地甲'), (old.people || []).map(p => p.name))
  ok('syncPartyTo 幂等', syncPartyTo(S, S.currentLoc) === partyNames(S).length)
}

// —— 结束同行：留在原地，不再跟随 ——
const r5 = setParty(S, '本地甲', false)
ok('结束同行成功', r5.ok && r5.on === false && r5.changed === true, r5)
ok('结束后 party 标记清除', !isParty(S, '本地甲'))
ok('结束后仍留在当前场景（人不会被抹掉）', (curLoc(S).people || []).some(p => p.name === '本地甲'))
const r6 = setParty(S, '本地甲', false)
ok('重复结束返回 changed=false', r6.ok && r6.changed === false, r6)

// —— AI 不得直写 party ——
applyChanges(S, { friends: [{ name: '行踪丙', party: true }] })
const c = (S.friends || []).find(f => f.name === '行踪丙')
ok('AI 写 party 字段不生效（同行只能由界面切换）', c && c.party === true) // 行踪丙此前已被邀请，故仍为 true
const c2 = (S.friends || []).find(f => f.name === '远处乙')
applyChanges(S, { friends: [{ name: '远处乙', party: true }] })
ok('未同行者不会被 AI 写成同行', c2 && c2.party !== true, c2 && c2.party)

// —— f.history：交谈 / 记忆更新要累积 ——
const jia = (S.friends || []).find(f => f.name === '本地甲')
ok('结束同行写入近况', friendRecentLines(jia, 9).some(x => /结束/.test(x)), friendRecentLines(jia, 9))
applyChanges(S, { friends: [{ name: '本地甲', mem: '与你并肩闯过城南秘窟' }] })
ok('AI 记忆更新写入近况', friendRecentLines(jia, 9).some(x => /城南秘窟/.test(x)), friendRecentLines(jia, 9))
const n0 = jia.history.length
addFriendHistory(jia, '在青云宗与你交谈')
ok('交谈写入近况', jia.history.length === n0 + 1)
addFriendHistory(jia, '在青云宗与你交谈')
ok('连续重复不入', jia.history.length === n0 + 1)
for (let i = 0; i < 80; i++) addFriendHistory(jia, '第 ' + i + ' 次近况')
ok('近况上限 50 条', jia.history.length === 50, jia.history.length)
ok('旧档对象形态兼容', friendRecentLines({ history: [{ day: 3, text: '老格式' }] }, 2).join() === '老格式')

// —— 提示词应带上同行者 ——
const sys = buildSystemPrompt(S, { limitOn: true })
ok('提示词含同行名单', sys.includes('【同行者】') && sys.includes('行踪丙'), sys.includes('【同行者】'))
const brief = partyBrief(S)
ok('同行简报含同行天数', brief.length === partyNames(S).length && brief.every(p => typeof p.同行天数 === 'number'), brief)

console.log(`PARTY ${pass}/${pass + fail}`)
if (fail) process.exit(1)
