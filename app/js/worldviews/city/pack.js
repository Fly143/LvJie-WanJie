// 都市生活世界观（非职场主线）
import { createCityMap } from './map.js'
import { buildCityRules } from './rules.js'

export const cityPack = {
  id: 'city',
  name: '都市',
  icon: '🌃',
  tagline: '烟火都市，从街角新人到城市传说',
  gameTitle: 'Agent都市',
  theme: {
    accent: '#ff6b9d',
    accent2: '#c44d8e',
    accentDim: '#9a3a6e',
    glow: 'rgba(255,107,157,.28)',
    bg: '#12081a',
    bg2: '#1c1030',
    bg3: '#0c0614',
    panel: 'rgba(36,18,48,.82)',
    panel2: 'rgba(52,28,72,.55)',
    line: 'rgba(220,140,200,.14)',
    line2: 'rgba(220,140,200,.3)',
    text: '#f0dcec',
    dim: '#b892b0',
    faint: '#7a5a78',
    jade: '#7dcea0',
    blue: '#7eb8ff',
    red: '#ff7a8a',
    purple: '#c39bff',
    fontDisplay: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    fontBody: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    fontEvent: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    radius: '14px',
    deco: 'radial-gradient(ellipse at 20% 0%, rgba(255,107,157,.08), transparent 45%)',
    cardBg: 'linear-gradient(160deg, rgba(50,24,70,.82), rgba(28,12,42,.88))'
  },
  defaultName: '城中新人',
  startText: '你拎着行李搬进城中村，手机弹出同城活动推送。',
  features: { lifespan: false, levelPressure: false, marriage: true },
  ui: {
    advanceBtn: '✨ 跃迁圈层',
    advanceVerb: '跃迁',
    advanceTo: '跃迁至',
    advancePeak: '已成都市传说',
    advanceSuccessTitle: '跃迁成功',
    lifeWarn: '状态不佳',
    talkBtn: '搭话',
    fightBtn: '比拼',
    powerLabel: '人气'
  },
  sceneActions: [
    { id: 'travel', label: '🚇 逛街串巷', prompt: '我在城里闲逛，钻小巷、商场和夜市。' },
    { id: 'talk', label: '🎤 社交凑热闹', prompt: '我主动搭话，参加聚会或同城活动。' },
    { id: 'fight', label: '🏆 才艺比拼', prompt: '我报名一场街头/线上比拼，秀出拿手绝活！' },
    { id: 'search', label: '📸 找好玩的', prompt: '我寻找演出、市集、网红店和隐秘据点。' },
    { id: 'rest', label: '🍜 觅食回血', prompt: '我去找家小馆子好好吃一顿，放松一下。' }
  ],
  worlds: ['城中村', '新城区', '周边都市'],
  worldMaxTier: { 城中村: 3, 新城区: 6, 周边都市: 9 },
  subNames: ['入圈', '热络', '熟门熟路'],
  subPower: [1, 1.3, 1.8],
  lexicon: {
    level: '圈层',
    progress: '人气',
    money: { main: '现金', mid: '零花/优惠', high: '潮品/收藏' },
    companion: '玩伴',
    skill: '特长',
    power: '人气',
    technique: '绝活',
    startBtn: '进城生活',
    welcomeTitle: 'Agent都市',
    welcomeSub: '烟火气开放世界都市之旅',
    nav: {
      scene: '当前位置', map: '城市地图', profile: '个人名片',
      friends: '玩伴', bag: '随身包', settings: '设置'
    }
  },
  skills: [
    { id: 'social', name: '社交', prof: '派对达人' },
    { id: 'style', name: '穿搭', prof: '时尚达人' },
    { id: 'food', name: '觅食', prof: '美食家' },
    { id: 'show', name: '表现', prof: '舞台咖' }
  ],
  typeNames: {
    consumable: '吃喝玩乐', equip: '潮品装备', technique: '绝活',
    material: '素材/道具', special: '票券/机会'
  },
  talentNames: { social: '自来熟', lucky: '欧皇体质', photo: '上镜体质', ordinary: '普通人' },
  talentCultMul: (t) => (t === 'lucky' ? 0.5 : 1),
  breakthroughGrade: '破圈机会',
  pillPct: { 普通: 5, 精良: 10, 限定: 20, 联名: 30 },
  pillPriceK: 15,
  artPriceK: 60,
  breakthroughPriceK: 18,
  artPower: { 普通: 0.1, 精良: 0.18, 限定: 0.32, 联名: 0.5 },
  cultYears: [1, 2, 4, 8, 12, 20, 30, 50, 80, 120],
  startLoc: 'c_flat',
  tiers: [
    { name: '城中村新人', lifespan: 90, subNames: ['入圈', '混脸熟'] },
    { name: '街熟', lifespan: 90 },
    { name: '圈内人', lifespan: 92 },
    { name: '同城红人', lifespan: 95 },
    { name: '跨区知名', lifespan: 98 },
    { name: '城中名人', lifespan: 100 },
    { name: '潮流领袖', lifespan: 105 },
    { name: '城市明星', lifespan: 110 },
    { name: '传奇主理', lifespan: 115 },
    { name: '都市传说', lifespan: 120 }
  ],
  createMap: createCityMap,
  buildRules: buildCityRules,
  gateRules(from, to, S) {
    if (!from || !from.world) return null
    if (to.world === '新城区' && S.tierIndex < 1) return '在城中村先混熟再进新城圈'
    if (to.world === '周边都市' && S.tierIndex < 3) return '跨城活动至少需要同城红人级号召力'
    return null
  },
  travelDays(S, c, t) {
    const speed = 1 + S.tierIndex * 0.2
    let raw = 1
    if (c.world !== t.world) raw = 7
    else if (c.continent !== t.continent) raw = 2
    return Math.max(0, Math.floor(raw / speed))
  },
  createInitState() {
    return {
      ageDays: 20 * 360,
      money: { main: 1800, mid: 0, high: 0 },
      startInventory: [
        {
          name: '旧手机', desc: '拍照还行，随时刷同城', type: 'equip',
          realm_index: 0, grade: '普通', price: 800, count: 1
        }
      ],
      startEvents: [{ age: '20岁0月0天', text: '你搬进城中村出租屋，窗外是永不熄灭的霓虹。' }]
    }
  }
}
