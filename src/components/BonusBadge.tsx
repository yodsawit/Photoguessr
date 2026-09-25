import { AnimatePresence, motion } from 'motion/react'

/** Live "Points" % while playing: the % kept by the cards that are still hidden. */
export function BonusBadge({ pct }: { pct: number }) {
  return (
    <div className="flex h-12 items-center gap-1.5 rounded-2xl border border-butter bg-white/90 px-3 shadow-sm" aria-label={`Points ${pct} percent`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Points</span>
      <span className="relative inline-flex w-16 justify-center overflow-hidden text-lg font-extrabold tabular-nums text-ink">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={pct}
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            {pct}%
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
