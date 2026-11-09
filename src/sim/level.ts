// Levels are drawn as text, one character per tile, rows top to bottom:
//   #  wall / floor            b  crate (solid)
//   =  table top or awning: stand on it, jump up through it, drop down with crouch + jump
//   h  the dark space under a table: crouch here and nobody can see you
//   f  a fish (on an empty tile)    g  a fish under a table (hidden spot)
//   C  the cat's start          E  the way out (the gutter)
//   I  a vendor facing right    J  a vendor facing left
//   .  empty

export type Tile = 'empty' | 'solid' | 'crate' | 'oneway' | 'hide'

export interface Vec2 {
  x: number
  y: number
}

export interface LevelDef {
  id: string
  name: string
  subtitle: string
  night?: boolean
  rows: string[]
}

export interface VendorSpawn {
  x: number
  y: number
  dir: 1 | -1
}

export interface Level {
  id: string
  name: string
  subtitle: string
  night: boolean
  width: number
  height: number
  tiles: Tile[]
  /** Cat's feet, tile units. */
  start: Vec2
  exit: { tx: number; ty: number }
  /** Fish centres. */
  fish: Vec2[]
  vendors: VendorSpawn[]
}

export function parseLevel(def: LevelDef): Level {
  const height = def.rows.length
  const width = def.rows[0]?.length ?? 0
  const tiles: Tile[] = []
  let start: Vec2 | null = null
  let exit: Level['exit'] | null = null
  const fish: Vec2[] = []
  const vendors: VendorSpawn[] = []
  def.rows.forEach((row, ty) => {
    if (row.length !== width) throw new Error(`${def.id}: row ${ty} is ${row.length} wide, expected ${width}`)
    ;[...row].forEach((ch, tx) => {
      let tile: Tile = 'empty'
      switch (ch) {
        case '#':
          tile = 'solid'
          break
        case 'b':
          tile = 'crate'
          break
        case '=':
          tile = 'oneway'
          break
        case 'h':
          tile = 'hide'
          break
        case 'g':
          tile = 'hide'
          fish.push({ x: tx + 0.5, y: ty + 0.6 })
          break
        case 'f':
          fish.push({ x: tx + 0.5, y: ty + 0.5 })
          break
        case 'C':
          start = { x: tx + 0.5, y: ty + 1 }
          break
        case 'E':
          exit = { tx, ty }
          break
        case 'I':
        case 'J':
          vendors.push({ x: tx + 0.5, y: ty + 1, dir: ch === 'I' ? 1 : -1 })
          break
        case '.':
          break
        default:
          throw new Error(`${def.id}: unknown tile '${ch}' at ${tx},${ty}`)
      }
      tiles.push(tile)
    })
  })
  if (!start) throw new Error(`${def.id}: no cat start (C)`)
  if (!exit) throw new Error(`${def.id}: no exit (E)`)
  if (fish.length === 0) throw new Error(`${def.id}: no fish`)
  return { id: def.id, name: def.name, subtitle: def.subtitle, night: def.night ?? false, width, height, tiles, start, exit, fish, vendors }
}

/** Outside the map: walls at the sides and below, open sky above. */
export function tileAt(level: Level, tx: number, ty: number): Tile {
  if (tx < 0 || tx >= level.width || ty >= level.height) return 'solid'
  if (ty < 0) return 'empty'
  return level.tiles[ty * level.width + tx]!
}

export const isSolid = (t: Tile): boolean => t === 'solid' || t === 'crate'

/** Blocks a vendor's line of sight: walls, crates, and the planks of tables and awnings. */
export const blocksSight = (t: Tile): boolean => t === 'solid' || t === 'crate' || t === 'oneway'
