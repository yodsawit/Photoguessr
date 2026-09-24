---
name: add-photo
description: Add photos (HEIC/JPG) from this computer to a PhotoGuessr pool and verify they are playable, metadata-free and have location/place/date.
allowed-tools: Bash Read
---

# Add photos to a pool (from a computer)

Phones use the iPhone Shortcut (`docs/iphone-shortcut.md`). From a computer:

1. Put the files anywhere (e.g. `photos/`, which is gitignored because originals contain GPS).
2. Run `npm run upload -- --key <UPLOAD_KEY> [--url https://<service>.onrender.com] <files...>`
   (default URL is the local dev server). It reads GPS/date locally, sends a 1920 px JPEG with no
   metadata; photos without GPS are skipped with a message — tell the user which.
3. Verify with the play key: `GET /api/rounds?count=20` lists the photo (id/width/height only) and
   `GET /api/photo/<id>` returns `image/webp`; check `sharp(...).metadata().exif` is undefined.
4. Never print or log the keys back to the user beyond what they gave you; never commit `photos/`.
