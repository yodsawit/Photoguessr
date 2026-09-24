---
name: add-photo
description: Add a new photo (HEIC/JPG) to the game's photo pool and verify its GPS, date and place metadata.
allowed-tools: Bash Read
---

# Add a photo to the pool

1. Copy the source file into `photos/` (keep the original name).
2. Run `npm run pool`.
3. Read `server/data/pool.json` and confirm the new entry has `lat`, `lng`, `takenAt`,
   `district`, `province`. Photos without GPS are skipped by the script — tell the user.
4. Confirm the served copy has no EXIF:
   `node -e "import('exifr').then(async m=>console.log(await m.default.gps('public/pool/<id>.jpg')))"`
   must print `undefined`.
5. Report the entry (place + date) to the user. Never commit `photos/`.
