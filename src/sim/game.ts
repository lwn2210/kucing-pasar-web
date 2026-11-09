import { CAT, DT, IBU, LIVES } from './constants'
import { isSolid, parseLevel, tileAt, type Level, type LevelDef, type Vec2 } from './level'
import { moveBody, newCatBody, stepCat, type Body, type CatBody, type CatInput } from './physics'
import { createRng, type Rng } from './rng'
import { lineOfSight } from './vision'

// The whole game as plain data plus one step function, so it can be tested
// without a browser and replayed from a seed.

export type VendorMood = 'patrol' | 'pause' | 'glance' | 'suspicious' | 'chase' | 'swing' | 'scold' | 'search' | 'return'

export interface Vendor extends Body {
  dir: 1 | -1
  mood: VendorMood
  timer: number
  /** 0..1: how sure she is there is a cat. 1 starts a chase. */
  alert: number
  seesCat: boolean
  lastSeenX: number
  unseen: number
  cooldown: number
  homeX: number
  /** How far she patrols, and how far she can run on her floor. */
  patrol: [number, number]
  floor: [number, number]
  variant: number
}

export interface Cat extends CatBody {
  lives: number
  fish: number[]
  hurt: number
  /** True while it stands in the exit with nothing to show for it (for the hint). */
  emptyHanded: boolean
}

export type Phase = 'playing' | 'won' | 'lost'

export interface GameState {
  level: Level
  tick: number
  cat: Cat
  vendors: Vendor[]
  taken: boolean[]
  phase: Phase
  /** Times a vendor started a chase. */
  alerts: number
  rng: Rng
}

export type GameEvent =
  | { type: 'jump' }
  | { type: 'drop' }
  | { type: 'land'; impact: number }
  | { type: 'fish'; index: number }
  | { type: 'suspicious'; vendor: number }
  | { type: 'alert'; vendor: number }
  | { type: 'giveUp'; vendor: number }
  | { type: 'swing'; vendor: number }
  | { type: 'scold'; vendor: number }
  | { type: 'hurt'; lostFish: number | null }
  | { type: 'emptyHanded' }
  | { type: 'won'; stars: number }
  | { type: 'lost' }

export const NO_INPUT: CatInput = { left: false, right: false, jump: false, crouch: false }

/** The open floor a vendor stands on: from wall/crate/ledge to wall/crate/ledge. */
function floorExtent(level: Level, x: number, y: number): [number, number] {
  const row = Math.round(y) - 1
  const standable = (tx: number) => !isSolid(tileAt(level, tx, row)) && isSolid(tileAt(level, tx, row + 1))
  let lo = Math.floor(x)
  let hi = lo
  while (standable(lo - 1)) lo--
  while (standable(hi + 1)) hi++
  return [lo + 0.5, hi + 0.5]
}

const PATROL_RADIUS = 6

export function createGame(def: LevelDef | Level, seed = 1): GameState {
  const level = 'tiles' in def ? def : parseLevel(def)
  const body = newCatBody(level.start.x, level.start.y)
  const cat: Cat = { ...body, lives: LIVES, fish: [], hurt: 0, emptyHanded: false }
  const rng = createRng(seed)
  const vendors = level.vendors.map((v, i): Vendor => {
    const floor = floorExtent(level, v.x, v.y)
    return {
      x: v.x,
      y: v.y,
      w: IBU.width,
      h: IBU.height,
      vx: 0,
      vy: 0,
      onGround: true,
      dropTimer: 0,
      dir: v.dir,
      mood: 'patrol',
      timer: 0,
      alert: 0,
      seesCat: false,
      lastSeenX: v.x,
      unseen: 0,
      cooldown: 0,
      homeX: v.x,
      patrol: [Math.max(floor[0], v.x - PATROL_RADIUS), Math.min(floor[1], v.x + PATROL_RADIUS)],
      floor,
      variant: i % 3,
    }
  })
  return { level, tick: 0, cat, vendors, taken: level.fish.map(() => false), phase: 'playing', alerts: 0, rng }
}

export function catCenter(cat: Cat): Vec2 {
  return { x: cat.x, y: cat.y - cat.h / 2 }
}

export function catHidden(state: GameState): boolean {
  const c = catCenter(state.cat)
  return state.cat.crouching && tileAt(state.level, Math.floor(c.x), Math.floor(c.y)) === 'hide'
}

/** Can vendor `v` see the cat right now? Also returns how far away it is. */
export function vendorSees(state: GameState, v: Vendor): { sees: boolean; dist: number } {
  const c = catCenter(state.cat)
  const eye = { x: v.x, y: v.y - IBU.eyeHeight }
  const dx = c.x - eye.x
  const dy = c.y - eye.y
  const dist = Math.hypot(dx, dy)
  const sees =
    !catHidden(state) &&
    dist <= IBU.sight &&
    dx * v.dir > -0.3 &&
    // She looks down at her feet easily; up toward the awnings, less so.
    (dy >= 0 ? dy <= Math.abs(dx) + 1.5 : -dy <= Math.abs(dx) * 0.6 + 0.6) &&
    lineOfSight(state.level, eye, c)
  return { sees, dist }
}

export function stars(state: GameState): number {
  return 1 + (state.cat.fish.length === state.level.fish.length ? 1 : 0) + (state.alerts === 0 ? 1 : 0)
}

function hurtCat(state: GameState, fromX: number, events: GameEvent[]): boolean {
  const cat = state.cat
  if (cat.hurt > 0 || state.phase !== 'playing') return false
  cat.lives--
  cat.hurt = CAT.hurtTime
  const away = cat.x >= fromX ? 1 : -1
  cat.vx = away * 7
  cat.vy = -9
  cat.onGround = false
  // Startled, it drops the last fish it grabbed; the fish goes back on the stall.
  const lost = cat.fish.pop() ?? null
  if (lost !== null) state.taken[lost] = false
  events.push({ type: 'hurt', lostFish: lost })
  if (cat.lives <= 0) {
    state.phase = 'lost'
    events.push({ type: 'lost' })
  }
  return true
}

function stepVendor(state: GameState, v: Vendor, i: number, events: GameEvent[]): void {
  const cat = state.cat
  const { sees, dist } = vendorSees(state, v)
  v.seesCat = sees
  if (sees) {
    const closeness = Math.max(0.15, 1.15 - dist / IBU.sight)
    const rate = IBU.noticeRate * closeness * (cat.crouching ? 0.45 : 1) * (state.level.night ? 0.7 : 1)
    v.alert = Math.min(1, v.alert + rate * DT)
    v.lastSeenX = cat.x
    v.unseen = 0
  } else {
    v.unseen += DT
    if (v.mood !== 'chase' && v.mood !== 'swing' && v.mood !== 'scold') v.alert = Math.max(0, v.alert - IBU.forgetRate * DT)
  }
  v.cooldown = Math.max(0, v.cooldown - DT)
  const clampFloor = (x: number) => Math.min(v.floor[1], Math.max(v.floor[0], x))
  let speed = 0

  switch (v.mood) {
    case 'patrol':
    case 'pause':
    case 'glance':
    case 'return':
      if (v.alert >= IBU.suspicious) {
        v.mood = 'suspicious'
        events.push({ type: 'suspicious', vendor: i })
        break
      }
      if (v.mood === 'return') {
        const d = v.homeX - v.x
        if (Math.abs(d) < 0.1) v.mood = 'patrol'
        else {
          v.dir = d > 0 ? 1 : -1
          speed = IBU.walkSpeed
        }
      } else if (v.mood === 'patrol') {
        speed = IBU.walkSpeed
        const atEnd = (v.dir > 0 && v.x >= v.patrol[1]) || (v.dir < 0 && v.x <= v.patrol[0])
        if (atEnd) {
          v.mood = 'pause'
          v.timer = IBU.pauseTime
          speed = 0
        } else if (state.rng() < 0.12 * DT) {
          // A glance over the shoulder.
          v.mood = 'glance'
          v.timer = 0.9
          v.dir = v.dir === 1 ? -1 : 1
          speed = 0
        }
      } else {
        v.timer -= DT
        if (v.timer <= 0) {
          v.dir = v.dir === 1 ? -1 : 1
          v.mood = 'patrol'
        }
      }
      break
    case 'suspicious':
      if (sees) v.dir = cat.x >= v.x ? 1 : -1
      if (v.alert >= 1) {
        v.mood = 'chase'
        state.alerts++
        events.push({ type: 'alert', vendor: i })
      } else if (v.alert <= 0) v.mood = 'return'
      break
    case 'chase': {
      if (v.unseen > IBU.giveUpTime) {
        v.mood = 'search'
        v.timer = IBU.searchTime
        v.alert = 0.5
        events.push({ type: 'giveUp', vendor: i })
        break
      }
      const target = clampFloor(v.lastSeenX)
      const d = target - v.x
      if (Math.abs(d) > 0.2) {
        v.dir = d > 0 ? 1 : -1
        speed = IBU.chaseSpeed
      }
      const reachable = cat.y <= v.y + 0.2 && cat.y >= v.y - 2.1
      if (sees && reachable && Math.abs(cat.x - v.x) < IBU.reach && v.cooldown <= 0) {
        v.mood = 'swing'
        v.timer = IBU.swingWindup
        v.dir = cat.x >= v.x ? 1 : -1
        events.push({ type: 'swing', vendor: i })
      }
      break
    }
    case 'swing':
      v.timer -= DT
      if (v.timer <= 0) {
        const reachable = cat.y <= v.y + 0.2 && cat.y >= v.y - 2.1
        const hit = reachable && Math.abs(cat.x - v.x) < IBU.reach + 0.25 && (cat.x - v.x) * v.dir > -0.3 && hurtCat(state, v.x, events)
        v.cooldown = IBU.swingCooldown
        if (hit) {
          v.mood = 'scold'
          v.timer = IBU.scoldTime
          events.push({ type: 'scold', vendor: i })
        } else v.mood = 'chase'
      }
      break
    case 'scold':
      v.timer -= DT
      if (v.timer <= 0) {
        v.mood = 'chase'
        v.unseen = 0
      }
      break
    case 'search':
      if (sees && v.alert >= 0.8) {
        v.alert = 1
        v.mood = 'chase'
        break
      }
      v.timer -= DT
      if (Math.floor((v.timer + DT) / 0.7) !== Math.floor(v.timer / 0.7)) v.dir = v.dir === 1 ? -1 : 1
      if (v.timer <= 0) {
        v.alert = 0
        v.mood = 'return'
      }
      break
  }

  v.vx = speed * v.dir
  v.vy = 0
  moveBody(state.level, v, DT)
  v.x = clampFloor(v.x)
}

export function step(state: GameState, input: CatInput): GameEvent[] {
  const events: GameEvent[] = []
  if (state.phase !== 'playing') return events
  state.tick++
  const cat = state.cat
  if (cat.hurt > 0) cat.hurt = Math.max(0, cat.hurt - DT)

  const scale = (1 - CAT.fishDrag * cat.fish.length) * (cat.hurt > CAT.hurtTime - 0.35 ? 0.3 : 1)
  const move = stepCat(state.level, cat, cat.hurt > CAT.hurtTime - 0.35 ? NO_INPUT : input, scale)
  if (move.jumped) events.push({ type: 'jump' })
  if (move.dropped) events.push({ type: 'drop' })
  if (move.landed > 4) events.push({ type: 'land', impact: move.landed })

  // Fell out of the world: back to the start, a life lighter.
  if (cat.y > state.level.height + 3) {
    hurtCat(state, cat.x, events)
    Object.assign(cat, { x: state.level.start.x, y: state.level.start.y, vx: 0, vy: 0 })
  }

  const c = catCenter(cat)
  state.level.fish.forEach((f, i) => {
    if (state.taken[i]) return
    if (Math.abs(f.x - c.x) < 0.65 && Math.abs(f.y - c.y) < 0.75) {
      state.taken[i] = true
      cat.fish.push(i)
      events.push({ type: 'fish', index: i })
    }
  })

  state.vendors.forEach((v, i) => stepVendor(state, v, i, events))
  if (state.phase !== 'playing') return events

  const { tx, ty } = state.level.exit
  const inExit = Math.floor(cat.x) === tx && Math.floor(cat.y - 0.01) === ty
  if (inExit && cat.fish.length > 0) {
    state.phase = 'won'
    events.push({ type: 'won', stars: stars(state) })
  } else if (inExit && !cat.emptyHanded) events.push({ type: 'emptyHanded' })
  cat.emptyHanded = inExit && cat.fish.length === 0
  return events
}
