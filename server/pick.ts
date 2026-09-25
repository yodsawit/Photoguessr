/**
 * Choosing a game's photos: at most one photo per day first, so a 10-round game spreads across
 * different days; only if the album runs out of days are same-day photos used to fill up.
 */

/** "YYYY-MM-DD" of the photo's own local time (from takenAt), or null when unknown. */
export function dayOf(takenAt: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(takenAt ?? '')
  return m ? m[1] : null
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Undated photos count as their own "day" each, so they never block one another. */
export function pickRounds(ids: string[], dayFor: (id: string) => string | null, count: number, random: () => number = Math.random): string[] {
  const shuffled = shuffle(ids, random)
  const usedDays = new Set<string>()
  const first: string[] = []
  const rest: string[] = []
  for (const id of shuffled) {
    const day = dayFor(id)
    if (day === null || !usedDays.has(day)) {
      if (day !== null) usedDays.add(day)
      first.push(id)
    } else rest.push(id)
  }
  return [...first, ...rest].slice(0, Math.max(0, count))
}
