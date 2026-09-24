# iPhone Shortcut: "Add to PhotoGuessr"

Adds photos from the Photos app to your pool. The photo is shrunk and cleaned **on the phone**
(1920 px JPEG, no metadata, ~360 KB instead of ~2.5 MB). Only the image pixels and the answer
(latitude, longitude, date) are sent. Originals and your iCloud library stay private.

You need: your **pool key** (6 characters, from `/admin`) and your game URL, e.g.
`https://photoguessr.onrender.com`.

## Build it (Shortcuts app → + → new shortcut)

1. Tap the **ⓘ** (Details) → turn on **Show in Share Sheet**. Set *Share Sheet Types* to **Images** only.
2. At the top, *Receive* **Images** from **Share Sheet**. If there's no input, choose **Ask For Photos**.
3. Add **Repeat with Each** → item in **Shortcut Input**.
4. Inside the repeat, add these actions in order:
   1. **Get Details of Images** → **Location** from *Repeat Item*.
   2. **Get Details of Locations** → **Latitude** from *Location*. Tap the result → *Rename* → `Lat`.
   3. **Get Details of Locations** → **Longitude** from *Location*. Rename → `Lng`.
   4. **Get Details of Images** → **Date Taken** from *Repeat Item*.
   5. **Format Date** → *Date Taken*, Date Format **ISO 8601**, **Include ISO 8601 Time** on. Rename → `Taken`.
   6. **Resize Image** → *Repeat Item*, by **Longest Edge**, **1920**.
   7. **Convert Image** → *Resized Image* to **JPEG**, Quality **0.8**, **Preserve Metadata: OFF**.
   8. **Get Contents of URL**:
      - URL: `https://YOUR-SERVICE.onrender.com/api/photos`
      - Method: **POST**
      - Headers: `Authorization` = `Bearer ABC123` (your pool key after `Bearer `)
      - Request Body: **Form**
        - `photo` → type **File** → *Converted Image*
        - `lat` → Text → `Lat`
        - `lng` → Text → `Lng`
        - `takenAt` → Text → `Taken`
5. After the repeat, add **Show Notification**: "Added to PhotoGuessr" (optional).

## Use it
Photos → select photos → Share → **Add to PhotoGuessr**.

- **Two phones:** both can use the same pool key at the same time.
- **Duplicates:** photos already in the pool are skipped.
- **No location:** photos without a location are refused ("Photo has no location"). Location must be
  on for the Camera (Settings → Privacy → Location Services → Camera).
- **First upload after a quiet period:** it can take ~1 minute, because Render's free plan sleeps
  when idle. Open the game site first to wake it.
- **Auto-delete:** a pool with photos is deleted **3 days after the last play, upload or delete**.
  A new or emptied pool is deleted **1 hour after it became empty**, so add the first photo soon
  after creating it. Check the time on the Pool home screen (open the site, enter the key).
- **Sharing:** the same key is what players use. Anyone with it can also add and delete photos.

## Troubleshooting
| Message | Meaning |
|---|---|
| `Invalid key` | Wrong pool key, or the pool was deleted/expired |
| `Too many wrong attempts` | 10 wrong keys from your network within a minute; wait a minute |
| `Photo has no location` | The photo has no GPS (screenshots, downloaded images, location off) |
| `Unsupported image` | The file isn't a photo the server can read |
