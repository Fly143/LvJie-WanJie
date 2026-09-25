// 背景音乐：mp3 用 <audio>，mid/midi 用 Web Audio 合成
import { BGM_TRACKS, BGM_DEFAULT } from '../engine/constants.js'
import { MidiPlayer, isMidiFile } from '../engine/midi.js'

let audioEl = null
const midiPlayer = new MidiPlayer()
let currentId = ''

export function initBgm() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.loop = true
    audioEl.preload = 'auto'
    audioEl.volume = 0.35
  }
}

function trackOf(id) {
  return BGM_TRACKS.find(t => t.id === id) || BGM_TRACKS.find(t => t.id === BGM_DEFAULT) || BGM_TRACKS[0]
}

export function playBgm(id) {
  initBgm()
  const t = trackOf(id)
  currentId = t.id
  if (!t.file) {
    stopBgm()
    return
  }
  if (isMidiFile(t.file)) {
    if (audioEl) {
      audioEl.pause()
      audioEl.removeAttribute('src')
    }
    midiPlayer.loop = true
    midiPlayer.playUrl(t.file).catch(() => { /* optional */ })
    return
  }
  midiPlayer.stop()
  if (audioEl.src.endsWith(t.file) && !audioEl.paused) return
  audioEl.src = t.file
  audioEl.play().catch(() => { /* 自动播放限制 */ })
}

export function stopBgm() {
  if (audioEl) {
    audioEl.pause()
  }
  midiPlayer.stop()
}

export function currentBgmId() {
  return currentId
}
