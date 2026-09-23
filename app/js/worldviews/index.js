// 世界观注册表
import { xiuxianPack } from './xiuxian/pack.js'
import { xuanhuanPack } from './xuanhuan/pack.js'
import { wuxiaPack } from './wuxia/pack.js'
import { urbanPack } from './urban/pack.js'
import { apocalypsePack } from './apocalypse/pack.js'
import { westernPack } from './western/pack.js'

const PACK_LIST = [
  xiuxianPack,
  xuanhuanPack,
  wuxiaPack,
  urbanPack,
  apocalypsePack,
  westernPack
]

export const PACKS = Object.fromEntries(PACK_LIST.map(p => [p.id, p]))
export const PACK_ORDER = PACK_LIST.map(p => p.id)

// 供 progression 等 O(1) 访问
globalThis.__AW_PACKS__ = PACKS

export function getPack(id) {
  return PACKS[id] || null
}

export function listPacks() {
  return PACK_ORDER.map(id => PACKS[id])
}

export function defaultPackId() {
  return 'xiuxian'
}
