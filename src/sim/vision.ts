import { blocksSight, tileAt, type Level, type Vec2 } from './level'

/**
 * Walks the tiles a straight line crosses (Amanatides & Woo) and reports
 * whether any of them blocks sight. The tiles holding the two end points
 * are not tested, so an eye or a target touching a plank still counts.
 */
export function lineOfSight(level: Level, from: Vec2, to: Vec2): boolean {
  let tx = Math.floor(from.x)
  let ty = Math.floor(from.y)
  const endX = Math.floor(to.x)
  const endY = Math.floor(to.y)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const stepX = Math.sign(dx)
  const stepY = Math.sign(dy)
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity
  let tMaxX = stepX > 0 ? (tx + 1 - from.x) * tDeltaX : stepX < 0 ? (from.x - tx) * tDeltaX : Infinity
  let tMaxY = stepY > 0 ? (ty + 1 - from.y) * tDeltaY : stepY < 0 ? (from.y - ty) * tDeltaY : Infinity
  for (let guard = 0; guard < 256; guard++) {
    if (tx === endX && ty === endY) return true
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX
      tx += stepX
    } else {
      tMaxY += tDeltaY
      ty += stepY
    }
    if (tx === endX && ty === endY) return true
    if (blocksSight(tileAt(level, tx, ty))) return false
  }
  return false
}
