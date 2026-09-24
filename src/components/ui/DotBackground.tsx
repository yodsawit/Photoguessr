// Adapted from Aceternity UI "Grid and Dot Backgrounds" — Dot Background
// (https://ui.aceternity.com/components/grid-and-dot-backgrounds).
// Changes: fixed full-viewport layer, warm cream palette instead of white/neutral, light only,
// plus two soft pastel glows.
import { cn } from '../../lib/utils'

export function DotBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10 bg-cream', className)}>
      <div className="absolute inset-0 [background-size:22px_22px] [background-image:radial-gradient(#E4D8C4_1.2px,transparent_1.2px)]" />
      {/* Radial fade so the dots soften toward the center, as in the original. */}
      <div className="absolute inset-0 bg-cream [mask-image:radial-gradient(ellipse_at_center,transparent_25%,black)]" />
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-peach/30 blur-3xl" />
      <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-sage/30 blur-3xl" />
    </div>
  )
}
