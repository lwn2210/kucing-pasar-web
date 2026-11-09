// Tuning. Distances are in tiles (y grows downward), times in seconds.

export const TICK_RATE = 60
export const DT = 1 / TICK_RATE

export const GRAVITY = 55
export const MAX_FALL = 18

export const CAT = {
  width: 0.8,
  height: 0.6,
  crouchHeight: 0.4,
  runSpeed: 7,
  sneakSpeed: 2.8,
  groundAccel: 70,
  airAccel: 38,
  jumpSpeed: 15.9,
  /** Releasing jump early cuts the rise to this fraction. */
  jumpCut: 0.45,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  /** Each fish in the mouth slows the cat a little. */
  fishDrag: 0.04,
  hurtTime: 2,
}

export const IBU = {
  width: 0.7,
  height: 1.8,
  eyeHeight: 1.55,
  walkSpeed: 1.6,
  chaseSpeed: 4.6,
  pauseTime: 1.2,
  sight: 6.5,
  /** Detection per second at point-blank range, standing cat. */
  noticeRate: 1.3,
  forgetRate: 0.45,
  suspicious: 0.3,
  giveUpTime: 3,
  searchTime: 2,
  reach: 1.15,
  swingWindup: 0.35,
  swingCooldown: 0.9,
  /** After a hit she stops to scold, which gives the cat a head start. */
  scoldTime: 1.5,
}

export const LIVES = 3
