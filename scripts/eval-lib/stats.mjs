// Statistics for publishing eval results. The primary statistic is the mean over cases of
// (mean score with the plugin - mean score without it), every case weighted equally. Its uncertainty comes from
// a seeded percentile bootstrap that resamples runs independently within each case x arm (no pairing of run
// numbers across arms; graders and judge votes are never treated as samples). Pass rates get Wilson intervals,
// which stay informative when every run of an arm has the same outcome.

// mulberry32: small, fast, seeded; good enough for resampling indices.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

export function median(xs) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Linear interpolation between order statistics (R type 7).
export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

const Z = { 0.8: 1.2815515655446004, 0.9: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 };
export function z(confidence) {
  const value = Z[confidence];
  if (value === undefined) throw new RangeError(`no z value for confidence ${confidence}`);
  return value;
}

export function wilson(successes, n, confidence) {
  if (n === 0) return [NaN, NaN];
  const k = z(confidence);
  const p = successes / n;
  const denom = 1 + (k * k) / n;
  const centre = (p + (k * k) / (2 * n)) / denom;
  const half = (k * Math.sqrt((p * (1 - p)) / n + (k * k) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// cases: [{ with: number[], without: number[] }]
export const suiteDelta = (cases) => mean(cases.map((c) => mean(c.with) - mean(c.without)));

export function bootstrap(cases, { replicates, seed }) {
  const next = rng(seed);
  const draw = (xs) => {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(next() * xs.length)];
    return sum / xs.length;
  };
  const out = new Float64Array(replicates);
  for (let r = 0; r < replicates; r++) {
    let total = 0;
    for (const c of cases) total += draw(c.with) - draw(c.without);
    out[r] = total / cases.length;
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function interval(sortedReplicates, confidence) {
  const tail = (1 - confidence) / 2;
  return [percentile(sortedReplicates, tail), percentile(sortedReplicates, 1 - tail)];
}
