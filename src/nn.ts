// A dependency-free feed-forward neural network with backpropagation, ported
// from the C engine in Bikebrainz/NeuralNetwork (network.c / forecast.c — the
// overhauled Urschel sunspot forecaster). Same maths: bias unit per layer,
// sigmoid/tanh activations, MSE loss, SGD with momentum, min/max normalization,
// windowed open/closed-loop time-series forecasting with a naive baseline.
//
// Small enough to TRAIN IN THE BROWSER on Vantage's live trend history (a few
// hundred epochs over ~100 windows is single-digit milliseconds).

export type Activation = 'sigmoid' | 'tanh'

// ---- seeded RNG (mulberry32) so a forecast is reproducible for given data ---
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function act(a: Activation, gain: number, x: number): number {
  return a === 'tanh' ? Math.tanh(gain * x) : 1 / (1 + Math.exp(-gain * x))
}
// derivative expressed in terms of the activation output y (as in network.c)
function actDeriv(a: Activation, gain: number, y: number): number {
  return a === 'tanh' ? gain * (1 - y * y) : gain * y * (1 - y)
}

export interface NetOpts {
  eta?: number // learning rate
  alpha?: number // momentum
  gain?: number // activation gain
  hiddenAct?: Activation
  outputAct?: Activation
  seed?: number
}

export class Net {
  units: number[]
  eta: number
  alpha: number
  gain: number
  acts: Activation[] // per-layer activation (index 0 unused)
  out: number[][] // out[l][0]=bias=1, out[l][1..units]
  err: number[][]
  w: number[][][] // w[l][i][j], i in 1..units[l], j in 0..units[l-1]
  dw: number[][][] // previous delta (momentum)

  constructor(units: number[], opts: NetOpts = {}) {
    if (units.length < 2) throw new Error('need >= 2 layers')
    this.units = units
    this.eta = opts.eta ?? 0.1
    this.alpha = opts.alpha ?? 0.5
    this.gain = opts.gain ?? 1
    const hidden = opts.hiddenAct ?? 'tanh'
    const output = opts.outputAct ?? 'sigmoid'
    this.acts = units.map((_, l) =>
      l === 0 ? 'sigmoid' : l === units.length - 1 ? output : hidden,
    )
    this.out = units.map((n) => {
      const a = new Array(n + 1).fill(0)
      a[0] = 1 // bias
      return a
    })
    this.err = units.map((n) => new Array(n + 1).fill(0))
    const rng = makeRng(opts.seed ?? 12345)
    this.w = units.map((n, l) =>
      l === 0 ? [] : this.initLayer(n, units[l - 1], this.acts[l], rng),
    )
    this.dw = units.map((n, l) =>
      l === 0
        ? []
        : Array.from({ length: n + 1 }, () =>
            new Array(units[l - 1] + 1).fill(0),
          ),
    )
  }

  // Xavier (tanh/sigmoid) init scaled by fan-in, matching net_init_weights.
  private initLayer(
    units: number,
    prev: number,
    a: Activation,
    rng: () => number,
  ): number[][] {
    const limit = Math.sqrt(6 / (prev + units)) * (a === 'sigmoid' ? 4 : 1)
    const rows: number[][] = [[]]
    for (let i = 1; i <= units; i++) {
      const row = new Array(prev + 1)
      for (let j = 0; j <= prev; j++) row[j] = (rng() * 2 - 1) * limit
      rows.push(row)
    }
    return rows
  }

  forward(input: number[]): number[] {
    for (let j = 0; j < input.length; j++) this.out[0][j + 1] = input[j]
    for (let l = 1; l < this.units.length; l++) {
      const prev = this.out[l - 1]
      const wl = this.w[l]
      for (let i = 1; i <= this.units[l]; i++) {
        let sum = 0
        const wi = wl[i]
        for (let j = 0; j <= this.units[l - 1]; j++) sum += wi[j] * prev[j]
        this.out[l][i] = act(this.acts[l], this.gain, sum)
      }
    }
    return this.out[this.units.length - 1].slice(1)
  }

  // One online step: forward, backprop, immediate SGD+momentum update (net_simulate).
  train(input: number[], target: number[]): number {
    this.forward(input)
    const L = this.units.length - 1
    // output error
    let loss = 0
    for (let i = 1; i <= this.units[L]; i++) {
      const y = this.out[L][i]
      const d = target[i - 1] - y
      loss += d * d
      this.err[L][i] = d * actDeriv(this.acts[L], this.gain, y)
    }
    // hidden errors
    for (let l = L - 1; l >= 1; l--) {
      for (let i = 1; i <= this.units[l]; i++) {
        let sum = 0
        const wNext = this.w[l + 1]
        for (let k = 1; k <= this.units[l + 1]; k++) sum += wNext[k][i] * this.err[l + 1][k]
        this.err[l][i] = sum * actDeriv(this.acts[l], this.gain, this.out[l][i])
      }
    }
    // weight update
    for (let l = 1; l <= L; l++) {
      const prev = this.out[l - 1]
      for (let i = 1; i <= this.units[l]; i++) {
        const wi = this.w[l][i]
        const dwi = this.dw[l][i]
        const e = this.err[l][i]
        for (let j = 0; j <= this.units[l - 1]; j++) {
          const delta = this.eta * e * prev[j] + this.alpha * dwi[j]
          wi[j] += delta
          dwi[j] = delta
        }
      }
    }
    return loss
  }
}

export interface SeriesForecast {
  predictions: number[] // next `horizon` values (raw scale)
  netRmse: number // open-loop RMSE on a held-out tail (raw scale)
  naiveRmse: number // persistence baseline RMSE on the same tail
  skill: number // 1 - netRmse/naiveRmse  (>0 means it beats persistence)
  trained: boolean // false if not enough history
  // "forecast surprise": the latest observed value vs what the model expected,
  // in units of the model's own typical error. A large surprise on a model that
  // is otherwise skilful means the learned pattern just broke — a leading signal.
  predictedLast: number // model's 1-step expectation for the latest point
  surprise: number // |actual - predicted| / netRmse  (sigmas of model error)
}

export interface ForecastOpts {
  window?: number
  hidden?: number
  horizon?: number
  epochs?: number
  seed?: number
}

export interface BacktestResult {
  netRmse: number // aggregate OUT-OF-SAMPLE RMSE across every walk-forward fold
  naiveRmse: number // persistence baseline RMSE across the same folds
  skill: number // 1 - netRmse/naiveRmse  (>0 means it genuinely beats persistence)
  mae: number // aggregate net mean-absolute-error (raw scale)
  folds: number // # of out-of-sample 1-step predictions actually evaluated
  winRate: number // fraction of folds where the net beat naive on that point
  trained: boolean // false if the series is too short to walk forward
}

const EMPTY_BACKTEST: BacktestResult = {
  netRmse: 0,
  naiveRmse: 0,
  skill: 0,
  mae: 0,
  folds: 0,
  winRate: 0,
  trained: false,
}

export interface MultiForecast {
  prediction: number // next value of the target signal (raw scale)
  netRmse: number // multivariate model RMSE on a held-out tail
  naiveRmse: number // persistence baseline RMSE on the same tail
  skill: number // 1 - net/naive (>0 = the cross-signal model adds value)
  trained: boolean
  features: number // # of input signals the model learned from
}

const EMPTY_MULTI: MultiForecast = {
  prediction: 0,
  netRmse: 0,
  naiveRmse: 0,
  skill: 0,
  trained: false,
  features: 0,
}

/**
 * MULTIVARIATE forecast: train a net to predict the next value of one target
 * signal from a window of ALL signals (so it can learn cross-signal leading
 * relationships — e.g. an aircraft/seismic surge preceding conflict). Scored
 * honestly against naive persistence of the target on a held-out tail.
 *
 * matrix: rows = time steps, cols = signals; targetIdx = column to forecast.
 */
export function forecastMultivariate(
  matrix: number[][],
  targetIdx: number,
  opts: ForecastOpts = {},
): MultiForecast {
  const window = opts.window ?? 4
  const hidden = opts.hidden ?? 12
  const epochs = opts.epochs ?? 300
  const T = matrix.length
  const F = matrix[0]?.length ?? 0
  if (F === 0 || targetIdx < 0 || targetIdx >= F) return EMPTY_MULTI
  // Require a rectangular matrix — a ragged row would leave some feature's
  // min/max at ±Infinity and corrupt normalization into NaN.
  if (matrix.some((row) => row.length !== F)) return { ...EMPTY_MULTI, features: F }
  if (T < window + 8) return { ...EMPTY_MULTI, features: F }

  const lo = 0.1
  const hi = 0.9
  const mins = new Array(F).fill(Infinity)
  const maxs = new Array(F).fill(-Infinity)
  for (const row of matrix) {
    for (let f = 0; f < F; f++) {
      if (row[f] < mins[f]) mins[f] = row[f]
      if (row[f] > maxs[f]) maxs[f] = row[f]
    }
  }
  const norm = (v: number, f: number) => {
    const r = maxs[f] - mins[f]
    return r > 0 ? ((v - mins[f]) / r) * (hi - lo) + lo : 0.5
  }
  const rangeT = maxs[targetIdx] - mins[targetIdx]
  const denormT = (n: number) =>
    rangeT > 0 ? ((n - lo) / (hi - lo)) * rangeT + mins[targetIdx] : mins[targetIdx]

  // input at time t = flattened, per-feature-normalized window [t-window, t)
  const inputAt = (t: number): number[] => {
    const a: number[] = []
    for (let k = t - window; k < t; k++)
      for (let f = 0; f < F; f++) a.push(norm(matrix[k][f], f))
    return a
  }

  const samples = T - window
  const testN = Math.max(3, Math.round(samples * 0.2))
  const trainUpb = T - testN

  const net = new Net([window * F, hidden, 1], {
    eta: 0.1,
    alpha: 0.5,
    hiddenAct: 'tanh',
    outputAct: 'sigmoid',
    seed: opts.seed,
  })
  for (let e = 0; e < epochs; e++) {
    for (let t = window; t < trainUpb; t++) {
      net.train(inputAt(t), [norm(matrix[t][targetIdx], targetIdx)])
    }
  }

  let netSq = 0
  let naiveSq = 0
  let count = 0
  for (let t = trainUpb; t < T; t++) {
    const p = denormT(net.forward(inputAt(t))[0])
    const a = matrix[t][targetIdx]
    netSq += (p - a) ** 2
    naiveSq += (matrix[t - 1][targetIdx] - a) ** 2
    count++
  }
  const netRmse = Math.sqrt(netSq / count)
  const naiveRmse = Math.sqrt(naiveSq / count)
  const skill = naiveRmse > 1e-9 ? 1 - netRmse / naiveRmse : 0
  const prediction = Math.round(denormT(net.forward(inputAt(T))[0]) * 10) / 10

  return { prediction, netRmse, naiveRmse, skill, trained: true, features: F }
}

const EMPTY: SeriesForecast = {
  predictions: [],
  netRmse: 0,
  naiveRmse: 0,
  skill: 0,
  trained: false,
  predictedLast: 0,
  surprise: 0,
}

/**
 * Train a windowed MLP on a 1-D series and forecast the next `horizon` steps
 * (closed-loop: each prediction is fed back as input). Mirrors forecast.c —
 * normalize to [0.1, 0.9], window→next-value samples, hold out a tail to score
 * net vs naive persistence. Returns trained=false if the series is too short.
 */
export function forecastSeries(
  series: number[],
  opts: ForecastOpts = {},
): SeriesForecast {
  const window = opts.window ?? 6
  const hidden = opts.hidden ?? 8
  const horizon = opts.horizon ?? 3
  const epochs = opts.epochs ?? 300
  // need enough windows to train AND a held-out tail to score honestly
  const minLen = window + 8
  if (series.length < minLen) return EMPTY

  const lo = 0.1
  const hi = 0.9
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min
  if (range === 0) {
    // flat series — perfect persistence, nothing to learn
    const v = series[series.length - 1]
    return {
      predictions: new Array(horizon).fill(v),
      netRmse: 0,
      naiveRmse: 0,
      skill: 0,
      trained: true,
      predictedLast: v,
      surprise: 0,
    }
  }
  const norm = series.map((v) => ((v - min) / range) * (hi - lo) + lo)
  const denorm = (n: number) => ((n - lo) / (hi - lo)) * range + min

  // hold out the last ~20% (>=3) of predictable points to score.
  const samples = norm.length - window
  const testN = Math.max(3, Math.round(samples * 0.2))
  const trainUpb = norm.length - testN

  const net = new Net([window, hidden, 1], {
    eta: 0.15,
    alpha: 0.5,
    hiddenAct: 'tanh',
    outputAct: 'sigmoid',
    seed: opts.seed,
  })

  for (let e = 0; e < epochs; e++) {
    for (let t = window; t < trainUpb; t++) {
      net.train(norm.slice(t - window, t), [norm[t]])
    }
  }

  // open-loop score on the held-out tail (out-of-sample). Capture the very
  // last point's prediction too — that's the model's expectation for "now".
  let netSq = 0
  let naiveSq = 0
  let count = 0
  let predictedLast = series[series.length - 1]
  for (let t = trainUpb; t < norm.length; t++) {
    const p = denorm(net.forward(norm.slice(t - window, t))[0])
    const a = series[t]
    netSq += (p - a) ** 2
    naiveSq += (series[t - 1] - a) ** 2 // persistence
    count++
    if (t === norm.length - 1) predictedLast = p
  }
  const netRmse = Math.sqrt(netSq / count)
  const naiveRmse = Math.sqrt(naiveSq / count)
  const skill = naiveRmse > 1e-9 ? 1 - netRmse / naiveRmse : 0
  predictedLast = Math.round(predictedLast * 10) / 10
  const surprise =
    netRmse > 1e-9
      ? Math.abs(series[series.length - 1] - predictedLast) / netRmse
      : 0

  // closed-loop forecast of the next `horizon` steps
  const buf = norm.slice(norm.length - window)
  const predictions: number[] = []
  for (let h = 0; h < horizon; h++) {
    const y = net.forward(buf)[0]
    predictions.push(Math.round(denorm(y) * 10) / 10)
    buf.shift()
    buf.push(y)
  }

  return {
    predictions,
    netRmse,
    naiveRmse,
    skill,
    trained: true,
    predictedLast,
    surprise: Math.round(surprise * 10) / 10,
  }
}

/**
 * WALK-FORWARD backtest of the windowed MLP — the honest, low-variance measure
 * of out-of-sample skill that a single train/test split (forecastSeries) cannot
 * give. For each fold we train a FRESH net on series[0..split), make one 1-step
 * open-loop prediction at `split`, and score it against the realized value and
 * against naive persistence. The split then advances across the held-out region.
 *
 * Two properties make this trustworthy:
 *  - No look-ahead leakage: each fold normalizes on its TRAINING slice only, so
 *    the point being predicted never informs its own min/max scaling.
 *  - Retrain-per-fold: aggregating many independent out-of-sample predictions
 *    averages out the luck of any one split — this is the standard backtest for
 *    time-series models, and what separates a measured forecaster from a demo.
 *
 * Cost is bounded by `maxFolds` (default 30): on long series the split advances
 * in strides so the walk never trains more than ~maxFolds nets.
 */
export function backtestSeries(
  series: number[],
  opts: ForecastOpts & { minTrain?: number; maxFolds?: number } = {},
): BacktestResult {
  const window = opts.window ?? 6
  const hidden = opts.hidden ?? 8
  const epochs = opts.epochs ?? 250
  // Each fold needs a window plus a few points to learn from before it can be
  // scored, and we need at least a handful of folds for the average to mean
  // anything.
  const minTrain = Math.max(opts.minTrain ?? window + 8, window + 4)
  if (series.length < minTrain + 3) return EMPTY_BACKTEST

  const firstSplit = minTrain
  const lastSplit = series.length - 1 // we predict series[split]
  const evalCount = lastSplit - firstSplit + 1
  const maxFolds = Math.max(1, opts.maxFolds ?? 30)
  const step = Math.max(1, Math.ceil(evalCount / maxFolds))
  const lo = 0.1
  const hi = 0.9

  let netSq = 0
  let naiveSq = 0
  let maeSum = 0
  let wins = 0
  let count = 0
  for (let split = firstSplit; split <= lastSplit; split += step) {
    // Scale on the training slice ONLY — no leakage from the future point.
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < split; i++) {
      if (series[i] < min) min = series[i]
      if (series[i] > max) max = series[i]
    }
    const range = max - min
    if (range === 0) continue // flat training window this fold — nothing to learn
    const norm = (v: number) => ((v - min) / range) * (hi - lo) + lo
    const denorm = (n: number) => ((n - lo) / (hi - lo)) * range + min

    const net = new Net([window, hidden, 1], {
      eta: 0.15,
      alpha: 0.5,
      hiddenAct: 'tanh',
      outputAct: 'sigmoid',
      seed: opts.seed,
    })
    for (let e = 0; e < epochs; e++) {
      for (let t = window; t < split; t++) {
        const win = new Array(window)
        for (let k = 0; k < window; k++) win[k] = norm(series[t - window + k])
        net.train(win, [norm(series[t])])
      }
    }

    const inWin = new Array(window)
    for (let k = 0; k < window; k++) inWin[k] = norm(series[split - window + k])
    const p = denorm(net.forward(inWin)[0])
    const actual = series[split]
    const naive = series[split - 1] // persistence
    const netErr = Math.abs(p - actual)
    const naiveErr = Math.abs(naive - actual)
    netSq += (p - actual) ** 2
    naiveSq += (naive - actual) ** 2
    maeSum += netErr
    if (netErr < naiveErr) wins++
    count++
  }
  if (count === 0) return EMPTY_BACKTEST

  const netRmse = Math.sqrt(netSq / count)
  const naiveRmse = Math.sqrt(naiveSq / count)
  const skill = naiveRmse > 1e-9 ? 1 - netRmse / naiveRmse : 0
  return {
    netRmse,
    naiveRmse,
    skill,
    mae: maeSum / count,
    folds: count,
    winRate: wins / count,
    trained: true,
  }
}
