/**
 * Game audio: CC0 sound effects (`sfx.ts`), quiet background music and the synthesized countdown tick.
 * iOS/Safari only allow audio after a user gesture, so `unlock()` is called from the Start click;
 * the effect files are fetched and decoded then. Every call is a silent no-op when audio is
 * unavailable, locked, still loading or muted, and never throws.
 */
import { MUSIC_FILE, MUSIC_VOLUME, SFX, SFX_NAMES, type SfxName } from './sfx'

const MUTE_KEY = 'photoguessr.muted'
const MUSIC_KEY = 'photoguessr.music'

const readFlag = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}
const writeFlag = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* not remembered in private mode */
  }
}

let ctx: AudioContext | null = null
let sfxGain: GainNode | null = null
let musicGain: GainNode | null = null
let musicEl: HTMLAudioElement | null = null
let musicWanted = false
let muted = readFlag(MUTE_KEY, false)
let musicOn = readFlag(MUSIC_KEY, true)
const buffers = new Map<SfxName, AudioBuffer>()
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

const running = () => !!ctx && ctx.state === 'running'

function loadAll(c: AudioContext) {
  loading ??= Promise.all(
    SFX_NAMES.map(async (name) => {
      try {
        const res = await fetch(SFX[name].file)
        if (!res.ok) return
        buffers.set(name, await c.decodeAudioData(await res.arrayBuffer()))
      } catch {
        /* one missing sound never breaks the game */
      }
    }),
  ).then(() => undefined)
}

/** Music level the gain should head to right now. */
const musicTarget = () => (musicWanted && musicOn && !muted ? MUSIC_VOLUME : 0)

function applyMusic(fadeSeconds = 0.6) {
  if (!ctx || !musicGain || !musicEl) return
  const t = ctx.currentTime
  const target = musicTarget()
  musicGain.gain.cancelScheduledValues(t)
  musicGain.gain.setValueAtTime(musicGain.gain.value, t)
  musicGain.gain.linearRampToValueAtTime(target, t + fadeSeconds)
  if (target > 0) void musicEl.play().catch(() => undefined)
  else window.setTimeout(() => musicTarget() === 0 && musicEl?.pause(), fadeSeconds * 1000 + 50)
}

export const sound = {
  unlock() {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      if (!ctx) {
        ctx = new Ctor()
        sfxGain = ctx.createGain()
        sfxGain.connect(ctx.destination)
      }
      if (ctx.state === 'suspended') void ctx.resume()
      loadAll(ctx)
    } catch {
      /* no audio available: the game works silently */
    }
  },

  /**
   * Play one effect. `rate` changes speed and pitch together; `volume` scales the catalogue level.
   * Returns a function that stops it (quick fade), or null if nothing played.
   */
  play(name: SfxName, opts: { rate?: number; volume?: number } = {}): (() => void) | null {
    if (muted || !ctx || !sfxGain || !running()) return null
    const buffer = buffers.get(name)
    if (!buffer) return null
    try {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = opts.rate ?? 1
      const gain = ctx.createGain()
      gain.gain.value = SFX[name].volume * (opts.volume ?? 1)
      src.connect(gain).connect(sfxGain)
      src.start()
      if (import.meta.env.DEV) console.debug('[sfx]', name)
      const c = ctx
      return () => {
        try {
          gain.gain.setTargetAtTime(0, c.currentTime, 0.03)
          src.stop(c.currentTime + 0.15)
        } catch {
          /* already finished */
        }
      }
    } catch {
      return null
    }
  },

  /** Soft blip for the last seconds: 660 Hz for 10..4 s, a touch higher (880 Hz) for the last 3. */
  tick(secondsLeft: number) {
    if (muted || !ctx || !running()) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = secondsLeft <= 3 ? 880 : 660
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)
  },

  /** Background music for a running game (loops; fades in/out). Streams, so it isn't decoded into memory. */
  startMusic() {
    musicWanted = true
    if (!ctx) return
    try {
      if (!musicEl) {
        musicEl = new Audio(MUSIC_FILE)
        musicEl.loop = true
        musicEl.preload = 'auto'
        musicGain = ctx.createGain()
        musicGain.gain.value = 0
        // Routed through Web Audio: iOS ignores <audio>.volume, but a GainNode works everywhere.
        ctx.createMediaElementSource(musicEl).connect(musicGain).connect(ctx.destination)
      }
      applyMusic(1.5)
    } catch {
      /* ignore */
    }
  },
  stopMusic() {
    musicWanted = false
    applyMusic(1)
  },

  isMuted: () => muted,
  setMuted(value: boolean) {
    muted = value
    writeFlag(MUTE_KEY, value)
    applyMusic()
    listeners.forEach((l) => l())
  },
  isMusicOn: () => musicOn,
  setMusicOn(value: boolean) {
    musicOn = value
    writeFlag(MUSIC_KEY, value)
    applyMusic()
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
}
