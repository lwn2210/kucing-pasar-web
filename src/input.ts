import type { CatInput } from './sim/physics'

// Keyboard and on-screen buttons, folded into one CatInput per tick.

export class Controls {
  private keys = new Set<string>()
  private touch = { left: false, right: false, jump: false, crouch: false }
  onPause: (() => void) | null = null

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.onPause?.()
      this.keys.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.clear())
    for (const [id, key] of [
      ['btn-left', 'left'],
      ['btn-right', 'right'],
      ['btn-jump', 'jump'],
      ['btn-crouch', 'crouch'],
    ] as const) {
      const el = document.getElementById(id)
      if (!el) continue
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        el.setPointerCapture(e.pointerId)
        el.classList.add('held')
        this.touch[key] = true
      })
      const up = () => {
        el.classList.remove('held')
        this.touch[key] = false
      }
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    }
  }

  clear(): void {
    this.keys.clear()
    this.touch = { left: false, right: false, jump: false, crouch: false }
    document.querySelectorAll('.touch .held').forEach((el) => el.classList.remove('held'))
  }

  read(): CatInput {
    const k = this.keys
    return {
      left: k.has('ArrowLeft') || k.has('KeyA') || this.touch.left,
      right: k.has('ArrowRight') || k.has('KeyD') || this.touch.right,
      jump: k.has('Space') || k.has('ArrowUp') || k.has('KeyW') || this.touch.jump,
      crouch: k.has('ArrowDown') || k.has('KeyS') || this.touch.crouch,
    }
  }
}
