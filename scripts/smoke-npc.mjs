// 按需 NPC 记忆
import { buildNpcIndex, matchNpcNames, focusNpcBlock, npcFocusFromTexts } from '../app/js/engine/npc-memory.js'

const S = {
  currentLoc: 'a1',
  friends: [{ name: '张三', realm: '炼气', power: 12, favor: 3, intro: '酒馆老板', mem: '欠你一顿酒', history: ['一起打过狼'] }],
  map: [
    {
      id: 'a1', name: '酒馆', world: '主世界',
      people: [{ name: '李四', realm: '凡人', power: 3, intro: '跑堂' }],
      beasts: [{ name: '野狗', realm: '野兽', power: 2, drops: '狗皮' }]
    },
    {
      id: 'a2', name: '铁匠铺', world: '主世界',
      people: [{ name: '王五', realm: '炼气', power: 20, intro: '铁匠' }],
      beasts: []
    }
  ]
}

const idx = buildNpcIndex(S)
if (!idx.has('张三') || !idx.has('王五') || !idx.has('野狗')) throw new Error('index')

const names = matchNpcNames('我去铁匠铺找王五买剑，顺便打听张三', idx)
console.log('names', names.join(','))
if (!names.includes('王五') || !names.includes('张三')) throw new Error('match ' + names)

const { block } = npcFocusFromTexts(S, ['找王五'])
if (!block.includes('王五') || !block.includes('铁匠')) throw new Error('block')
if (!block.includes('张三')) {
  // 只点名王五时也可不含张三
}
const block2 = focusNpcBlock(idx, ['张三'])
if (!block2.includes('欠你一顿酒')) throw new Error('friend mem')

console.log('NPC_OK')
