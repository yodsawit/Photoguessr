import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { GradeInfo, GradeTone } from '../game/scoring'
import { cn } from '../lib/utils'

/**
 * Grade medal, SVG + CSS only. Grander with each grade (see the tier table in CLAUDE.md):
 * F rusty cracked stone → D flat disc → C bronzy coin → B metallic → A laurel → A+ gold + rays
 * → S crowned rainbow with rotating rays, sparkles and confetti.
 */

type Palette = { light: string; mid: string; dark: string; text: string; glow: string }
export const PALETTE: Record<Exclude<GradeTone, 'rainbow'>, Palette> & { rainbow: Palette } = {
  rust: { light: '#c98458', mid: '#9a5530', dark: '#5e3019', text: '#f1d5c2', glow: 'rgba(154,85,48,0.25)' },
  purple: { light: '#c9a7ec', mid: '#8b5cc4', dark: '#5a3290', text: '#fbf5ff', glow: 'rgba(139,92,196,0.35)' },
  yellow: { light: '#fbe38a', mid: '#e0b53a', dark: '#9c7415', text: '#fffaf0', glow: 'rgba(224,181,58,0.4)' },
  blue: { light: '#a9d3fa', mid: '#4d95dc', dark: '#245f9e', text: '#f4faff', glow: 'rgba(77,149,220,0.45)' },
  green: { light: '#a9e6ad', mid: '#4cae62', dark: '#2a7340', text: '#f3fff4', glow: 'rgba(76,174,98,0.5)' },
  gold: { light: '#ffeaa0', mid: '#e8b43a', dark: '#a8741a', text: '#fffbeb', glow: 'rgba(232,180,58,0.6)' },
  rainbow: { light: '#fff', mid: '#f6a', dark: '#83f', text: '#fff', glow: 'rgba(255,120,200,0.6)' },
}

/** Plain text colour for a grade (chips, labels). */
export function gradeTextColor(tone: GradeTone) {
  return tone === 'rainbow' ? '#d9468f' : PALETTE[tone].mid
}

const RAINBOW = 'conic-gradient(from 0deg, #ff5f6d, #ffc371, #f9f871, #7ee8a2, #5fb8ff, #a47bff, #ff6fd8, #ff5f6d)'

type Props = { info: GradeInfo; size?: 'sm' | 'lg'; className?: string }

export function GradeMedal({ info, size = 'lg', className }: Props) {
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const { tier, tone, grade } = info
  const p = PALETTE[tone]
  const big = size === 'lg'
  // Size grows with the grade: F is small and sad, S is large and grand.
  const disc = (big ? 72 : 34) + tier * (big ? 9 : 2.5)
  const ribbons = [1, 0, 1, 2, 2, 3, 3][tier]

  const entrance = reduce
    ? {}
    : tier === 0
      ? { initial: { rotate: 0, y: -6, scale: 0.9 }, animate: { rotate: [0, 8, -4, 5, 3], y: [-6, 2, 0, 1, 0], scale: 1 }, transition: { duration: 0.9 } }
      : tier === 6
        ? { initial: { scale: 0.3, rotate: -25, opacity: 0 }, animate: { scale: [0.3, 1.25, 1], rotate: 0, opacity: 1 }, transition: { duration: 0.7, ease: 'easeOut' as const } }
        : { initial: { scale: 0.7, rotateY: 90 }, animate: { scale: 1, rotateY: 0 }, transition: { type: 'spring' as const, stiffness: 420, damping: 16 } }

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)} style={{
        width: disc * (big ? 2 : 1.5),
        paddingTop: big && tier === 6 ? disc * 0.34 : 0,
        // reserve room for the ribbon tails so they never overlap what's below
        paddingBottom: ribbons > 0 ? disc * 0.42 : 0,
      }} aria-label={`Grade ${grade}`} role="img">
      {/* light rays behind (A+ soft, S bright) */}
      {big && tier >= 5 && (
        <div
          aria-hidden
          className={cn('pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full', !reduce && 'animate-[medal-spin_18s_linear_infinite]')}
          style={{
            top: (tier === 6 ? disc * 0.34 : 0) + disc / 2 - disc * 1.05,
            width: disc * 2.1,
            height: disc * 2.1,
            opacity: tier === 6 ? 0.85 : 0.45,
            background: `repeating-conic-gradient(from 0deg, ${tier === 6 ? 'rgba(255,215,120,0.55)' : 'rgba(255,220,140,0.45)'} 0deg 7deg, transparent 7deg 22deg)`,
            maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
          }}
        />
      )}

      <motion.div key={grade} className="relative" style={{ width: disc, height: disc }} {...entrance}>
        {/* crown (S) */}
        {tier === 6 && (
          <svg aria-hidden viewBox="0 0 64 40" className="absolute left-1/2 -translate-x-1/2 drop-shadow" style={{ width: disc * 0.62, top: -disc * 0.36 }}>
            <defs>
              <linearGradient id={`cr${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff3b0" />
                <stop offset="1" stopColor="#e0a21a" />
              </linearGradient>
            </defs>
            <path d="M4 34 L8 10 L22 24 L32 4 L42 24 L56 10 L60 34 Z" fill={`url(#cr${uid})`} stroke="#a8741a" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="32" cy="6" r="3.5" fill="#ff6fd8" />
            <circle cx="8" cy="10" r="3" fill="#5fb8ff" />
            <circle cx="56" cy="10" r="3" fill="#7ee8a2" />
          </svg>
        )}

        {/* laurel (A, A+, S) */}
        {tier >= 4 && (
          <svg aria-hidden viewBox="0 0 100 100" className="absolute" style={{ inset: -disc * 0.22, width: disc * 1.44, height: disc * 1.44 }}>
            {[-1, 1].map((side) =>
              Array.from({ length: tier === 6 ? 7 : tier === 5 ? 6 : 4 }, (_, i) => {
                const a = (200 + i * 19) * (Math.PI / 180)
                const cx = 50 + side * Math.cos(a) * -44
                const cy = 50 - Math.sin(a) * 44
                return (
                  <ellipse
                    key={`${side}${i}`}
                    cx={cx}
                    cy={cy}
                    rx="4.2"
                    ry="9"
                    transform={`rotate(${side * (60 - i * 19)} ${cx} ${cy})`}
                    fill={tier === 4 ? '#5fb36f' : '#e8b43a'}
                    stroke={tier === 4 ? '#2a7340' : '#a8741a'}
                    strokeWidth="1"
                  />
                )
              }),
            )}
          </svg>
        )}

        {/* ribbons */}
        {ribbons > 0 && (
          <svg aria-hidden viewBox="0 0 60 50" className="absolute left-1/2 -translate-x-1/2" style={{ width: disc * 0.72, top: disc * 0.78, zIndex: -1 }}>
            {(ribbons === 1 ? [0] : ribbons === 2 ? [-1, 1] : [-1, 0, 1]).map((o) => (
              <path
                key={o}
                d={tier === 0 ? `M${30 + o * 12 - 6} 0 L${30 + o * 12 + 6} 0 L${30 + o * 12 + 5} 34 L${30 + o * 12 + 2} 30 L${30 + o * 12 - 1} 36 L${30 + o * 12 - 4} 31 L${30 + o * 12 - 6} 35 Z` : `M${30 + o * 13 - 7} 0 L${30 + o * 13 + 7} 0 L${30 + o * 13 + 7 + o * 3} 46 L${30 + o * 13 + o * 3} 38 L${30 + o * 13 - 7 + o * 3} 46 Z`}
                fill={tier === 0 ? '#7d4a33' : o === 0 ? p.dark : p.mid}
                opacity={tier === 0 ? 0.8 : 1}
              />
            ))}
          </svg>
        )}

        {/* ring */}
        <div
          className={cn('absolute inset-0 rounded-full', tier === 6 && !reduce && 'animate-[medal-spin_6s_linear_infinite]')}
          style={{
            background: tier === 6 ? RAINBOW : tier === 1 ? p.mid : `linear-gradient(145deg, ${p.light}, ${p.mid} 45%, ${p.dark})`,
            boxShadow: tier === 0 ? 'inset 0 2px 4px rgba(0,0,0,0.25)' : `0 ${big ? 6 : 2}px ${big ? 18 : 6}px ${p.glow}`,
          }}
        />
        {/* face */}
        <div
          className="absolute rounded-full"
          style={{
            inset: tier === 1 ? disc * 0.06 : tier >= 2 ? disc * 0.11 : disc * 0.08,
            background:
              tier === 0
                ? `radial-gradient(circle at 35% 30%, #a2684a, ${p.mid} 55%, ${p.dark})`
                : tier === 6
                  ? 'radial-gradient(circle at 35% 30%, #fff, #ffe6f5 45%, #f3d9ff)'
                  : `radial-gradient(circle at 35% 30%, ${p.light}, ${p.mid} 60%, ${p.dark})`,
            boxShadow: tier >= 2 ? `inset 0 0 0 ${big ? 2 : 1}px rgba(255,255,255,0.35), inset 0 -${big ? 6 : 2}px ${big ? 10 : 4}px rgba(0,0,0,0.18)` : 'inset 0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          {/* crack (F) */}
          {tier === 0 && (
            <svg aria-hidden viewBox="0 0 40 40" className="absolute inset-0 h-full w-full opacity-60">
              <path d="M26 4 L22 14 L27 19 L20 27 L23 36" fill="none" stroke="#3b1d0f" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
          {/* shine sweep (B and up) */}
          {tier >= 3 && !reduce && (
            <div aria-hidden className="absolute inset-0 overflow-hidden rounded-full">
              <div className="absolute -inset-y-2 -left-1/2 w-1/3 animate-[medal-shine_3.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/55 to-transparent" />
            </div>
          )}
        </div>

        {/* star studs (A+, S) */}
        {tier >= 5 &&
          Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <span
                key={i}
                aria-hidden
                className="absolute text-white drop-shadow"
                style={{ left: disc / 2 + Math.cos(a) * disc * 0.445 - disc * 0.05, top: disc / 2 + Math.sin(a) * disc * 0.445 - disc * 0.07, fontSize: disc * 0.1, lineHeight: 1 }}
              >
                ✦
              </span>
            )
          })}

        {/* letter */}
        <span
          className={cn('absolute inset-0 flex items-center justify-center font-black tracking-tight select-none', tier === 6 && !reduce && 'animate-[medal-shimmer_2.4s_linear_infinite]')}
          style={{
            fontSize: disc * (grade === 'A+' ? 0.38 : 0.46),
            ...(tier === 6
              ? { backgroundImage: 'linear-gradient(90deg,#ff5f6d,#ffc371,#7ee8a2,#5fb8ff,#a47bff,#ff6fd8,#ff5f6d)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 2px rgba(120,40,120,0.35))' }
              : { color: p.text, textShadow: tier === 0 ? '0 1px 0 rgba(0,0,0,0.35)' : `0 ${big ? 2 : 1}px ${big ? 3 : 1}px rgba(0,0,0,0.35)` }),
          }}
        >
          {grade}
        </span>
      </motion.div>

      {/* sparkles on reaching B+ ; confetti for S */}
      {big && tier >= 3 && !reduce && <Sparkles key={`sp${grade}`} count={tier === 6 ? 14 : tier === 5 ? 9 : 5} spread={disc * 0.95} top={(tier === 6 ? disc * 0.34 : 0) + disc / 2} />}
      {big && tier === 6 && !reduce && <Confetti key="confetti" width={disc * 2} />}
    </div>
  )
}

function Sparkles({ count, spread, top }: { count: number; spread: number; top: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2" style={{ top }}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + 0.3
        return (
          <motion.span
            key={i}
            className="absolute text-amber-300"
            style={{ fontSize: 10 + (i % 3) * 4 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(a) * spread, y: Math.sin(a) * spread, opacity: [0, 1, 0], scale: [0.4, 1.1, 0.6] }}
            transition={{ duration: 0.9, delay: (i % 4) * 0.04, ease: 'easeOut' }}
          >
            ✦
          </motion.span>
        )
      })}
    </div>
  )
}

const CONFETTI_COLORS = ['#ff5f6d', '#ffc371', '#7ee8a2', '#5fb8ff', '#a47bff', '#ff6fd8']
function Confetti({ width }: { width: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 overflow-visible" style={{ width }}>
      {Array.from({ length: 22 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute block h-2 w-1.5 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
          initial={{ y: -10, opacity: 0, rotate: 0 }}
          animate={{ y: 160 + (i % 5) * 20, opacity: [0, 1, 1, 0], rotate: 360 + i * 25 }}
          transition={{ duration: 1.8 + (i % 4) * 0.25, delay: (i % 6) * 0.08, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}
