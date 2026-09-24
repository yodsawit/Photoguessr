---
name: playtest
description: Play one full round of the game in Chrome (desktop and mobile width) and verify the rules and result screen.
---

# Playtest

1. `npm run build`, then start `ADMIN_CODE=<test code> PORT=8787 node dist-server/index.js` in the
   background (in-memory storage). Create a pool (`POST /api/pools` with `X-Admin-Code`), then
   `npm run upload -- --key <UPLOAD> --url http://localhost:8787 photos/<file>`.
2. Load the `claude-in-chrome` skill, open http://localhost:8787 and join with the play key.
   If the tab is hidden (rAF paused), drive React inputs with the native value setter + `input`
   event and force `main{opacity:1;transform:none}` for screenshots.
3. Check at desktop width and at ~375px width:
   - Guess is disabled before any tile is opened.
   - Opening a corner/side/middle tile lowers the multiplier by 0.1 / 0.2 / 0.5.
   - Pin can be dropped on the map (on mobile: open the map sheet first).
   - Submitting shows full photo, both pins + dashed line, distance, district + province,
     date, base x multiplier = final score; Next leads to the game-over screen.
   - Letting the timer hit 0 auto-submits (or scores 0 without pin/tile).
4. Screenshot the result screen and report any console errors.
