export function createXuanhuanMap() {
  return [
    {
      id: 'x_bs', name: '边陲小城·石镇', world: '人界', continent: '东域', type: '城镇',
      desc: '斗气稀薄的边陲小城，家族林立。',
      people: [{ name: '城主·石横', realm: '大斗师后期', power: 800, intro: '石镇城主' }],
      shop: [{ name: '凝气散', desc: '下品丹药', type: 'consumable', realm_index: 0, grade: '下品', price: 15 }],
      beasts: [], interactables: [{ name: '斗气测试碑', intro: '测斗之气' }], notes: []
    },
    {
      id: 'x_cj', name: '苍岚学院', world: '人界', continent: '东域', type: '学院',
      desc: '东域著名学院，天才云集。',
      people: [{ name: '院长·云苍', realm: '斗皇初期', power: 5e4, intro: '学院院长' }],
      shop: [], beasts: [], interactables: [{ name: '试炼塔', intro: '层层试炼' }], notes: []
    },
    {
      id: 'x_wl', name: '万兽山脉', world: '人界', continent: '东域', type: '山脉',
      desc: '魔兽盘踞，灵药遍地。',
      people: [],
      shop: [],
      beasts: [{ name: '四阶魔兽·炎狼', realm: '斗师后期', power: 70, drops: '狼核x1' }],
      interactables: [], notes: []
    },
    {
      id: 'x_df', name: '丹塔分会', world: '人界', continent: '西域', type: '城池',
      desc: '西域炼药圣地。',
      people: [{ name: '塔老·药尘', realm: '斗宗中期', power: 2e5, intro: '丹塔供奉' }],
      shop: [], beasts: [], interactables: [], notes: []
    },
    {
      id: 't_lc', name: '天罗圣城', world: '天罗界', continent: '中洲', type: '城池',
      desc: '天罗界第一雄城。',
      people: [{ name: '圣城之主', realm: '斗尊中期', power: 5e7, intro: '天罗强者' }],
      shop: [], beasts: [], interactables: [], notes: []
    },
    {
      id: 't_lh', name: '轮回禁地', world: '天罗界', continent: '荒域', type: '禁地',
      desc: '传说可窥轮回的禁地。',
      people: [],
      shop: [],
      beasts: [{ name: '禁地守灵', realm: '斗尊后期', power: 8e7, drops: '轮回碎片x1' }],
      interactables: [], notes: []
    },
    {
      id: 'd_zy', name: '帝域·诸天台', world: '帝域', continent: '帝庭', type: '圣地',
      desc: '斗帝气息残留的诸天台。',
      people: [{ name: '帝使', realm: '斗圣后期', power: 5e12, intro: '帝域使者' }],
      shop: [], beasts: [], interactables: [{ name: '帝火残留', intro: '可遇帝火机缘' }], notes: []
    }
  ]
}
