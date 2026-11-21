import {
  CoefficientResult,
  DummyMapping,
  ModelingSuiteResult,
  PreprocessedDataset,
  RegressionModelResult,
  ResidualPoint,
} from '../types/analytics';
import {
  computeNormalEquations,
  fDistributionPValue,
  formatCurrencyLike,
  formatNumber,
  invertMatrix,
  mean,
  multiplyMatrixVector,
  sampleStdDev,
  studentTCriticalValue,
  studentTTwoTailedPValue,
} from './mathStats';

function expandSelectedFeaturesToDesignColumns(
  selectedSourceFeatures: string[],
  preprocessed: PreprocessedDataset,
  targetVariable: string
): string[] {
  const cols: string[] = [];
  for (const feat of selectedSourceFeatures) {
    if (feat === targetVariable) continue;
    if (preprocessed.numericColumns.includes(feat)) {
      cols.push(feat);
    } else if (preprocessed.categoricalColumns.includes(feat)) {
      const dummies = preprocessed.dummyMappings
        .filter((d) => d.sourceColumn === feat)
        .map((d) => d.dummyName);
      cols.push(...dummies);
    }
  }
  return cols;
}

/**
 * Computes VIF for each predictor column j using R^2 from regressing X_j on remaining predictors.
 */
function computeVIFs(XWithoutIntercept: number[][]): (number | null)[] {
  const n = XWithoutIntercept.length;
  const k = XWithoutIntercept[0]?.length ?? 0;
  if (k <= 1) return new Array(k).fill(1.0);

  const vifs: (number | null)[] = [];
  for (let j = 0; j < k; j++) {
    const yj = XWithoutIntercept.map((row) => row[j]);
    const yMean = mean(yj);
    let sst = 0;
    for (let i = 0; i < n; i++) {
      const d = yj[i] - yMean;
      sst += d * d;
    }
    if (sst < 1e-12) {
      vifs.push(null);
      continue;
    }

    const Xother = XWithoutIntercept.map((row) => {
      const r: number[] = [1];
      for (let c = 0; c < k; c++) {
        if (c !== j) r.push(row[c]);
      }
      return r;
    });

    const { xtx, xty } = computeNormalEquations(Xother, yj);
    const inv = invertMatrix(xtx, 1e-11);
    if (!inv) {
      vifs.push(99.9);
      continue;
    }
    const beta = multiplyMatrixVector(inv, xty);
    let sse = 0;
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let c = 0; c < beta.length; c++) pred += Xother[i][c] * beta[c];
      const err = yj[i] - pred;
      sse += err * err;
    }
    const r2j = Math.max(0, Math.min(0.9999, 1 - sse / sst));
    vifs.push(1 / (1 - r2j));
  }
  return vifs;
}

function buildBusinessExplanation(
  coef: {
    name: string;
    sourceColumn: string;
    isIntercept: boolean;
    isDummy: boolean;
    dummyCategory?: string;
    referenceCategory?: string;
    estimate: number;
    pValue: number;
  },
  targetVariable: string
): string {
  const formattedDelta = formatCurrencyLike(Math.abs(coef.estimate), targetVariable);
  const directionVerb = coef.estimate >= 0 ? 'incrementa' : 'reduce';
  const sigNote =
    coef.pValue < 0.05
      ? 'Este efecto es estadísticamente significativo (p < 0,05).'
      : 'Sin embargo, este efecto no es estadísticamente significativo al 95% (p ≥ 0,05) y debe interpretarse con cautela.';

  if (coef.isIntercept) {
    return `Valor base teórico del modelo (${formatCurrencyLike(coef.estimate, targetVariable)}) cuando todas las variables numéricas toman valor cero y las categóricas se encuentran en su categoría de referencia. Sirve como punto de anclaje matemático de la ecuación.`;
  }

  if (coef.isDummy && coef.dummyCategory && coef.referenceCategory) {
    return `En comparación con la categoría base "${coef.referenceCategory}" de ${coef.sourceColumn}, pertenecer al segmento "${coef.dummyCategory}" ${directionVerb} el valor esperado de ${targetVariable} en ${formattedDelta}, manteniendo constantes los demás atributos. ${sigNote}`;
  }

  return `Por cada unidad adicional en ${coef.name}, el valor esperado de ${targetVariable} se ${directionVerb} en promedio en ${formattedDelta}, manteniendo constantes el resto de las variables (ceteris paribus). ${sigNote}`;
}

export function fitOLS(
  id: 'full' | 'stepwise' | 'parsimonious',
  label: string,
  description: string,
  encodedRows: Record<string, number>[],
  targetVariable: string,
  requestedFeatureCols: string[],
  dummyMap: Map<string, DummyMapping>
): RegressionModelResult | null {
  const n = encodedRows.length;
  if (n < 5 || requestedFeatureCols.length === 0) return null;

  const y = encodedRows.map((r) => r[targetVariable]);
  const meanY = mean(y);
  const stdY = sampleStdDev(y, meanY);

  // Filter out constant or exact-collinear columns progressively
  let activeCols: string[] = [];
  const droppedForCollinearity: string[] = [];

  for (const col of requestedFeatureCols) {
    const vals = encodedRows.map((r) => r[col]);
    const sd = sampleStdDev(vals);
    if (sd < 1e-10) {
      droppedForCollinearity.push(col);
      continue;
    }

    // Test adding col to design matrix
    const candidateCols = [...activeCols, col];
    const Xtest = encodedRows.map((row) => [1, ...candidateCols.map((c) => row[c])]);
    const { xtx } = computeNormalEquations(Xtest, y);
    const invTest = invertMatrix(xtx, 1e-10);
    if (!invTest) {
      droppedForCollinearity.push(col);
    } else {
      activeCols = candidateCols;
    }
  }

  const k = activeCols.length;
  if (k === 0 || n <= k + 1) return null;

  const X = encodedRows.map((row) => [1, ...activeCols.map((c) => row[c])]);
  const XnoInt = encodedRows.map((row) => activeCols.map((c) => row[c]));

  const { xtx, xty } = computeNormalEquations(X, y);
  const xtxInv = invertMatrix(xtx, 1e-12);
  if (!xtxInv) return null;

  const beta = multiplyMatrixVector(xtxInv, xty);

  // Predictions, residuals, SSE, SST, SSR
  const residuals: ResidualPoint[] = [];
  let sse = 0;
  let sst = 0;
  let sumAbsErr = 0;
  let sumAbsPctErr = 0;
  let validPctCount = 0;

  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < beta.length; j++) {
      pred += X[i][j] * beta[j];
    }
    const err = y[i] - pred;
    sse += err * err;
    const dy = y[i] - meanY;
    sst += dy * dy;
    sumAbsErr += Math.abs(err);
    if (Math.abs(y[i]) > 1e-9) {
      sumAbsPctErr += Math.abs(err / y[i]);
      validPctCount++;
    }
    residuals.push({
      index: i + 1,
      actual: y[i],
      predicted: pred,
      residual: err,
    });
  }

  const dfModel = k;
  const dfResidual = n - k - 1;
  const ssr = Math.max(0, sst - sse);
  const mse = sse / dfResidual;
  const msr = ssr / dfModel;
  const residualStdError = Math.sqrt(mse);
  const rmse = Math.sqrt(sse / n);
  const mae = sumAbsErr / n;
  const mape = validPctCount > 0 ? (sumAbsPctErr / validPctCount) * 100 : 0;

  const rSquared = sst > 1e-12 ? Math.max(0, Math.min(1, 1 - sse / sst)) : 0;
  const adjRSquared = 1 - ((1 - rSquared) * (n - 1)) / dfResidual;

  const fStat = mse > 1e-12 ? msr / mse : 0;
  const fPValue = fDistributionPValue(fStat, dfModel, dfResidual);

  // Information criteria (Gaussian log-likelihood)
  const pParams = k + 2; // intercept + k slopes + sigma^2
  const logLik = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(Math.max(sse / n, 1e-15)) + 1);
  const aic = 2 * pParams - 2 * logLik;
  const aicc = n - pParams - 1 > 0 ? aic + (2 * pParams * (pParams + 1)) / (n - pParams - 1) : aic;
  const bic = Math.log(n) * pParams - 2 * logLik;

  // Durbin-Watson statistic
  let dwNum = 0;
  for (let i = 1; i < n; i++) {
    const diff = residuals[i].residual - residuals[i - 1].residual;
    dwNum += diff * diff;
  }
  const durbinWatson = sse > 1e-12 ? dwNum / sse : 2;

  // VIFs and standard deviations for standardized beta
  const vifs = computeVIFs(XnoInt);
  const tCrit = studentTCriticalValue(dfResidual, 0.05);

  const coefficients: CoefficientResult[] = [];

  for (let j = 0; j < beta.length; j++) {
    const isIntercept = j === 0;
    const colName = isIntercept ? 'Intercepto' : activeCols[j - 1];
    const dummyInfo = !isIntercept ? dummyMap.get(colName) : undefined;
    const se = Math.sqrt(Math.max(0, mse * xtxInv[j][j]));
    const tStat = se > 1e-12 ? beta[j] / se : 0;
    const pValue = studentTTwoTailedPValue(tStat, dfResidual);
    const ciLower = beta[j] - tCrit * se;
    const ciUpper = beta[j] + tCrit * se;

    let stdBeta: number | null = null;
    if (!isIntercept && stdY > 1e-12) {
      const colVals = encodedRows.map((r) => r[colName]);
      const sdX = sampleStdDev(colVals);
      stdBeta = (beta[j] * sdX) / stdY;
    }

    const coefBase = {
      name: colName,
      sourceColumn: dummyInfo ? dummyInfo.sourceColumn : colName,
      isIntercept,
      isDummy: Boolean(dummyInfo),
      dummyCategory: dummyInfo?.categoryValue,
      referenceCategory: dummyInfo?.referenceCategory,
      estimate: beta[j],
      pValue,
    };

    coefficients.push({
      ...coefBase,
      stdError: se,
      tStat,
      pValue,
      ciLower,
      ciUpper,
      vif: isIntercept ? null : vifs[j - 1],
      stdBeta,
      significant: pValue < 0.05,
      businessExplanation: buildBusinessExplanation(coefBase, targetVariable),
    });
  }

  // Build readable mathematical equation
  const interceptStr = formatNumber(beta[0], 2);
  const termParts = activeCols.map((col, idx) => {
    const val = beta[idx + 1];
    const sign = val >= 0 ? ' + ' : ' − ';
    return `${sign}${formatNumber(Math.abs(val), 2)}·(${col})`;
  });
  const equationText = `${targetVariable} = ${interceptStr}${termParts.join('')}`;

  return {
    id,
    label,
    description,
    targetVariable,
    features: activeCols,
    droppedForCollinearity,
    n,
    k,
    dfModel,
    dfResidual,
    rSquared,
    adjRSquared,
    rmse,
    mae,
    mape,
    residualStdError,
    fStat,
    fPValue,
    aic,
    aicc,
    bic,
    durbinWatson,
    coefficients,
    equationText,
    residuals,
    xtxInverse: xtxInv,
    meanY,
    stdY,
  };
}

export function trainAndSelectModels(
  preprocessed: PreprocessedDataset,
  targetVariable: string,
  selectedSourceFeatures: string[]
): ModelingSuiteResult {
  const warnings: string[] = [];
  const dummyMap = new Map<string, DummyMapping>(
    preprocessed.dummyMappings.map((d) => [d.dummyName, d])
  );

  const designCols = expandSelectedFeaturesToDesignColumns(
    selectedSourceFeatures,
    preprocessed,
    targetVariable
  );

  if (designCols.length === 0) {
    return {
      models: [],
      recommendedModelId: 'full',
      selectionRationale: 'Selecciona al menos una variable independiente (X) para ajustar el modelo.',
      warnings: ['No hay variables independientes seleccionadas.'],
    };
  }

  const maxAllowedFeatures = Math.max(1, preprocessed.encodedRows.length - 3);
  let usableDesignCols = designCols;
  if (usableDesignCols.length > maxAllowedFeatures) {
    warnings.push(
      `El número de columnas predictoras (${usableDesignCols.length}) excedía los grados de libertad disponibles para ${preprocessed.encodedRows.length} filas; se conservaron las primeras ${maxAllowedFeatures} variables.`
    );
    usableDesignCols = usableDesignCols.slice(0, maxAllowedFeatures);
  }

  // Candidate 1: Full Model
  const fullModel = fitOLS(
    'full',
    'Modelo Completo',
    'Incluye todas las variables independientes seleccionadas (numéricas y dummies).',
    preprocessed.encodedRows,
    targetVariable,
    usableDesignCols,
    dummyMap
  );

  if (!fullModel) {
    return {
      models: [],
      recommendedModelId: 'full',
      selectionRationale:
        'No fue posible estimar el modelo OLS debido a insuficiencia de grados de libertad o multicolinealidad perfecta.',
      warnings: ['Verifica que el dataset tenga suficientes observaciones frente al número de variables.'],
    };
  }

  if (fullModel.droppedForCollinearity.length > 0) {
    warnings.push(
      `Se excluyeron automáticamente por colinealidad perfecta o varianza nula: ${fullModel.droppedForCollinearity.join(', ')}.`
    );
  }

  const models: RegressionModelResult[] = [fullModel];

  // Candidate 2: Backward Stepwise optimizing Adjusted R² & AICc
  if (fullModel.features.length > 1) {
    let currentFeatures = [...fullModel.features];
    let bestStepModel: RegressionModelResult = fullModel;

    while (currentFeatures.length > 1) {
      let bestCandidate: RegressionModelResult | null = null;
      for (let i = 0; i < currentFeatures.length; i++) {
        const subset = currentFeatures.filter((_, idx) => idx !== i);
        const cand = fitOLS(
          'stepwise',
          'Modelo Optimizado (Paso a Paso)',
          'Selección secuencial hacia atrás maximizando R² ajustado y minimizando AICc.',
          preprocessed.encodedRows,
          targetVariable,
          subset,
          dummyMap
        );
        if (!cand) continue;
        if (!bestCandidate || cand.adjRSquared > bestCandidate.adjRSquared + 1e-6) {
          bestCandidate = cand;
        }
      }

      if (bestCandidate && bestCandidate.adjRSquared > bestStepModel.adjRSquared + 1e-5) {
        bestStepModel = bestCandidate;
        currentFeatures = [...bestCandidate.features];
      } else {
        break;
      }
    }

    if (bestStepModel.features.length < fullModel.features.length) {
      models.push({
        ...bestStepModel,
        id: 'stepwise',
        label: 'Modelo Optimizado (Paso a Paso)',
        description:
          'Depura variables redundantes maximizando el R² ajustado y reduciendo el criterio de información AICc.',
      });
    }
  }

  // Candidate 3: Parsimonious model (only p < 0.05 predictors via backward elimination)
  if (fullModel.features.length > 1) {
    let sigFeatures = [...fullModel.features];
    let currentModel: RegressionModelResult | null = fullModel;

    while (sigFeatures.length > 1 && currentModel) {
      const slopeCoefs = currentModel.coefficients.filter((c) => !c.isIntercept);
      const worst = slopeCoefs.reduce((a, b) => (b.pValue > a.pValue ? b : a), slopeCoefs[0]);
      if (worst && worst.pValue >= 0.05) {
        sigFeatures = sigFeatures.filter((f) => f !== worst.name);
        currentModel = fitOLS(
          'parsimonious',
          'Modelo Parsimonioso (p < 0,05)',
          'Retiene exclusivamente predictores con significancia estadística individual al 95% de confianza.',
          preprocessed.encodedRows,
          targetVariable,
          sigFeatures,
          dummyMap
        );
      } else {
        break;
      }
    }

    const alreadyExists = models.some(
      (m) =>
        currentModel &&
        m.features.length === currentModel.features.length &&
        m.features.every((f) => currentModel!.features.includes(f))
    );

    if (currentModel && !alreadyExists) {
      models.push({
        ...currentModel,
        id: 'parsimonious',
        label: 'Modelo Parsimonioso (p < 0,05)',
        description:
          'Conserva únicamente las variables estadísticamente significativas (p < 0,05) para máxima estabilidad interpretativa.',
      });
    }
  }

  // Select the best model: highest Adjusted R², with tie-breaking preference for lower AICc & parsimony
  let best = models[0];
  for (const m of models.slice(1)) {
    const adjDiff = m.adjRSquared - best.adjRSquared;
    if (adjDiff > 0.0005 || (Math.abs(adjDiff) <= 0.0005 && m.aicc < best.aicc)) {
      best = m;
    }
  }

  const highVifCols = best.coefficients
    .filter((c) => !c.isIntercept && c.vif !== null && c.vif > 5)
    .map((c) => `${c.name} (VIF ${formatNumber(c.vif!, 1)})`);
  if (highVifCols.length > 0) {
    warnings.push(
      `Se observa multicolinealidad moderada/alta en: ${highVifCols.join(', ')}. Evalúa los intervalos de confianza al interpretar impactos aislados.`
    );
  }

  const selectionRationale = `Se seleccionó el "${best.label}" por alcanzar el mayor poder explicativo ajustado por complejidad (R² ajustado = ${formatNumber(best.adjRSquared * 100, 2)}%, RMSE = ${formatCurrencyLike(best.rmse, targetVariable)}, estadístico F = ${formatNumber(best.fStat, 2)} con p ${best.fPValue < 0.0001 ? '< 0,0001' : `= ${formatNumber(best.fPValue, 4)}`}), logrando el mejor equilibrio entre precisión predictiva y parsimonia econométrica.`;

  return {
    models,
    recommendedModelId: best.id,
    selectionRationale,
    warnings,
  };
}
