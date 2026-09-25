import L from 'leaflet'
import { useEffect } from 'react'
import { TileLayer, useMap } from 'react-leaflet'

/** Where the guess map opens. The album is Thailand-focused, so start there (still pannable anywhere). */
export const MAP_START = { center: [13.2, 101.0] as [number, number], zoom: 5 }

export function BaseTiles() {
  return (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      maxZoom={19}
      className="soft-tiles"
    />
  )
}

/** Leaflet caches its container size; re-measure whenever the container animates/resizes. */
export function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

function pinIcon(fill: string, label: string) {
  return L.divIcon({
    className: 'pin-icon',
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    html: `<svg width="34" height="44" viewBox="0 0 34 44" aria-label="${label}">
      <path d="M17 42s14-13.2 14-24.5C31 9 24.7 3 17 3S3 9 3 17.5C3 28.8 17 42 17 42z" fill="${fill}" stroke="white" stroke-width="3"/>
      <circle cx="17" cy="17.5" r="5.5" fill="white"/>
    </svg>`,
  })
}

export const guessIcon = pinIcon('#4f8fbd', 'Your guess')
export const answerIcon = pinIcon('#e98c6b', 'Photo location')
