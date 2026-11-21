/**
 * Exact statistical distributions, descriptive statistics, and linear algebra utilities
 * for Multiple Linear Regression and Monte Carlo scenario projection.
 */

export function lnGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  const zm = z - 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (zm + i);
  }
  const t = zm + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Continued fraction for regularized incomplete beta function I_x(a, b)
 * using Modified Lentz's algorithm.
 */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3.0e-12;
  const FPMIN = 1.0e-30;

  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return h;
}

export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/**
 * Exact two-tailed p-value for Student's t-distribution with df degrees of freedom.
 */
export function studentTTwoTailedPValue(tStat: number, df: number): number {
  if (!Number.isFinite(tStat) || df <= 0) return 1;
  const absT = Math.abs(tStat);
  if (absT === 0) return 1;
  const x = df / (df + absT * absT);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  return Math.max(0, Math.min(1, p));
}

/**
 * Exact upper-tail p-value for Fisher's F-distribution P(F_{d1, d2} >= fStat).
 */
export function fDistributionPValue(fStat: number, d1: number, d2: number): number {
  if (!Number.isFinite(fStat) || fStat <= 0 || d1 <= 0 || d2 <= 0) return 1;
  const x = d2 / (d2 + d1 * fStat);
  const p = regularizedIncompleteBeta(x, d2 / 2, d1 / 2);
  return Math.max(0, Math.min(1, p));
}

/**
 * Critical value t_{1 - alpha/2, df} for two-sided confidence interval via bisection.
 */
export function studentTCriticalValue(df: number, alpha = 0.05): number {
  if (df <= 0) return 1.96;
  let low = 0;
  let high = 100;
  // Expand upper bound if df is very small (e.g. df = 1)
  while (studentTTwoTailedPValue(high, df) > alpha && high < 1e6) {
    high *= 2;
  }
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (low + high);
    const p = studentTTwoTailedPValue(mid, df);
    if (p > alpha) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return 0.5 * (low + high);
}

/**
 * Basic descriptive statistics helpers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

export function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

export function sampleStdDev(values: number[], avg?: number): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = avg ?? mean(values);
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (n - 1));
}

export function sampleSkewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const s = sampleStdDev(values, m);
  if (s === 0) return 0;
  let sumCube = 0;
  for (let i = 0; i < n; i++) {
    sumCube += Math.pow((values[i] - m) / s, 3);
  }
  return (n / ((n - 1) * (n - 2))) * sumCube;
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, num / denom));
}

/**
 * Matrix Inversion via Gauss-Jordan elimination with partial pivoting.
 * Returns null if the matrix is singular or numerically rank-deficient.
 */
export function invertMatrix(matrix: number[][], tolerance = 1e-10): number[][] | null {
  const n = matrix.length;
  const aug: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array<number>(2 * n).fill(0);
    for (let j = 0; j < n; j++) row[j] = matrix[i][j];
    row[n + i] = 1;
    return row;
  });

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(aug[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }

    if (maxAbs < tolerance) {
      return null;
    }

    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivotVal = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivotVal;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

/**
 * Computes X^T X and X^T y for a design matrix X (n x p) and vector y (n).
 */
export function computeNormalEquations(X: number[][], y: number[]): { xtx: number[][]; xty: number[] } {
  const n = X.length;
  const p = X[0].length;
  const xtx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty: number[] = new Array<number>(p).fill(0);

  for (let i = 0; i < n; i++) {
    const row = X[i];
    const yi = y[i];
    for (let j = 0; j < p; j++) {
      const rj = row[j];
      xty[j] += rj * yi;
      for (let k = j; k < p; k++) {
        xtx[j][k] += rj * row[k];
      }
    }
  }
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) {
      xtx[j][k] = xtx[k][j];
    }
  }
  return { xtx, xty };
}

export function multiplyMatrixVector(A: number[][], v: number[]): number[] {
  const rows = A.length;
  const cols = v.length;
  const out = new Array<number>(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let s = 0;
    const row = A[i];
    for (let j = 0; j < cols; j++) {
      s += row[j] * v[j];
    }
    out[i] = s;
  }
  return out;
}

export function quadraticForm(x: number[], M: number[][]): number {
  const mv = multiplyMatrixVector(M, x);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i] * mv[i];
  }
  return sum;
}

/**
 * Seeded PRNG (Mulberry32) for deterministic, reproducible Monte Carlo simulations
 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomStandardNormal(rng: () => number): number {
  let u1 = rng();
  let u2 = rng();
  while (u1 <= 1e-12) u1 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Build histogram bins cleanly for charts
 */
export function buildHistogram(
  values: number[],
  binCount = 10
): { label: string; min: number; max: number; count: number }[] {
  if (values.length === 0) return [];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  if (minVal === maxVal) {
    return [{ label: formatCompactNumber(minVal), min: minVal, max: maxVal, count: values.length }];
  }
  const bins = Math.max(4, Math.min(binCount, Math.ceil(Math.sqrt(values.length))));
  const width = (maxVal - minVal) / bins;
  const counts = new Array<number>(bins).fill(0);

  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - minVal) / width));
    counts[idx]++;
  }

  return counts.map((count, i) => {
    const lo = minVal + i * width;
    const hi = lo + width;
    return {
      label: `${formatCompactNumber(lo)}–${formatCompactNumber(hi)}`,
      min: lo,
      max: hi,
      count,
    };
  });
}

export function formatCompactNumber(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(val / 1_000).toFixed(0)}k`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(1);
}

export function formatNumber(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatCurrencyLike(val: number, targetName: string): string {
  if (!Number.isFinite(val)) return '—';
  const lower = targetName.toLowerCase();
  const isCurrency =
    lower.includes('precio') ||
    lower.includes('price') ||
    lower.includes('usd') ||
    lower.includes('valor') ||
    lower.includes('costo') ||
    lower.includes('tarifa') ||
    lower.includes('venta') ||
    lower.includes('alquiler') ||
    lower.includes('ingreso');

  const abs = Math.abs(val);
  const decimals = abs >= 1000 ? 0 : 2;
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);

  if (lower.includes('eur') || lower.includes('euro')) return `€${formatted}`;
  if (isCurrency) return `$${formatted}`;
  return formatted;
}

export function formatPValue(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p < 0.0001) return '< 0,0001';
  return formatNumber(p, 4);
}
