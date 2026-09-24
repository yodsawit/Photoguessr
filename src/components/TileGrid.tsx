import { GRID, TILE_COUNT, TILE_VALUE, tileKind } from '../game/scoring'
import type { PublicPhoto } from '../game/types'
import { cn } from '../lib/utils'
import ClickSpark from './ui/ClickSpark'

type Props = {
  photo: PublicPhoto
  /** Local object URL of the photo (fetched with the pool key). */
  imageUrl: string
  opened: ReadonlySet<number>
  disabled: boolean
  onOpen: (index: number) => void
}

const KIND_CHIP = {
  corner: 'bg-sage/25 text-sage-deep',
  side: 'bg-sky/30 text-sky-deep',
  middle: 'bg-peach/40 text-coral',
} as const

/**
 * 4x4 hidden cards over the photo. Each opened card's back face shows its own slice of the image
 * via background-position, so hidden areas never render any photo pixels.
 */
export function TileGrid({ photo, imageUrl, opened, disabled, onOpen }: Props) {
  const aspect = photo.width / photo.height

  return (
    <ClickSpark
      className="mx-auto"
      // Fit inside the viewport: leave room for the header and the bottom guess bar.
      style={{ width: `min(100%, calc((100dvh - 12.5rem) * ${aspect}))` }}
      sparkColor="#E98C6B"
    >
      <div
        className="grid w-full gap-1 rounded-2xl bg-white/70 p-1 shadow-[0_10px_30px_-12px_rgba(120,90,60,0.35)] ring-1 ring-sand sm:gap-1.5 sm:p-1.5"
        style={{
          gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`,
          aspectRatio: `${aspect}`,
        }}
      >
        {Array.from({ length: TILE_COUNT }, (_, i) => {
          const r = Math.floor(i / GRID)
          const c = i % GRID
          const kind = tileKind(i)
          const isOpen = opened.has(i)
          return (
            <button
              key={i}
              type="button"
              disabled={disabled || isOpen}
              onClick={() => onOpen(i)}
              aria-label={isOpen ? `Tile ${i + 1}, open` : `Open tile ${i + 1} (${kind}, costs ${TILE_VALUE[kind]} bonus)`}
              className={cn(
                'flip-card min-h-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-coral',
                isOpen && 'is-open',
                !isOpen && !disabled && 'cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-95',
              )}
            >
              <div className="flip-card-inner">
                <div className="flip-card-front">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-extrabold sm:text-xs', KIND_CHIP[kind])}>
                    +{TILE_VALUE[kind].toFixed(1)}
                  </span>
                </div>
                <div
                  className="flip-card-back"
                  style={
                    isOpen
                      ? {
                          backgroundImage: `url(${imageUrl})`,
                          backgroundPosition: `${(c / (GRID - 1)) * 100}% ${(r / (GRID - 1)) * 100}%`,
                        }
                      : undefined
                  }
                />
              </div>
            </button>
          )
        })}
      </div>
    </ClickSpark>
  )
}
