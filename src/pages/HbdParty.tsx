import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { ChromaVideo, type ChromaVideoHandle } from '../components/ChromaVideo'

/**
 * /hbd: a goofy birthday party page (public link, no key). Files live in public/hbd/; a missing one
 * is skipped. Layers, top to bottom: HBD title > explosion > green-screen cats > the big photo.
 * - Magic Mamaliga starts on open if the browser allows it; phones need a tap first, so the one tap
 *   both starts the song and reveals the title, then the explosion plays (green-screen keyed in WebGL).
 * - 30 s after that tap: hard cut to black, the song stops dead, and each tap types one line in light
 *   grey. After the last line, a tap goes to the game home page.
 */
const BASE = '/hbd/'

/**
 * Cats around the photo, overlapping its edges. Positions are relative to the photo's frame;
 * `w` is the cat's width as a share of the photo's width.
 */
const CATS = [
  { file: 'cat-1.mp4', style: { left: '-9%', top: '-4%' }, w: 0.35, rotate: -8, dur: 1.0 },
  { file: 'cat-2.mp4', style: { right: '-9%', top: '-6%' }, w: 0.37, rotate: 9, dur: 1.2 },
  { file: 'cat-4.mp4', style: { left: '-10%', top: '38%' }, w: 0.33, rotate: 6, dur: 0.9 },
  { file: 'cat-7.mp4', style: { right: '-10%', top: '32%' }, w: 0.35, rotate: -7, dur: 1.1 },
  { file: 'cat-5.mp4', style: { left: '-7%', bottom: '-8%' }, w: 0.32, rotate: -5, dur: 0.85 },
  { file: 'cat-6.mp4', style: { right: '-8%', bottom: '4%' }, w: 0.42, rotate: 7, dur: 1.05 },
  { file: 'cat-3.mp4', style: { left: '29%', bottom: '-14%' }, w: 0.42, rotate: -3, dur: 1.3 },
] as const

const TITLE = ['HAPPY', 'BIRTHDAY!!']
const LETTER_COLORS = ['#ff4d4d', '#ff9f1c', '#ffd23f', '#3ec46d', '#2ec4f1', '#7b61ff', '#ff5fb3']
const CONFETTI = ['#f7b79b', '#e98c6b', '#9dbf9e', '#a7cde6', '#f6de9c', '#e8b4d8', '#ff7a45']
/** The explosion goes off once the title has landed. */
const EXPLOSION_DELAY_MS = 650
/** How long the party lasts after the HBD tap before the hard cut to black. */
const CUT_AFTER_MS = 30_000
const BLACK_LINES = ['Another year has passed...', 'Have you taken a good look at yourself?', 'Do you remember?', 'Where are you?']
/** A line fades out this long before the next one starts typing. */
const FADE_MS = 1400
/** Typewriter speed, per character. */
const TYPE_MS = 90

type Burst = { id: number; x: number; y: number }

/** `onExit`: after the last line on the black screen; the app fades from black into the album page. */
export default function HbdParty({ onExit }: { onExit: () => void }) {
  const reduce = useReducedMotion()
  const song = useRef<HTMLAudioElement>(null)
  const boom = useRef<HTMLAudioElement>(null)
  const explosion = useRef<ChromaVideoHandle>(null)
  const shake = useAnimationControls()
  const [stage, setStage] = useState<1 | 2>(1)
  const [hasSong, setHasSong] = useState(true)
  const [muted, setMuted] = useState(false)
  const [brokenCats, setBrokenCats] = useState<ReadonlySet<string>>(() => new Set())
  const [exploding, setExploding] = useState(false)
  const [hasExplosion, setHasExplosion] = useState(true)
  const [bursts, setBursts] = useState<Burst[]>([])
  const burstId = useRef(0)
  const [blackout, setBlackout] = useState(false)
  const cutTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(cutTimer.current), [])

  /** The hard cut: silence first (removing an <audio> from the page doesn't always stop it), then black. */
  const cutToBlack = () => {
    for (const a of [song.current, boom.current]) {
      if (!a) continue
      a.pause()
      a.currentTime = 0
    }
    setBlackout(true)
  }

  // Try to start the song right away; phones block that until the first tap.
  useEffect(() => {
    const a = song.current
    if (!a) return
    a.volume = 0.8
    // A missing file comes back as the app's index.html (SPA fallback), so check it is really audio.
    fetch(a.src, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('audio'))
      .catch(() => false)
      .then((ok) => !ok && setHasSong(false))
    a.play().catch(() => undefined) // blocked on phones until the first tap
  }, [])

  useEffect(() => {
    if (song.current) song.current.muted = muted
    if (boom.current) boom.current.muted = muted
  }, [muted])

  const startSong = () => {
    const a = song.current
    if (a && a.paused) void a.play().catch(() => undefined)
  }

  const burstAt = (x: number, y: number) => {
    const id = ++burstId.current
    setBursts((b) => [...b.slice(-5), { id, x, y }])
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1200)
  }

  const onTap = (e: PointerEvent<HTMLElement>) => {
    startSong() // phones block sound until a tap, so the reveal tap also starts the song
    burstAt(e.clientX, e.clientY)
    if (stage === 2) return
    setStage(2)
    cutTimer.current = window.setTimeout(cutToBlack, CUT_AFTER_MS)
    window.setTimeout(() => {
      setExploding(true)
      explosion.current?.play()
      if (boom.current) {
        boom.current.currentTime = 0
        void boom.current.play().catch(() => undefined)
      }
      if (!reduce) void shake.start({ x: [0, -14, 12, -10, 8, -5, 3, 0], y: [0, 8, -6, 5, -3, 2, 0, 0], transition: { duration: 0.6 } })
    }, EXPLOSION_DELAY_MS)
  }

  if (blackout) return <BlackScreen onExit={onExit} />

  return (
    <motion.main
      animate={shake}
      onPointerDown={onTap}
      className="relative flex min-h-dvh touch-manipulation flex-col items-center justify-center overflow-hidden px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] select-none"
    >
      <audio ref={song} src={`${BASE}song.mp3`} loop preload="auto" onError={() => setHasSong(false)} />
      <audio ref={boom} src="/sfx/overflow.mp3" preload="auto" />

      {/* soft party glows: plain gradients, no blur filter (blur is expensive in Safari) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(18rem 18rem at 0% 0%, rgba(247,183,155,0.45), transparent 70%), radial-gradient(18rem 18rem at 100% 40%, rgba(167,205,230,0.4), transparent 70%), radial-gradient(18rem 18rem at 35% 100%, rgba(246,222,156,0.55), transparent 70%)',
        }}
      />

      {/* layer 1 (top): the birthday title, after the tap */}
      {stage === 2 && <MemeTitle />}

      {/* layer 4 (bottom): the photo, with layer 3 (cats) overlapping its edges */}
      <div className="relative z-10">
        <div className="hbd-wobble">
          <motion.figure
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.4 } : { type: 'spring', stiffness: 160, damping: 14 }}
            className="relative rounded-3xl bg-white p-1.5 pb-2 shadow-[0_24px_60px_-22px_rgba(120,90,60,0.55)] ring-1 ring-sand"
          >
            <img
              src={`${BASE}photo.webp`}
              alt="The birthday girl"
              draggable={false}
              className={`w-auto max-w-[min(calc(100vw-2.25rem),40rem)] rounded-2xl object-cover transition-[max-height] duration-500 ${stage === 2 ? 'max-h-[62dvh]' : 'max-h-[82dvh]'}`}
            />
            {stage === 1 && <figcaption className="mt-2 text-center text-lg font-black text-ink">who is this?? 👀</figcaption>}
          </motion.figure>
        </div>

        {CATS.filter((c) => !brokenCats.has(c.file)).map((cat, i) => (
          <motion.div
            key={cat.file}
            className="pointer-events-none absolute z-20"
            style={{ ...cat.style, width: `${cat.w * 100}%` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
          >
            <div
              className="hbd-bob"
              style={
                {
                  '--r': `${cat.rotate}deg`,
                  '--dur': `${stage === 2 ? cat.dur * 0.6 : cat.dur}s`,
                  '--delay': `${i * 0.07}s`,
                  '--s': stage === 2 ? 1.12 : 1.05,
                } as CSSProperties
              }
            >
              <ChromaVideo
                src={`${BASE}${cat.file}`}
                frozen={exploding} // covered by the explosion: skip their frames so it stays smooth
                onError={() => setBrokenCats((s) => new Set(s).add(cat.file))}
                className={`block h-auto w-full ${i % 3 === 1 ? '-scale-x-100' : ''}`}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {stage === 1 && (
        <p className="hbd-pulse relative z-30 mt-6 rounded-full bg-white/90 px-4 py-2 text-sm font-extrabold text-coral shadow">tap anywhere 👀</p>
      )}

      {/* layer 2: the explosion, under the title, above the cats; plays once after the reveal */}
      {hasExplosion && (
        <div
          aria-hidden
          className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center transition-opacity duration-500 ${exploding ? 'opacity-100' : 'opacity-0'}`}
        >
          <ChromaVideo
            ref={explosion}
            src={`${BASE}explosion.mp4`}
            mode="fire"
            loop={false}
            autoPlay={false}
            onEnded={() => setExploding(false)}
            onError={() => setHasExplosion(false)}
            className="h-auto w-[max(100vw,62dvh)] max-w-none"
          />
        </div>
      )}

      {/* mute */}
      {hasSong && (
        <button
          type="button"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onPointerDown={(e) => {
            e.stopPropagation()
            setMuted((m) => !m)
          }}
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg shadow ring-1 ring-sand"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}

      {/* little fire bursts from each tap */}
      {bursts.map((b) => (
        <FireBurst key={b.id} x={b.x} y={b.y} />
      ))}

      {stage === 2 && !reduce && <Confetti />}
      {stage === 2 && <FlameRow reduce={!!reduce} />}
    </motion.main>
  )
}

/** WordArt-style "HAPPY BIRTHDAY!!": rainbow letters, white outline, chunky 3D shadow, all bouncing. */
function MemeTitle() {
  let n = 0
  return (
    <motion.h1
      initial={{ y: -300, scale: 0.3, rotate: -12 }}
      animate={{ y: 0, scale: 1, rotate: -4 }}
      transition={{ type: 'spring', stiffness: 260, damping: 11 }}
      className="pointer-events-none relative z-50 mb-6 text-center font-black leading-[0.95] tracking-tight"
      style={{ fontSize: 'clamp(2.6rem, 13vw, 6.5rem)' }}
    >
      {TITLE.map((word) => (
        <span key={word} className="block whitespace-nowrap">
          {[...word].map((ch) => {
            const i = n++
            return (
              <span
                key={i}
                className="hbd-letter inline-block"
                style={
                  {
                    color: LETTER_COLORS[i % LETTER_COLORS.length],
                    WebkitTextStroke: '0.06em #fff',
                    paintOrder: 'stroke fill',
                    textShadow: '0 0.08em 0 #b3471b, 0 0.14em 0.12em rgba(80,30,10,0.35)',
                    '--delay': `${i * 0.06}s`,
                  } as CSSProperties
                }
              >
                {ch}
              </span>
            )
          })}
        </span>
      ))}
    </motion.h1>
  )
}

function FireBurst({ x, y }: { x: number; y: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed z-[55]" style={{ left: x, top: y }}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.2
        const r = 110 * (0.6 + ((i * 7) % 5) / 10)
        return (
          <motion.span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ fontSize: 18 + (i % 3) * 6 }}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 1 }}
            animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r - 30, scale: [0.3, 1.2, 0.8], opacity: [1, 1, 0] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {i % 3 === 0 ? '💥' : i % 3 === 1 ? '🔥' : '✨'}
          </motion.span>
        )
      })}
    </div>
  )
}

/** Flickering flames along the bottom edge. */
function FlameRow({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-between overflow-hidden px-1 pb-[env(safe-area-inset-bottom)]">
      {Array.from({ length: 12 }, (_, i) => (
        <motion.span
          key={i}
          className="inline-block text-4xl sm:text-5xl"
          initial={{ y: 60 }}
          animate={{ y: 0 }}
          transition={reduce ? { duration: 0.3 } : { type: 'spring', stiffness: 200, damping: 12, delay: 0.2 + i * 0.03 }}
        >
          <span className="hbd-flicker inline-block" style={{ '--dur': `${0.7 + (i % 4) * 0.12}s` } as CSSProperties}>
            🔥
          </span>
        </motion.span>
      ))}
    </div>
  )
}

function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className="hbd-fall absolute -top-4 block h-3 w-2 rounded-sm"
          style={
            {
              left: `${(i * 29 + 3) % 100}%`,
              background: CONFETTI[i % CONFETTI.length],
              '--dur': `${3.2 + (i % 5) * 0.6}s`,
              '--delay': `${(i % 8) * 0.3}s`,
              '--spin': `${360 + i * 40}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/**
 * After the cut: a white flash, then black. Each tap fades the current line out, then types the next
 * one in light grey, centred. A tap while a line is still typing finishes it (so no line is skipped);
 * a tap after the last line fades it out, then the app fades from black into the album page.
 */
function BlackScreen({ onExit }: { onExit: () => void }) {
  const [flash, setFlash] = useState(true)
  const [line, setLine] = useState(-1)
  const [typed, setTyped] = useState(0)
  const [fading, setFading] = useState(false)
  // Ignore taps right after the cut, so a tap already in progress can't start the first line.
  const readyAt = useRef(performance.now() + 700)

  useEffect(() => {
    const id = window.setTimeout(() => setFlash(false), 80)
    return () => window.clearTimeout(id)
  }, [])

  const text = line >= 0 ? BLACK_LINES[line] : ''
  useEffect(() => {
    if (typed >= text.length) return
    const id = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS)
    return () => window.clearTimeout(id)
  }, [typed, text])

  const onTap = () => {
    if (fading || performance.now() < readyAt.current) return
    if (typed < text.length) return setTyped(text.length)
    if (line === BLACK_LINES.length - 1) {
      setFading(true) // the last line fades out too, then the game home page
      window.setTimeout(onExit, FADE_MS)
      return
    }
    const next = () => {
      setFading(false)
      setLine(line + 1)
      setTyped(0)
    }
    if (line < 0) return next()
    setFading(true) // the old line fades out completely before the next one starts typing
    window.setTimeout(next, FADE_MS)
  }

  return (
    <main
      onPointerDown={onTap}
      className={`fixed inset-0 z-[100] touch-manipulation select-none ${flash ? 'bg-white' : 'bg-black'}`}
    >
      {line >= 0 && (
        // Pinned: every sentence's first line starts at the same height and extra lines grow downward,
        // so nothing moves up (centring each sentence on its own height made 2-line ones jump up).
        <p
          className="absolute top-[40%] left-1/2 w-[calc(100%-4rem)] max-w-[20ch] -translate-x-1/2 text-center font-light leading-snug tracking-wide transition-opacity ease-out"
          style={{ color: '#d6d6d6', fontSize: 'clamp(1.5rem, 6.5vw, 2.25rem)', opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
          aria-live="polite"
        >
          {/* The whole line is laid out from the start (the rest is invisible), so each character is
              typed in its final place: a word never jumps to the next line halfway through. */}
          {text.slice(0, typed)}
          <span className="relative" aria-hidden>
            <span className="hbd-caret absolute left-0.5 top-0">▍</span>
          </span>
          <span className="invisible">{text.slice(typed)}</span>
        </p>
      )}
    </main>
  )
}

