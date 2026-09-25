// 任务系统冒烟
import { applyQuestChanges, ensureQuestList, questStatusLabel } from '../app/js/engine/quests.js'

const S = { quests: [] }
let r = applyQuestChanges(S, [
  { title: '帮李四找剑', from: '李四', desc: '找回青铜剑', objectives: ['去后山'], reward: '银两' }
])
if (!r.added.length) throw new Error('add')
r = applyQuestChanges(S, [{ title: '帮李四找剑', status: 'done', notes: '已找回' }])
if (S.quests[0].status !== 'done') throw new Error('done ' + S.quests[0].status)
if (questStatusLabel(S.quests[0].status) !== '已完成') throw new Error('label')
r = applyQuestChanges(S, [{ title: '新委托', status: 'failed' }])
if (!S.quests.some(q => q.status === 'failed')) throw new Error('failed')
if (ensureQuestList(S).length < 2) throw new Error('len')
console.log('QUEST_OK', S.quests.map(q => q.title + ':' + q.status).join(','))
