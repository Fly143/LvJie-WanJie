// 玄幻世界观（斗气大陆风）
import { createXuanhuanMap } from './map.js'
import { buildXuanhuanRules } from './rules.js'

export const xuanhuanPack = {
  id: 'xuanhuan',
  name: '玄幻',
  icon: '🐉',
  tagline: '斗气大陆，从斗者到斗帝',
  gameTitle: 'Agent玄幻',
  theme: {
    accent: '#ff8a4c', accent2: '#d35420', accentDim: '#a84820',
    glow: 'rgba(255,120,40,.35)',
    bg: '#140806', bg2: '#2a100c', bg3: '#0e0605',
    panel: 'rgba(42,20,14,.85)', panel2: 'rgba(64,28,18,.55)',
    line: 'rgba(255,140,80,.15)', line2: 'rgba(255,140,80,.32)',
    text: '#ffd9c2', dim: '#c89880', faint: '#8a6050',
    jade: '#ffcc80', blue: '#ff9e7a', red: '#ff6b5a', purple: '#e89bff',
    fontDisplay: '"Microsoft YaHei","PingFang SC",sans-serif',
    fontBody: '"Microsoft YaHei","PingFang SC",sans-serif',
    fontEvent: '"Microsoft YaHei","PingFang SC",sans-serif',
    radius: '8px',
    cardBg: 'linear-gradient(150deg, rgba(80,30,16,.8), rgba(40,14,10,.85))'
  },
  defaultName: '无名少年',
  startText: '斗气复苏的边陲小城，你是一名刚测出斗之气的少年。',
  features: { lifespan: true, levelPressure: true, marriage: true },
  ui: {
    advanceBtn: '🔥 突破',
    advanceVerb: '突破',
    advanceTo: '突破至',
    advancePeak: '已至斗道尽头',
    advanceSuccessTitle: '突破成功',
    lifeWarn: '气血将衰',
    talkBtn: '交谈',
    fightBtn: '挑战'
  },
  sceneActions: [
    { id: 'travel', label: '🗺️ 闯荡大陆', prompt: '我外出闯荡，寻找机缘。' },
    { id: 'talk', label: '💬 攀谈结交', prompt: '我与附近的人攀谈，打探消息。' },
    { id: 'fight', label: '⚔️ 猎杀魔兽', prompt: '我挑战附近的魔兽或强者！' },
    { id: 'search', label: '🔍 搜寻灵药', prompt: '我搜寻灵药、功法与遗迹。' },
    { id: 'cultivate', label: '🌀 打坐炼气', prompt: '我盘膝炼化斗气，冲击瓶颈。' }
  ],
  worlds: ['人界', '天罗界', '帝域'],
  worldMaxTier: { 人界: 4, 天罗界: 7, 帝域: 9 },
  subNames: ['初期', '中期', '后期', '大圆满'],
  subPower: [1, 1.25, 1.6, 1.8],
  lexicon: {
    level: '斗阶',
    progress: '斗气',
    money: { main: '金币', mid: '玄晶', high: '帝晶' },
    companion: '红颜/兄弟',
    skill: '副业',
    power: '战力',
    technique: '功法',
    startBtn: '踏上斗途',
    welcomeTitle: 'Agent玄幻',
    welcomeSub: 'AI驱动的开放世界玄幻之旅',
    nav: {
      scene: '当前场景', map: '大陆地图', profile: '人物信息',
      friends: '同伴', bag: '纳戒', settings: '设置'
    }
  },
  skills: [
    { id: 'alchemy', name: '炼药', prof: '炼药师' },
    { id: 'forge', name: '铸兵', prof: '铸兵师' },
    { id: 'array', name: '符阵', prof: '符阵师' },
    { id: 'beast', name: '驭兽', prof: '驭兽师' }
  ],
  typeNames: {
    consumable: '丹药', equip: '兵器', technique: '功法',
    material: '灵材', special: '奇物'
  },
  talentNames: { venomsoul: '毒斗圣体', starbone: '星辰战骨', dualqi: '阴阳双气', ordinary: '平凡之躯' },
  talentCultMul: (t) => (t === 'starbone' ? 0.5 : 1),
  breakthroughGrade: '破阶丹',
  pillPct: { 下品: 5, 中品: 10, 上品: 20, 极品: 30 },
  pillPriceK: 20,
  artPriceK: 100,
  breakthroughPriceK: 25,
  artPower: { 下品: 0.1, 中品: 0.17, 上品: 0.3, 极品: 0.5 },
  cultYears: [2, 15, 60, 200, 600, 2000, 8000, 40000, 200000, 1000000],
  startLoc: 'x_bs',
  tiers: [
    { name: '斗之气', lifespan: 100, subNames: ['一星', '二星', '三星', '四星'] },
    { name: '斗者', lifespan: 120 },
    { name: '斗师', lifespan: 150 },
    { name: '大斗师', lifespan: 200 },
    { name: '斗灵', lifespan: 300 },
    { name: '斗王', lifespan: 500 },
    { name: '斗皇', lifespan: 1000 },
    { name: '斗宗', lifespan: 3000 },
    { name: '斗尊', lifespan: 10000 },
    { name: '斗圣', lifespan: 100000 },
    { name: '斗帝', lifespan: Infinity }
  ],
  createMap: createXuanhuanMap,
  buildRules: buildXuanhuanRules,
  gateRules(from, to, S) {
    if (!from || !from.world) return null
    if (to.world === '天罗界' && from.world === '人界' && S.tierIndex < 5) return '前往天罗界需斗王境'
    if (to.world === '帝域' && from.world === '天罗界' && S.tierIndex < 8) return '踏入帝域需斗尊境'
    if (from.world === to.world && from.continent !== to.continent && S.tierIndex < 3) return '跨域游历需大斗师境'
    return null
  },
  travelDays(S, c, t) {
    const speed = Math.pow(2, Math.max(0, S.tierIndex))
    let raw = c.world !== t.world ? 400 : (c.continent !== t.continent ? 40 : 5)
    return Math.max(0, Math.floor(raw / speed))
  },
  createInitState() {
    return {
      ageDays: 3600,
      startInventory: [
        {
          name: '凝气散', desc: '下品丹药，可增少量斗气', type: 'consumable',
          realm_index: 0, grade: '下品', price: 15, count: 2,
          usable: 'direct', use_effect: { type: 'progress', value: 1 }
        }
      ],
      startEvents: [{ age: '16岁0月0天', text: '测出斗之气，踏上修行路。' }]
    }
  }
}
