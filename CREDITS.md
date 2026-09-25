# Credits

UI components adapted from free community sources (see CLAUDE.md for the approved list).

| Component | Source | Changes |
|---|---|---|
| Count Up | [ReactBits](https://reactbits.dev/text-animations/count-up) (TS + Tailwind) | Used as-is for score counters |
| Click Spark | [ReactBits](https://reactbits.dev/animations/click-spark) (TS + Tailwind) | Canvas above children, DPR scaling, rAF only while active, pointer events, reduced-motion |
| Dot Background | [Aceternity UI](https://ui.aceternity.com/components/grid-and-dot-backgrounds) | Fixed full-viewport, warm cream dots, pastel glows, light only |
| Moving Border | [Aceternity UI](https://ui.aceternity.com/components/moving-border) | Typed props, light face + coral glow, static disabled state, reduced-motion |
| Flip card | [uiverse.io — joe-watson-sbf](https://uiverse.io/joe-watson-sbf/little-goat-24) | Click (one-way) instead of hover, back face shows photo slice, grid-sized, flat peach face (no gradient) |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/copyright) standard tiles | Softened with a CSS filter; follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |
| Layout mood | [godly.design](https://godly.design/) | Inspiration only |

## Sounds and music (all CC0; GeoGuessr's own sounds are copyrighted and not used)

| File (`public/sfx/`) | Source | Licence |
|---|---|---|
| `guess` (drop_003, softened), `count` (tick_002), `bar` (tick_001), `pinpoint` (glass_001), `overflow` (confirmation_004) | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 |
| `pin` (impactWood_light_001, softened) | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 |
| `card` (card-slide-2) | [Kenney — Casino Audio](https://kenney.nl/assets/casino-audio) | CC0 |
| `grade-low` (PIZZI05), `grade-mid` (PIZZI04), `grade-high` (PIZZI10), `grade-s` (PIZZI02), `medal-low` (SAX07), `medal-mid` (STEEL02), `medal-high` (STEEL12), `medal-s` (HIT15) | [Kenney — Music Jingles](https://kenney.nl/assets/music-jingles) | CC0 |
| `music` — "Calm Piano 1 (Vaporware)" | [The Cynic Project on OpenGameArt](https://opengameart.org/content/calm-piano-1-vaporware) | CC0 |
| `alarm` — twin-bell alarm-clock ring | Synthesized for this project | — |

All files were trimmed, loudness-normalised and re-encoded to mp3; the music has a fade in/out.

## Birthday party page (`/hbd`, `public/hbd/`)

Third-party meme content, not CC0, supplied by the owner for this one personal birthday page (see
CLAUDE.md). The game itself never uses it.

| File | Source |
|---|---|
| `song.mp3`: "Magic Mamaliga" by OMFO (Borat soundtrack), meme clip | [Myinstants](https://www.myinstants.com/en/instant/borat-magic-mamaliga-41708/) · [Spotify](https://open.spotify.com/track/0BvrrxYDRXVjsWH0CzRQxg) |
| `cat-1.mp4` … `cat-7.mp4`: green-screen cat meme clips | TikTok, supplied by the owner; cropped, re-encoded to H.264, no audio |
| `explosion.mp4`: green-screen explosion | Supplied by the owner; trimmed, re-encoded to H.264, no audio |
| `photo.webp` | The owner's photo, re-encoded without metadata |
| boom sound | `public/sfx/overflow.mp3` (Kenney, CC0) |

The green screen is removed in the browser by `src/components/ChromaVideo.tsx` (WebGL). The title,
flames and confetti on that page are original (motion/react).
