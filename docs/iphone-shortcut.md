# iPhone Shortcut: "Add to PhotoGuessr"

> **Simpler option:** open your album in the game and tap **📷 Add photos**. It uploads original
> photos from your gallery or computer directly (up to 50 at a time, 40 MB each). If photos arrive
> "without location", tap **Options** in the iPhone photo picker and turn **Location** on — or use
> this Shortcut, which always sends the location.

Adds photos from the Photos app to your album. The photo is shrunk and cleaned **on the phone**
(1920 px JPEG, no metadata, ~360 KB instead of ~2.5 MB). Only the image pixels and the answer
(latitude, longitude, date) are sent. Originals and your iCloud library stay private.

You need: your **album key** (6 characters, from `/admin`) and your game URL, e.g.
`https://photoguessr.onrender.com`.

## Build it (Shortcuts app → + → new shortcut)

1. Tap the **ⓘ** (Details) → turn on **Show in Share Sheet**. Set *Share Sheet Types* to **Images** only.
2. At the top, *Receive* **Images** from **Share Sheet**. If there's no input, choose **Ask For Photos** and turn on **Select Multiple**.
3. Add **Repeat with Each** → item in **Shortcut Input**.
4. Inside the repeat, add these actions in order:
   1. **Get Details of Images** → **Location** from *Repeat Item*.
   2. **Get Details of Locations** → **Latitude** from *Location*. Tap the result → *Rename* → `Lat`.
   3. **Get Details of Locations** → **Longitude** from *Location*. Rename → `Lng`.
   4. **Get Details of Images** → **Date Taken** from *Repeat Item*.
   5. **Format Date** → *Date Taken*, Date Format **ISO 8601**, **Include ISO 8601 Time** on. Rename → `Taken`.
   6. **Resize Image** → *Repeat Item*, by **Longest Edge**, **1920**.
   7. **Convert Image** → *Resized Image* to **JPEG**, Quality **0.8**, **Preserve Metadata: OFF**.
   8. **Get Contents of URL**. It must come **after** Convert Image; the order matters.
      - URL: `https://YOUR-SERVICE.onrender.com/api/photos`. Include `https://`, or `http://` for a
        local test such as `http://192.168.x.x:8787/api/photos`.
      - Method: **POST**
      - Headers: `Authorization` = `Bearer ABC123` (the word `Bearer`, a space, then your album key)
      - Request Body: **Form**
        - `photo` → add it with **Add new field → File** (not Text!) → *Converted Image*
        - `lat` → **Text** → `Lat`
        - `lng` → **Text** → `Lng`
        - `takenAt` → **Text** → `Taken`
   9. **Show Notification** → *Contents of URL* (turn **Play Sound** off if you like). It appears as a
      banner that goes away by itself, so you don't need to tap Done. Success shows `{"photoId": …}`;
      otherwise it shows the reason. Use **Show Result** instead only while you're debugging, because it
      stays on screen until you tap Done.
   - **Skip photos without a location before sending them:** right after step 3 (`Lng`), add **If** →
     *Location* → **has any value**. Drag steps 4–10 inside the **If**. For **Otherwise**, leave it
     empty, or add **Show Notification** "Skipped: no location". Those photos never make a request.
5. After the repeat, add **Show Notification**: "Added to PhotoGuessr" (optional).

**Alternative without form fields.** Set Request Body to **File** → *Converted Image*, and send the
answer as headers instead: `X-Lat` = `Lat`, `X-Lng` = `Lng`, `X-Taken-At` = `Taken` (plus `Authorization`).

## Share one shortcut for every album (the "⚡ Add iPhone Shortcut" button)
The album home can link to one shared shortcut that asks for the album key when it's added. Never
share a shortcut with a real key typed in: anyone with the iCloud link would get that album.

1. At the very top of the shortcut (before Repeat), add a **Text** action and type `ABC123` in it.
2. In **Get Contents of URL**, edit the header `Authorization`: delete the typed key and keep `Bearer `
   (with the space). Right after it, tap **Select Variable** above the keyboard, then tap the **Text**
   action, so the value reads `Bearer [Text]`. (Renaming isn't needed; to use a name, add
   **Set Variable** `AlbumKey` after the Text action and insert that instead.)
3. **ⓘ → Setup** (or *Import Questions*) → **Add Question** → pick the **Text** action.
   Question: `What's your album key?`. Default answer: `ABC123`, never a real key.
4. **Share → Copy iCloud Link**. Put that link in `SHORTCUT_URL` (`src/game/shortcut.ts`) and deploy.
   Delete any older shared link that still has a real key in it
   (Settings → your name → iCloud → Manage… → Shortcuts, or re-share after the edit).

Tapping the button copies the key, then opens the link. When iPhone asks "What's your album key?"
while adding the shortcut, paste the key. To switch albums later, edit the Text action.

## Use it
Photos → select photos → Share → **Add to PhotoGuessr**.

- **Two phones:** both can use the same album key at the same time.
- **Duplicates:** photos already in the album are skipped.
- **No location:** photos without a location are refused ("Photo has no location"). Location must be
  on for the Camera (Settings → Privacy → Location Services → Camera).
- **First upload after a quiet period:** it can take ~1 minute, because Render's free plan sleeps
  when idle. Open the game site first to wake it.
- **Auto-delete:** an album with photos is deleted **3 days after the last play, upload or delete**.
  A new or emptied album is deleted **1 hour after it became empty**, so add the first photo soon
  after creating it. Check the time on the Album home screen (open the site, enter the key).
- **Sharing:** the same key is what players use. Anyone with it can also add and delete photos.

## Troubleshooting
| Message | Meaning |
|---|---|
| Nothing happens, album stays empty | Shortcuts doesn't show server errors. Add **Show Result** after Get Contents of URL |
| `Missing photo: … sent as Text …` | The `photo` form field is a Text field. Delete it and add it again with **Add new field → File** |
| `Missing photo: no 'photo' field …` | The form field isn't named exactly `photo`, or Convert Image runs after the upload |
| `couldn't convert from Rich Text to URL` | The URL is missing `http://` or `https://` |
| `Invalid key` | Wrong album key, `Bearer ` missing in the header, or the album was deleted/expired |
| `Too many wrong attempts` | 10 wrong keys from your network within a minute; wait a minute |
| `Photo has no location` | The photo has no GPS (screenshots, downloaded images, location off) |
| `Unsupported image` | The file isn't a photo the server can read |
