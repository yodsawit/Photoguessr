# Tasks

## Now
- [ ] You: create R2 API token (Object Read & Write, bucket photoguessr) -> Render env + local .env
- [ ] You: Render -> New -> Blueprint -> yodsawit/Photoguessr; set ADMIN_CODE, R2_*, NOMINATIM_CONTACT
- [ ] Verify on real R2 + Render: E2E, two phones at once, sweeper deletes a 4-day-old test pool
- [ ] Re-check animations + hover map in a visible Chrome window
- [ ] More rounds (raise ROUNDS in src/App.tsx)

## Done
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
