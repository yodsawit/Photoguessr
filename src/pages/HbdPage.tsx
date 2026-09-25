import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '../components/layout'

type Props = {
  /** Local object URL of the gift photo (fetched with the surprise key). */
  imageUrl: string
  onBack: () => void
}

const CONFETTI = ['#f7b79b', '#e98c6b', '#9dbf9e', '#a7cde6', '#f6de9c', '#e8b4d8']

/**
 * Birthday surprise: shown instead of the round result when the gift round is guessed.
 * A wrapped present opens by itself (or on tap) and reveals the gift photo, with soft confetti.
 */
export default function HbdPage({ imageUrl, onBack }: Props) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)

  // Opens by itself after a moment; tapping only makes it faster (never gated on a tap).
  useEffect(() => {
    const id = window.setTimeout(() => setOpen(true), reduce ? 0 : 1400)
    return () => window.clearTimeout(id)
  }, [reduce])

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-peach/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-sky/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-1/4 top-1/3 h-56 w-56 rounded-full bg-sage/25 blur-3xl" />
      {open && !reduce && <FallingConfetti />}

      <motion.h1
        initial={{ opacity: 0, y: -16, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        className="relative bg-gradient-to-r from-coral via-[#e8a0c8] to-sky-deep bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-6xl"
      >
        Happy Birthday!
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="relative mt-2 text-3xl" aria-hidden>
        🎂🎈🥳
      </motion.p>

      <div className="relative mt-6 flex w-full max-w-[min(88vw,26rem)] items-center justify-center" style={{ minHeight: 'min(88vw, 26rem)' }}>
        <AnimatePresence>
          {!open && (
            <motion.button
              key="box"
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open your present"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={reduce ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1, rotate: [0, -4, 4, -3, 3, 0] }}
              exit={{ scale: 1.25, opacity: 0, y: -30 }}
              transition={{ rotate: { repeat: Infinity, duration: 1.1, repeatDelay: 0.2 }, default: { duration: 0.35 } }}
              className="absolute flex h-48 w-48 cursor-pointer items-center justify-center rounded-3xl bg-peach shadow-[0_18px_40px_-16px_rgba(233,140,107,0.7)] outline-none focus-visible:ring-4 focus-visible:ring-coral/50"
            >
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 bg-sage/90" />
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 bg-sage/90" />
              <span aria-hidden className="absolute -top-9 text-6xl">
                🎀
              </span>
              <span className="relative mt-32 rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-coral shadow-sm">Tap to open</span>
            </motion.button>
          )}
        </AnimatePresence>

        {open && (
          <motion.figure
            initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: -2 }}
            transition={{ type: 'spring', stiffness: 160, damping: 13, delay: reduce ? 0 : 0.15 }}
            className="relative w-full rounded-3xl bg-white p-3 pb-4 shadow-[0_22px_50px_-20px_rgba(120,90,60,0.45)] ring-1 ring-sand"
          >
            <img src={imageUrl} alt="Your birthday present" className="aspect-square w-full rounded-2xl object-cover" />
            <figcaption className="mt-3 text-lg font-extrabold text-ink">Your present 🎁</figcaption>
            {!reduce && <Burst />}
          </motion.figure>
        )}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ delay: 0.8 }} className="relative mt-8 w-full max-w-sm">
        <p className="mb-4 font-bold text-muted">This round wasn't a place. It was for you 💝</p>
        <Button tone="coral" onClick={onBack}>
          Back to album
        </Button>
      </motion.div>
    </main>
  )
}

/** Soft pastel confetti drifting down the whole screen, looping. */
function FallingConfetti() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute -top-4 block h-3 w-2 rounded-sm"
          style={{ left: `${(i * 37 + 5) % 100}%`, background: CONFETTI[i % CONFETTI.length] }}
          initial={{ y: -20, rotate: 0, opacity: 0 }}
          animate={{ y: '105vh', rotate: 360 + i * 40, opacity: [0, 1, 1, 0.8] }}
          transition={{ duration: 4 + (i % 5) * 0.7, delay: (i % 7) * 0.45, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  )
}

/** One sparkle burst around the photo as it pops out of the box. */
function Burst() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2
        return (
          <motion.span
            key={i}
            className="absolute text-amber-300"
            style={{ fontSize: 14 + (i % 3) * 6 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(a) * 200, y: Math.sin(a) * 200, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
            transition={{ duration: 1.1, delay: 0.2 + (i % 4) * 0.05, ease: 'easeOut' }}
          >
            ✦
          </motion.span>
        )
      })}
    </div>
  )
}
