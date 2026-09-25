import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet'
import { formatDistance, formatTakenAt } from '../game/format'
import type { Answer, GuessResponse, PublicPhoto } from '../game/types'
import { AutoResize, BaseTiles, answerIcon, guessIcon } from './map'
import CountUp from './ui/CountUp'
import { motion } from 'motion/react'
import { gradeFor, PINPOINT_METERS, PINPOINT_POINTS } from '../game/scoring'
import { gradeTextColor } from './GradeMedal'

type Props = {
  photo: PublicPhoto
  imageUrl: string
  result: GuessResponse
  isLastRound: boolean
  /** Game total before this round; the result shows it counting up to include this round. */
  totalBefore: number
  onNext: () => void
}

function FitBoth({ answer, guess }: { answer: Answer; guess: GuessResponse['guess'] }) {
  const map = useMap()
  useEffect(() => {
    if (guess) {
      map.fitBounds(L.latLngBounds([answer.lat, answer.lng], [guess.lat, guess.lng]), { padding: [48, 48], maxZoom: 13 })
    } else {
      map.setView([answer.lat, answer.lng], 10)
    }
  }, [map, answer.lat, answer.lng, guess])
  return null
}

export function ResultView({ photo, imageUrl, result, isLastRound, totalBefore, onNext }: Props) {
  const { guess, distanceKm, baseScore, bonusPct, finalScore, pinpoint, timedOut, answer } = result
  const noScoreReason = !guess ? 'No pin dropped in time' : null

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6">
      <figure className="self-start overflow-hidden rounded-3xl bg-white p-2 shadow-[0_10px_30px_-12px_rgba(120,90,60,0.35)] ring-1 ring-sand">
        <img
          src={imageUrl}
          alt={`Photo taken in ${answer.district}, ${answer.province}`}
          width={photo.width}
          height={photo.height}
          className="mx-auto max-h-[70dvh] w-auto rounded-2xl object-contain"
        />
      </figure>

      <div className="flex flex-col gap-4">
        <div className="h-[300px] overflow-hidden rounded-3xl shadow-[0_10px_30px_-12px_rgba(120,90,60,0.35)] ring-1 ring-sand md:h-[340px]">
          <MapContainer center={[answer.lat, answer.lng]} zoom={8} className="h-full w-full">
            <BaseTiles />
            <AutoResize />
            <FitBoth answer={answer} guess={guess} />
            <Marker position={[answer.lat, answer.lng]} icon={answerIcon} />
            {guess && (
              <>
                <Marker position={[guess.lat, guess.lng]} icon={guessIcon} />
                <Polyline
                  positions={[[guess.lat, guess.lng], [answer.lat, answer.lng]]}
                  pathOptions={{ color: '#3f3a34', weight: 3, dashArray: '6 8', opacity: 0.7 }}
                />
              </>
            )}
          </MapContainer>
        </div>

        <section className="rounded-3xl border border-sand bg-white/90 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Score</p>
              <p className="text-5xl font-extrabold leading-none text-ink tabular-nums">
                <CountUp to={finalScore} duration={1.2} separator="," />
              </p>
              <p className="mt-2 inline-block rounded-2xl bg-butter/40 px-3 py-1.5 text-sm font-semibold text-ink tabular-nums">
                {baseScore.toFixed(1)} <span className="text-muted">×</span> {bonusPct}%
                {pinpoint && (
                  <>
                    {' '}
                    <span className="text-muted">+</span> 🎯{PINPOINT_POINTS}
                  </>
                )}{' '}
                <span className="text-muted">=</span> {finalScore}
              </p>
            </div>
            {/* grade pops in once the count-up has settled */}
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.0, type: 'spring', stiffness: 380, damping: 16 }}>
              <GradeLetter score={finalScore} />
            </motion.div>
          </div>

          {pinpoint && (
            <motion.p
              className="mt-3 w-fit rounded-xl bg-sage/25 px-3 py-2 text-sm font-extrabold text-sage-deep"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 420, damping: 14 }}
            >
              🎯 Pinpoint! Within {PINPOINT_METERS} m: +{PINPOINT_POINTS}
            </motion.p>
          )}
          {noScoreReason && <p className="mt-3 rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">⏰ {noScoreReason}</p>}
          {!noScoreReason && timedOut && <p className="mt-3 text-sm font-semibold text-coral">⏰ Time's up — your pin was submitted automatically.</p>}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Distance" value={distanceKm === null ? '—' : formatDistance(distanceKm)} />
            <Stat label="Taken" value={formatTakenAt(answer.takenAt)} />
            <Stat label="District" value={answer.district || 'Unknown'} />
            <Stat label="Province" value={answer.province || 'Unknown'} />
          </dl>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Total score</p>
            <p className="text-xl font-extrabold text-ink tabular-nums">
              <CountUp from={totalBefore} to={totalBefore + finalScore} duration={1.2} delay={0.3} separator="," />
            </p>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="mt-5 h-12 w-full rounded-2xl bg-sage-deep font-bold text-white shadow-sm transition active:scale-[0.98] hover:brightness-105"
          >
            {isLastRound ? 'See final score →' : 'Next round →'}
          </button>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream px-3 py-2">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  )
}

/** Between rounds: just the letter grade in its colour (the medal is saved for the game over). */
function GradeLetter({ score }: { score: number }) {
  const { grade, tone } = gradeFor(score)
  const rainbow = tone === 'rainbow'
  return (
    <span
      aria-label={`Grade ${grade}`}
      className={`block text-6xl leading-none font-black tracking-tight ${rainbow ? 'animate-[medal-shimmer_2.4s_linear_infinite]' : ''}`}
      style={
        rainbow
          ? {
              backgroundImage: 'linear-gradient(90deg,#ff5f6d,#ffc371,#7ee8a2,#5fb8ff,#a47bff,#ff6fd8,#ff5f6d)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }
          : { color: gradeTextColor(tone) }
      }
    >
      {grade}
    </span>
  )
}
