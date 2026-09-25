import { useState } from 'react'
import { SFX_NAMES, type SfxName } from '../game/sfx'
import { sound } from '../game/sound'
import { Card, CenteredPage, Title } from '../components/layout'
import { SoundToggles } from '../components/Timer'

const WHEN: Record<SfxName, string> = {
  pin: 'Pin dropped / moved',
  guess: 'Guess pressed',
  card: 'Card opened',
  count: 'Score counting up',
  pinpoint: '🎯 Pinpoint',
  'grade-low': 'Round grade F / D',
  'grade-mid': 'Round grade C / B',
  'grade-high': 'Round grade A / A+',
  'grade-s': 'Round grade S',
  bar: 'Game-over bar tick',
  overflow: 'Bar passes the max',
  'medal-low': 'Final medal F / D',
  'medal-mid': 'Final medal C / B',
  'medal-high': 'Final medal A / A+',
  'medal-s': 'Final medal S',
  alarm: "Time's up",
}

/** `/sounds`: listen to every sound (unlinked page, for choosing swaps). */
export function SoundsPage() {
  const [music, setMusic] = useState(false)
  return (
    <CenteredPage>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Title>Sounds</Title>
          <SoundToggles />
        </div>
        <ul className="mt-5 grid gap-2 text-left sm:grid-cols-2">
          {SFX_NAMES.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => {
                  sound.unlock()
                  // decoding starts on the first tap; retry shortly so the first tap still plays
                  if (!sound.play(name)) window.setTimeout(() => sound.play(name), 500)
                }}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-sand bg-white px-4 py-2 text-left shadow-sm active:scale-[0.98]"
              >
                <span>
                  <span className="block font-bold text-ink">{WHEN[name]}</span>
                  <span className="font-mono text-xs text-muted">{name}</span>
                </span>
                <span aria-hidden>▶</span>
              </button>
            </li>
          ))}
          <li className="sm:col-span-2">
            <button
              type="button"
              onClick={() => {
                sound.unlock()
                if (music) sound.stopMusic()
                else sound.startMusic()
                setMusic(!music)
              }}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-sand bg-butter/40 px-4 py-2 font-bold text-ink shadow-sm active:scale-[0.98]"
            >
              🎵 Background music <span aria-hidden>{music ? '■' : '▶'}</span>
            </button>
          </li>
        </ul>
      </Card>
    </CenteredPage>
  )
}
