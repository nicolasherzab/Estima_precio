import {
  BusinessRuleInsight,
  CategoryBreakdown,
  CorrelationPair,
  EdaResult,
  NumericSummary,
  PreprocessedDataset,
  VariableRecommendation,
} from '../types/analytics';
import {
  buildHistogram,
  formatCurrencyLike,
  formatNumber,
  mean,
  median,
  pearsonCorrelation,
  quantile,
  sampleSkewness,
  sampleStdDev,
} from './mathStats';

const PRICE_TARGET_KEYWORDS = [
  'precio',
  'price',
  'valor',
  'tarifa',
  'costo',
  'cost',
  'venta',
  'sale',
  'importe',
  'monto',
  'alquiler',
  'renta',
  'rent',
  'ingreso',
  'revenue',
  'usd',
  'eur',
];

function tokenizeContext(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function suggestVariables(
  preprocessed: PreprocessedDataset,
  businessContext: string,
  businessQuestion: string
): VariableRecommendation {
  const { numericColumns, categoricalColumns, encodedRows, dummyMappings } = preprocessed;
  const combinedText = `${businessContext} ${businessQuestion}`;
  const contextTokens = tokenizeContext(combinedText);
  const matchedKeywords = new Set<string>();

  if (numericColumns.length === 0) {
    return {
      suggestedTarget: '',
      targetJustification: 'No se encontraron columnas numéricas disponibles para modelar como variable dependiente.',
      suggestedFeatures: [],
      featureJustifications: {},
      contextKeywordsMatched: [],
    };
  }

  // Score each numeric column as candidate for Dependent Variable Y
  let bestTarget = numericColumns[numericColumns.length - 1];
  let bestScore = -Infinity;

  for (let idx = 0; idx < numericColumns.length; idx++) {
    const col = numericColumns[idx];
    const norm = normalizeName(col);
    let score = 0;

    for (const kw of PRICE_TARGET_KEYWORDS) {
      if (norm.includes(kw)) {
        score += 50;
        matchedKeywords.add(kw);
      }
    }

    // Check overlap with business context / question
    for (const token of contextTokens) {
      if (norm.includes(token) || token.includes(norm.split('_')[0])) {
        score += 12;
        matchedKeywords.add(token);
      }
    }

    // Conventionally target variable is often the last numeric column
    if (idx === numericColumns.length - 1) score += 8;

    // Target should have high numeric dispersion (not just 0/1/2/3)
    const vals = encodedRows.map((r) => r[col]);
    const uniq = new Set(vals).size;
    if (uniq >= 10) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = col;
    }
  }

  const yVals = encodedRows.map((r) => r[bestTarget]);

  // Evaluate candidate independent variables (both numeric != bestTarget and categorical source columns)
  const featureJustifications: Record<
    string,
    { recommended: boolean; reason: string; corrWithY: number }
  > = {};
  const suggestedFeatures: string[] = [];

  // 1. Numeric predictors
  const numericCandidates = numericColumns.filter((c) => c !== bestTarget);
  const corrWithYMap = new Map<string, number>();

  for (const col of numericCandidates) {
    const xVals = encodedRows.map((r) => r[col]);
    const r = pearsonCorrelation(xVals, yVals);
    corrWithYMap.set(col, r);
  }

  // Sort numeric candidates by |r| descending to handle severe collinearity intelligently
  const sortedNumeric = [...numericCandidates].sort(
    (a, b) => Math.abs(corrWithYMap.get(b) ?? 0) - Math.abs(corrWithYMap.get(a) ?? 0)
  );
  const acceptedNumerics: string[] = [];

  for (const col of sortedNumeric) {
    const r = corrWithYMap.get(col) ?? 0;
    const absR = Math.abs(r);
    const norm = normalizeName(col);
    const contextMatch = contextTokens.some(
      (t) => norm.includes(t) || t.includes(norm.split('_')[0])
    );
    if (contextMatch) matchedKeywords.add(col);

    // Check multicollinearity against already accepted numeric predictors
    let collinearPartner: string | null = null;
    let maxCollinearR = 0;
    const xVals = encodedRows.map((row) => row[col]);
    for (const prev of acceptedNumerics) {
      const prevVals = encodedRows.map((row) => row[prev]);
      const pairR = Math.abs(pearsonCorrelation(xVals, prevVals));
      if (pairR > maxCollinearR) {
        maxCollinearR = pairR;
        if (pairR >= 0.92) collinearPartner = prev;
      }
    }

    if (collinearPartner) {
      featureJustifications[col] = {
        recommended: false,
        corrWithY: r,
        reason: `Excluida preliminarmente por multicolinealidad severa (|r| = ${formatNumber(maxCollinearR, 2)}) con "${collinearPartner}".`,
      };
    } else if (absR >= 0.08 || contextMatch) {
      acceptedNumerics.push(col);
      suggestedFeatures.push(col);
      const direction = r >= 0 ? 'positiva' : 'negativa';
      const strength = absR >= 0.6 ? 'fuerte' : absR >= 0.3 ? 'moderada' : 'relevante por contexto';
      featureJustifications[col] = {
        recommended: true,
        corrWithY: r,
        reason: `Relación ${strength} (${direction}, r = ${formatNumber(r, 2)}) con ${bestTarget}${contextMatch ? ' y alineada con el contexto de negocio' : ''}.`,
      };
    } else {
      featureJustifications[col] = {
        recommended: false,
        corrWithY: r,
        reason: `Correlación lineal débil con ${bestTarget} (r = ${formatNumber(r, 2)}). Puedes incluirla manualmente si aporta control comercial.`,
      };
    }
  }

  // Fallback: ensure at least 1 numeric predictor is selected if available
  if (suggestedFeatures.length === 0 && sortedNumeric.length > 0) {
    const fallback = sortedNumeric[0];
    suggestedFeatures.push(fallback);
    featureJustifications[fallback] = {
      recommended: true,
      corrWithY: corrWithYMap.get(fallback) ?? 0,
      reason: `Seleccionada como predictor base principal por presentar la mayor asociación relativa con ${bestTarget}.`,
    };
  }

  // 2. Categorical predictors (evaluate via max dummy |r| and group price spread)
  for (const catCol of categoricalColumns) {
    const relatedDummies = dummyMappings.filter((d) => d.sourceColumn === catCol);
    let maxAbsDummyR = 0;
    let signedBestR = 0;

    for (const d of relatedDummies) {
      const dVals = encodedRows.map((row) => row[d.dummyName]);
      const r = pearsonCorrelation(dVals, yVals);
      if (Math.abs(r) > maxAbsDummyR) {
        maxAbsDummyR = Math.abs(r);
        signedBestR = r;
      }
    }

    // Compute relative spread across category means
    const groups = new Map<string, number[]>();
    preprocessed.cleanedRows.forEach((row, idx) => {
      const cat = String(row[catCol]);
      const arr = groups.get(cat) ?? [];
      arr.push(yVals[idx]);
      groups.set(cat, arr);
    });
    const groupMeans = [...groups.values()].map((vals) => mean(vals));
    const spreadPct =
      groupMeans.length > 1 && mean(yVals) !== 0
        ? ((Math.max(...groupMeans) - Math.min(...groupMeans)) / Math.abs(mean(yVals))) * 100
        : 0;

    const norm = normalizeName(catCol);
    const contextMatch = contextTokens.some(
      (t) => norm.includes(t) || t.includes(norm.split('_')[0])
    );

    const shouldRecommend = maxAbsDummyR >= 0.08 || spreadPct >= 6 || contextMatch;
    if (shouldRecommend) {
      suggestedFeatures.push(catCol);
      featureJustifications[catCol] = {
        recommended: true,
        corrWithY: signedBestR,
        reason: `Genera una diferenciación de precios de hasta ${formatNumber(spreadPct, 1)}% entre categorías (codificada en ${relatedDummies.length} variables Dummy).`,
      };
    } else {
      featureJustifications[catCol] = {
        recommended: false,
        corrWithY: signedBestR,
        reason: `Baja diferenciación de precios entre sus categorías (${formatNumber(spreadPct, 1)}% de brecha).`,
      };
    }
  }

  const targetMatchText = PRICE_TARGET_KEYWORDS.some((kw) => normalizeName(bestTarget).includes(kw))
    ? `identificada directamente como la métrica económica/precio principal`
    : `seleccionada como la variable numérica continua más coherente con el objetivo económico`;

  const targetJustification = `"${bestTarget}" es ${targetMatchText} dentro del conjunto de datos (${encodedRows.length} observaciones limpias) y responde directamente al objetivo de estimación planteado en el contexto de negocio.`;

  return {
    suggestedTarget: bestTarget,
    targetJustification,
    suggestedFeatures,
    featureJustifications,
    contextKeywordsMatched: Array.from(matchedKeywords).slice(0, 6),
  };
}

export function runEdaAnalysis(
  preprocessed: PreprocessedDataset,
  targetVariable: string,
  businessContext: string,
  businessQuestion: string
): EdaResult {
  const { numericColumns, categoricalColumns, cleanedRows, encodedRows } = preprocessed;
  const recommendation = suggestVariables(preprocessed, businessContext, businessQuestion);
  const activeTarget = numericColumns.includes(targetVariable)
    ? targetVariable
    : recommendation.suggestedTarget;

  // 1. Numeric summaries & histograms
  const numericSummaries: NumericSummary[] = numericColumns.map((col) => {
    const vals = encodedRows.map((r) => r[col]);
    const sorted = [...vals].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const q1 = quantile(sorted, 0.25);
    const med = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const avg = mean(vals);
    const sd = sampleStdDev(vals, avg);
    const skew = sampleSkewness(vals);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outlierCount = vals.filter((v) => v < lowerFence || v > upperFence).length;
    const isInteger = vals.every((v) => Math.abs(v - Math.round(v)) < 1e-6);

    return {
      column: col,
      count: vals.length,
      min,
      q1,
      median: med,
      mean: avg,
      q3,
      max,
      stdDev: sd,
      skewness: skew,
      outlierCount,
      isInteger,
      histogram: buildHistogram(vals, 10),
    };
  });

  // 2. Categorical breakdowns against target variable
  const targetValues = activeTarget ? encodedRows.map((r) => r[activeTarget]) : [];
  const categoricalBreakdowns: CategoryBreakdown[] = categoricalColumns.map((col) => {
    const map = new Map<string, number[]>();
    cleanedRows.forEach((row, idx) => {
      const cat = String(row[col]);
      const list = map.get(cat) ?? [];
      list.push(targetValues[idx] ?? 0);
      map.set(cat, list);
    });

    const groups = [...map.entries()]
      .map(([category, vals]) => ({
        category,
        count: vals.length,
        share: (vals.length / Math.max(1, cleanedRows.length)) * 100,
        meanTarget: mean(vals),
        medianTarget: median(vals),
      }))
      .sort((a, b) => b.meanTarget - a.meanTarget);

    return { column: col, groups };
  });

  // 3. Pearson correlation matrix across numeric columns (with target first for readability)
  const correlationColumns = activeTarget
    ? [activeTarget, ...numericColumns.filter((c) => c !== activeTarget)]
    : [...numericColumns];

  const colVectors = correlationColumns.map((c) => encodedRows.map((r) => r[c]));
  const correlationMatrix: number[][] = correlationColumns.map((_, i) =>
    correlationColumns.map((__, j) =>
      i === j ? 1 : pearsonCorrelation(colVectors[i], colVectors[j])
    )
  );

  // Detect high collinearity pairs among predictors (excluding target)
  const highCollinearityPairs: CorrelationPair[] = [];
  for (let i = 0; i < correlationColumns.length; i++) {
    for (let j = i + 1; j < correlationColumns.length; j++) {
      if (correlationColumns[i] === activeTarget || correlationColumns[j] === activeTarget) {
        continue;
      }
      const r = correlationMatrix[i][j];
      if (Math.abs(r) >= 0.78) {
        highCollinearityPairs.push({
          varA: correlationColumns[i],
          varB: correlationColumns[j],
          r,
        });
      }
    }
  }

  // 4. Generate Business Rules / Insights from EDA
  const businessRules: BusinessRuleInsight[] = [];
  const targetSummary = numericSummaries.find((s) => s.column === activeTarget);

  if (targetSummary) {
    businessRules.push({
      title: `Rango operativo de ${activeTarget}`,
      metric: `${formatCurrencyLike(targetSummary.min, activeTarget)} – ${formatCurrencyLike(targetSummary.max, activeTarget)}`,
      detail: `El 50% central de las observaciones se concentra entre ${formatCurrencyLike(targetSummary.q1, activeTarget)} (Q1) y ${formatCurrencyLike(targetSummary.q3, activeTarget)} (Q3), con una mediana de ${formatCurrencyLike(targetSummary.median, activeTarget)}.`,
    });

    const cv = targetSummary.mean !== 0 ? (targetSummary.stdDev / Math.abs(targetSummary.mean)) * 100 : 0;
    businessRules.push({
      title: 'Dispersión y asimetría de precios',
      metric: `CV ${formatNumber(cv, 1)}% · Asimetría ${formatNumber(targetSummary.skewness, 2)}`,
      detail:
        Math.abs(targetSummary.skewness) > 0.75
          ? `La distribución presenta asimetría ${targetSummary.skewness > 0 ? 'positiva (cola hacia segmentos premium)' : 'negativa'}, con ${targetSummary.outlierCount} registros atípicos detectados por criterio IQR.`
          : `La distribución de ${activeTarget} es relativamente simétrica alrededor del promedio (${formatCurrencyLike(targetSummary.mean, activeTarget)}), favorable para el ajuste por mínimos cuadrados ordinarios.`,
    });
  }

  // Strongest numeric driver insight
  if (activeTarget && correlationColumns.length > 1) {
    let bestDriver = correlationColumns[1];
    let bestR = correlationMatrix[0][1];
    for (let j = 1; j < correlationColumns.length; j++) {
      if (Math.abs(correlationMatrix[0][j]) > Math.abs(bestR)) {
        bestR = correlationMatrix[0][j];
        bestDriver = correlationColumns[j];
      }
    }
    businessRules.push({
      title: `Impulsor numérico dominante: ${bestDriver}`,
      metric: `r = ${formatNumber(bestR, 3)}`,
      detail: `Exhibe la mayor correlación lineal ${bestR >= 0 ? 'positiva' : 'inversa'} con ${activeTarget}, lo que la posiciona como palanca primaria en la estructura de valoración.`,
    });
  }

  // Strongest categorical price gap
  if (categoricalBreakdowns.length > 0 && activeTarget) {
    let topCatInsight: { col: string; high: string; low: string; gap: number; pct: number } | null = null;
    for (const cb of categoricalBreakdowns) {
      if (cb.groups.length < 2) continue;
      const hi = cb.groups[0];
      const lo = cb.groups[cb.groups.length - 1];
      const gap = hi.meanTarget - lo.meanTarget;
      const pct = lo.meanTarget !== 0 ? (gap / Math.abs(lo.meanTarget)) * 100 : 0;
      if (!topCatInsight || pct > topCatInsight.pct) {
        topCatInsight = { col: cb.column, high: hi.category, low: lo.category, gap, pct };
      }
    }
    if (topCatInsight) {
      businessRules.push({
        title: `Brecha por segmento en ${topCatInsight.col}`,
        metric: `+${formatNumber(topCatInsight.pct, 1)}% (${formatCurrencyLike(topCatInsight.gap, activeTarget)})`,
        detail: `El segmento "${topCatInsight.high}" registra el precio promedio más alto frente a "${topCatInsight.low}", confirmando una prima comercial significativa por segmentación.`,
      });
    }
  }

  return {
    numericSummaries,
    categoricalBreakdowns,
    correlationColumns,
    correlationMatrix,
    highCollinearityPairs,
    businessRules,
    recommendation,
  };
}
