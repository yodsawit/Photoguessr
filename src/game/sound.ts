/**
 * Tiny Web Audio synth for the countdown tick — no audio files. Kept deliberately quiet.
 * iOS/Safari only allow audio after a user gesture, so `unlock()` is called from the Start click.
 */
const MUTE_KEY = 'photoguessr.muted'

let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()

export const sound = {
  unlock() {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx ??= new Ctor()
      if (ctx.state === 'suspended') void ctx.resume()
    } catch {
      /* no audio available: the game works silently */
    }
  },

  /** Soft blip for the last seconds: 660 Hz for 10..4 s, a touch higher (880 Hz) for the last 3. */
  tick(secondsLeft: number) {
    if (muted || !ctx || ctx.state !== 'running') return
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

  isMuted: () => muted,
  setMuted(value: boolean) {
    muted = value
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0')
    } catch {
      /* not remembered in private mode */
    }
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
}
