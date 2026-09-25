# PhotoGuessr — project rules

GeoGuessr-style browser game played on private, auto-expiring pools of the owner's own photos.

## UI rules (MANDATORY — do not forget)
- UI components/inspiration come **only** from these free sources:
  - https://21st.dev/community/components
  - https://godly.design/ (inspiration only — it is a gallery, not code)
  - https://ui.aceternity.com/
  - https://uiverse.io/
  - https://reactbits.dev/
- Theme is **light and comfy**: warm cream background, soft pastel accents (sage / peach / sky),
  rounded-2xl cards, soft shadows, Nunito font. No dark neon aesthetics.
- **Mobile friendly** is required: test at 375px width, tap targets >= 44px, no hover-only
  interactions (hover may enhance, never gate), respect safe-area insets.
- Every borrowed component is adapted to TS + the light palette and credited in `CREDITS.md`
  (use the `add-ui-component` skill).

## Game rules (source of truth: `src/game/scoring.ts`)
- Photo hidden under a 4x4 grid of cards; player opens them one at a time. Opening none is allowed
  (guess blind, keep the full 120%).
- **Points %** starts at 0%; every card still hidden adds corner 4%, side 7%, middle 12%
  (all hidden = 120%, best real case 116%, all opened = 0%). UI says "Points", never "bonus",
  and never "+" before %.
- **Distance points** = 100 * e^(-10 * min(d / 1000 km, 1)), d = haversine km.
- **Pinpoint**: a guess within 100 m adds +10 to the final score, **after** the % (perfect round
  = 100 × 116% + 10 = 126; even with every card opened a pinpoint scores 10).
- **Final** = round(distance points * points% / 100) [+10 pinpoint]. 0 only without a pin.
- **Clock**: 40 s per round, **+5 s per opened card** ("+5s" pop). Last 10 s: gentle number bump
  each second + soft Web Audio tick (`src/game/sound.ts`, mute toggle remembered per device).
  At 0 s: auto-submit (0 if no pin).
- **10 rounds per game** (`ROUNDS` in `src/App.tsx`); albums with fewer photos play each once.
  Only round 1 shows the rules card; later rounds auto-start when their photo is ready.
  A game prefers photos from **different days** (`server/pick.ts`, day index
  `pools/<id>/days/<day|none>/<photoId>`, backfilled on first game); same-day photos only fill up.
- Result: full photo, both pins + line, distance, district + province (English), photo date,
  "51.3 × 116% = 60" (or "100.0 × 116% + 🎯10 = 126" on a pinpoint) and the **letter grade in its
  colour only** (no medal between rounds; medals are for game over and the album high score).
  The answer pin has a white flag; the guess pin a dot.
- **Grades** (`gradeFor`, per round; a game uses the average): F <50 rust, D 50+ purple,
  C 60+ yellow, B 70+ blue, A 80+ green, A+ 90+ gold, S 100+ rainbow. Medal (`GradeMedal`) gets
  grander per tier: cracked rusty stone F … crowned rainbow S with rays/sparkles/confetti.
- **Game over** (`GameSummary`): one motion value drives number + golden striped bar (max 100 ×
  rounds) + medal, starting at F; overflow past the max flashes, sweeps, bursts sparkles.
- **Album high score**: the server records each guess against its game (`server/games.ts`, in
  memory) and saves `pools/<id>/highscore.json` when a finished game beats it; shown on album home.

## Wording
- Players and owners see **album / albums**. Code, API routes (`/api/pools`, `/api/pool`), R2 layout
  (`pools/…`) and storage keys keep the internal name **pool**. Never show "pool" in UI, user docs
  or user-facing error messages.

## Architecture (v2: private expiring pools)
- **Render** runs `server/index.ts` (Hono): serves `dist/` + `/api/*`. **R2** bucket `photoguessr`
  stores everything; no database. **Cloudflare Worker** `photoguessr-sweeper` (`sweeper/`, hourly
  cron, every 15 min) deletes expired pools. Deploy notes: `docs/deploy.md`.
- **Pools:** created at `/admin` with `ADMIN_CODE`. **One key per pool** does everything: play,
  upload (iPhone Shortcut), status and delete on the Pool home screen (`/`). Keys: 6 chars `A-Z0-9`,
  case-insensitive, stored only as `HMAC(KEY_PEPPER, key)`. Wrong key/admin attempts: 10/min/IP,
  then the IP waits (429).
- **Expiry** (`server/expiry.ts`): a pool **with photos** is deleted 72 h after its last
  play/upload/delete; an **empty** pool 1 h after it became empty (`emptySince`: creation or last
  photo deleted; visits don't extend it). Enforced on access, by the server's hourly sweep and by
  the sweeper Worker (every 15 min). Emptiness is read from the bucket (`ObjectStore.any`).
- **Photos:** the iPhone Shortcut (`docs/iphone-shortcut.md`) or `npm run upload` sends a 1920 px
  JPEG + lat/lng/takenAt. The server ALWAYS re-encodes to WebP q80 <= 1920 px with no metadata
  (`server/ingest.ts`), dedups by sha256, geocodes via a 1 req/s Nominatim queue.
- **Layout** (single source of truth: `server/poolStore.ts`, shared with the sweeper):
  `keys/<hash>.json` -> `{poolId}`, `pools/<id>/pool.json` (`keyHash, createdAt, lastActivityAt, emptySince`),
  `pools/<id>/photos/<photoId>.{webp,json}`, `pools/<id>/hashes/<sha>`.
- **Module seams / tests:** `ObjectStore` (Memory | S3-R2 | R2 binding) → `poolStore` → `PoolService`
  (keys/auth/expiry) → `createApp` routes. Tests use `MemoryObjects` + `app.request`.

## Privacy rules (MANDATORY)
- Answers (GPS, place, date) leave the server ONLY in the `/api/guess` response for that photo.
- Keys only in `Authorization: Bearer` / `X-Admin-Code` headers, never in URLs. Photos are fetched
  with the key into blob URLs.
- Logs: method + route pattern + status + ms only — never keys, ids, bodies, coordinates, IPs.
- Never log or return error messages from unknown errors; never write uploads to local disk.
- Never import `server/` from `src/`. Never commit `.env`, `photos/`, `dist*/`.
- Known limitation: the full image is sent to players, so tiles can be revealed via devtools.

## Project skills (`.claude/skills/`)
- Project: `tasks`, `add-photo`, `add-ui-component`, `playtest`.
- AI Hero (MIT, see `.claude/skills/SOURCES.md`): `/grill-with-docs` (design interview that writes
  `CONTEXT.md` + `docs/adr/`), `tdd` (red → green, confirm seams first), `/improve-codebase-architecture`
  (HTML report of deepening opportunities). Support skills: `grilling`, `domain-modeling`, `codebase-design`.
- Changes go test-first via `tdd`; seams: `src/game/scoring.ts` (rules), `useRound` (round lifecycle),
  `server/pools.ts` (keys/expiry), `server/ingest.ts` (photo cleaning), `server/app.ts` (routes).

## Task tracking (MANDATORY for big tasks)
- Any big task (3+ steps, a build, a multi-phase change): **create the todo list with the task
  tool (TaskCreate/TaskUpdate or TodoWrite) BEFORE starting work**, one item per step, and mark
  items in_progress/completed live as each step starts/finishes — never retroactively.
- If no task tool is in the session's toolset, say so once, then track the same list in
  `TASKS.md` via the `tasks` skill (and restate progress in replies). Don't skip tracking.
