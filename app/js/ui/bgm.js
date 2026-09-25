// 背景音乐：内置 mp3/mid + 用户自定义（IndexedDB）
import { BGM_TRACKS, BGM_DEFAULT } from '../engine/constants.js'
import { MidiPlayer, isMidiFile } from '../engine/midi.js'
import { listCustomBgm, customTracksFrom, blobUrl, removeCustomBgm, putCustomBgm, fileToTrack } from '../engine/custom-bgm.js'

let audioEl = null
const midiPlayer = new MidiPlayer()
let currentId = ''
let userTracks = []
let userUrl = null

export function initBgm() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.loop = true
    audioEl.preload = 'auto'
    audioEl.volume = 0.35
  }
  // 首次手势时恢复 Web Audio / 音频元素，必要时补播
  if (!initBgm._gesture) {
    initBgm._gesture = true
    const kick = () => {
      try {
        if (currentId) {
          const t = trackOf(currentId)
          const midi = t.kind === 'midi' || (t.file && isMidiFile(t.file))
          if (midi && !midiPlayer.playing) playBgm(currentId)
          else if (!midi && audioEl && audioEl.paused && audioEl.src) audioEl.play().catch(() => {})
        } else {
          playBgm(currentId || 'm027')
        }
      } catch (e) { /* ignore */ }
    }
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      document.addEventListener(ev, kick, { once: true, passive: true })
    }
  }
}

/** 载入自定义曲目（boot 时调用） */
export async function hydrateCustomBgm() {
  try {
    const rows = await listCustomBgm()
    userTracks = customTracksFrom(rows)
    return userTracks
  } catch (e) {
    userTracks = []
    return []
  }
}

export function allBgmTracks() {
  return [...BGM_TRACKS, ...userTracks]
}

function trackOf(id) {
  const list = allBgmTracks()
  const hit = list.find(t => t.id === id)
  if (hit) return hit
  // 旧档 handpan/universe 等已删除曲目 → 回落默认
  const def = list.find(t => t.id === BGM_DEFAULT) || list.find(t => t.id === 'm027') || list.find(t => t.file) || list[0]
  return def || { id: '', name: '', file: '' }
}

function revokeUserUrl() {
  if (userUrl) {
    try { URL.revokeObjectURL(userUrl) } catch (e) { /* ignore */ }
    userUrl = null
  }
}

export function playBgm(id) {
  initBgm()
  const t = trackOf(id)
  // 仅当同一曲确实还在响时才跳过
  const samePlaying = t.id && t.id === currentId && (
    (t.kind === 'midi' || (t.file && isMidiFile(t.file)) ? midiPlayer.playing : (audioEl && !audioEl.paused && !!audioEl.src))
  )
  if (samePlaying) return
  currentId = t.id

  if (t.custom && t.blob) {
    if (audioEl) {
      audioEl.pause()
      audioEl.removeAttribute('src')
    }
    midiPlayer.stop()
    revokeUserUrl()
    if (t.kind === 'midi') {
      t.blob.arrayBuffer().then(buf => {
        midiPlayer.loop = true
        return midiPlayer.playArrayBuffer(buf, t.id)
      }).catch(() => {})
    } else {
      userUrl = blobUrl(t.blob)
      audioEl.src = userUrl
      audioEl.play().catch(() => {})
    }
    return
  }

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
    midiPlayer.playUrl(t.file, t.id).then(r => {
      if (r && r.ok) midiPlayer.playing = true
    }).catch(() => {})
    return
  }
  midiPlayer.stop()
  revokeUserUrl()
  if (audioEl.src.endsWith(t.file) && !audioEl.paused) return
  audioEl.src = t.file
  audioEl.play().catch(() => {})
}

export function showGamePlay(S) {
  try {
    const track = (S && S.bgmTrack) || 'm027'
    playBgm(track)
    // 双保险：稍后再补一次（有些环境首帧 resume 后才允许出声）
    setTimeout(() => {
      try {
        const t = trackOf(currentId || track)
        const midi = t.kind === 'midi' || (t.file && isMidiFile(t.file))
        if (midi && !midiPlayer.playing) playBgm(t.id)
      } catch (e) { /* ignore */ }
    }, 400)
  } catch (e) { /* ignore */ }
}

export function stopBgm() {
  if (audioEl) audioEl.pause()
  midiPlayer.stop()
}

export function currentBgmId() {
  return currentId
}

/** 设置页：添加本地文件 */
export async function addLocalBgmFiles(fileList) {
  const files = Array.from(fileList || []).slice(0, 8)
  const added = []
  for (const f of files) {
    if (!/\.(mp3|wav|ogg|m4a|mid|midi)$/i.test(f.name)) continue
    const row = fileToTrack(f)
    try {
      await putCustomBgm(row)
      userTracks = customTracksFrom(await listCustomBgm())
      added.push(row)
    } catch (e) { /* skip */ }
  }
  return added
}

export async function removeLocalBgm(id) {
  await removeCustomBgm(id)
  userTracks = customTracksFrom(await listCustomBgm())
  if (currentId === id) stopBgm()
}
