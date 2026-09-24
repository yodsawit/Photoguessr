const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Formats the photo's own local time ("2024-09-28T11:10:56+07:00" -> "28 September 2024 · 11:10"), ignoring the viewer's timezone. */
export function formatTakenAt(iso: string | null): string {
  if (!iso) return 'Unknown date'
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return 'Unknown date'
  const [, y, mo, d, h, mi] = m
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y} · ${h}:${mi}`
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}
