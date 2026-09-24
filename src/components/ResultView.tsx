import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet'
import { formatDistance, formatTakenAt } from '../game/format'
import type { Answer, GuessResponse, PublicPhoto } from '../game/types'
import { AutoResize, BaseTiles, answerIcon, guessIcon } from './map'
import CountUp from './ui/CountUp'

type Props = {
  photo: PublicPhoto
  imageUrl: string
  result: GuessResponse
  isLastRound: boolean
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

export function ResultView({ photo, imageUrl, result, isLastRound, onNext }: Props) {
  const { guess, distanceKm, baseScore, multiplier, finalScore, openedCount, timedOut, answer } = result
  const noScoreReason = !guess ? 'No pin dropped in time' : openedCount === 0 ? 'Time ran out before opening a card' : null

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6">
      <figure className="overflow-hidden rounded-3xl bg-white p-2 shadow-[0_10px_30px_-12px_rgba(120,90,60,0.35)] ring-1 ring-sand">
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Score</p>
              <p className="text-5xl font-extrabold leading-none text-ink tabular-nums">
                <CountUp to={finalScore} duration={1.2} separator="," />
              </p>
            </div>
            <p className="rounded-2xl bg-butter/40 px-3 py-2 text-sm font-semibold text-ink tabular-nums">
              {baseScore.toFixed(1)} <span className="text-muted">×</span> {multiplier.toFixed(1)} bonus
            </p>
          </div>

          {noScoreReason && <p className="mt-3 rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">⏰ {noScoreReason}</p>}
          {!noScoreReason && timedOut && <p className="mt-3 text-sm font-semibold text-coral">⏰ Time's up — your pin was submitted automatically.</p>}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Distance" value={distanceKm === null ? '—' : formatDistance(distanceKm)} />
            <Stat label="Taken" value={formatTakenAt(answer.takenAt)} />
            <Stat label="District" value={answer.district || 'Unknown'} />
            <Stat label="Province" value={answer.province || 'Unknown'} />
          </dl>

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
