// Characters drawn with Canvas paths, in tile units (the caller scales the
// context so 1 = one tile) with the origin at the feet.

type Ctx = CanvasRenderingContext2D

export interface CatPose {
  facing: 1 | -1
  crouching: boolean
  /** Horizontal speed, for the run cycle. */
  speed: number
  airborne: boolean
  vy: number
  /** Seconds, for idle motion. */
  time: number
  /** Distance travelled, drives the legs. */
  stride: number
  fish: number
  blink: boolean
}

const ORANGE = '#f0892a'
const ORANGE_DARK = '#c9611a'
const CREAM = '#fde7c8'

function fishShape(ctx: Ctx, len: number, tint = '#9fb7c9'): void {
  ctx.fillStyle = tint
  ctx.beginPath()
  ctx.ellipse(0, 0, len * 0.42, len * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-len * 0.38, 0)
  ctx.lineTo(-len * 0.58, -len * 0.16)
  ctx.lineTo(-len * 0.58, len * 0.16)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(40, 70, 100, 0.55)'
  ctx.beginPath()
  ctx.ellipse(0, -len * 0.06, len * 0.36, len * 0.07, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c2630'
  ctx.beginPath()
  ctx.arc(len * 0.28, -len * 0.03, len * 0.035, 0, Math.PI * 2)
  ctx.fill()
}

export function drawFish(ctx: Ctx, time: number, onIce: boolean): void {
  if (onIce) {
    ctx.fillStyle = '#d9eef7'
    ctx.beginPath()
    ctx.roundRect(-0.42, 0.12, 0.84, 0.16, 0.05)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    for (let i = 0; i < 4; i++) ctx.fillRect(-0.35 + i * 0.2, 0.14, 0.07, 0.05)
  } else {
    // A plastic basin.
    ctx.fillStyle = '#e8493a'
    ctx.beginPath()
    ctx.moveTo(-0.42, -0.02)
    ctx.lineTo(0.42, -0.02)
    ctx.lineTo(0.32, 0.38)
    ctx.lineTo(-0.32, 0.38)
    ctx.closePath()
    ctx.fill()
  }
  ctx.save()
  ctx.translate(0, onIce ? 0.02 : -0.04)
  ctx.rotate(Math.sin(time * 2.4) * 0.05)
  fishShape(ctx, 0.78)
  ctx.restore()
  // Glint.
  const g = (Math.sin(time * 3.1) + 1) / 2
  ctx.fillStyle = `rgba(255,255,255,${0.35 + g * 0.5})`
  ctx.beginPath()
  ctx.arc(0.08, -0.08, 0.035 + g * 0.02, 0, Math.PI * 2)
  ctx.fill()
}

const spriteCache: Record<string, HTMLImageElement> = {}
function getSprite(name: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  if (!spriteCache[name]) {
    const img = new Image()
    const base = (import.meta as any).env?.BASE_URL || './'
    img.src = `${base}assets/${name}.png`
    spriteCache[name] = img
  }
  const spr = spriteCache[name]!
  return spr.complete && spr.naturalWidth > 0 ? spr : null
}

export function drawCat(ctx: Ctx, p: CatPose): void {
  let sprName = 'cat_running'
  if (p.fish > 0) sprName = 'cat_with_fish'
  else if (p.airborne) sprName = 'cat_jumping'
  else if (p.crouching) sprName = 'cat_sneaking'
  else if (Math.abs(p.speed) < 0.2) sprName = 'cat_sneaking'

  const spr = getSprite(sprName)
  if (spr) {
    ctx.save()
    ctx.scale(p.facing, 1)
    const targetW = 0.95
    const targetH = targetW * (spr.naturalHeight / spr.naturalWidth)
    const bob = p.airborne ? 0 : Math.abs(Math.sin(p.stride * 2.2)) * 0.04
    ctx.drawImage(spr, -targetW * 0.5, -targetH + 0.08 - bob, targetW, targetH)
    ctx.restore()
    return
  }

  ctx.save()
  ctx.scale(p.facing, 1)
  const run = Math.min(1, Math.abs(p.speed) / 7)
  const phase = p.stride * 2.2
  const squash = p.crouching ? 0.68 : 1
  const bob = p.airborne ? 0 : Math.abs(Math.sin(phase)) * 0.04 * run
  const bodyY = -0.32 * squash - bob
  const stretch = p.airborne ? (p.vy < 0 ? 1.12 : 0.95) : 1

  // Tail.
  ctx.strokeStyle = ORANGE
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.1
  ctx.beginPath()
  ctx.moveTo(-0.32, bodyY)
  const sway = Math.sin(p.time * 3) * 0.15
  const tailUp = p.crouching ? 0.05 : -0.35
  ctx.bezierCurveTo(-0.55, bodyY - 0.05, -0.6 + sway * 0.3, bodyY + tailUp, -0.48 + sway, bodyY + tailUp - 0.12)
  ctx.stroke()
  ctx.strokeStyle = ORANGE_DARK
  ctx.lineWidth = 0.1
  ctx.beginPath()
  ctx.moveTo(-0.48 + sway, bodyY + tailUp - 0.12)
  ctx.lineTo(-0.47 + sway, bodyY + tailUp - 0.2)
  ctx.stroke()

  // Legs: back pair and front pair swing opposite.
  ctx.fillStyle = ORANGE
  const legLen = 0.22 * squash
  const legs = [
    { x: -0.2, a: Math.sin(phase) },
    { x: -0.12, a: Math.sin(phase + Math.PI) },
    { x: 0.17, a: Math.sin(phase + Math.PI) },
    { x: 0.25, a: Math.sin(phase) },
  ]
  for (const leg of legs) {
    const swing = p.airborne ? (leg.x > 0 ? 0.5 : -0.5) : leg.a * 0.55 * run
    ctx.save()
    ctx.translate(leg.x, bodyY + 0.08)
    ctx.rotate(swing)
    ctx.beginPath()
    ctx.roundRect(-0.045, 0, 0.09, legLen + 0.02, 0.04)
    ctx.fill()
    ctx.restore()
  }

  // Body.
  ctx.save()
  ctx.translate(0, bodyY)
  ctx.scale(stretch, 1 / stretch)
  ctx.fillStyle = ORANGE
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.36, 0.17 * (p.crouching ? 0.85 : 1), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = CREAM
  ctx.beginPath()
  ctx.ellipse(0.04, 0.07, 0.24, 0.08, 0, 0, Math.PI)
  ctx.fill()
  ctx.strokeStyle = ORANGE_DARK
  ctx.lineWidth = 0.045
  for (const x of [-0.18, -0.06, 0.06]) {
    ctx.beginPath()
    ctx.moveTo(x, -0.16)
    ctx.quadraticCurveTo(x + 0.04, -0.08, x - 0.01, -0.02)
    ctx.stroke()
  }
  ctx.restore()

  // Head.
  const headX = 0.36
  const headY = bodyY - (p.crouching ? 0.04 : 0.12)
  ctx.save()
  ctx.translate(headX, headY)
  ctx.fillStyle = ORANGE
  const earFlat = p.crouching ? 0.6 : 1
  for (const ex of [-0.1, 0.07]) {
    ctx.beginPath()
    ctx.moveTo(ex - 0.06, -0.08)
    ctx.lineTo(ex + 0.01, -0.08 - 0.14 * earFlat)
    ctx.lineTo(ex + 0.08, -0.07)
    ctx.closePath()
    ctx.fill()
  }
  // Inner ear pink
  ctx.fillStyle = '#ffb6c1'
  for (const ex of [-0.09, 0.08]) {
    ctx.beginPath()
    ctx.moveTo(ex - 0.04, -0.09)
    ctx.lineTo(ex + 0.01, -0.09 - 0.1 * earFlat)
    ctx.lineTo(ex + 0.05, -0.08)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = ORANGE
  ctx.beginPath()
  ctx.arc(0, 0, 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = CREAM
  ctx.beginPath()
  ctx.ellipse(0.06, 0.06, 0.08, 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  // Eye with sparkle
  if (p.blink) {
    ctx.strokeStyle = '#3a2410'
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.moveTo(0.02, -0.03)
    ctx.lineTo(0.09, -0.03)
    ctx.stroke()
  } else {
    ctx.fillStyle = '#66bb6a'
    ctx.beginPath()
    ctx.ellipse(0.06, -0.03, 0.038, 0.048, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0f2010'
    ctx.beginPath()
    ctx.ellipse(0.068, -0.03, 0.014, 0.038, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0.056, -0.042, 0.01, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ff80ab'
  ctx.beginPath()
  ctx.arc(0.14, 0.03, 0.024, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 0.012
  for (const dy of [-0.01, 0.02, 0.05]) {
    ctx.beginPath()
    ctx.moveTo(0.12, dy)
    ctx.lineTo(0.28, dy * 1.6)
    ctx.stroke()
  }
  if (p.fish > 0) {
    ctx.save()
    ctx.translate(0.2, 0.1)
    ctx.rotate(0.25)
    fishShape(ctx, 0.36 + Math.min(0.12, (p.fish - 1) * 0.04))
    ctx.restore()
  }
  ctx.restore()
  ctx.restore()
}

export interface VendorPose {
  dir: 1 | -1
  variant: number
  walking: boolean
  running: boolean
  stride: number
  /** 0..1 progress of a broom swing, or -1. */
  swing: number
  time: number
}

const DRESSES = [
  { base: '#d6578b', dots: '#ffd4e4' },
  { base: '#5e6fd1', dots: '#f7e27c' },
  { base: '#3f9e72', dots: '#f6f2d8' },
]

export function drawVendor(ctx: Ctx, p: VendorPose): void {
  const spr = getSprite('ibu_penjual')
  if (spr) {
    ctx.save()
    ctx.scale(p.dir, 1)
    const targetW = 1.05
    const targetH = targetW * (spr.naturalHeight / spr.naturalWidth)
    const bob = (p.walking || p.running) ? Math.sin(p.stride * (p.running ? 3.2 : 1.8)) * 0.04 : 0
    const swingAngle = p.swing >= 0 ? Math.sin(p.swing * Math.PI) * 0.28 : 0
    ctx.rotate(swingAngle)
    ctx.drawImage(spr, -targetW * 0.5, -targetH + 0.1 - bob, targetW, targetH)
    ctx.restore()
    return
  }

  ctx.save()
  ctx.scale(p.dir, 1)
  const dress = DRESSES[p.variant % DRESSES.length]!
  const pace = p.running ? 3.2 : 1.8
  const step = p.walking || p.running ? Math.sin(p.stride * pace) : 0
  const bob = Math.abs(step) * 0.04

  // Sandals and legs.
  ctx.fillStyle = '#9b6b4c'
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.translate(s * 0.1 + step * s * 0.12, -0.02)
    ctx.fillRect(-0.04, -0.22, 0.08, 0.22)
    ctx.fillStyle = '#2b2b2b'
    ctx.fillRect(-0.06, -0.03, 0.15, 0.04)
    ctx.restore()
  }

  // Daster.
  ctx.translate(0, -bob)
  ctx.fillStyle = dress.base
  ctx.beginPath()
  ctx.moveTo(-0.22, -1.22)
  ctx.quadraticCurveTo(-0.34, -0.6, -0.33, -0.2)
  ctx.lineTo(0.33, -0.2)
  ctx.quadraticCurveTo(0.34, -0.6, 0.22, -1.22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = dress.dots
  for (let i = 0; i < 14; i++) {
    const x = ((i * 37) % 50) / 100 - 0.25
    const y = -0.3 - ((i * 53) % 85) / 100
    ctx.beginPath()
    ctx.arc(x, y, 0.025, 0, Math.PI * 2)
    ctx.fill()
  }

  // Head: hijab or hair in a bun.
  const skin = '#c98f63'
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(0.02, -1.42, 0.17, 0, Math.PI * 2)
  ctx.fill()
  if (p.variant % 2 === 0) {
    ctx.fillStyle = p.variant === 0 ? '#f1e4c9' : '#7b4fa3'
    ctx.beginPath()
    ctx.arc(0.0, -1.44, 0.21, Math.PI * 0.95, Math.PI * 2.08)
    ctx.lineTo(0.2, -1.2)
    ctx.quadraticCurveTo(0, -1.08, -0.24, -1.18)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.ellipse(0.07, -1.4, 0.1, 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = '#2a1d17'
    ctx.beginPath()
    ctx.arc(0.0, -1.47, 0.18, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-0.17, -1.52, 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#2a1d17'
  ctx.beginPath()
  ctx.arc(0.11, -1.43, 0.02, 0, Math.PI * 2)
  ctx.fill()

  // Arm and sapu lidi.
  const swing = p.swing >= 0 ? Math.sin(p.swing * Math.PI) : 0
  const rest = p.running ? -0.5 : 0.15 + Math.sin(p.time * 1.3) * 0.04
  const angle = p.swing >= 0 ? -1.6 + swing * 2.6 : rest
  ctx.save()
  ctx.translate(0.12, -1.05)
  ctx.rotate(angle)
  ctx.strokeStyle = skin
  ctx.lineWidth = 0.08
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0.22, 0.25)
  ctx.stroke()
  ctx.strokeStyle = '#8a6a3a'
  ctx.lineWidth = 0.04
  ctx.beginPath()
  ctx.moveTo(0.05, 0.05)
  ctx.lineTo(0.55, 0.75)
  ctx.stroke()
  ctx.strokeStyle = '#c9a75c'
  ctx.lineWidth = 0.018
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(0.5, 0.7)
    ctx.lineTo(0.62 + i * 0.05, 1.15 + Math.abs(i) * -0.02)
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}
