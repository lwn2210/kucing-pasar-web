import { LEVELS } from './levels'

/** Untrusted local storage must never prevent the level menu from opening. */
export function parseStars(raw: string | null): Record<string, number> {
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const saved = value as Record<string, unknown>
    const stars: Record<string, number> = {}
    for (const level of LEVELS) {
      const n = saved[level.id]
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 3) stars[level.id] = n
    }
    return stars
  } catch {
    return {}
  }
}
