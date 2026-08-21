# Estate Manager

Internal tool for adding/editing property listings on kocsisagnes.hu —
no more hard-coding HTML.

## Run it

Double-click **`estate_manager.pyw`** (needs Python 3 installed, nothing else),
or from a terminal:

```
python estate_manager.pyw
```

## How it works

- All listings live in **`data/properties.js`** — the only file the
  website reads for property data. Every page (HU + EN) renders from it.
- The app edits that file and copies photos into
  `assets/properties/<category>/property-N/`.
- After pressing **Save**, the website is already up to date — just
  commit + push as usual.

## Quick guide

| Action | How |
|---|---|
| Add a listing | Pick the category → **➕ New property** → fill both language tabs → **➕ Add photos…** → **💾 Save** |
| Feature on homepage | Set **Featured order** to 1, 2, … (0 = not featured) |
| Change photo order | Select a photo → **▲/▼** (the first one is the cover) |
| Reorder listings on the page | Select in the list → **▲ Move up / ▼ Move down** |
| Translate quickly | On the English tab: **⇩ Copy from Hungarian tab**, then translate |
| Sanity check | `python estate_manager.pyw --selftest` |

Photos: select them in the order you want them shown — the first becomes
the cover image (`main.*`). Any of jpg / jpeg / png / webp / jfif works.
