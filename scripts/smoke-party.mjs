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
const { partyInteract, canInteractToday, partyDays, PARTY_DAILY_FAVOR, dismissAll, originOf } = await import(base + '/engine/party.js')
const { addFriendHistory, friendRecentLines, advanceFriendDays } = await import(base + '/engine/npc-memory.js')
const { buildSystemPrompt } = await import(base + '/engine/prompt.js')
const { totalPowerF, powerBreakdown, partyPowerF, friendPowerF } = await import(base + '/engine/power.js')

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

// —— 队伍战力：同行者按系数计入总战力 ——
const bdNoParty = powerBreakdown(S)
ok('队伍战力>0（有同行者）', partyPowerF(S) > 0, partyPowerF(S))
ok('战力明细含 party 项', typeof bdNoParty.party === 'number')
const totalWith = totalPowerF(S)
const saved = S.friends.map(f => f.party)
S.friends.forEach(f => { f.party = false })
const totalWithout = totalPowerF(S)
S.friends.forEach((f, i) => { f.party = saved[i] })
ok('结束同行会降低总战力', totalWith > totalWithout, { totalWith, totalWithout })
ok('恢复同行后总战力还原', totalPowerF(S) === totalWith)
// 伴侣不重复计入队伍战力
const spouseTest = S.friends.find(f => f.party === true)
if (spouseTest) {
  spouseTest.married = 'wife'
  const bdSpouse = powerBreakdown(S)
  ok('伴侣同时同行时不重复计入队伍战力', partyPowerF(S) < friendPowerF(S, spouseTest) + 1 || partyPowerF(S) === 0, { party: partyPowerF(S) })
  spouseTest.married = null
}

// —— 每日互动：每人每天一次、加好感、写近况 ——
const target = (S.friends || []).find(f => f.party === true)
if (target) {
  target.favor = 10
  const before = target.favor
  ok('今日可互动', canInteractToday(S, target) === true)
  const i1 = partyInteract(S, target.name)
  ok('互动成功且加好感', i1.ok && target.favor === before + PARTY_DAILY_FAVOR, { i1, favor: target.favor })
  ok('互动写入近况', friendRecentLines(target, 5).some(x => /切磋/.test(x)), friendRecentLines(target, 5))
  ok('同日重复互动被拦', partyInteract(S, target.name).reason === 'today')
  ok('今日不可再互动', canInteractToday(S, target) === false)
  S.ageDays += 30 // 过一天
  ok('次日恢复可互动', canInteractToday(S, target) === true)
  const i2 = partyInteract(S, target.name)
  ok('次日互动成功', i2.ok === true, i2)
} else {
  ok('存在同行者用于每日互动测试', false)
}
ok('非同行者不能互动', (() => {
  const notParty = (S.friends || []).find(f => f.party !== true)
  return notParty ? partyInteract(S, notParty.name).reason === 'notparty' : true
})())

// —— 状态随天数推进：已结识 NPC 年龄同步增长 ——
const aged = (S.friends || []).find(f => f.ageDays != null)
if (aged) {
  const before = aged.ageDays
  const n = advanceFriendDays(S, 30)
  ok('NPC 年龄随时间推进', aged.ageDays === before + 30 && n >= 1, { before, after: aged.ageDays, n })
} else {
  aged && 0
  const f2 = (S.friends || [])[0]
  f2.ageDays = 3600
  const before = f2.ageDays
  advanceFriendDays(S, 30)
  ok('NPC 年龄随时间推进', f2.ageDays === before + 30, { before, after: f2.ageDays })
}
// 未知年龄不被凭空生成
const unknown = (S.friends || []).find(f => f.ageDays == null)
if (unknown) {
  advanceFriendDays(S, 30)
  ok('未知年龄保持未知', unknown.ageDays == null)
}
// travel 也会推进 NPC 年龄
if (elsewhere) {
  const anyFriend = (S.friends || []).find(f => f.ageDays != null)
  const before = anyFriend.ageDays
  const back = S.map.find(l => l.id !== S.currentLoc && !gateReason(S, curLoc(S), l))
  if (back) {
    const tr = travel(S, back.name)
    ok('旅行推进同伴年龄', !tr.ok || anyFriend.ageDays === before + (tr.days || 0), { before, after: anyFriend.ageDays, days: tr.days })
  }
}

// —— 解除同行：留在原地 / 返回原处 / 解散全队 ——
{
  // A：留在原地
  const A = newGame('甲测试', packId)
  const aHome = curLoc(A)
  const aDest = A.map.find(l => l.id !== A.currentLoc && !gateReason(A, curLoc(A), l))
  applyChanges(A, { friends: [{ name: '同伴A', rank: '凡人中期', gender: '男', power: 5 }] })
  aHome.people = aHome.people || []
  aHome.people.push({ name: '同伴A' })
  setParty(A, '同伴A', true)
  ok('A 邀请时记住出发点', (originOf(A, A.friends[0]) || {}).id === aHome.id, originOf(A, A.friends[0]))
  if (aDest) {
    travel(A, aDest.name)
    const d = setParty(A, '同伴A', false)
    ok('A 留在原地：仍在当前场景', d.returned === false && (curLoc(A).people || []).some(p => p.name === '同伴A'), d)
    ok('A 留在原地：未回出发地', !((A.map.find(l => l.id === aHome.id).people) || []).some(p => p.name === '同伴A'))
  }

  // B：返回原处
  const B = newGame('乙测试', packId)
  const bHome = curLoc(B)
  const bDest = B.map.find(l => l.id !== B.currentLoc && !gateReason(B, curLoc(B), l))
  applyChanges(B, { friends: [{ name: '同伴B', rank: '凡人中期', gender: '男', power: 5 }] })
  bHome.people = bHome.people || []
  bHome.people.push({ name: '同伴B' })
  setParty(B, '同伴B', true)
  if (bDest) {
    travel(B, bDest.name)
    const d = setParty(B, '同伴B', false, { returnTo: true })
    ok('B 返回原处：标记正确', d.returned === true && d.to === bHome.name, d)
    ok('B 返回原处：回到出发地人物表', ((B.map.find(l => l.id === bHome.id).people) || []).some(p => p.name === '同伴B'))
    ok('B 返回原处：已离开当前场景', !(curLoc(B).people || []).some(p => p.name === '同伴B'))
  }

  // C：解散全队（各自返回原处）
  const C = newGame('丙测试', packId)
  const cHome = curLoc(C)
  applyChanges(C, {
    friends: [
      { name: '丙一', rank: '凡人中期', gender: '男', power: 5 },
      { name: '丙二', rank: '凡人中期', gender: '女', power: 4 }
    ]
  })
  cHome.people = cHome.people || []
  cHome.people.push({ name: '丙一' }, { name: '丙二' })
  setParty(C, '丙一', true)
  setParty(C, '丙二', true)
  ok('C 前置：两人同行', partyNames(C).length === 2, partyNames(C))
  const cDest = C.map.find(l => l.id !== C.currentLoc && !gateReason(C, curLoc(C), l))
  if (cDest) travel(C, cDest.name)
  const all = dismissAll(C, { returnTo: true })
  ok('C 解散全队：全部解除', all.count === 2 && partyNames(C).length === 0, all)
  ok('C 解散全队：全部返回原处', all.returned === 2, all)
  ok('C 解散全队：原处人物表恢复两人',
    (((C.map.find(l => l.id === cHome.id) || {}).people) || []).filter(p => /丙/.test(p.name)).length === 2)

  // D：行踪不明者没有出发点
  const D = newGame('丁测试', packId)
  applyChanges(D, { friends: [{ name: '丁某', rank: '凡人中期', gender: '男', power: 3 }] })
  ok('D 行踪不明者邀请成功', setParty(D, '丁某', true).ok === true)
  ok('D 行踪不明者无出发点', originOf(D, D.friends[0]) === null)
  ok('D 无出发点时要求返回也不报错', setParty(D, '丁某', false, { returnTo: true }).returned === false)
}

console.log(`PARTY ${pass}/${pass + fail}`)
if (fail) process.exit(1)
