// 背景音乐
import { BGM_TRACKS, BGM_DEFAULT } from '../engine/constants.js'

let audio = null
let curId = null

export function initBgm() {
  // 懒加载
}

export function playBgm(id) {
  if (curId === id) return
  curId = id
  if (audio) {
    audio.pause()
    audio = null
  }
  if (!id) return
  const track = BGM_TRACKS.find(t => t.id === id) || BGM_TRACKS.find(t => t.id === BGM_DEFAULT)
  if (!track || !track.file) return
  audio = new Audio(track.file)
  audio.loop = true
  audio.volume = 0.35
  audio.play().catch(() => { /* autoplay may fail until gesture */ })
}
