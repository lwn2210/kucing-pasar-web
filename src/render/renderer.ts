import { IBU } from '../sim/constants'
import type { GameState, Vendor } from '../sim/game'
import { blocksSight, tileAt, type Level } from '../sim/level'
import { drawCat, drawFish, drawVendor } from './sprites'

// Draws a GameState onto a 2D canvas. Holds only presentation state: the
// camera, particles, speech bubbles and per-character animation clocks.

type Ctx = CanvasRenderingContext2D

export interface Pose {
  x: number
  y: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  kind: 'dust' | 'spark' | 'swish'
}

interface Bubble {
  vendor: number
  text: string
  until: number
}

const AWNINGS = [
  ['#2f6fd1', '#ffffff'],
  ['#e8552f', '#fff3e0'],
  ['#2e9e5b', '#f4f8e8'],
  ['#d9a21b', '#fffbea'],
]

export class Renderer {
  private readonly ctx: Ctx
  private width = 1
  private height = 1
  private dpr = 1
  private tile = 40
  private camX = 0
  private camY = 0
  private particles: Particle[] = []
  private bubbles: Bubble[] = []
  private catStride = 0
  private vendorStride: number[] = []
  private swingStart: number[] = []
  private shade: HTMLCanvasElement | null = null
  /** Pixels kept clear at the bottom for touch controls. */
  bottomReserve = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
  }

  private fit(level: Level): void {
    const portrait = this.height > this.width
    const playH = this.height - this.bottomReserve
    // A hidden page can report a 0×0 window; keep a usable size until it resizes.
    this.tile = Math.max(8, Math.min(playH / (level.height + 0.5), this.width / (portrait ? 9.5 : 17)))
  }

  /** Snap the camera onto the cat, for a new level. */
  reset(state: GameState): void {
    this.fit(state.level)
    this.particles = []
    this.bubbles = []
    this.vendorStride = state.vendors.map(() => 0)
    this.swingStart = state.vendors.map(() => -1)
    const t = this.camTarget(state, state.cat)
    this.camX = t.x
    this.camY = t.y
  }

  private camTarget(state: GameState, cat: Pose & { facing?: number }): Pose {
    const level = state.level
    const viewW = this.width / this.tile
    const playH = (this.height - this.bottomReserve) / this.tile
    let x = cat.x + (cat.facing ?? 1) * 1.5 - viewW / 2
    x = level.width <= viewW ? (level.width - viewW) / 2 : Math.min(level.width - viewW, Math.max(0, x))
    // The level's floor sits at the bottom of the play area; anything above is sky.
    const y = level.height <= playH ? level.height - playH : Math.min(level.height - playH, Math.max(0, cat.y - playH * 0.6))
    return { x, y }
  }

  say(vendor: number, text: string, now: number): void {
    this.bubbles = this.bubbles.filter((b) => b.vendor !== vendor)
    this.bubbles.push({ vendor, text, until: now + 1.6 })
  }

  burst(x: number, y: number, kind: Particle['kind'], count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = kind === 'spark' ? 2 + Math.random() * 3 : 0.6 + Math.random() * 1.4
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: kind === 'dust' ? -Math.abs(Math.sin(a)) * s * 0.6 : Math.sin(a) * s,
        life: 0,
        max: kind === 'spark' ? 0.5 : 0.45,
        kind,
      })
    }
  }

  swing(vendor: number, now: number): void {
    this.swingStart[vendor] = now
  }

  draw(state: GameState, cat: Pose, vendors: Pose[], now: number, dt: number): void {
    const ctx = this.ctx
    const level = state.level
    this.fit(level)
    const target = this.camTarget(state, { ...cat, facing: state.cat.facing })
    const k = 1 - Math.exp(-dt * 6)
    if (!Number.isFinite(this.camX + this.camY)) {
      this.camX = target.x
      this.camY = target.y
    }
    this.camX += (target.x - this.camX) * k
    this.camY += (target.y - this.camY) * k
    this.catStride += (Math.abs(state.cat.vx) * dt) / 0.9
    state.vendors.forEach((v, i) => (this.vendorStride[i] = (this.vendorStride[i] ?? 0) + Math.abs(v.vx) * dt))

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.background(level, now)
    const T = this.tile
    ctx.save()
    ctx.translate(-this.camX * T, -this.camY * T)
    ctx.scale(T, T)

    const x0 = Math.max(0, Math.floor(this.camX) - 1)
    const x1 = Math.min(level.width, Math.ceil(this.camX + this.width / T) + 1)
    state.vendors.forEach((v, i) => this.cone(state, v, vendors[i]!))
    this.tiles(level, x0, x1, now)
    this.exit(level, state.cat.fish.length > 0, now)
    level.fish.forEach((f, i) => {
      if (state.taken[i] || f.x < x0 - 1 || f.x > x1 + 1) return
      ctx.save()
      ctx.translate(f.x, f.y + 0.15)
      drawFish(ctx, now + i, tileAt(level, Math.floor(f.x), Math.floor(f.y)) !== 'hide')
      ctx.restore()
    })
    state.vendors.forEach((v, i) => this.vendor(v, i, vendors[i]!, now))
    this.cat(state, cat, now)
    this.tableFronts(level, x0, x1)
    this.updateParticles(dt)
    ctx.restore()
    if (level.night) this.night(state, cat, vendors, now)
    this.bubbleLayer(state, vendors, now)
  }

  private toScreen(x: number, y: number): Pose {
    return { x: (x - this.camX) * this.tile, y: (y - this.camY) * this.tile }
  }

  private background(level: Level, now: number): void {
    const ctx = this.ctx
    const w = this.width
    const h = this.height
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    if (level.night) {
      sky.addColorStop(0, '#141a33')
      sky.addColorStop(1, '#2c2a45')
    } else {
      sky.addColorStop(0, '#f7d9a8')
      sky.addColorStop(1, '#f2c48a')
    }
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    const T = this.tile
    // Back wall of the market hall, with signs, scrolling at half speed.
    const par = 0.5
    const floorY = (level.height - 2 - this.camY) * T
    ctx.fillStyle = level.night ? '#3b3653' : '#e3c9a0'
    ctx.fillRect(0, floorY - 7 * T, w, 7 * T)
    ctx.fillStyle = level.night ? '#2e2a44' : '#d2b083'
    for (let i = -1; i < w / (6 * T) + 2; i++) {
      const x = i * 6 * T - ((this.camX * T * par) % (6 * T))
      ctx.fillRect(x, floorY - 7 * T, 0.5 * T, 7 * T)
    }
    const signs = ['IKAN SEGAR', 'SAYUR MAYUR', 'BUMBU DAPUR', 'TAHU TEMPE', 'AYAM POTONG', 'BUAH']
    ctx.font = `700 ${Math.round(T * 0.42)}px "Lilita One", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < Math.ceil(level.width / 12) + 2; i++) {
      const x = (i * 12 + 4) * T - this.camX * T * par
      if (x < -6 * T || x > w + 6 * T) continue
      const y = floorY - 5.6 * T
      ctx.fillStyle = level.night ? '#5b3a3a' : '#b8432f'
      ctx.fillRect(x - 2.4 * T, y - 0.45 * T, 4.8 * T, 0.9 * T)
      ctx.fillStyle = level.night ? '#ffd88a' : '#fff4dd'
      ctx.fillText(signs[i % signs.length]!, x, y + 0.04 * T)
    }
    // Roof trusses and hanging lamps.
    ctx.strokeStyle = level.night ? '#24203a' : '#b9936a'
    ctx.lineWidth = Math.max(1, T * 0.12)
    for (let i = -1; i < w / (8 * T) + 2; i++) {
      const x = i * 8 * T - ((this.camX * T * 0.7) % (8 * T))
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + 4 * T, floorY - 8 * T)
      ctx.lineTo(x + 8 * T, 0)
      ctx.stroke()
    }
    void now
  }

  private plankRun(level: Level, tx: number, ty: number): { start: number; end: number } {
    let start = tx
    let end = tx
    while (tileAt(level, start - 1, ty) === 'oneway') start--
    while (tileAt(level, end + 1, ty) === 'oneway') end++
    return { start, end }
  }

  private tiles(level: Level, x0: number, x1: number, now: number): void {
    const ctx = this.ctx
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const t = tileAt(level, tx, ty)
        if (t === 'solid') {
          const floor = ty > 0 && tileAt(level, tx, ty - 1) !== 'solid'
          ctx.fillStyle = level.night ? '#4a4b57' : '#8c8f95'
          ctx.fillRect(tx, ty, 1.01, 1.01)
          if (floor) {
            ctx.fillStyle = level.night ? '#5d6070' : '#a9adb3'
            ctx.fillRect(tx, ty, 1.01, 0.18)
            ctx.fillStyle = 'rgba(255,255,255,0.12)'
            ctx.fillRect(tx + 0.1, ty + 0.05, 0.5, 0.04)
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.12)'
          ctx.lineWidth = 0.03
          ctx.strokeRect(tx, ty, 1, 1)
        } else if (t === 'crate') {
          ctx.fillStyle = '#b07a43'
          ctx.fillRect(tx + 0.02, ty + 0.02, 0.96, 0.96)
          ctx.strokeStyle = '#7a4f25'
          ctx.lineWidth = 0.06
          ctx.strokeRect(tx + 0.05, ty + 0.05, 0.9, 0.9)
          ctx.beginPath()
          ctx.moveTo(tx + 0.05, ty + 0.35)
          ctx.lineTo(tx + 0.95, ty + 0.35)
          ctx.moveTo(tx + 0.05, ty + 0.65)
          ctx.lineTo(tx + 0.95, ty + 0.65)
          ctx.stroke()
          if (tileAt(level, tx, ty - 1) === 'empty') {
            // Produce piled on top.
            const veg = ((tx * 7 + ty * 3) % 3) as 0 | 1 | 2
            const colours = ['#5aa83a', '#e8732a', '#c8352c']
            ctx.fillStyle = colours[veg]!
            for (let i = 0; i < 3; i++) {
              ctx.beginPath()
              ctx.arc(tx + 0.25 + i * 0.25, ty - 0.02, 0.13, Math.PI, Math.PI * 2)
              ctx.fill()
            }
          }
        } else if (t === 'hide') {
          ctx.fillStyle = 'rgba(30, 18, 10, 0.45)'
          ctx.fillRect(tx, ty, 1.01, 1)
        } else if (t === 'oneway') {
          const run = this.plankRun(level, tx, ty)
          const isTable = tileAt(level, tx, ty + 1) === 'hide'
          if (isTable) {
            ctx.fillStyle = '#8a5a32'
            ctx.fillRect(tx, ty, 1.01, 0.16)
            if (tx === run.start || tx === run.end) {
              ctx.fillStyle = '#6b4424'
              ctx.fillRect(tx === run.start ? tx + 0.05 : tx + 0.83, ty + 0.16, 0.12, 0.84)
            }
          } else {
            const [a, b] = AWNINGS[(run.start * 3 + ty) % AWNINGS.length]!
            for (let s = 0; s < 4; s++) {
              ctx.fillStyle = s % 2 ? b : a
              ctx.fillRect(tx + s * 0.25, ty, 0.26, 0.2)
            }
            // Scalloped edge.
            ctx.fillStyle = a
            for (let s = 0; s < 2; s++) {
              ctx.beginPath()
              ctx.arc(tx + 0.25 + s * 0.5, ty + 0.2, 0.25, 0, Math.PI)
              ctx.fill()
            }
            if (tx === run.start || tx === run.end) {
              // Bamboo pole down to whatever is below.
              let bottom = ty + 1
              while (bottom < level.height && tileAt(level, tx, bottom) !== 'solid' && tileAt(level, tx, bottom) !== 'crate' && tileAt(level, tx, bottom) !== 'oneway') bottom++
              ctx.fillStyle = '#b89a5e'
              ctx.fillRect(tx === run.start ? tx + 0.06 : tx + 0.86, ty + 0.2, 0.08, bottom - ty - 0.2)
            }
          }
        }
      }
    }
    void now
  }

  /** The front edge of table cloths, drawn over the cat so it reads as being underneath. */
  private tableFronts(level: Level, x0: number, x1: number): void {
    const ctx = this.ctx
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        if (tileAt(level, tx, ty) !== 'oneway' || tileAt(level, tx, ty + 1) !== 'hide') continue
        ctx.fillStyle = (tx + ty) % 2 ? '#3d78c9' : '#f4f1ea'
        ctx.fillRect(tx, ty + 0.12, 0.51, 0.22)
        ctx.fillStyle = (tx + ty) % 2 ? '#f4f1ea' : '#3d78c9'
        ctx.fillRect(tx + 0.5, ty + 0.12, 0.51, 0.22)
      }
    }
  }

  private exit(level: Level, open: boolean, now: number): void {
    const ctx = this.ctx
    const { tx, ty } = level.exit
    ctx.fillStyle = '#1d1a18'
    ctx.beginPath()
    ctx.moveTo(tx + 0.05, ty + 1)
    ctx.lineTo(tx + 0.05, ty + 0.35)
    ctx.quadraticCurveTo(tx + 0.5, ty - 0.05, tx + 0.95, ty + 0.35)
    ctx.lineTo(tx + 0.95, ty + 1)
    ctx.fill()
    ctx.strokeStyle = '#6f6a63'
    ctx.lineWidth = 0.05
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(tx + i * 0.25, ty + 0.3)
      ctx.lineTo(tx + i * 0.25, ty + 1)
      ctx.stroke()
    }
    const pulse = open ? 0.6 + Math.sin(now * 5) * 0.4 : 0.35
    ctx.fillStyle = `rgba(255, 220, 90, ${pulse})`
    ctx.font = '700 0.45px "Lilita One", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('GOT', tx + 0.5, ty - 0.35)
    ctx.beginPath()
    ctx.moveTo(tx + 0.3, ty - 0.15)
    ctx.lineTo(tx + 0.7, ty - 0.15)
    ctx.lineTo(tx + 0.5, ty + 0.1)
    ctx.closePath()
    ctx.fill()
  }

  /** The vendor's field of view, cut off where crates and planks block it. */
  private cone(state: GameState, v: Vendor, pose: Pose): void {
    const ctx = this.ctx
    const eye = { x: pose.x, y: pose.y - IBU.eyeHeight }
    const rays = 22
    const pts: Pose[] = [eye]
    for (let i = 0; i <= rays; i++) {
      // Same limits as vendorSees: up to slope 0.6 above, slope 1 below.
      const a0 = Math.atan(0.6)
      const a1 = Math.atan(1.25)
      const a = -a0 + (a0 + a1) * (i / rays)
      const dx = Math.cos(a) * v.dir
      const dy = Math.sin(a)
      let d = 0
      while (d < IBU.sight) {
        d += 0.1
        const x = eye.x + dx * d
        const y = eye.y + dy * d
        if (blocksSight(tileAt(state.level, Math.floor(x), Math.floor(y))) && !(Math.floor(y) === Math.floor(eye.y) && Math.floor(x) === Math.floor(eye.x))) break
      }
      pts.push({ x: eye.x + dx * d, y: eye.y + dy * d })
    }
    const heat = v.mood === 'chase' || v.mood === 'swing' || v.mood === 'scold' ? 1 : v.alert
    const r = Math.round(255)
    const g = Math.round(220 - heat * 170)
    const grad = ctx.createRadialGradient(eye.x, eye.y, 0.2, eye.x, eye.y, IBU.sight)
    grad.addColorStop(0, `rgba(${r},${g},80,${0.28 + heat * 0.15})`)
    grad.addColorStop(1, `rgba(${r},${g},80,0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fill()
  }

  private vendor(v: Vendor, i: number, pose: Pose, now: number): void {
    const ctx = this.ctx
    const started = this.swingStart[i] ?? -1
    const swing = started >= 0 && now - started < 0.6 ? (now - started) / 0.6 : -1
    ctx.save()
    ctx.translate(pose.x, pose.y)
    drawVendor(ctx, {
      dir: v.dir,
      variant: v.variant,
      walking: Math.abs(v.vx) > 0.1,
      running: Math.abs(v.vx) > 3,
      stride: this.vendorStride[i] ?? 0,
      swing,
      time: now + i,
    })
    // Mood mark and alert meter over the head.
    const mark = v.mood === 'suspicious' ? '?' : v.mood === 'chase' || v.mood === 'swing' || v.mood === 'scold' ? '!' : v.mood === 'search' ? '…' : ''
    if (v.alert > 0.02 && mark !== '!') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(-0.35, -2.05, 0.7, 0.1)
      ctx.fillStyle = v.alert > 0.7 ? '#e8452f' : '#f2b21b'
      ctx.fillRect(-0.35, -2.05, 0.7 * v.alert, 0.1)
    }
    if (mark) {
      const hop = mark === '!' ? Math.abs(Math.sin(now * 12)) * 0.12 : Math.sin(now * 4) * 0.04
      const markY = -2.2 - hop
      // Comic pop alert bubble
      ctx.fillStyle = mark === '!' ? '#ff3b2f' : '#ffd54f'
      ctx.strokeStyle = '#2a1d17'
      ctx.lineWidth = 0.06
      ctx.beginPath()
      ctx.arc(0, markY - 0.15, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Mark text inside bubble
      ctx.font = '900 0.46px "Lilita One", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = mark === '!' ? '#ffffff' : '#2a1d17'
      ctx.fillText(mark, 0, markY - 0.14)
    }
    ctx.restore()
  }

  private cat(state: GameState, pose: Pose, now: number): void {
    const ctx = this.ctx
    const c = state.cat
    if (c.hurt > 0 && Math.floor(now * 14) % 2 === 0) return
    ctx.save()
    ctx.translate(pose.x, pose.y)
    drawCat(ctx, {
      facing: c.facing,
      crouching: c.crouching,
      speed: c.vx,
      airborne: !c.onGround,
      vy: c.vy,
      time: now,
      stride: this.catStride,
      fish: c.fish.length,
      blink: now % 3.7 < 0.12,
    })
    ctx.restore()
  }

  private updateParticles(dt: number): void {
    const ctx = this.ctx
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max)
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += (p.kind === 'spark' ? 6 : 1.5) * dt
      const a = 1 - p.life / p.max
      if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255, 236, 140, ${a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 0.06, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = `rgba(210, 200, 185, ${a * 0.7})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 0.08 + p.life * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /** Darkness with pools of light from hanging lamps and the vendors' torches. */
  private night(state: GameState, cat: Pose, vendors: Pose[], now: number): void {
    const w = Math.round(this.width)
    const h = Math.round(this.height)
    this.shade ??= document.createElement('canvas')
    if (this.shade.width !== w || this.shade.height !== h) {
      this.shade.width = w
      this.shade.height = h
    }
    const s = this.shade.getContext('2d')!
    s.globalCompositeOperation = 'source-over'
    s.clearRect(0, 0, w, h)
    s.fillStyle = 'rgba(8, 10, 30, 0.72)'
    s.fillRect(0, 0, w, h)
    s.globalCompositeOperation = 'destination-out'
    const T = this.tile
    const light = (x: number, y: number, r: number, strength: number) => {
      const p = this.toScreen(x, y)
      const g = s.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * T)
      g.addColorStop(0, `rgba(0,0,0,${strength})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      s.fillStyle = g
      s.beginPath()
      s.arc(p.x, p.y, r * T, 0, Math.PI * 2)
      s.fill()
    }
    for (let x = 4; x < state.level.width; x += 9) light(x, 2.5, 4.2, 0.85 + Math.sin(now * 7 + x) * 0.04)
    vendors.forEach((v) => light(v.x, v.y - 1.2, 2.6, 0.6))
    light(cat.x, cat.y - 0.3, 1.4, 0.45)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.drawImage(this.shade, 0, 0, w, h, 0, 0, this.canvas.width, this.canvas.height)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    // The lamps themselves.
    for (let x = 4; x < state.level.width; x += 9) {
      const p = this.toScreen(x, 2.5)
      if (p.x < -T || p.x > this.width + T) continue
      this.ctx.strokeStyle = '#111'
      this.ctx.lineWidth = 1
      this.ctx.beginPath()
      this.ctx.moveTo(p.x, p.y - 2.5 * T)
      this.ctx.lineTo(p.x, p.y - 0.2 * T)
      this.ctx.stroke()
      this.ctx.fillStyle = '#ffe9a8'
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, 0.18 * T, 0, Math.PI * 2)
      this.ctx.fill()
    }
  }

  private bubbleLayer(_state: GameState, vendors: Pose[], now: number): void {
    const ctx = this.ctx
    this.bubbles = this.bubbles.filter((b) => b.until > now)
    const T = this.tile
    ctx.font = `800 ${Math.max(12, Math.round(T * 0.36))}px Nunito, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const b of this.bubbles) {
      const v = vendors[b.vendor]
      if (!v) continue
      const p = this.toScreen(v.x, v.y - 2.75)
      const w = ctx.measureText(b.text).width + T * 0.5
      const h = T * 0.6
      ctx.fillStyle = '#fffaf0'
      ctx.strokeStyle = '#2a1d17'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#2a1d17'
      ctx.fillText(b.text, p.x, p.y + 1)
    }
  }
}
