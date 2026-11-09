import { CAT, DT, GRAVITY, MAX_FALL } from './constants'
import { isSolid, tileAt, type Level } from './level'

// Tile collision for axis-aligned boxes whose (x, y) is the middle of the
// feet. Moves one axis at a time; one-way planks only stop a body falling
// onto them from above.

export interface Body {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
  /** Seconds left of ignoring one-way planks (dropping through a table). */
  dropTimer: number
}

const EPS = 1e-6

export function moveBody(level: Level, b: Body, dt: number): { landedAt: number } {
  let landedAt = 0
  // Horizontal.
  b.x += b.vx * dt
  const top = b.y - b.h
  const rowA = Math.floor(top + EPS)
  const rowB = Math.floor(b.y - EPS)
  if (b.vx > 0) {
    const col = Math.floor(b.x + b.w / 2 - EPS)
    for (let r = rowA; r <= rowB; r++) {
      if (isSolid(tileAt(level, col, r))) {
        b.x = col - b.w / 2
        b.vx = 0
        break
      }
    }
  } else if (b.vx < 0) {
    const col = Math.floor(b.x - b.w / 2 + EPS)
    for (let r = rowA; r <= rowB; r++) {
      if (isSolid(tileAt(level, col, r))) {
        b.x = col + 1 + b.w / 2
        b.vx = 0
        break
      }
    }
  }

  // Vertical.
  const prevBottom = b.y
  b.y += b.vy * dt
  const colA = Math.floor(b.x - b.w / 2 + EPS)
  const colB = Math.floor(b.x + b.w / 2 - EPS)
  b.onGround = false
  if (b.vy >= 0) {
    const row = Math.floor(b.y - EPS)
    for (let c = colA; c <= colB; c++) {
      const t = tileAt(level, c, row)
      const plank = t === 'oneway' && b.dropTimer <= 0 && prevBottom <= row + EPS
      if (isSolid(t) || plank) {
        landedAt = b.vy
        b.y = row
        b.vy = 0
        b.onGround = true
        break
      }
    }
  } else {
    const row = Math.floor(b.y - b.h + EPS)
    for (let c = colA; c <= colB; c++) {
      if (isSolid(tileAt(level, c, row))) {
        b.y = row + 1 + b.h
        b.vy = 0
        break
      }
    }
  }
  if (b.dropTimer > 0) b.dropTimer -= dt
  return { landedAt }
}

/** True if a box of height `h` with feet at (x, y) overlaps a wall. */
export function blocked(level: Level, x: number, y: number, w: number, h: number): boolean {
  for (let r = Math.floor(y - h + EPS); r <= Math.floor(y - EPS); r++) {
    for (let c = Math.floor(x - w / 2 + EPS); c <= Math.floor(x + w / 2 - EPS); c++) {
      if (isSolid(tileAt(level, c, r))) return true
    }
  }
  return false
}

/** Whether the body stands on a one-way plank (so crouch + jump drops through it). */
export function onPlank(level: Level, b: Body): boolean {
  if (!b.onGround) return false
  const row = Math.round(b.y)
  for (let c = Math.floor(b.x - b.w / 2 + EPS); c <= Math.floor(b.x + b.w / 2 - EPS); c++) {
    if (isSolid(tileAt(level, c, row))) return false
  }
  return tileAt(level, Math.floor(b.x), row) === 'oneway'
}

export interface CatInput {
  left: boolean
  right: boolean
  jump: boolean
  crouch: boolean
}

export interface CatBody extends Body {
  facing: 1 | -1
  crouching: boolean
  coyote: number
  buffer: number
  jumpHeld: boolean
}

export function newCatBody(x: number, y: number): CatBody {
  return {
    x,
    y,
    w: CAT.width,
    h: CAT.height,
    vx: 0,
    vy: 0,
    onGround: true,
    dropTimer: 0,
    facing: 1,
    crouching: false,
    coyote: 0,
    buffer: 0,
    jumpHeld: false,
  }
}

export interface CatMove {
  jumped: boolean
  dropped: boolean
  /** Downward speed at touchdown, 0 when it did not land this tick. */
  landed: number
}

/**
 * One tick of cat movement: run, sneak, jump (with coyote time, a press
 * buffer and a cut when released early), drop through planks.
 * `speedScale` slows it while carrying fish or hurt.
 */
export function stepCat(level: Level, cat: CatBody, input: CatInput, speedScale = 1): CatMove {
  const out: CatMove = { jumped: false, dropped: false, landed: 0 }
  const wantCrouch = input.crouch && cat.onGround
  if (wantCrouch) {
    cat.crouching = true
    cat.h = CAT.crouchHeight
  } else if (cat.crouching && !blocked(level, cat.x, cat.y, cat.w, CAT.height)) {
    // Only stand up where there is headroom.
    cat.crouching = false
    cat.h = CAT.height
  }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (dir !== 0) cat.facing = dir as 1 | -1
  const top = (cat.crouching ? CAT.sneakSpeed : CAT.runSpeed) * speedScale
  const accel = cat.onGround ? CAT.groundAccel : CAT.airAccel
  const target = dir * top
  const dv = target - cat.vx
  cat.vx += Math.sign(dv) * Math.min(Math.abs(dv), accel * DT)

  if (input.jump && !cat.jumpHeld) cat.buffer = CAT.jumpBuffer
  cat.jumpHeld = input.jump
  cat.coyote = cat.onGround ? CAT.coyoteTime : Math.max(0, cat.coyote - DT)
  if (cat.buffer > 0) {
    cat.buffer -= DT
    if (input.crouch && onPlank(level, cat)) {
      cat.dropTimer = 0.25
      cat.y += 0.05
      cat.onGround = false
      cat.buffer = 0
      cat.coyote = 0
      out.dropped = true
    } else if (cat.coyote > 0) {
      cat.vy = -CAT.jumpSpeed
      cat.buffer = 0
      cat.coyote = 0
      cat.onGround = false
      if (cat.crouching && !blocked(level, cat.x, cat.y, cat.w, CAT.height)) {
        cat.crouching = false
        cat.h = CAT.height
      }
      out.jumped = true
    }
  }
  if (!cat.jumpHeld && cat.vy < -CAT.jumpSpeed * CAT.jumpCut) cat.vy = -CAT.jumpSpeed * CAT.jumpCut

  cat.vy = Math.min(MAX_FALL, cat.vy + GRAVITY * DT)
  out.landed = moveBody(level, cat, DT).landedAt
  return out
}
