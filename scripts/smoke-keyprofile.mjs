// API 配置「切换选用」回归测试：
// 1) 同一条配置的匹配（忽略结尾斜杠、兼容旧 style 字段）
// 2) 表单未改动 → 不得触发 upsert（否则会把切换改回原来那条）
import { normBase, styleOf, sameKeyEntry, formDirty, upsertKeyEntry, isZenEntry } from '../app/js/engine/keyprofile.js'

let pass = 0
let fail = 0
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) }
}

const chat = { name: 'deepseek-flash', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiStyle: 'chat' }
const resp = { name: 'deepseek-flash', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiStyle: 'response' }

// —— 归一化 ——
ok('normBase 去结尾斜杠', normBase('https://a.b/v1/') === 'https://a.b/v1')
ok('styleOf 默认 chat', styleOf({}) === 'chat')
ok('styleOf 认旧 style 字段', styleOf({ style: 'response' }) === 'response')

// —— 同一条判定 ——
ok('结尾斜杠差异仍算同一条', sameKeyEntry(chat, { baseUrl: 'https://api.deepseek.com/v1/' }) === true || sameKeyEntry(
  { baseUrl: 'https://a/v1', model: 'm', apiStyle: 'chat' },
  { baseUrl: 'https://a/v1/', model: 'm', apiStyle: 'chat' }
) === true)
ok('协议不同 → 不同条', sameKeyEntry(chat, resp) === false)
ok('旧 style 字段可与 apiStyle 匹配', sameKeyEntry({ baseUrl: 'https://a/v1', model: 'm', style: 'response' },
  { baseUrl: 'https://a/v1', model: 'm', apiStyle: 'response' }) === true)
ok('model 不同 → 不同条', sameKeyEntry(chat, { baseUrl: chat.baseUrl, model: 'other', apiStyle: 'chat' }) === false)

// —— 核心回归：切换后未改表单，保存不得 upsert 回旧条 ——
// 打开弹窗时选中的是 chat（表单由 chat 填充）；玩家切到 response，
// 修复后表单会被同步成 response，于是 dirty=false → 只切换选用。
ok('同步后的表单与当前条一致 → 不算改动（关键）', formDirty({ ...resp }, resp) === false)
ok('表单仍是旧条内容 → 判定为改动（这正是过去的 bug 路径）', formDirty({ ...chat }, resp) === true)
ok('改了协议 → 算改动', formDirty({ ...resp, apiStyle: 'chat' }, resp) === true)
ok('改了模型 → 算改动', formDirty({ ...resp, model: 'deepseek-chat' }, resp) === true)
ok('改了备注名 → 算改动', formDirty({ ...resp, name: '新名字' }, resp) === true)
ok('重填了 Key → 算改动', formDirty({ ...resp, key: 'sk-new' }, resp) === true)
ok('结尾斜杠差异不算改动', formDirty({ ...resp, baseUrl: resp.baseUrl + '/' }, resp) === false)
ok('空表单无当前条 → 不算改动', formDirty({}, null) === false)
ok('有内容无当前条 → 算改动', formDirty({ baseUrl: 'https://a/v1' }, null) === true)

// —— 内置免费通道：只保留一条，换模型不新增 ——
const ZEN = 'https://opencode.ai/zen/v1'
const zenA = { name: '内置免费', baseUrl: ZEN, key: 'public', model: 'mimo-v2.6-flash-free', apiStyle: 'chat' }
const zenB = { name: '内置免费', baseUrl: ZEN, key: 'public', model: 'deepseek-v4-flash-free', apiStyle: 'chat' }
ok('isZenEntry 认得内置通道', isZenEntry(zenA) === true && isZenEntry(chat) === false)
ok('内置通道写入空列表 → 1 条', upsertKeyEntry([], zenA).list.length === 1)
ok('内置通道换模型 → 仍是 1 条', (() => {
  const r1 = upsertKeyEntry([], zenA)
  const r2 = upsertKeyEntry(r1.list, zenB)
  return r2.list.length === 1 && r2.list[0].model === zenB.model && r2.index === 0
})())
ok('内置通道不会覆盖自定义条目', (() => {
  const r = upsertKeyEntry([chat], zenA)
  return r.list.length === 2 && r.list[0].model === chat.model && r.index === 1
})())
ok('自定义换模型仍会各自成条', (() => {
  const r1 = upsertKeyEntry([], chat)
  const r2 = upsertKeyEntry(r1.list, { ...chat, model: 'deepseek-v4-pro' })
  return r2.list.length === 2
})())
ok('同一条自定义 → 原地更新不新增', (() => {
  const r1 = upsertKeyEntry([], chat)
  const r2 = upsertKeyEntry(r1.list, { ...chat, name: '改个名' })
  return r2.list.length === 1 && r2.list[0].name === '改个名' && r2.index === 0
})())
ok('沿用原 Key 编辑（无 keyInput + selNow）', (() => {
  const r = upsertKeyEntry([chat, resp], { ...resp, model: 'x' }, { selNow: 1 })
  return r.index === 1 && r.list.length === 2
})())
ok('更新时保留原 Key', (() => {
  const r = upsertKeyEntry([{ ...chat, key: 'sk-old' }], { ...chat, name: 'n' })
  return r.list[0].key === 'sk-old'
})())

// —— 场景演练：两条配置、切到第 2 条后保存 ——
const keys = [chat, resp]
let selected = 0
const formAfterSwitch = { ...keys[1] } // 切换时由 syncFormToEntry 同步
selected = 1
const dirty = formDirty(formAfterSwitch, keys[selected])
const upsert = keys.findIndex(k => sameKeyEntry(k, formAfterSwitch))
ok('演练：保存后仍选第 2 条', dirty === false && selected === 1)
ok('演练：不会误匹配回第 1 条', !(dirty && upsert === 0))

console.log(`KEYPROFILE ${pass}/${pass + fail}`)
if (fail) process.exit(1)
