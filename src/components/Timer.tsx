import { ROUND_SECONDS } from '../game/scoring'
import { cn } from '../lib/utils'

const R = 20
const CIRCUMFERENCE = 2 * Math.PI * R

export function Timer({ remainingMs }: { remainingMs: number }) {
  const fraction = remainingMs / (ROUND_SECONDS * 1000)
  const seconds = Math.ceil(remainingMs / 1000)
  const urgent = seconds <= 10

  return (
    <div className="relative h-12 w-12 shrink-0" role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
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
          className="transition-[stroke-dashoffset,stroke] duration-100 ease-linear"
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums',
          urgent ? 'text-coral' : 'text-ink',
          urgent && seconds > 0 && 'motion-safe:animate-pulse',
        )}
      >
        {seconds}
      </span>
    </div>
  )
}
