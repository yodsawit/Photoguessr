// Adapted from Aceternity UI "Moving Border" (https://ui.aceternity.com/components/moving-border).
// Changes: typed props (no `any`), light theme (white face, coral glow), sized by the caller,
// disabled state renders a calm static button, and the glow stops for prefers-reduced-motion.
import React, { useRef } from 'react'
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { cn } from '../../lib/utils'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  borderRadius?: string
  duration?: number
  containerClassName?: string
  borderClassName?: string
}

export function MovingBorderButton({
  borderRadius = '1rem',
  children,
  containerClassName,
  borderClassName,
  duration = 3000,
  className,
  disabled,
  ...otherProps
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'relative h-12 overflow-hidden bg-transparent p-[2px] font-bold transition-transform active:scale-[0.98] disabled:cursor-not-allowed',
        containerClassName,
      )}
      style={{ borderRadius }}
      {...otherProps}
    >
      {!disabled && (
        <div className="absolute inset-0" style={{ borderRadius: `calc(${borderRadius} * 0.96)` }}>
          <MovingBorder duration={duration} rx="30%" ry="30%">
            <div className={cn('h-20 w-20 bg-[radial-gradient(#E98C6B_40%,transparent_60%)] opacity-90', borderClassName)} />
          </MovingBorder>
        </div>
      )}
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center gap-2 border text-base antialiased backdrop-blur-xl',
          disabled ? 'border-sand bg-sand/90 text-muted' : 'border-peach/60 bg-white/90 text-ink',
          className,
        )}
        style={{ borderRadius: `calc(${borderRadius} * 0.96)` }}
      >
        {children}
      </div>
    </button>
  )
}

function MovingBorder({ children, duration = 3000, rx, ry }: { children: React.ReactNode; duration?: number; rx?: string; ry?: string }) {
  const pathRef = useRef<SVGRectElement>(null)
  const progress = useMotionValue<number>(0)
  const reduce = useReducedMotion()

  useAnimationFrame((time) => {
    if (reduce) return
    const length = pathRef.current?.getTotalLength()
    if (length) progress.set((time * (length / duration)) % length)
  })

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).x ?? 0)
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).y ?? 0)
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`

  return (
    <>
      <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="absolute h-full w-full" width="100%" height="100%">
        <rect fill="none" width="100%" height="100%" rx={rx} ry={ry} ref={pathRef} />
      </svg>
      <motion.div style={{ position: 'absolute', top: 0, left: 0, display: 'inline-block', transform }}>{children}</motion.div>
    </>
  )
}
