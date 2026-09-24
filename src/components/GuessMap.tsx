import { useState } from 'react'
import { MapContainer, Marker, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../game/types'
import { cn } from '../lib/utils'
import { AutoResize, BaseTiles, MAP_START, guessIcon } from './map'
import { MovingBorderButton } from './ui/MovingBorderButton'

type Props = {
  pin: LatLng | null
  openedCount: number
  canGuess: boolean
  onPin: (ll: LatLng) => void
  onGuess: () => void
}

function ClickToPin({ onPin }: { onPin: (ll: LatLng) => void }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng.wrap()
      onPin({ lat, lng })
    },
  })
  return null
}

/**
 * Desktop: GeoGuessr-style mini map in the bottom-right that grows while hovered/focused.
 * Mobile: bottom bar with a map toggle; the map opens as a sheet (no hover dependency).
 */
export function GuessMap({ pin, openedCount, canGuess, onPin, onGuess }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const hint = openedCount === 0 ? 'Open a card first' : !pin ? 'Drop a pin on the map' : 'Guess!'

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1000] md:inset-x-auto md:right-5 md:bottom-5">
      <div className="group rounded-t-3xl border border-sand bg-white/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_-12px_rgba(120,90,60,0.35)] backdrop-blur-md md:rounded-3xl md:pb-3 md:shadow-[0_12px_40px_-12px_rgba(120,90,60,0.4)]">
        <div
          className={cn(
            'overflow-hidden rounded-2xl transition-[height,width,margin] duration-300 ease-out',
            sheetOpen ? 'mb-3 h-[58dvh]' : 'mb-0 h-0',
            'md:mb-3 md:h-[200px] md:w-[300px] md:group-hover:h-[420px] md:group-hover:w-[min(600px,calc(100vw-3rem))] md:group-focus-within:h-[420px] md:group-focus-within:w-[min(600px,calc(100vw-3rem))]',
          )}
        >
          <MapContainer center={MAP_START.center} zoom={MAP_START.zoom} worldCopyJump className="h-full w-full" zoomControl>
            <BaseTiles />
            <AutoResize />
            <ClickToPin onPin={onPin} />
            {pin && <Marker position={[pin.lat, pin.lng]} icon={guessIcon} />}
          </MapContainer>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-sky/60 bg-sky/20 px-4 font-bold text-sky-deep active:scale-95 md:hidden"
          >
            <span aria-hidden>{sheetOpen ? '▾' : '🗺️'}</span>
            {sheetOpen ? 'Hide' : pin ? 'Map ✓' : 'Map'}
          </button>
          <MovingBorderButton containerClassName="flex-1 md:w-full" disabled={!canGuess} onClick={onGuess}>
            {canGuess ? '📍 Guess' : hint}
          </MovingBorderButton>
        </div>
      </div>
    </div>
  )
}
