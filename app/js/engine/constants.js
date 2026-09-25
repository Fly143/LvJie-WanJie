// 引擎常量（与具体世界观无关）
export const SAVE_KEY = 'agentworlds_save_v1' // 旧单槽；载入时迁入分槽
export const ACTIVE_WORLD_KEY = 'agentworlds_active_world_v2'
export const SLOT_PREFIX = 'agentworlds_slot_v2_'
export const KEYS_KEY = 'agentworlds_apikeys_v1'
export const META_KEY = 'agentworlds_meta_v1'

export const SAVE_VERSION = 1
export const MAX_EVENT_CHOICES = 10
export const MAX_TALK_PER_DAY = 5

// 物品类型（引擎中性；各包可扩展 display 名）
export const LEGACY_TYPE_MAP = {
  pill: 'consumable',
  artifact: 'equip',
  manual: 'technique',
  material: 'material',
  other: 'special'
}

// AI 风格
export const AI_STYLES = {
  cheat: { name: '开挂', desc: '有求必应：无论要求是否合理，AI都会满足你（只想爽一把时用）' },
  generous: { name: '慷慨', desc: '更容易顺着你，出格的行动也常能得逞；奖励普遍更丰厚' },
  normal: { name: '正常', desc: '合理则成、离谱则被驳回；奖励适中' },
  hard: { name: '艰难', desc: '严格把关，离谱的行动基本会被驳回；奖励更吝啬、机缘更凶险' }
}
export const AI_STYLE_ORDER = ['cheat', 'generous', 'normal', 'hard']

export const PLAYER_GENDERS = [
  { v: '', name: '不选择' },
  { v: 'male', name: '男' },
  { v: 'female', name: '女' }
]

// 背景音乐（相对 app 目录）；mp3 用 <audio>，mid 用 Web Audio 合成
export const BGM_TRACKS = [
  { id: '', name: '无音乐', file: '' },
  { id: 'handpan', name: '手碟', file: 'assets/handpan音乐.mp3' },
  { id: 'universe', name: '宇宙', file: 'assets/Alpha宇宙音乐.mp3' },
  { id: 'midi-demo', name: 'MIDI示例', file: 'assets/示例旋律.mid' },
  { id: 'midi-031', name: '031.MID', file: 'assets/031.mid' }
]
export const BGM_DEFAULT = 'handpan'
