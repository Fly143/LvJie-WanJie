// 轻量 Standard MIDI File 解析 + Web Audio 播放（无音色库）
// 支持 format 0/1、note on/off、tempo、program change（映射波形）

export function parseMidi(buf) {
  const d = buf instanceof DataView ? buf : new DataView(buf.buffer ? buf.buffer : buf)
  let pos = 0
  const u8 = (n) => {
    let v = 0
    for (let i = 0; i < n; i++) v = (v << 8) | d.getUint8(pos++)
    return v
  }
  const tag = () => String.fromCharCode(u8(1), u8(1), u8(1), u8(1))

  if (tag() !== 'MThd') throw new Error('不是 MIDI 文件')
  const hdrLen = u8(4)
  const format = u8(2)
  const ntrks = u8(2)
  const division = u8(2)
  if (hdrLen > 6) pos += hdrLen - 6
  if (division & 0x8000) throw new Error('暂不支持 SMPTE 时基')

  const ticksPerBeat = division || 480
  const rawNotes = []
  let tempoUs = 500000 // 默认 120 BPM

  for (let t = 0; t < ntrks && pos < d.byteLength; t++) {
    if (tag() !== 'MTrk') break
    const len = u8(4)
    const end = pos + len
    let tick = 0
    let running = 0
    const onMap = new Map() // key ch<<8|note -> {tick, vel}

    const readVLQ = () => {
      let v = 0
      for (;;) {
        const b = d.getUint8(pos++)
        v = (v << 7) | (b & 0x7f)
        if ((b & 0x80) === 0) break
      }
      return v
    }

    while (pos < end) {
      tick += readVLQ()
      let status = d.getUint8(pos)
      if (status < 0x80) {
        // running status
        status = running
      } else {
        pos++
        if (status < 0xf0) running = status
      }
      const hi = status & 0xf0
      const ch = status & 0x0f

      if (status === 0xff) {
        const type = d.getUint8(pos++)
        const mlen = readVLQ()
        if (type === 0x51 && mlen === 3) {
          tempoUs = (d.getUint8(pos) << 16) | (d.getUint8(pos + 1) << 8) | d.getUint8(pos + 2)
        }
        pos += mlen
      } else if (status === 0xf0 || status === 0xf7) {
        const mlen = readVLQ()
        pos += mlen
      } else if (hi === 0x80 || hi === 0x90) {
        const note = d.getUint8(pos++)
        const vel = d.getUint8(pos++)
        const key = (ch << 8) | note
        if (hi === 0x90 && vel > 0) {
          onMap.set(key, { tick, vel })
        } else {
          const st = onMap.get(key)
          if (st) {
            rawNotes.push({
              note,
              vel: st.vel,
              ch,
              startTick: st.tick,
              endTick: tick
            })
            onMap.delete(key)
          }
        }
      } else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
        pos += 2
      } else if (hi === 0xc0 || hi === 0xd0) {
        pos += 1
      } else {
        // 未知，尽量跳过
        break
      }
    }
    pos = end
  }

  rawNotes.sort((a, b) => a.startTick - b.startTick)
  return { format, ticksPerBeat, tempoUs, notes: rawNotes }
}

/** tick → 秒 */
function tickToSec(tick, ticksPerBeat, tempoUs) {
  return (tick * (tempoUs / 1e6)) / ticksPerBeat
}

/** GM program → 波形近似 */
function waveForProgram(p) {
  if (p >= 8 && p <= 15) return 'triangle' // 键盘
  if (p >= 24 && p <= 31) return 'sawtooth' // 吉他
  if (p >= 32 && p <= 39) return 'triangle' // 贝斯
  if (p >= 40 && p <= 55) return 'triangle' // 弦乐
  if (p >= 56 && p <= 63) return 'square' // 铜管
  if (p >= 64 && p <= 79) return 'sine' // 木管
  return 'sine'
}

function freqOf(note) {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export class MidiPlayer {
  constructor() {
    this.ctx = null
    this.master = null
    this.nodes = []
    this.timer = null
    this.playing = false
    this.loop = true
    this.volume = 0.22
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext
      if (!AC) throw new Error('当前环境不支持 Web Audio')
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = Math.max(0.15, this.volume)
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state !== 'running' && this.ctx.resume) {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  get running() {
    return !!(this.ctx && this.ctx.state === 'running' && this.playing)
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0))
    if (this.master) this.master.gain.value = this.volume
  }

  async playArrayBuffer(buf) {
    this.stop()
    const midi = parseMidi(buf)
    if (!midi.notes.length) return { ok: false, error: 'MIDI 无音符' }
    this._ensureCtx()
    this.playing = true
    const duration = this._schedule(midi, 0)
    this.timer = setTimeout(() => {
      if (this.loop && this.playing) {
        this.stop()
        this.playArrayBuffer(buf).catch(() => {})
      } else {
        this.playing = false
      }
    }, (duration + 0.4) * 1000)
    return { ok: true, duration, notes: midi.notes.length }
  }

  async playUrl(url) {
    let buf
    const host = globalThis.awHost && globalThis.awHost.asset
    if (host && host.read) {
      const r = await host.read(url)
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || '读取失败' }
      const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0))
      buf = bin.buffer
    } else {
      const res = await fetch(url)
      if (!res.ok) return { ok: false, error: '读取失败 ' + res.status }
      buf = await res.arrayBuffer()
    }
    return this.playArrayBuffer(buf)
  }

  _schedule(midi, when) {
    const ctx = this.ctx
    const t0 = (when || ctx.currentTime) + 0.05
    const maxNotes = 4000
    const notes = midi.notes.slice(0, maxNotes)
    let end = 0
    for (const n of notes) {
      const s = t0 + tickToSec(n.startTick, midi.ticksPerBeat, midi.tempoUs)
      const e = t0 + tickToSec(Math.max(n.endTick, n.startTick + 1), midi.ticksPerBeat, midi.tempoUs)
      const dur = Math.max(0.03, e - s)
      end = Math.max(end, e)
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = waveForProgram(0)
      osc.frequency.value = freqOf(n.note)
      const amp = Math.min(0.32, 0.08 + (n.vel / 127) * 0.24)
      g.gain.setValueAtTime(0.0001, s)
      g.gain.exponentialRampToValueAtTime(amp, s + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, Math.max(s + 0.05, s + dur - 0.02))
      osc.connect(g)
      g.connect(this.master)
      osc.start(Math.max(this.ctx.currentTime, s))
      osc.stop(Math.max(this.ctx.currentTime, s + dur + 0.02))
      this.nodes.push(osc, g)
    }
    return end - t0
  }

  stop() {
    this.playing = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    for (const n of this.nodes) {
      try {
        if (n.stop) n.stop()
        if (n.disconnect) n.disconnect()
      } catch (e) { /* ignore */ }
    }
    this.nodes = []
  }
}

export function isMidiFile(name) {
  return /\.(mid|midi)$/i.test(String(name || ''))
}
