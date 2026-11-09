// Synthesised with Web Audio, no files. Starts on the first tap or key press
// (iOS and Safari refuse to play before one). On iPhone the silent switch
// also mutes Web Audio.

const MUTE_KEY = 'kucing-pasar.mute'

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private crowd: GainNode | null = null
  muted = false

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }
    const unlock = () => this.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchend', unlock)
  }

  private unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.8
      this.master.connect(ctx.destination)
      const length = ctx.sampleRate * 2
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      // Market murmur: a low band of noise.
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const bq = ctx.createBiquadFilter()
      bq.type = 'bandpass'
      bq.frequency.value = 450
      bq.Q.value = 0.8
      this.crowd = ctx.createGain()
      this.crowd.gain.value = 0
      src.connect(bq).connect(this.crowd).connect(this.master)
      src.start()
    }
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // Not remembered; fine.
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
    return this.muted
  }

  private ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && this.master ? this.ctx : null
  }

  private tone(type: OscillatorType, from: number, to: number, start: number, length: number, volume: number): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + length)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    osc.connect(gain).connect(this.master!)
    osc.start(start)
    osc.stop(start + length + 0.02)
  }

  private hiss(freq: number, q: number, start: number, length: number, volume: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bq = ctx.createBiquadFilter()
    bq.type = 'bandpass'
    bq.frequency.value = freq
    bq.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    src.connect(bq).connect(gain).connect(this.master!)
    src.start(start, Math.random())
    src.stop(start + length + 0.02)
  }

  /** "Meong": a rising then falling nasal tone. */
  private meow(t: number, pitch = 1, volume = 0.1): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(520 * pitch, t)
    osc.frequency.linearRampToValueAtTime(820 * pitch, t + 0.12)
    osc.frequency.linearRampToValueAtTime(560 * pitch, t + 0.38)
    const formant = ctx.createBiquadFilter()
    formant.type = 'bandpass'
    formant.Q.value = 6
    formant.frequency.setValueAtTime(900, t)
    formant.frequency.linearRampToValueAtTime(1500, t + 0.15)
    formant.frequency.linearRampToValueAtTime(800, t + 0.38)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    osc.connect(formant).connect(gain).connect(this.master!)
    osc.start(t)
    osc.stop(t + 0.45)
  }

  ambience(on: boolean, night: boolean): void {
    const ctx = this.ready()
    if (!ctx || !this.crowd) return
    this.crowd.gain.setTargetAtTime(on ? (night ? 0.018 : 0.035) : 0, ctx.currentTime, 0.4)
  }

  jump(): void {
    const ctx = this.ready()
    if (ctx) this.tone('sine', 300, 620, ctx.currentTime, 0.12, 0.06)
  }

  land(impact: number): void {
    const ctx = this.ready()
    if (ctx) this.tone('sine', 120, 50, ctx.currentTime, 0.1, Math.min(0.2, impact * 0.012))
  }

  fish(): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    this.meow(t, 1.1, 0.09)
    this.tone('triangle', 1320, 1320, t + 0.05, 0.12, 0.06)
    this.tone('triangle', 1760, 1760, t + 0.13, 0.16, 0.06)
  }

  suspicious(): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    this.tone('sine', 300, 340, t, 0.18, 0.08)
    this.tone('sine', 340, 460, t + 0.18, 0.22, 0.08)
  }

  /** "Hus! Hus!" and a sting. */
  alert(): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    this.hiss(2600, 1.5, t, 0.16, 0.25)
    this.hiss(2600, 1.5, t + 0.22, 0.16, 0.25)
    this.tone('square', 660, 640, t, 0.25, 0.04)
    this.tone('square', 932, 900, t, 0.25, 0.03)
  }

  giveUp(): void {
    const ctx = this.ready()
    if (ctx) this.tone('sine', 420, 280, ctx.currentTime, 0.35, 0.06)
  }

  swing(): void {
    const ctx = this.ready()
    if (ctx) this.hiss(1800, 0.7, ctx.currentTime + 0.25, 0.18, 0.18)
  }

  /** A yowl. */
  hurt(): void {
    const ctx = this.ready()
    if (!ctx) return
    this.meow(ctx.currentTime, 1.5, 0.14)
    this.tone('sine', 140, 60, ctx.currentTime, 0.15, 0.2)
  }

  nope(): void {
    const ctx = this.ready()
    if (ctx) this.tone('square', 220, 200, ctx.currentTime, 0.15, 0.04)
  }

  won(): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.12, i === 3 ? 0.5 : 0.14, 0.12))
    this.meow(t + 0.55, 1, 0.08)
  }

  lost(): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    ;[392, 349, 311, 262].forEach((f, i) => this.tone('triangle', f, f * 0.98, t + i * 0.22, i === 3 ? 0.6 : 0.2, 0.12))
  }
}
