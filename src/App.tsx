import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ApiError, fetchPhotoUrl, fetchRounds, KEY_PATTERN, postGuess } from './game/api'
import { bonusPercent, ROUND_SECONDS, TILE_BONUS_PCT, TIME_PER_TILE_SECONDS } from './game/scoring'
import { sound } from './game/sound'
import type { GameProgress, GuessRequest, PublicPhoto } from './game/types'
import { useRound } from './game/useRound'
import { GuessMap } from './components/GuessMap'
import { KeyInput } from './components/KeyInput'
import { Button, Card, CenteredPage, Shell, Title } from './components/layout'
import { BonusBadge } from './components/BonusBadge'
import { GameSummary } from './components/GameSummary'
import { ResultView } from './components/ResultView'
import { TileGrid } from './components/TileGrid'
import { MuteToggle, Timer } from './components/Timer'
import { AdminPage } from './pages/AdminPage'
import { PoolHome } from './pages/PoolHome'

/** Rounds per game. Albums with fewer photos play each photo once (shorter game). */
const ROUNDS = 10
const POOL_KEY_STORAGE = 'photoguessr.poolKey'
const LEGACY_KEY_STORAGE = 'photoguessr.playKey'

/** Remembering the album key is a per-device convenience; everything works without storage. */
const rememberedKey = {
  get: () => {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY_STORAGE)
      if (legacy) {
        localStorage.removeItem(LEGACY_KEY_STORAGE)
        localStorage.setItem(POOL_KEY_STORAGE, legacy)
      }
      return localStorage.getItem(POOL_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  },
  set: (v: string) => {
    try {
      if (v) localStorage.setItem(POOL_KEY_STORAGE, v)
      else localStorage.removeItem(POOL_KEY_STORAGE)
    } catch {
      /* private mode: key just isn't remembered */
    }
  },
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/admin') return <AdminPage />
  if (path === '/manage') window.history.replaceState(null, '', '/') // old link: album management now lives on the album screen
  return <PoolPage />
}

/** One key per album: enter it once, then album home (status/delete) and the game share it. */
function PoolPage() {
  const [poolKey, setPoolKey] = useState(rememberedKey.get)
  const [view, setView] = useState<'home' | 'game'>('home')
  const [joinError, setJoinError] = useState<string | null>(null)

  const join = (key: string) => {
    rememberedKey.set(key)
    setJoinError(null)
    setView('home')
    setPoolKey(key)
  }
  const leave = useCallback((reason: string | null = null) => {
    rememberedKey.set('')
    setJoinError(reason)
    setPoolKey('')
  }, [])
  const backToPool = useCallback(() => setView('home'), [])

  if (!poolKey) return <JoinPage error={joinError} onJoin={join} />
  if (view === 'home') return <PoolHome key={poolKey} poolKey={poolKey} onPlay={() => setView('game')} onLeave={leave} />
  return <Game key={poolKey} poolKey={poolKey} onLeave={leave} onBack={backToPool} />
}

function JoinPage({ error, onJoin }: { error: string | null; onJoin: (key: string) => void }) {
  const [key, setKey] = useState('')
  return (
    <CenteredPage>
      <Card>
        <p className="text-4xl" aria-hidden>
          📸
        </p>
        <Title>Open a photo album</Title>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (KEY_PATTERN.test(key)) onJoin(key)
          }}
          className="mt-5 space-y-4"
        >
          <KeyInput label="Album key" value={key} onChange={setKey} autoFocus />
          {error && <p className="rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}
          <Button type="submit" tone="coral" disabled={!KEY_PATTERN.test(key)}>
            Open album
          </Button>
        </form>
      </Card>
    </CenteredPage>
  )
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; gameId: string; photos: PublicPhoto[] }

function Game({ poolKey, onLeave, onBack }: { poolKey: string; onLeave: (reason?: string | null) => void; onBack: () => void }) {
  const [gameKey, setGameKey] = useState(0)
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [roundIndex, setRoundIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  /** Server-side game result (total + album high score), from the last guess of the game. */
  const [progress, setProgress] = useState<GameProgress | null>(null)

  // Photos are fetched with the key into blob URLs, shared across rounds so the next one can be
  // downloaded in the background. All are released when the game restarts or the screen closes.
  const photoCache = useRef(new Map<string, Promise<string>>())
  const loadPhoto = useCallback(
    (id: string) => {
      let url = photoCache.current.get(id)
      if (!url) {
        url = fetchPhotoUrl(poolKey, id)
        photoCache.current.set(id, url)
        url.catch(() => photoCache.current.delete(id))
      }
      return url
    },
    [poolKey],
  )
  useEffect(() => {
    const cache = photoCache.current
    return () => {
      for (const url of cache.values()) url.then(URL.revokeObjectURL, () => undefined)
      cache.clear()
    }
  }, [gameKey])

  // The server picks the rounds and sends only id + size; answers stay server-side until a guess.
  useEffect(() => {
    let cancelled = false
    setLoad({ state: 'loading' })
    fetchRounds(poolKey, ROUNDS)
      .then(({ gameId, photos }) => !cancelled && setLoad({ state: 'ready', gameId, photos }))
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) onLeave('That album key is not valid, or the album has expired.')
        else if (err instanceof ApiError && err.status === 429) setLoad({ state: 'error', message: 'Too many wrong keys from this network. Wait a minute and try again.' })
        else setLoad({ state: 'error', message: err instanceof Error ? err.message : 'Something went wrong' })
      })
    return () => {
      cancelled = true
    }
  }, [gameKey, poolKey, onLeave])

  const playAgain = () => {
    setGameKey((k) => k + 1)
    setRoundIndex(0)
    setTotal(0)
    setGameOver(false)
    setProgress(null)
  }

  if (load.state !== 'ready' || load.photos.length === 0) {
    return (
      <CenteredPage>
        <Card>
          {load.state === 'loading' && <p className="font-bold text-muted">Loading photos…</p>}
          {load.state === 'error' && (
            <>
              <h1 className="text-2xl font-extrabold">Couldn't load the game</h1>
              <p className="mt-2 text-sm text-muted">{load.message}</p>
              <Button className="mt-6" onClick={playAgain}>
                Try again
              </Button>
            </>
          )}
          {load.state === 'ready' && (
            <>
              <h1 className="text-2xl font-extrabold">No photos yet</h1>
              <p className="mt-2 text-muted">This album is empty. Add photos from your iPhone with the album key.</p>
              <Button className="mt-6" onClick={playAgain}>
                Check again
              </Button>
            </>
          )}
          <Button tone="quiet" className="mt-3" onClick={onBack}>
            Back to album
          </Button>
        </Card>
      </CenteredPage>
    )
  }

  const { photos, gameId } = load
  const next = (score: number, game?: GameProgress) => {
    if (game) setProgress(game)
    setTotal((t) => t + score)
    if (roundIndex + 1 >= photos.length) setGameOver(true)
    else setRoundIndex((i) => i + 1)
  }

  return (
    <Shell>
      {gameOver ? (
        <GameSummary total={progress?.done ? progress.total : total} rounds={photos.length} progress={progress} onPlayAgain={playAgain} onBack={onBack} />
      ) : (
        <Round
          key={`${gameKey}-${roundIndex}`}
          poolKey={poolKey}
          gameId={gameId}
          photo={photos[roundIndex]}
          nextPhotoId={photos[roundIndex + 1]?.id}
          loadPhoto={loadPhoto}
          roundNo={roundIndex + 1}
          rounds={photos.length}
          onDone={next}
          onLeave={onBack}
        />
      )}
    </Shell>
  )
}

type RoundProps = {
  poolKey: string
  gameId: string
  photo: PublicPhoto
  nextPhotoId?: string
  loadPhoto: (id: string) => Promise<string>
  roundNo: number
  rounds: number
  onDone: (score: number, game?: GameProgress) => void
  onLeave: () => void
}

function Round({ poolKey, gameId, photo, nextPhotoId, loadPhoto, roundNo, rounds, onDone, onLeave }: RoundProps) {
  const grade = useCallback((req: GuessRequest) => postGuess(poolKey, { ...req, gameId }), [poolKey, gameId])
  const round = useRound(photo, grade)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)

  // The photo must be downloaded before the timer can start; then start fetching the next one.
  useEffect(() => {
    let active = true
    loadPhoto(photo.id).then(
      (url) => {
        if (!active) return
        setImageUrl(url)
        if (nextPhotoId) void loadPhoto(nextPhotoId).catch(() => undefined)
      },
      () => active && setImageError(true),
    )
    return () => {
      active = false
    }
  }, [loadPhoto, photo.id, nextPhotoId])

  // Only round 1 shows the rules card; later rounds start as soon as their photo is ready.
  const autoStart = roundNo > 1
  const { phase, start } = round
  useEffect(() => {
    if (autoStart && imageUrl && phase === 'ready') start()
  }, [autoStart, imageUrl, phase, start])

  return (
    <>
      <header className="sticky top-0 z-[1100] mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Photo<span className="text-coral">Guessr</span>
          </h1>
          <p className="text-xs font-semibold text-muted">
            Round {roundNo} / {rounds}
            {round.phase === 'ready' && (
              <button type="button" onClick={onLeave} className="ml-2 underline decoration-dotted underline-offset-2 hover:text-ink">
                back to album
              </button>
            )}
          </p>
        </div>
        {round.phase === 'playing' && (
          <div className="flex items-center gap-2">
            <BonusBadge pct={bonusPercent(round.opened)} />
            <Timer remainingMs={round.remainingMs} totalMs={round.totalMs} bonusCount={round.opened.size} />
            <MuteToggle />
          </div>
        )}
      </header>

      {/* Enter-only animations: never gate a phase change (and the running timer) on an exit animation. */}
      {round.phase === 'ready' && autoStart && (
        <main className="flex flex-1 items-center justify-center px-4 pb-10">
          <p className="rounded-2xl bg-white/80 px-4 py-3 font-bold text-muted shadow-sm">
            {imageError ? "Couldn't load the photo" : 'Loading photo…'}
          </p>
        </main>
      )}

      {round.phase === 'ready' && !autoStart && (
        <motion.main key="ready" {...fade} className="flex flex-1 items-center justify-center px-4 pb-10">
          <ReadyCard
            loading={!imageUrl}
            failed={imageError}
            rounds={rounds}
            onStart={() => {
              sound.unlock() // audio needs a user gesture on iOS
              round.start()
            }}
          />
        </motion.main>
      )}

      {(round.phase === 'playing' || round.phase === 'submitting') && imageUrl && (
        <>
          <motion.main key="playing" {...fade} className="flex-1 px-3 pb-36 md:px-4 md:pb-8">
            <TileGrid photo={photo} imageUrl={imageUrl} opened={round.opened} disabled={round.phase !== 'playing'} onOpen={round.openTile} />
            {round.phase === 'submitting' && <SubmittingToast error={round.error} onRetry={round.retry} />}
          </motion.main>
          {/* Outside the animated <main>: a transformed ancestor would re-anchor this fixed panel. */}
          <GuessMap pin={round.pin} canGuess={round.canGuess} onPin={round.placePin} onGuess={round.submit} />
        </>
      )}

      {round.phase === 'result' && round.result && imageUrl && (
        <motion.main key="result" {...fade} className="flex-1">
          <ResultView photo={photo} imageUrl={imageUrl} result={round.result} isLastRound={roundNo === rounds} onNext={() => onDone(round.result!.finalScore, round.result!.game)} />
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

function ReadyCard({ loading, failed, rounds, onStart }: { loading: boolean; failed: boolean; rounds: number; onStart: () => void }) {
  return (
    <Card>
      <p className="text-4xl" aria-hidden>
        📸
      </p>
      <h2 className="mt-2 text-2xl font-extrabold text-ink">Where was this taken?</h2>
      <ul className="mt-4 space-y-2 text-left text-sm text-ink">
        <li>🃏 The photo hides under 16 cards. Open as many as you need — or none, if you're feeling brave.</li>
        <li>
          ✨ Every hidden card keeps its points: corners <b>{TILE_BONUS_PCT.corner}%</b>, sides <b>{TILE_BONUS_PCT.side}%</b>, middle{' '}
          <b>{TILE_BONUS_PCT.middle}%</b>. Your score is distance points × those %.
        </li>
        <li>📍 Drop a pin on the map and guess. Closer = more points.</li>
        <li>
          ⏱️ You start with {ROUND_SECONDS} seconds, and each card you open adds <b>+{TIME_PER_TILE_SECONDS} s</b>. At zero your pin is
          sent automatically.
        </li>
        <li>
          🔁 {rounds} round{rounds === 1 ? '' : 's'} this game.
        </li>
      </ul>
      <Button tone="coral" className="mt-6" onClick={onStart} disabled={loading || failed}>
        {failed ? "Couldn't load the photo" : loading ? 'Loading photo…' : 'Start round'}
      </Button>
    </Card>
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
