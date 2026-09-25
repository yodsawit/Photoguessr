/**
 * Sound catalogue. Every file in `public/sfx/` is CC0 (credited in CREDITS.md) or made for this
 * project; GeoGuessr's own sounds are copyrighted and never used. Swap a sound by replacing its mp3.
 */
export const SFX_NAMES = [
  'pin', 'guess', 'card', 'count', 'pinpoint',
  'grade-low', 'grade-mid', 'grade-high', 'grade-s',
  'bar', 'overflow', 'medal-low', 'medal-mid', 'medal-high', 'medal-s',
  'alarm',
] as const
export type SfxName = (typeof SFX_NAMES)[number]

const VOLUME: Record<SfxName, number> = {
  pin: 0.55, guess: 0.5, card: 0.6, count: 0.25, pinpoint: 0.6,
  'grade-low': 0.5, 'grade-mid': 0.55, 'grade-high': 0.6, 'grade-s': 0.65,
  bar: 0.3, overflow: 0.55, 'medal-low': 0.55, 'medal-mid': 0.6, 'medal-high': 0.65, 'medal-s': 0.7,
  alarm: 0.6,
}

export const SFX: Record<SfxName, { file: string; volume: number }> = Object.fromEntries(
  SFX_NAMES.map((n) => [n, { file: `/sfx/${n}.mp3`, volume: VOLUME[n] }]),
) as Record<SfxName, { file: string; volume: number }>

/** The alarm rings over the last seconds of a round (the file is exactly this long). */
export const ALARM_SECONDS = 2

/** Background music while a game runs: calm piano + pads, kept quiet under the effects. */
export const MUSIC_FILE = '/sfx/music.mp3'
export const MUSIC_VOLUME = 0.12

/** Round grade sound by grade tier (F, D = 0, 1 … S = 6). */
export function gradeSound(tier: number): SfxName {
  if (tier >= 6) return 'grade-s'
  if (tier >= 4) return 'grade-high'
  if (tier >= 2) return 'grade-mid'
  return 'grade-low'
}

/** Game-over medal jingle by grade tier. */
export function medalSound(tier: number): SfxName {
  if (tier >= 6) return 'medal-s'
  if (tier >= 4) return 'medal-high'
  if (tier >= 2) return 'medal-mid'
  return 'medal-low'
}

/** Playback rate of the bar tick: 0.8 when empty, 1.6 at the max, still rising past it (cap 2). */
export function barTickRate(fraction: number): number {
  return Math.min(2, 0.8 + 0.8 * Math.max(0, fraction))
}

/** Returns a function that says true at most once per `ms`. */
export function createThrottle(ms: number, now: () => number = () => performance.now()) {
  let last = -Infinity
  return () => {
    const t = now()
    if (t - last < ms) return false
    last = t
    return true
  }
}
