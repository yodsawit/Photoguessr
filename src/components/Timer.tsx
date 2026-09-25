import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { TIME_PER_TILE_SECONDS } from '../game/scoring'
import { sound } from '../game/sound'
import { ALARM_SECONDS } from '../game/sfx'
import { cn } from '../lib/utils'

const R = 20
const CIRCUMFERENCE = 2 * Math.PI * R
const URGENT_SECONDS = 10

type Props = {
  remainingMs: number
  /** Clock length so far (ROUND_SECONDS + TIME_PER_TILE_SECONDS per opened card). */
  totalMs: number
  /** Number of opened cards; each increase shows a "+10s" pop. */
  bonusCount: number
}

export function Timer({ remainingMs, totalMs, bonusCount }: Props) {
  const reduce = useReducedMotion()
  const fraction = Math.min(1, remainingMs / totalMs)
  const seconds = Math.ceil(remainingMs / 1000)
  const urgent = seconds <= URGENT_SECONDS

  // Soft tick once per whole second in the last 10 s (stops if a per-card time bonus lifts the clock),
  // then a Gartic-style alarm rings over the last ALARM_SECONDS instead of ticks.
  const lastTicked = useRef<number | null>(null)
  const stopAlarm = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (seconds > ALARM_SECONDS && stopAlarm.current) {
      stopAlarm.current() // a card added time: silence the alarm
      stopAlarm.current = null
    }
    if (!urgent || seconds <= 0 || lastTicked.current === seconds) return
    lastTicked.current = seconds
    if (seconds > ALARM_SECONDS) sound.tick(seconds)
    else if (!stopAlarm.current) stopAlarm.current = sound.play('alarm')
  }, [seconds, urgent])
  // Guessing (or the round ending) unmounts the timer: stop the alarm with it.
  useEffect(() => () => stopAlarm.current?.(), [])

  // "+10s" pops: one per newly opened card.
  const [pops, setPops] = useState<number[]>([])
  const seen = useRef(bonusCount)
  useEffect(() => {
    if (bonusCount <= seen.current) return
    seen.current = bonusCount
    const id = bonusCount
    setPops((p) => [...p, id])
    const t = setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 1100)
    return () => clearTimeout(t)
  }, [bonusCount])

  return (
    <div className="relative h-12 w-12 shrink-0" role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 48 48" className={cn('h-full w-full -rotate-90 transition-[filter] duration-300', urgent && 'drop-shadow-[0_0_6px_rgba(233,140,107,0.55)]')}>
        <circle cx="24" cy="24" r={R} fill="white" stroke="var(--color-sand)" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke={urgent ? 'var(--color-coral)' : 'var(--color-sage)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset,stroke] duration-200 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <motion.span
          key={urgent ? seconds : 'calm'}
          initial={urgent && !reduce ? { scale: 1.35 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className={cn('text-sm font-extrabold tabular-nums', urgent ? 'text-coral' : 'text-ink')}
        >
          {seconds}
        </motion.span>
      </span>
      <AnimatePresence>
        {pops.map((id) => (
          <motion.span
            key={id}
            aria-hidden
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: -22, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : -34 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-sage-deep px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white shadow-sm"
          >
            +{TIME_PER_TILE_SECONDS}s
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}

const toggleClass = 'flex h-11 w-11 items-center justify-center rounded-2xl border border-sand bg-white/90 text-lg shadow-sm active:scale-95'

/** 🔊 / 🔇 for every sound (effects, music, countdown); remembered per device. */
export function MuteToggle() {
  const muted = useSyncExternalStore(sound.subscribe, sound.isMuted)
  return (
    <button
      type="button"
      onClick={() => sound.setMuted(!muted)}
      aria-label={muted ? 'Turn sound on' : 'Mute all sound'}
      aria-pressed={muted}
      className={toggleClass}
    >
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
    </button>
  )
}

/** 🎵 background music on/off (effects stay on); remembered per device. */
export function MusicToggle() {
  const on = useSyncExternalStore(sound.subscribe, sound.isMusicOn)
  return (
    <button
      type="button"
      onClick={() => sound.setMusicOn(!on)}
      aria-label={on ? 'Turn music off' : 'Turn music on'}
      aria-pressed={on}
      className={cn(toggleClass, !on && 'opacity-45')}
    >
      <span aria-hidden>🎵</span>
    </button>
  )
}

export function SoundToggles() {
  return (
    <div className="flex items-center gap-2">
      <MusicToggle />
      <MuteToggle />
    </div>
  )
}
