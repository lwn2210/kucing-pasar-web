import { describe, expect, it } from 'vitest'
import { LEVELS } from '../src/levels'
import { CAT, LIVES } from '../src/sim/constants'
import { catHidden, createGame, NO_INPUT, step, vendorSees, type GameEvent, type GameState } from '../src/sim/game'
import { parseLevel, type Level, type LevelDef } from '../src/sim/level'
import { newCatBody, stepCat, type CatInput } from '../src/sim/physics'
import { lineOfSight } from '../src/sim/vision'

const input = (p: Partial<CatInput>): CatInput => ({ ...NO_INPUT, ...p })

function run(state: GameState, ticks: number, inp: CatInput | ((s: GameState, t: number) => CatInput)): GameEvent[] {
  const events: GameEvent[] = []
  for (let t = 0; t < ticks && state.phase === 'playing'; t++) events.push(...step(state, typeof inp === 'function' ? inp(state, t) : inp))
  return events
}

/** A test room: floor at row 6 (cat stands at y = 6), walls at the sides. */
function room(rows: string[], name = 'test'): LevelDef {
  // Levels need a fish; tuck one in the top-left corner where nothing reaches it.
  const fishless = !rows.some((r) => r.includes('f') || r.includes('g'))
  return { id: name, name, subtitle: '', rows: fishless ? ['#f' + rows[0]!.slice(2), ...rows.slice(1)] : rows }
}

const FLAT = room([
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#.C..............E.#',
  '####################',
])

describe('cat physics', () => {
  it('stands on the floor and jumps about 2.3 tiles', () => {
    const level = parseLevel(FLAT)
    const cat = newCatBody(level.start.x, level.start.y)
    for (let i = 0; i < 10; i++) stepCat(level, cat, NO_INPUT)
    expect(cat.onGround).toBe(true)
    expect(cat.y).toBe(6)
    let peak = 6
    stepCat(level, cat, input({ jump: true }))
    for (let i = 0; i < 60; i++) {
      stepCat(level, cat, input({ jump: true }))
      peak = Math.min(peak, cat.y)
    }
    expect(6 - peak).toBeGreaterThan(2.1)
    expect(6 - peak).toBeLessThan(2.5)
    expect(cat.onGround).toBe(true)
  })

  it('a tap jump is lower than a held one', () => {
    const level = parseLevel(FLAT)
    const cat = newCatBody(level.start.x, level.start.y)
    let peak = 6
    for (let i = 0; i < 60; i++) {
      stepCat(level, cat, input({ jump: i < 3 }))
      peak = Math.min(peak, cat.y)
    }
    expect(6 - peak).toBeLessThan(1.2)
  })

  it('stops at walls', () => {
    const level = parseLevel(FLAT)
    const cat = newCatBody(level.start.x, level.start.y)
    for (let i = 0; i < 300; i++) stepCat(level, cat, input({ right: true }))
    expect(cat.x).toBeCloseTo(19 - CAT.width / 2)
  })

  it('jumps up through a plank, stands on it, and drops back down', () => {
    const level = parseLevel(
      room(['#......#', '#......#', '#......#', '#......#', '#..==..#', '#..C..E#', '########']),
    )
    const cat = newCatBody(level.start.x, level.start.y)
    for (let i = 0; i < 60; i++) stepCat(level, cat, input({ jump: true }))
    expect(cat.y).toBe(4)
    expect(cat.onGround).toBe(true)
    stepCat(level, cat, input({ crouch: true }))
    stepCat(level, cat, input({ crouch: true, jump: true }))
    for (let i = 0; i < 40; i++) stepCat(level, cat, NO_INPUT)
    expect(cat.y).toBe(5 + 1)
  })

  it('still jumps just after running off a ledge (coyote time)', () => {
    const level = parseLevel(room(['#........#', '#........#', '#C.......#', '###......#', '#........#', '#.......E#', '##########']))
    const cat = newCatBody(level.start.x, level.start.y)
    let t = 0
    while (cat.onGround && t++ < 200) stepCat(level, cat, input({ right: true }))
    const yAtEdge = cat.y
    stepCat(level, cat, input({ right: true }))
    stepCat(level, cat, input({ right: true, jump: true }))
    expect(cat.vy).toBeLessThan(0)
    expect(yAtEdge).toBeCloseTo(3, 1)
  })

  it('sneaking makes the cat lower and slower', () => {
    const level = parseLevel(FLAT)
    const cat = newCatBody(level.start.x, level.start.y)
    for (let i = 0; i < 60; i++) stepCat(level, cat, input({ right: true, crouch: true }))
    expect(cat.h).toBe(CAT.crouchHeight)
    expect(cat.vx).toBeCloseTo(CAT.sneakSpeed)
  })
})

describe('vision', () => {
  const open = room([
    '#....................#',
    '#....................#',
    '#....................#',
    '#........====........#',
    '#....................#',
    '#.C....I.....b.....E.#',
    '######################',
  ])

  it('lines of sight stop at crates and planks', () => {
    const level = parseLevel(open)
    expect(lineOfSight(level, { x: 3, y: 5.5 }, { x: 12, y: 5.5 })).toBe(true)
    expect(lineOfSight(level, { x: 3, y: 5.5 }, { x: 16, y: 5.5 })).toBe(false)
    expect(lineOfSight(level, { x: 11, y: 5.5 }, { x: 11, y: 2.5 })).toBe(false)
  })

  it('a vendor sees in front, not behind, and not through a crate', () => {
    const s = createGame(open)
    const v = s.vendors[0]!
    s.cat.x = 10
    expect(vendorSees(s, v).sees).toBe(true)
    s.cat.x = 4
    expect(vendorSees(s, v).sees).toBe(false)
    s.cat.x = 16
    expect(vendorSees(s, v).sees).toBe(false)
  })

  it('a crouching cat in the dark under a table is invisible', () => {
    const s = createGame(room(['#..........#', '#..........#', '#..........#', '#..........#', '#....===...#', '#.I..hhh.CE#', '############']))
    const v = s.vendors[0]!
    s.cat.x = 6.5
    expect(vendorSees(s, v).sees).toBe(true)
    s.cat.crouching = true
    s.cat.h = CAT.crouchHeight
    expect(catHidden(s)).toBe(true)
    expect(vendorSees(s, v).sees).toBe(false)
  })
})

describe('vendors', () => {
  const lane = room([
    '#..........................#',
    '#..........................#',
    '#.........====.............#',
    '#..........................#',
    '#..........................#',
    '#.C...I....................#',
    '############################',
  ])
  // Exit far off on the right so it never ends the test.
  lane.rows[5] = '#.C...I...................E#'
  lane.rows[0] = '#f' + lane.rows[0]!.slice(2)

  it('patrols back and forth on her floor', () => {
    const s = createGame(lane, 3)
    s.cat.x = 2
    const xs: number[] = []
    run(s, 60 * 20, (st) => {
      xs.push(st.vendors[0]!.x)
      st.cat.x = 1.5
      return NO_INPUT
    })
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(4)
  })

  it('gets suspicious, then chases a cat that stays in view', () => {
    const s = createGame(lane, 3)
    const v = s.vendors[0]!
    v.dir = 1
    s.cat.x = 10
    const events = run(s, 120, (st) => {
      st.cat.x = Math.max(st.cat.x, st.vendors[0]!.x + 2.5)
      return NO_INPUT
    })
    const types = events.map((e) => e.type)
    expect(types).toContain('suspicious')
    expect(types).toContain('alert')
    expect(types.indexOf('suspicious')).toBeLessThan(types.indexOf('alert'))
    expect(s.alerts).toBe(1)
  })

  it('swings the broom at a cat in reach: a life and the last fish are lost', () => {
    const s = createGame(lane, 3)
    const v = s.vendors[0]!
    v.mood = 'chase'
    v.alert = 1
    v.dir = 1
    s.cat.x = v.x + 0.8
    s.cat.fish = [0]
    s.taken[0] = true
    const events = run(s, 60, (st) => {
      if (st.cat.hurt === 0) st.cat.x = st.vendors[0]!.x + 0.8
      return NO_INPUT
    })
    expect(events.map((e) => e.type)).toContain('swing')
    expect(events).toContainEqual({ type: 'hurt', lostFish: 0 })
    expect(s.cat.lives).toBe(LIVES - 1)
    expect(s.taken[0]).toBe(false)
    // She stops to scold after a hit, giving the cat a head start.
    expect(events).toContainEqual({ type: 'scold', vendor: 0 })
    expect(v.mood).toBe('scold')
    expect(v.vx).toBe(0)
  })

  it('gives up when the cat is out of sight, then goes home', () => {
    const s = createGame(lane, 3)
    const v = s.vendors[0]!
    v.mood = 'chase'
    v.alert = 1
    v.lastSeenX = 12
    // The cat sits up on the awning, out of her sight and reach.
    s.cat.x = 11.5
    s.cat.y = 2
    const events = run(s, 60 * 8, (st) => {
      st.cat.x = 11.5
      st.cat.y = 2
      st.cat.vy = 0
      return NO_INPUT
    })
    expect(events.map((e) => e.type)).toContain('giveUp')
    expect(['return', 'patrol']).toContain(v.mood as string)
  })

  it('three hits and the cat is caught', () => {
    const s = createGame(lane, 3)
    for (let i = 0; i < 3; i++) {
      s.cat.hurt = 0
      const v = s.vendors[0]!
      v.mood = 'chase'
      v.alert = 1
      v.cooldown = 0
      v.dir = 1
      s.cat.x = v.x + 0.6
      v.lastSeenX = s.cat.x
      s.cat.y = 6
      run(s, 40, (st) => {
        if (st.cat.hurt === 0) {
          st.cat.x = st.vendors[0]!.x + 0.6
          st.cat.y = 6
        }
        return NO_INPUT
      })
    }
    expect(s.phase).toBe('lost')
  })
})

describe('game flow', () => {
  const tiny = room(['#..........#', '#..........#', '#..........#', '#..........#', '#..........#', '#.C..f...E.#', '############'])

  it('the exit only opens with a fish in the mouth', () => {
    const s = createGame(tiny)
    s.taken[0] = true
    s.cat.x = 9.5
    const events = step(s, NO_INPUT)
    expect(events).toContainEqual({ type: 'emptyHanded' })
    expect(s.phase).toBe('playing')
  })

  it('picks up fish on the way and wins with stars', () => {
    const s = createGame(tiny)
    const events = run(s, 60 * 5, input({ right: true }))
    expect(events).toContainEqual({ type: 'fish', index: 0 })
    expect(events).toContainEqual({ type: 'won', stars: 3 })
    expect(s.phase).toBe('won')
  })

  it('is deterministic', () => {
    const script = (_s: GameState, t: number): CatInput => input({ right: t % 200 < 150, left: t % 200 >= 150, jump: t % 47 < 10, crouch: t % 300 > 260 })
    const a = createGame(LEVELS[1]!, 9)
    const b = createGame(LEVELS[1]!, 9)
    run(a, 3000, script)
    run(b, 3000, script)
    const strip = (s: GameState) => JSON.stringify({ ...s, rng: null })
    expect(strip(a)).toBe(strip(b))
  })
})

/**
 * Explores a level with the real cat physics: from every place the cat can
 * stand, try walking, running jumps and short hops in each direction, and
 * drops through planks. Returns which fish it touched and whether it found
 * the exit. Vendors are ignored: this checks the layout, not the stealth.
 */
function explore(level: Level): { fish: Set<number>; exit: boolean; spots: number } {
  const fish = new Set<number>()
  let exit = false
  const seen = new Set<string>()
  const queue: { x: number; y: number }[] = [level.start]
  const key = (x: number, y: number) => `${Math.floor(x * 2)},${Math.round(y)}`
  seen.add(key(level.start.x, level.start.y))
  const touch = (x: number, y: number, h: number) => {
    const cx = x
    const cy = y - h / 2
    level.fish.forEach((f, i) => {
      if (Math.abs(f.x - cx) < 0.65 && Math.abs(f.y - cy) < 0.75) fish.add(i)
    })
    if (Math.floor(x) === level.exit.tx && Math.floor(y - 0.01) === level.exit.ty) exit = true
  }
  const plans: { dir: number; runup: number; hold: number; crouch: boolean }[] = []
  for (const dir of [-1, 0, 1]) {
    for (const runup of [0, 10]) for (const hold of [0, 4, 40]) plans.push({ dir, runup, hold, crouch: false })
    plans.push({ dir, runup: 0, hold: 2, crouch: true })
  }
  while (queue.length) {
    const p = queue.shift()!
    for (const plan of plans) {
      const cat = newCatBody(p.x, p.y)
      let airborne = false
      for (let t = 0; t < 150; t++) {
        const jumping = plan.hold > 0 && t >= plan.runup && t < plan.runup + plan.hold
        const i: CatInput = {
          left: plan.dir < 0,
          right: plan.dir > 0,
          jump: jumping,
          crouch: plan.crouch && t <= plan.runup + 1,
        }
        stepCat(level, cat, i)
        touch(cat.x, cat.y, cat.h)
        if (!cat.onGround) airborne = true
        const landedSomewhere = cat.onGround && (airborne || plan.hold === 0)
        if (landedSomewhere) {
          const k = key(cat.x, cat.y)
          if (!seen.has(k)) {
            seen.add(k)
            queue.push({ x: cat.x, y: cat.y })
          }
          if (airborne) break
        }
        if (plan.hold === 0 && t > 40) break
      }
    }
  }
  return { fish, exit, spots: seen.size }
}

describe('levels', () => {
  for (const def of LEVELS) {
    it(`${def.name}: every fish and the exit can be reached`, () => {
      const level = parseLevel(def)
      const result = explore(level)
      const missing = level.fish.map((f, i) => (result.fish.has(i) ? null : `${f.x},${f.y}`)).filter(Boolean)
      expect(missing).toEqual([])
      expect(result.exit).toBe(true)
      expect(level.vendors.length).toBeGreaterThan(0)
    })
  }
})
