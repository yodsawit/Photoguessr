# Tasks

## Now
- [ ] Push 6068b01 + v2.2 commit (waiting for your OK)

## Next
- [ ] You: Render Blueprint deploy (same KEY_PEPPER as .env)
- [ ] Speed: R2 round trips make each request ~1-3 s from Thailand (cache pool/key records per request)
- [ ] Re-check animations + hover map in a visible Chrome window

## Done
- [x] v2.2 step 7: 51 tests; browser: 10 rounds, 3-photo album = 3 rounds, +10s pop, +195% badge, tick once/sec + mute remembered, score = round(base x bonus%) (2026-09-25)
- [x] v2.2 steps 1-6: new scoring (D=500 capped, bonus % from 0), +10 s per card with pop, last-10-s bump + soft tick + mute, % displays, 10 rounds + next-photo preload, album wording (2026-09-25)
- [x] Upload fixes: clear Text-vs-File error, raw-body upload option, Shortcut guide (6068b01, 2026-09-25)
- [x] v2.1 step 8: real-R2 E2E (upload, play, delete -> 0 objects; empty 2 h -> 404), UI check, committed + pushed (2026-09-25)
- [x] v2.1 step 7: sweeper redeployed with new rules, cron */15, no public URL (2026-09-25)
- [x] v2.1 step 6: two-key wording removed everywhere (code, docs, skills, CLAUDE.md, render.yaml); grep clean (2026-09-25)
- [x] v2.1 step 5: PoolHome merges play + manage; admin shows one key; /manage redirects to / (2026-09-25)
- [x] v2.1 steps 1-4: expiry 72 h/empty 1 h, ObjectStore.any, one-key PoolService + routes, R2_S3_ENDPOINT; 36 server tests (2026-09-24)
- [x] You: R2 API token + local .env filled (2026-09-24)
- [x] Dev fixes: node --watch --import tsx dev server (tsx watch hung under concurrently), printed dev admin code (2026-09-24)
- [x] v2 step 8: iPhone Shortcut guide, deploy guide, CLAUDE.md/skills updated, committed + pushed (2026-09-24)
- [x] v2 step 7: R2 bucket photoguessr (APAC, private) + photoguessr-sweeper Worker (hourly cron, no public URL) (2026-09-24)
- [x] v2 step 5: join/admin/manage screens, keyed blob photo fetch; browser E2E passed; fixed OSM Referer + /assets 404 (2026-09-24)
- [x] v2 step 6: npm run upload CLI (1920px JPEG q80, no metadata); build-pool retired (2026-09-24)
- [x] v2 step 4: R2 adapter, server/index.ts, esbuild bundle, render.yaml; smoke test with real HEIC passed (2026-09-24)
- [x] v2 step 3: Hono routes + limiter + headers + privacy logger, 12 route tests (2026-09-24)
- [x] v2 step 2: ingest.ts (WebP 1920 q80, metadata stripped, dedup, EXIF fallback) + geocode queue, 7 tests (2026-09-24)
- [x] v2 step 1: ObjectStore/PoolStore + MemoryObjects; pools.ts keys/auth/expiry, 11 tests (2026-09-24)
- [x] Answers server-side (API), flat card color, pool folders gitignored (2026-09-24)
- [x] Initial build: game, pipeline, UI, tooling, playtest (2026-09-24)
