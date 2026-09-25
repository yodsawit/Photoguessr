# Deploying PhotoGuessr (Render + Cloudflare R2)

Already done (Cloudflare account `Yodsawit44@gmail.com's Account`):
- **R2 bucket:** `photoguessr` (APAC). Private; its public r2.dev URL is off.
- **Worker:** `photoguessr-sweeper`. Runs every 15 minutes with an R2 binding and has no public URL. It deletes expired albums: empty for more than 1 hour, or with photos and inactive for more than 3 days. Its source is `sweeper/`; rebuild with `npm run build:sweeper`.

## 1. R2 API token (you do this; it's a secret)
Cloudflare dashboard → **R2** → **Manage API tokens** → **Create API token**:
- Permissions: **Object Read & Write**
- Scope: **Apply to specific buckets only** → `photoguessr`
- Copy the **Access Key ID**, **Secret Access Key**, and the **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
- The token value itself (`R2_API_TOKEN`) is **not** used by PhotoGuessr; leave it out of `.env` and Render.

The secret is shown once. Put it only in Render and in your local `.env`, never in git.

## 2. Render
Render dashboard → **New** → **Blueprint** → connect GitHub → `yodsawit/Photoguessr`.
`render.yaml` creates the web service. Fill in the prompted secret values:

| Variable | Value |
|---|---|
| `ADMIN_CODE` | A long code of your choice. Needed to create albums at `/admin` |
| `R2_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` (or set `R2_ACCOUNT_ID` instead) |
| `R2_ACCOUNT_ID` | Cloudflare account ID (only needed without `R2_S3_ENDPOINT`) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | From step 1 |
| `NOMINATIM_CONTACT` | Your email. Sent only to OpenStreetMap Nominatim, as its usage policy asks |
| `SURPRISE_KEY` / `SURPRISE_ALBUM_KEY` | Optional birthday surprise, see below. Leave empty to turn it off |

### Birthday surprise (optional)
`SURPRISE_KEY` is an extra key that plays the photos of the album `SURPRISE_ALBUM_KEY`. It is play-only:
no uploads or deletes, and it doesn't count toward the high score. A game counts as played at its first
guess. From the **2nd game** on, **round 3** hides the gift photo under the cards. Locking a guess (or
running out of time) opens a Happy Birthday page with the gift instead of the result. After that page has
been shown, games are normal again. Reloads and abandoned games can't use the surprise up.
- Upload the gift once. It is cleaned like any photo and stored in R2 at `pools/<id>/surprise/gift.webp`:
  `curl -X PUT -H "X-Admin-Code: $ADMIN_CODE" --data-binary @gift.jpg https://<app>/api/surprise/gift`
- After testing, reset the count and the "seen" flag so her 2nd game is the surprise one:
  `curl -X POST -H "X-Admin-Code: $ADMIN_CODE" https://<app>/api/surprise/reset`
- The gift and the count are deleted with the album. The album still expires 72 h after its last activity.

`KEY_PEPPER`: paste the **same value as in your local `.env`** (both use the same bucket) before creating any album. **Never change it afterwards**: every existing key would stop working.

Free plan notes:
- The service sleeps after 15 min idle, so the first request takes about 1 minute.
- The server has 512 MB of memory. The iPhone Shortcut sends about 360 KB per photo, well within that.

## 3. Local dev
`npm run dev` starts the API (:8787) and Vite (5173, or the next free port) with `/api` proxied.
- Look for both `[api] PhotoGuessr server on :8787` and `[web] Local: ...` in the output.
- Without `.env`, storage is in-memory and the terminal prints a throwaway `dev admin code: …` to use at `/admin`.
- **Port 8787 serves the last `npm run build`** (the files in `dist/`), not live code. For instant updates use the Vite address (`:5173`, or the next free port), or run `npm run build` after changes.

### Against real R2 (optional)
Copy `.env.example` → `.env` and fill it in. Use the **same** `KEY_PEPPER` as Render, because both use the same bucket. Then run `npm run dev`; the log shows `storage: R2`.

## 4. Check
1. `https://<service>.onrender.com/admin` → create an album → note its key (shown once). It is deleted in 1 hour if it stays empty.
2. Add a photo with the iPhone Shortcut (`docs/iphone-shortcut.md`), or run `npm run upload -- --key <POOL_KEY> --url https://<service>.onrender.com photos/x.HEIC`.
3. Open the site and enter the album key. Album home shows the photo count and auto-delete time → **Play**.
4. Album home → *Album key & settings* → **Delete album now** removes everything.
