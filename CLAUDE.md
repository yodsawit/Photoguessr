# PhotoGuessr — project rules

GeoGuessr-style browser game played on a static pool of the owner's own photos.

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
- Photo hidden under a 4x4 grid of cards; player opens 1 at a time, must open >= 1 before guessing.
- Tile bonus: corner 0.1, side 0.2, middle 0.5. Multiplier = 1.0 + sum of values of tiles
  still hidden (5.0 theoretical, 4.9 practical max).
- 30 s per round (whole round). At 0 s: auto-submit if >= 1 tile open and a pin is placed, else 0.
- Score = round(100 * e^(-10 * d / 1000) * multiplier), d = haversine km (base 100, D = 1000 km).
- Result: full photo, both pins + line, distance, district + province (English), photo date, score.
- Currently 1 round per game (`ROUNDS` in `src/App.tsx`).

## Photo pipeline
- Raw photos go in `photos/` (gitignored — they contain GPS). `npm run pool` runs
  `scripts/build-pool.ts`: reads EXIF (exifr), converts HEIC -> JPEG, resizes, **strips all
  metadata**, reverse-geocodes via Nominatim (cached in `scripts/.geocache.json`), writes
  `public/pool/<id>.jpg` + `server/data/pool.json`.
- Never ship a served image with EXIF.
- **Answers never reach the client before the guess.** The browser only gets `PublicPhoto`
  (id, src, width, height) from `GET /api/rounds`; `POST /api/guess` scores server-side and
  reveals the `Answer`. API lives in `server/api.ts`, mounted in Vite dev + preview. Never import
  `server/` or the pool JSON from `src/`. `server.fs.deny` blocks `server/`, `scripts/`, `photos/`.
- `public/pool/` and `server/data/` are gitignored; regenerate with `npm run pool`.
- Known limitation: the full image is still sent, so a player could reveal tiles via devtools.

## Stack & commands
Vite + React 19 + TS + Tailwind v4 + motion + react-leaflet (OpenStreetMap tiles; CARTO now needs an API key), Vitest.
- `npm run dev` / `npm run build` / `npm test` / `npm run typecheck` / `npm run pool`

## Project skills (`.claude/skills/`)
- Project: `tasks`, `add-photo`, `add-ui-component`, `playtest`.
- AI Hero (MIT, see `.claude/skills/SOURCES.md`): `/grill-with-docs` (design interview that writes
  `CONTEXT.md` + `docs/adr/`), `tdd` (red → green, confirm seams first), `/improve-codebase-architecture`
  (HTML report of deepening opportunities). Support skills: `grilling`, `domain-modeling`, `codebase-design`.
- Scoring/rules changes should go test-first via `tdd`; the natural seams are `src/game/scoring.ts`
  (pure rules) and `useRound` (round lifecycle).

## Task tracking
Use the built-in task tools (TaskCreate/TaskUpdate/TodoWrite) if present in the session.
Otherwise track work in `TASKS.md` via the `tasks` skill, updating it live, not at the end.
