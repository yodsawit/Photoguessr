---
name: playtest
description: Play one full round of the game in Chrome (desktop and mobile width) and verify the rules and result screen.
---

# Playtest

1. Start `npm run dev` in the background; note the local URL.
2. Load the `claude-in-chrome` skill, open the URL.
3. Check at desktop width and at ~375px width:
   - Guess is disabled before any tile is opened.
   - Opening a corner/side/middle tile lowers the multiplier by 0.1 / 0.2 / 0.5.
   - Pin can be dropped on the map (on mobile: open the map sheet first).
   - Submitting shows full photo, both pins + dashed line, distance, district + province,
     date, base x multiplier = final score; Next leads to the game-over screen.
   - Letting the timer hit 0 auto-submits (or scores 0 without pin/tile).
4. Screenshot the result screen and report any console errors.
