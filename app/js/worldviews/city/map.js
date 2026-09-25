export function createCityMap() {
  return [
    {
      id: 'c_flat', name: '城中村出租屋', world: '城中村', continent: '南城', type: '住所',
      desc: '隔音一般，窗外是烧烤摊和霓虹。',
      people: [{ name: '室友·阿哲', realm: '街熟', power: 8, intro: '本地通，消息灵' }],
      shop: [{ name: '关东煮', desc: '夜宵顶饱', type: 'consumable', realm_index: 0, grade: '普通', price: 12, usable: 'direct', use_effect: { type: 'progress', value: 0.3 } }],
      beasts: [], interactables: [{ name: '天台', intro: '看夜景、吹风' }], notes: []
    },
    {
      id: 'c_night', name: '夜市小吃街', world: '城中村', continent: '南城', type: '街区',
      desc: '烟火气最重，摊主和熟客都认得脸。',
      people: [{ name: '摊主·花姐', realm: '圈内人', power: 30, intro: '夜市百事通' }],
      shop: [{ name: '烤冷面', desc: '排队神店', type: 'consumable', realm_index: 0, grade: '精良', price: 18, usable: 'direct', use_effect: { type: 'progress', value: 0.5 } }],
      beasts: [], interactables: [{ name: '街头演出角', intro: '可上去秀一段' }], notes: []
    },
    {
      id: 'c_park', name: '老街球场', world: '城中村', continent: '南城', type: '场地',
      desc: '约球、滑板、周末市集都在这儿。',
      people: [], shop: [], beasts: [{ name: '街头好手·豪仔', realm: '同城红人', power: 120, drops: '球衣与掌声' }],
      interactables: [{ name: '滑板坡道', intro: '技术流打卡点' }], notes: []
    },
    {
      id: 'c_mall', name: '万象城商场', world: '新城区', continent: '新城', type: '商圈',
      desc: '首店、快闪和潮流展常年不断。',
      people: [{ name: '买手·Mia', realm: '潮流领袖', power: 400, intro: '潮流买手店主理' }],
      shop: [{ name: '联名球鞋', desc: '排队也不一定买得到', type: 'equip', realm_index: 2, grade: '限定', price: 2200 }],
      beasts: [], interactables: [{ name: '快闪展台', intro: '适合拍照与试装' }], notes: []
    },
    {
      id: 'c_live', name: '运河音乐现场', world: '新城区', continent: '新城', type: 'livehouse',
      desc: '独立乐队与城中之夜的交汇处。',
      people: [{ name: '主唱·小满', realm: '城市明星', power: 900, intro: '本地人气主唱' }],
      shop: [], beasts: [], interactables: [{ name: '开放麦', intro: '可以上台试音' }], notes: []
    },
    {
      id: 'c_fest', name: '滨江艺术节', world: '新城区', continent: '滨江', type: '节庆',
      desc: '一年一度的破圈现场。',
      people: [{ name: '策展人·叶舟', realm: '传奇主理', power: 2000, intro: '艺术节主策' }],
      shop: [], beasts: [], interactables: [{ name: '主舞台', intro: '大场面比拼' }], notes: []
    },
    {
      id: 'c_suzhou', name: '苏州河咖啡街', world: '周边都市', continent: '华东', type: '街区',
      desc: '咖啡香与设计工作室扎堆。',
      people: [{ name: '咖啡师·老周', realm: '城中名人', power: 1500, intro: '拿铁拉花冠军' }],
      shop: [], beasts: [], interactables: [], notes: []
    },
    {
      id: 'c_hk', name: '维港夜色', world: '周边都市', continent: '华南', type: '海港',
      desc: '跨城潮流与夜景圣地。',
      people: [{ name: '夜景摄影·K', realm: '都市传说', power: 5000, intro: '只拍城市光影' }],
      shop: [], beasts: [], interactables: [{ name: '天际观景台', intro: '传说级打卡' }], notes: []
    }
  ]
}
