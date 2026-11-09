import './style.css'
import { Sfx } from './audio'
import { Controls } from './input'
import { LEVELS } from './levels'
import { Renderer, type Pose } from './render/renderer'
import { DT, LIVES } from './sim/constants'
import { createGame, step, type GameEvent, type GameState } from './sim/game'

// Menu, level flow and the fixed-step loop. The sim runs at 60 Hz; the cat
// and vendors are drawn interpolated between ticks.

const PROGRESS_KEY = 'kucing-pasar.stars'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!

const LINES = {
  suspicious: ['Hmm?', 'Eh?', 'Apaan tuh?'],
  alert: ['Hus! Hus!', 'Kucing siapa nih?!', 'Awas ya kamu!', 'Ikanku!'],
  giveUp: ['Ke mana tuh kucing…', 'Huh, kabur.', 'Awas aja nanti.'],
  scold: ['Rasain!', 'Kapok nggak?!', 'Dasar kucing oren!'],
}

function loadStars(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function saveStars(stars: Record<string, number>): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(stars))
  } catch {
    // Progress just isn't kept.
  }
}

const starRow = (n: number) => [0, 1, 2].map((i) => (i < n ? '★' : '<span class="off">★</span>')).join('')

class App {
  private readonly renderer: Renderer
  private readonly controls = new Controls()
  private readonly sfx = new Sfx()
  private state: GameState | null = null
  private levelIndex = 0
  private paused = false
  private stars = loadStars()
  private accumulator = 0
  private last = performance.now()
  private time = 0
  private prevCat: Pose = { x: 0, y: 0 }
  private prevVendors: Pose[] = []
  private bannerUntil = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas)
    const touch = matchMedia('(pointer: coarse)')
    const layout = () => {
      this.renderer.bottomReserve = touch.matches && window.innerHeight > window.innerWidth ? 130 : 0
      this.renderer.resize()
    }
    window.addEventListener('resize', layout)
    layout()
    this.controls.onPause = () => this.togglePause()
    this.bindUi()
    this.showMenu()
    // A level runs behind the menu as a backdrop.
    this.load(0, false)
    requestAnimationFrame(() => this.frame())
  }

  private bindUi(): void {
    $('pause').addEventListener('click', () => this.togglePause())
    $('resume').addEventListener('click', () => this.togglePause())
    $('restart').addEventListener('click', () => this.load(this.levelIndex, true))
    $('again').addEventListener('click', () => this.load(this.levelIndex, true))
    $('next').addEventListener('click', () => this.load(this.levelIndex + 1, true))
    $('quit').addEventListener('click', () => this.showMenu())
    $('to-menu').addEventListener('click', () => this.showMenu())
    const mute = $('mute')
    const showMute = () => (mute.textContent = this.sfx.muted ? '🔇' : '🔊')
    showMute()
    mute.addEventListener('click', () => {
      this.sfx.toggleMute()
      showMute()
    })
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        this.sfx.toggleMute()
        showMute()
      }
    })
  }

  private showOnly(id: 'menu' | 'pause-menu' | 'result' | null): void {
    for (const o of ['menu', 'pause-menu', 'result'] as const) $(o).hidden = o !== id
    $('hud').hidden = id === 'menu'
  }

  private showMenu(): void {
    this.paused = false
    this.showOnly('menu')
    this.sfx.ambience(false, false)
    const list = $('levels')
    list.innerHTML = ''
    LEVELS.forEach((def, i) => {
      const unlocked = i === 0 || (this.stars[LEVELS[i - 1]!.id] ?? 0) > 0
      const btn = document.createElement('button')
      btn.className = 'level'
      btn.disabled = !unlocked
      btn.innerHTML = `<b>${i + 1}. ${def.name}</b><span class="stars-small">${starRow(this.stars[def.id] ?? 0)}</span><small>${
        unlocked ? def.subtitle : 'Selesaikan level sebelumnya dulu.'
      }</small>`
      btn.addEventListener('click', () => this.load(i, true))
      list.appendChild(btn)
    })
  }

  private load(index: number, play: boolean): void {
    const def = LEVELS[index]
    if (!def) return this.showMenu()
    this.levelIndex = index
    this.state = createGame(def, (Math.random() * 2 ** 32) >>> 0)
    this.renderer.reset(this.state)
    this.capturePrev()
    this.accumulator = 0
    this.paused = false
    this.controls.clear()
    if (!play) return
    this.showOnly(null)
    $('level-name').textContent = `${index + 1}. ${def.name}`
    this.updateHud()
    this.banner(def.name, def.subtitle, 2.6)
    this.sfx.ambience(true, def.night ?? false)
  }

  private togglePause(): void {
    if (!this.state || this.state.phase !== 'playing' || !$('menu').hidden) return
    this.paused = !this.paused
    this.showOnly(this.paused ? 'pause-menu' : null)
    this.controls.clear()
  }

  private banner(main: string, sub: string, seconds: number): void {
    $('banner-main').textContent = main
    $('banner-sub').textContent = sub
    $('banner').classList.add('show')
    this.bannerUntil = this.time + seconds
  }

  private updateHud(): void {
    const s = this.state
    if (!s) return
    $('lives').innerHTML = Array.from({ length: LIVES }, (_, i) => (i < s.cat.lives ? '♥' : '<span class="gone">♥</span>')).join('')
    $('fish').textContent = `${s.cat.fish.length}/${s.level.fish.length}`
  }

  private capturePrev(): void {
    const s = this.state
    if (!s) return
    this.prevCat = { x: s.cat.x, y: s.cat.y }
    this.prevVendors = s.vendors.map((v) => ({ x: v.x, y: v.y }))
  }

  private frame(): void {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.time += dt
    const s = this.state
    const live = !$('hud').hidden && !this.paused
    if (s && live && s.phase === 'playing') {
      this.accumulator += dt
      while (this.accumulator >= DT && s.phase === 'playing') {
        this.capturePrev()
        for (const e of step(s, this.controls.read())) this.onEvent(e)
        this.accumulator -= DT
      }
    }
    if (this.time > this.bannerUntil) $('banner').classList.remove('show')
    if (s) {
      const a = live ? Math.min(1, this.accumulator / DT) : 1
      const lerp = (p: Pose, x: number, y: number): Pose => ({ x: p.x + (x - p.x) * a, y: p.y + (y - p.y) * a })
      const cat = lerp(this.prevCat, s.cat.x, s.cat.y)
      const vendors = s.vendors.map((v, i) => lerp(this.prevVendors[i] ?? v, v.x, v.y))
      this.renderer.draw(s, cat, vendors, this.time, live ? dt : 0)
    }
    requestAnimationFrame(() => this.frame())
  }

  private onEvent(e: GameEvent): void {
    const s = this.state!
    const r = this.renderer
    switch (e.type) {
      case 'jump':
        this.sfx.jump()
        r.burst(s.cat.x, s.cat.y, 'dust', 4)
        break
      case 'land':
        this.sfx.land(e.impact)
        r.burst(s.cat.x, s.cat.y, 'dust', 6)
        break
      case 'fish': {
        const f = s.level.fish[e.index]!
        this.sfx.fish()
        r.burst(f.x, f.y, 'spark', 14)
        this.updateHud()
        break
      }
      case 'suspicious':
        this.sfx.suspicious()
        r.say(e.vendor, pick(LINES.suspicious), this.time)
        break
      case 'alert':
        this.sfx.alert()
        r.say(e.vendor, pick(LINES.alert), this.time)
        break
      case 'giveUp':
        this.sfx.giveUp()
        r.say(e.vendor, pick(LINES.giveUp), this.time)
        break
      case 'swing':
        this.sfx.swing()
        r.swing(e.vendor, this.time)
        break
      case 'scold':
        r.say(e.vendor, pick(LINES.scold), this.time)
        break
      case 'hurt':
        this.sfx.hurt()
        this.updateHud()
        this.banner('Aduh!', e.lostFish !== null ? 'Kena sapu, ikannya jatuh.' : 'Kena sapu.', 1.2)
        break
      case 'emptyHanded':
        this.sfx.nope()
        this.banner('Bawa ikan dulu!', 'Masa pulang dengan tangan kosong.', 1.6)
        break
      case 'won':
        this.sfx.won()
        this.sfx.ambience(false, false)
        this.finish(true, e.stars)
        break
      case 'lost':
        this.sfx.lost()
        this.sfx.ambience(false, false)
        this.finish(false, 0)
        break
      default:
        break
    }
  }

  private finish(won: boolean, stars: number): void {
    const s = this.state!
    const id = s.level.id
    if (won) {
      this.stars[id] = Math.max(this.stars[id] ?? 0, stars)
      saveStars(this.stars)
    }
    $('result-title').textContent = won ? 'Berhasil kabur!' : 'Ketangkep!'
    $('result-stars').innerHTML = won ? starRow(stars) : ''
    const items = won
      ? [
          ['Kabur bawa ikan', true],
          [`Semua ikan (${s.cat.fish.length}/${s.level.fish.length})`, s.cat.fish.length === s.level.fish.length],
          [s.alerts === 0 ? 'Nggak pernah ketahuan' : `Ketahuan ${s.alerts}×`, s.alerts === 0],
        ]
      : [['Nyawa habis. Besok-besok jangan nekat.', false]]
    $('result-list').innerHTML = items.map(([text, ok]) => `<li class="${ok ? '' : 'off'}">${ok ? '★' : '☆'} ${text}</li>`).join('')
    $('next').hidden = !won || this.levelIndex >= LEVELS.length - 1
    setTimeout(() => this.showOnly('result'), won ? 500 : 900)
  }
}

async function boot(): Promise<void> {
  await Promise.race([document.fonts.load('40px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))])
  const app = new App(document.getElementById('scene') as HTMLCanvasElement)
  if (import.meta.env.DEV) Object.assign(window, { __app: app })
}

void boot()
