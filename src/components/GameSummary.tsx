import { useEffect, useState } from 'react'
import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react'
import { gameGrade, GRADES } from '../game/scoring'
import type { GameProgress } from '../game/types'
import { gradeTextColor, GradeMedal } from './GradeMedal'
import { Button, Card } from './layout'

type Props = {
  /** Total points (server total when available). */
  total: number
  rounds: number
  progress: GameProgress | null
  onPlayAgain: () => void
  onBack: () => void
}

/**
 * End of game: one animated value drives the number, the golden striped bar and the grade medal,
 * so all three climb in sync (grade starts at F). Bar max = 100 per round (1000 for 10 rounds);
 * going past it plays the overflow effect.
 */
export function GameSummary({ total, rounds, progress, onPlayAgain, onBack }: Props) {
  const reduce = useReducedMotion()
  const max = Math.max(100, rounds * 100)
  const value = useMotionValue(0)
  const [shown, setShown] = useState(0)
  const [finished, setFinished] = useState(false)
  const width = useTransform(value, (v) => `${Math.min(v / max, 1) * 100}%`)
  useMotionValueEvent(value, 'change', (v) => setShown(Math.round(v)))

  useEffect(() => {
    if (reduce) {
      value.set(total)
      setFinished(true)
      return
    }
    const controls = animate(value, total, { duration: Math.min(4.2, 1.6 + total / 450), ease: [0.2, 0.7, 0.3, 1], onComplete: () => setFinished(true) })
    return () => controls.stop()
  }, [reduce, total, value])

  const info = gameGrade(shown, rounds)
  const over = shown > max
  const overBy = shown - max

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Card className="max-w-lg overflow-visible">
        <p className="text-2xl font-extrabold text-ink">🎉 Game over</p>

        <div className="mt-2 flex min-h-[230px] items-end justify-center">
          <GradeMedal info={info} size="lg" />
        </div>

        <p className="mt-2 text-6xl font-black tabular-nums" style={{ color: gradeTextColor(info.tone) }}>
          {shown.toLocaleString('en-US')}
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">total points</p>

        {/* golden frame, dark track, green striped fill (no stars) */}
        <div className="relative mt-6">
          <div className="rounded-full bg-[linear-gradient(180deg,#fff3c4,#e8b43a_45%,#a8741a)] p-[5px] shadow-[0_6px_16px_-6px_rgba(168,116,26,0.7),inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="relative h-7 overflow-hidden rounded-full bg-[#2f2b3a] shadow-[inset_0_3px_6px_rgba(0,0,0,0.55)]">
              <motion.div className="absolute inset-y-0 left-0 overflow-hidden rounded-full" style={{ width }}>
                <div
                  className={`absolute inset-0 ${reduce ? '' : 'animate-[bar-stripes_1.2s_linear_infinite]'}`}
                  style={{
                    background: over
                      ? 'repeating-linear-gradient(135deg,#ffd75e 0 10px,#f0b429 10px 20px)'
                      : 'repeating-linear-gradient(135deg,#86dc5a 0 10px,#5dbb3b 10px 20px)',
                    backgroundSize: '40px 100%',
                  }}
                />
                <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/45 to-white/0" />
              </motion.div>
              {/* grade threshold ticks */}
              {GRADES.filter((g) => g.min > 0 && g.min < 100).map((g) => (
                <span key={g.grade} className="absolute inset-y-1 w-px bg-white/25" style={{ left: `${g.min}%` }} />
              ))}
              {/* light sweep once full */}
              {over && !reduce && (
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-[bar-sweep_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              )}
            </div>
          </div>
          <div className="relative mt-1 h-4 text-[10px] font-bold text-muted">
            <span className="absolute left-0">0</span>
            {GRADES.filter((g) => g.min > 0 && g.min < 100).map((g) => (
              <span key={g.grade} className="absolute -translate-x-1/2" style={{ left: `${g.min}%`, color: gradeTextColor(g.tone) }}>
                {g.grade}
              </span>
            ))}
            <span className="absolute right-0" style={{ color: gradeTextColor('rainbow') }}>
              S · {max.toLocaleString('en-US')}
            </span>
          </div>

          {/* overflow: flash, sparkle burst at the end, bouncy chip */}
          <AnimatePresence>
            {over && (
              <>
                {!reduce && (
                  <motion.div
                    key="flash"
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[38px] rounded-full bg-amber-200"
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.7 }}
                  />
                )}
                {!reduce &&
                  Array.from({ length: 12 }, (_, i) => {
                    const a = (i / 12) * Math.PI * 2
                    return (
                      <motion.span
                        key={`b${i}`}
                        aria-hidden
                        className="pointer-events-none absolute right-2 top-3 text-amber-400"
                        style={{ fontSize: 10 + (i % 3) * 5 }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                        animate={{ x: Math.cos(a) * 46, y: Math.sin(a) * 34, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
                        transition={{ duration: 0.9, delay: (i % 4) * 0.05 }}
                      >
                        ✦
                      </motion.span>
                    )
                  })}
                <motion.div
                  key="chip"
                  className="absolute -top-9 right-0 rounded-full bg-gradient-to-r from-amber-300 to-pink-300 px-3 py-1 text-sm font-extrabold text-ink shadow-md"
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 12 }}
                >
                  +{overBy.toLocaleString('en-US')} over the top!
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-4 text-sm font-semibold text-muted">
          {rounds} round{rounds === 1 ? '' : 's'} played
        </p>

        <AnimatePresence>
          {finished && progress?.newHighScore && (
            <motion.div
              key="hs"
              className="mx-auto mt-3 w-fit rounded-full bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-4 py-1.5 text-sm font-extrabold text-amber-800 shadow-sm ring-1 ring-amber-300"
              initial={{ y: 10, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
            >
              ★ New album high score! ★
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button onClick={onPlayAgain}>Play again</Button>
          <Button tone="quiet" onClick={onBack}>
            Back to album
          </Button>
        </div>
      </Card>
    </main>
  )
}
