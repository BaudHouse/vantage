# VANTAGE

**A live, global common operating picture for conflict & risk — fused from free,
mostly key-less data, with a local-AI analyst.** A 3D globe overlays real-time
conflict, seismic, disaster, aircraft, vessel, wildfire, traffic-camera and
weather-radar layers, and a local Ollama model reasons over all of it.

> Think "a self-hostable, $0-data-cost Palantir-lite for open-source intelligence."

## Why it's interesting

- **Key-less multi-INT fusion.** Most layers need **no API key at all** — GDELT
  (conflict wire), USGS (seismic), NASA EONET (disasters/wildfires), adsb.lol
  (ADS-B aircraft incl. military), NYC DOT + Caltrans (live traffic cams),
  RainViewer (weather radar), Stooq (defense/commodity/FX tape). Two optional
  free keys unlock global thermal (NASA FIRMS) and AIS vessels.
- **Headline geocoding (the moat).** GDELT only tells you the *publisher's*
  country. Vantage reads the actual dateline out of each headline via a
  conflict-zone gazetteer, so a US outlet covering Kyiv plots in **Ukraine, not
  Washington** — and only *precisely-located* events color the heatmap. This is
  unit-tested (`src/gazetteer.test.ts`).
- **Local-AI analyst.** An Ollama model (qwen2.5) acts as an all-source analyst
  (BLUF-first, fact-vs-assessment, confidence) over every active layer, plus
  per-market AI forecasts — **zero inference cost, fully private, no per-token
  economics.**
- **Click any entity → dossier.** Full attributes per aircraft/vessel/fire/cam
  (with live image), an "Ask Operator about this" action, and a searchable
  camera gallery.

## Architecture

- **Vite + React 19 + TypeScript**, `react-globe.gl` + `three` for the globe
  (lazy-loaded; initial bundle ~81 kB gzip, globe in a separate async chunk).
- **Feeds**: dev routes through the Vite proxy (CORS); a packaged **Electron**
  build routes every fetch through an **allow-listed main-process handler** so
  the renderer keeps `webSecurity: true`.
- **Secrets**: optional keys are loaded **at runtime** from `userData/keys.json`
  (or env) via a `contextBridge` — **never baked into the web bundle**.
- **Resilience**: AbortController timeouts, `Promise.allSettled`, GDELT
  rate-limit backoff + last-good cache, AIS auto-reconnect, React error
  boundaries, output escaping (`escapeHtml`/`safeUrl`) on all feed/LLM data.

## Run

```bash
npm install
npm run dev            # http://localhost:5174  (browser)
npm run electron:dev   # desktop app
npm test               # vitest (gazetteer, choropleth, XSS guards)
npm run build          # type-checked production build
```

### Optional free keys

Local dev: put them in `.env.local` (gitignored):

```
VITE_FIRMS_KEY=…       # global thermal — firms.modaps.eosdis.nasa.gov/api/map_key/
VITE_AISSTREAM_KEY=…   # live vessels  — aisstream.io
```

For a **distributed desktop build**, build *without* `.env.local` and ship keys
in `userData/keys.json` — they load at runtime and stay off the bundle.

## Honest limitations

- AIS vessels and global FIRMS thermal genuinely require a free key (no reliable
  key-less global source exists). The keyless wildfire baseline (EONET) is
  US-centric.
- The gazetteer covers the major active conflict zones; obscure datelines fall
  back to publisher country (clearly labeled in the feed).
- The 1.8 MB globe chunk (three.js) loads after first paint — fine for desktop.

## Data sources
GDELT · USGS · NASA EONET · NASA FIRMS · adsb.lol · AISStream · NYC DOT ·
Caltrans · RainViewer · Stooq · Natural Earth · Ollama (local)
