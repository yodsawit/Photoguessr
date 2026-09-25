/**
 * Games the server has handed out, kept in memory. Each guess the server scores is recorded
 * against its game, so an album's high score is built only from server-computed scores and can't
 * be faked. Losing this map (restart) only means an unfinished game's total isn't recorded.
 */
import { randomUUID } from 'node:crypto'

export type Game = {
  gameId: string
  poolId: string
  photoIds: string[]
  scores: Map<string, number>
  createdAt: number
}

export type GameProgress = { done: boolean; total: number; rounds: number }

const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class GameRegistry {
  private readonly games = new Map<string, Game>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 2 * 60 * 60 * 1000,
    private readonly maxGames = 5000,
  ) {}

  create(poolId: string, photoIds: string[]): Game {
    this.prune()
    const game: Game = { gameId: randomUUID(), poolId, photoIds, scores: new Map(), createdAt: this.now() }
    this.games.set(game.gameId, game)
    return game
  }

  /** The game, if it exists, is fresh and belongs to this album. */
  get(gameId: unknown, poolId: string): Game | null {
    if (typeof gameId !== 'string' || !GAME_ID.test(gameId)) return null
    const game = this.games.get(gameId)
    if (!game || game.poolId !== poolId) return null
    if (this.now() - game.createdAt > this.ttlMs) {
      this.games.delete(gameId)
      return null
    }
    return game
  }

  /**
   * Records the first score for a photo of this game (later guesses at the same photo don't
   * count). Returns progress, or null if the photo isn't part of the game.
   */
  record(game: Game, photoId: string, score: number): GameProgress | null {
    if (!game.photoIds.includes(photoId)) return null
    if (!game.scores.has(photoId)) game.scores.set(photoId, score)
    const total = [...game.scores.values()].reduce((a, b) => a + b, 0)
    const done = game.scores.size === game.photoIds.length
    if (done) this.games.delete(game.gameId) // a finished game can't be scored again
    return { done, total, rounds: game.photoIds.length }
  }

  private prune() {
    const now = this.now()
    for (const [id, g] of this.games) if (now - g.createdAt > this.ttlMs) this.games.delete(id)
    while (this.games.size >= this.maxGames) this.games.delete(this.games.keys().next().value!)
  }
}
