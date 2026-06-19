# VANTAGE

[![CI](https://github.com/Bikebrainz/vantage/actions/workflows/ci.yml/badge.svg)](https://github.com/Bikebrainz/vantage/actions/workflows/ci.yml)

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

### Prediction stack — "track everything → detect → predict"

- **Early-warning engine.** Every metric's history is snapshotted each refresh;
  a z-score anomaly detector (rising-only, with an absolute floor so flat
  metrics can't false-positive) flags what's *statistically abnormal* and badges
  it on the TRENDS button (`src/anomaly.ts`, unit-tested).
- **In-browser neural forecaster.** A faithful TypeScript port of
  [Bikebrainz/NeuralNetwork](https://github.com/Bikebrainz/NeuralNetwork) — the
  overhauled Urschel **sunspot backprop net** (MLP, SGD+momentum, min/max
  normalization, windowed open/closed-loop forecasting) — **trains in the
  browser** on each metric's live history and projects the next steps, each with
  an **80% prediction interval** derived from the model's own out-of-sample error
  (so every forecast carries calibrated uncertainty, not just a point). A second
  **multivariate "all-signal" model** forecasts one metric from a window of
  *every* signal, learning cross-signal leading relationships a univariate model
  would miss. Both are scored against a naive-persistence baseline
  (`skill = 1 − net/naive`), and a **forecast-surprise** flag fires when the
  latest reading breaks a model that is otherwise skilful. No backend, no GPU.
  Unit-tested incl. golden checks (learns XOR, beats persistence on a sine wave).
  *(`src/nn.ts`)*
- **Forecast accountability — the part most "AI forecasts" skip.** Vantage
  doesn't just predict; it grades itself against reality, entirely on-device:
  - **Outcome-driven scorecard.** Each cycle's 1-step forecast is resolved by the
    *next* cycle's real value; Vantage keeps the (predicted, realized) pairs and
    learns realized RMSE, **systematic bias** — and auto-corrects future
    forecasts by it (marked ↺) — plus direction accuracy. It scores against what
    *actually happened*, not a held-out slice of the past. *(`src/scorecard.ts`)*
  - **Walk-forward backtest.** On demand, a fresh net is **retrained per fold**
    across an expanding window, each fold making one out-of-sample prediction — a
    low-variance, leakage-free skill estimate a single train/test split can't
    give. *(`backtestSeries`)*
  - **Interval coverage calibration.** The 80% bands are themselves checked: how
    often did reality actually land inside? A well-calibrated band covers ≈80%,
    surfaced per-metric so over/under-confidence is visible, not assumed.
  - **Brier-scored probabilistic outlook.** The Likely/Possible/Watch forward
    forecast is calibrated with a Brier score + reliability bins against a
    base-rate baseline. *(`src/calibration.ts`)*
- **Butterfly-effect cascade (multi-model consensus).** Enter any trigger and the
  local model maps how it cascades into compounding cross-domain effect chains
  (MIL/ECON/CIVIL/ENERGY/CYBER/DIPLO/SUPPLY), each step with a conditional
  likelihood whose product is the chain's compounded probability. For accuracy it
  runs an **ensemble**: several independent drafts (across more than one local
  model) are **reconciled into a calibrated consensus**, a **red-team critique**
  pass then stress-tests each likelihood against base rates for over-confidence,
  and chain-level **agreement is measured by embedding cosine** — so a recurring
  conclusion is weighted by how many drafts genuinely reached it. Reachable from
  a nav button, any dossier entity, or a developing situation. *(`src/cascade.ts`)*
- **AI assessment & 24–72h outlook.** Developing situations are auto-assessed
  (driver + what's next, anchored to the neural projection); the daily briefing
  auto-runs a calibrated Likely/Possible/Watch forward forecast.
- **Watchlist + desktop alerts.** Pin regions; get an in-app badge *and* an OS
  notification when conflict activity or any metric spikes past your baseline.
- **Agentic camera verification.** Ask the Operator about a place with cameras
  nearby and it **pulls the live feeds, runs vision on them, and answers from
  current ground truth** ("traffic light, clear skies, construction crew on the
  bridge") — not just feed counts.
- All AI calls funnel through one **single-flight queue** so a local Ollama
  instance is never overloaded by concurrent auto-triggers.

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
npm test               # vitest — 120 tests (forecaster + backtest + intervals,
                       #   scorecard coverage, Brier calibration, gazetteer,
                       #   choropleth, XSS guards, feed NaN-guards, …)
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

## Data sources (15 live layers)
GDELT (conflict) · USGS + EMSC (seismic) · GDACS (multi-hazard alerts) ·
NASA EONET (disasters) · adsb.lol (aircraft) · NOAA NHC (cyclones) ·
USGS HANS (volcanoes) · NASA EONET/FIRMS (wildfires) · NWS (US severe-wx alerts) ·
wheretheiss (ISS) · Safecast (radiation) · WAQI (air quality†) · AISStream (vessels†) ·
NYC DOT + Caltrans + Windy (traffic + global cams†) · RainViewer (weather radar) ·
Stooq + CoinGecko (markets/crypto) · Natural Earth · Ollama (local AI)

† optional, free signup key (FIRMS, AISStream, WAQI, Windy) — load via `.env.local`
in dev or `userData/keys.json` in a build. Everything else is fully key-less.
