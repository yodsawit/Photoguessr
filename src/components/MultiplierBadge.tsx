import { AnimatePresence, motion } from 'motion/react'

export function MultiplierBadge({ value }: { value: number }) {
  return (
    <div className="flex h-12 items-center gap-1.5 rounded-2xl border border-butter bg-white/90 px-3 shadow-sm" aria-label={`Bonus ${value.toFixed(1)} times`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bonus</span>
      <span className="relative inline-flex w-12 justify-center overflow-hidden text-lg font-extrabold tabular-nums text-ink">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            ×{value.toFixed(1)}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
