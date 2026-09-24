import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { fetchRounds, postGuess } from './game/api'
import { multiplier, ROUND_SECONDS, TILE_VALUE } from './game/scoring'
import type { PublicPhoto } from './game/types'
import { useRound } from './game/useRound'
import { GuessMap } from './components/GuessMap'
import { MultiplierBadge } from './components/MultiplierBadge'
import { ResultView } from './components/ResultView'
import { TileGrid } from './components/TileGrid'
import { Timer } from './components/Timer'
import { DotBackground } from './components/ui/DotBackground'
import CountUp from './components/ui/CountUp'

/** Rounds per game. 1 for now while testing. */
const ROUNDS = 1

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; photos: PublicPhoto[] }

export default function App() {
  const [gameKey, setGameKey] = useState(0)
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [roundIndex, setRoundIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [gameOver, setGameOver] = useState(false)

  // The server picks the rounds and sends only id + image; answers stay server-side until a guess.
  useEffect(() => {
    let cancelled = false
    setLoad({ state: 'loading' })
    fetchRounds(ROUNDS)
      .then((photos) => !cancelled && setLoad({ state: 'ready', photos }))
      .catch((err: Error) => !cancelled && setLoad({ state: 'error', message: err.message }))
    return () => {
      cancelled = true
    }
  }, [gameKey])

  const playAgain = () => {
    setGameKey((k) => k + 1)
    setRoundIndex(0)
    setTotal(0)
    setGameOver(false)
  }

  if (load.state !== 'ready' || load.photos.length === 0) {
    return (
      <Shell>
        <main className="flex flex-1 items-center justify-center px-4">
          <Card>
            {load.state === 'loading' && <p className="font-bold text-muted">Loading photos…</p>}
            {load.state === 'error' && (
              <>
                <h1 className="text-2xl font-extrabold">Couldn't reach the game server</h1>
                <p className="mt-2 text-sm text-muted">{load.message}</p>
                <PrimaryButton onClick={playAgain}>Try again</PrimaryButton>
              </>
            )}
            {load.state === 'ready' && (
              <>
                <h1 className="text-2xl font-extrabold">No photos yet</h1>
                <p className="mt-2 text-muted">
                  Add photos to <code>photos/</code> and run <code>npm run pool</code>.
                </p>
              </>
            )}
          </Card>
        </main>
      </Shell>
    )
  }

  const { photos } = load
  const next = (score: number) => {
    setTotal((t) => t + score)
    if (roundIndex + 1 >= photos.length) setGameOver(true)
    else setRoundIndex((i) => i + 1)
  }

  return (
    <Shell>
      {gameOver ? (
        <GameOver total={total} rounds={photos.length} onPlayAgain={playAgain} />
      ) : (
        <Round key={`${gameKey}-${roundIndex}`} photo={photos[roundIndex]} roundNo={roundIndex + 1} rounds={photos.length} onDone={next} />
      )}
    </Shell>
  )
}

function Round({ photo, roundNo, rounds, onDone }: { photo: PublicPhoto; roundNo: number; rounds: number; onDone: (score: number) => void }) {
  const round = useRound(photo, postGuess)
  const [imgReady, setImgReady] = useState(false)

  // Preload so the timer never starts on a photo that is still downloading.
  useEffect(() => {
    const img = new Image()
    img.onload = () => setImgReady(true)
    img.src = photo.src
  }, [photo.src])

  return (
    <>
      <header className="sticky top-0 z-[1100] mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Photo<span className="text-coral">Guessr</span>
          </h1>
          <p className="text-xs font-semibold text-muted">
            Round {roundNo} / {rounds}
          </p>
        </div>
        {round.phase === 'playing' && (
          <div className="flex items-center gap-2">
            <MultiplierBadge value={multiplier(round.opened)} />
            <Timer remainingMs={round.remainingMs} />
          </div>
        )}
      </header>

      {/* Enter-only animations: never gate a phase change (and the running timer) on an exit animation. */}
        {round.phase === 'ready' && (
          <motion.main key="ready" {...fade} className="flex flex-1 items-center justify-center px-4 pb-10">
            <ReadyCard loading={!imgReady} onStart={round.start} />
          </motion.main>
        )}

        {(round.phase === 'playing' || round.phase === 'submitting') && (
          <>
            <motion.main key="playing" {...fade} className="flex-1 px-3 pb-36 md:px-4 md:pb-8">
              <TileGrid photo={photo} opened={round.opened} disabled={round.phase !== 'playing'} onOpen={round.openTile} />
              {round.phase === 'submitting' && <SubmittingToast error={round.error} onRetry={round.retry} />}
            </motion.main>
            {/* Outside the animated <main>: a transformed ancestor would re-anchor this fixed panel. */}
            <GuessMap
              pin={round.pin}
              openedCount={round.opened.size}
              canGuess={round.canGuess}
              onPin={round.placePin}
              onGuess={round.submit}
            />
          </>
        )}

        {round.phase === 'result' && round.result && (
          <motion.main key="result" {...fade} className="flex-1">
            <ResultView photo={photo} result={round.result} isLastRound={roundNo === rounds} onNext={() => onDone(round.result!.finalScore)} />
          </motion.main>
        )}
    </>
  )
}

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
}

function ReadyCard({ loading, onStart }: { loading: boolean; onStart: () => void }) {
  return (
    <Card>
      <p className="text-4xl" aria-hidden>
        📸
      </p>
      <h2 className="mt-2 text-2xl font-extrabold text-ink">Where was this taken?</h2>
      <ul className="mt-4 space-y-2 text-left text-sm text-ink">
        <li>🃏 The photo hides under 16 cards. Tap to open them one at a time — at least one.</li>
        <li>
          ✨ Every hidden card keeps its bonus: corners <b>+{TILE_VALUE.corner}</b>, sides <b>+{TILE_VALUE.side}</b>, middle{' '}
          <b>+{TILE_VALUE.middle}</b> on top of ×1.0.
        </li>
        <li>📍 Drop a pin on the map and guess. Closer = more points.</li>
        <li>⏱️ You have {ROUND_SECONDS} seconds. At zero your pin is sent automatically.</li>
      </ul>
      <button
        type="button"
        onClick={onStart}
        disabled={loading}
        className="mt-6 h-12 w-full rounded-2xl bg-coral font-bold text-white shadow-sm transition active:scale-[0.98] hover:brightness-105 disabled:opacity-60"
      >
        {loading ? 'Loading photo…' : 'Start round'}
      </button>
    </Card>
  )
}

function GameOver({ total, rounds, onPlayAgain }: { total: number; rounds: number; onPlayAgain: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card>
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h2 className="mt-2 text-2xl font-extrabold text-ink">Game over</h2>
        <p className="mt-1 text-sm text-muted">
          {rounds} round{rounds > 1 ? 's' : ''} played
        </p>
        <p className="mt-4 text-6xl font-extrabold text-coral tabular-nums">
          <CountUp to={total} duration={1.2} separator="," />
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">total points</p>
        <button
          type="button"
          onClick={onPlayAgain}
          className="mt-6 h-12 w-full rounded-2xl bg-sage-deep font-bold text-white shadow-sm transition active:scale-[0.98] hover:brightness-105"
        >
          Play again
        </button>
      </Card>
    </main>
  )
}

function SubmittingToast({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div role="status" className="fixed inset-x-0 top-20 z-[1200] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-2xl border border-sand bg-white/95 px-4 py-3 text-sm font-bold shadow-lg">
      {error ? (
        <span className="flex items-center gap-3 text-coral">
          {error}
          <button type="button" onClick={onRetry} className="h-11 rounded-xl bg-coral px-4 text-white">
            Retry
          </button>
        </span>
      ) : (
        <span className="text-muted">Checking your guess…</span>
      )}
    </div>
  )
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 h-12 w-full rounded-2xl bg-sage-deep font-bold text-white shadow-sm transition active:scale-[0.98] hover:brightness-105"
    >
      {children}
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <DotBackground />
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-3xl border border-sand bg-white/90 p-6 text-center shadow-[0_20px_50px_-20px_rgba(120,90,60,0.35)] backdrop-blur-sm">
      {children}
    </div>
  )
}
