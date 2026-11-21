import {
  FeatureContribution,
  MonteCarloSummary,
  PreprocessedDataset,
  RegressionModelResult,
  ScenarioEvaluation,
  ScenarioInputValues,
  SimulationSuiteResult,
  StrategicRecommendation,
  VariableSimulationPlan,
} from '../types/analytics';
import {
  buildHistogram,
  createSeededRandom,
  formatCurrencyLike,
  formatNumber,
  mean,
  pearsonCorrelation,
  quadraticForm,
  quantile,
  randomStandardNormal,
  sampleSkewness,
  sampleStdDev,
  studentTCriticalValue,
} from './mathStats';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function getActiveSourceVariables(
  model: RegressionModelResult,
  preprocessed: PreprocessedDataset
): { numericVars: string[]; categoricalVars: string[] } {
  const numSet = new Set<string>();
  const catSet = new Set<string>();

  for (const coef of model.coefficients) {
    if (coef.isIntercept) continue;
    if (coef.isDummy) {
      catSet.add(coef.sourceColumn);
    } else if (preprocessed.numericColumns.includes(coef.name)) {
      numSet.add(coef.name);
    }
  }

  return {
    numericVars: Array.from(numSet),
    categoricalVars: Array.from(catSet),
  };
}

/**
 * Evaluates a single scenario (custom or preset) with exact 95% confidence & prediction intervals
 * plus feature-by-feature economic contribution breakdown.
 */
export function evaluateScenario(
  name: string,
  subtitle: string,
  inputs: ScenarioInputValues,
  model: RegressionModelResult,
  preprocessed: PreprocessedDataset
): ScenarioEvaluation {
  const dummyMap = new Map(preprocessed.dummyMappings.map((d) => [d.dummyName, d]));

  // Build x0 vector matching model design matrix [1, ...model.features]
  const x0: number[] = [1];
  const contributions: FeatureContribution[] = [];

  const interceptCoef = model.coefficients.find((c) => c.isIntercept);
  if (interceptCoef) {
    contributions.push({
      label: 'Base estructural (Intercepto)',
      contribution: interceptCoef.estimate,
      detail: 'Punto base de la ecuación',
    });
  }

  // Group categorical dummy contributions by sourceColumn for clear executive waterfall
  const catContribMap = new Map<string, { val: number; chosen: string; ref: string }>();

  for (const feat of model.features) {
    const coef = model.coefficients.find((c) => c.name === feat);
    const dummy = dummyMap.get(feat);

    if (dummy) {
      const selectedCat = inputs.categorical[dummy.sourceColumn] ?? dummy.referenceCategory;
      const isActive = selectedCat === dummy.categoryValue ? 1 : 0;
      x0.push(isActive);

      const existing = catContribMap.get(dummy.sourceColumn) ?? {
        val: 0,
        chosen: selectedCat,
        ref: dummy.referenceCategory,
      };
      if (isActive && coef) {
        existing.val += coef.estimate;
      }
      catContribMap.set(dummy.sourceColumn, existing);
    } else {
      const val = inputs.numeric[feat] ?? 0;
      x0.push(val);
      if (coef) {
        contributions.push({
          label: feat,
          contribution: coef.estimate * val,
          detail: `${formatNumber(val, Number.isInteger(val) ? 0 : 1)} × ${formatCurrencyLike(coef.estimate, model.targetVariable)}`,
        });
      }
    }
  }

  for (const [col, info] of catContribMap.entries()) {
    contributions.push({
      label: `${col}: ${info.chosen}`,
      contribution: info.val,
      detail: info.chosen === info.ref ? `Categoría base (${info.ref})` : `Prima frente a ${info.ref}`,
    });
  }

  let predictedPrice = 0;
  for (let i = 0; i < model.coefficients.length; i++) {
    predictedPrice += model.coefficients[i].estimate * x0[i];
  }

  const leverage = Math.max(0, quadraticForm(x0, model.xtxInverse));
  const tCrit = studentTCriticalValue(model.dfResidual, 0.05);
  const seMean = model.residualStdError * Math.sqrt(leverage);
  const sePred = model.residualStdError * Math.sqrt(1 + leverage);

  const ciLower = predictedPrice - tCrit * seMean;
  const ciUpper = predictedPrice + tCrit * seMean;
  const piLower = predictedPrice - tCrit * sePred;
  const piUpper = predictedPrice + tCrit * sePred;

  const deltaVsMeanPct =
    model.meanY !== 0 ? ((predictedPrice - model.meanY) / Math.abs(model.meanY)) * 100 : 0;

  return {
    name,
    subtitle,
    inputs,
    predictedPrice,
    ciLower,
    ciUpper,
    piLower,
    piUpper,
    deltaVsMeanPct,
    contributions,
  };
}

/**
 * Determines the best statistical simulation method for every active independent variable:
 * - Auxiliary OLS Regression if |r| >= 0.45 with a primary numeric driver (preserves covariance)
 * - Log-Normal if strictly positive and right-skewed (skewness > 0.7)
 * - Empirical Discrete if integer-valued with <= 12 unique values
 * - Truncated Normal if continuous and approximately symmetric
 * - Empirical Multinomial for categorical features
 */
export function buildSimulationSuite(
  model: RegressionModelResult,
  preprocessed: PreprocessedDataset,
  businessContext: string,
  businessQuestion: string
): SimulationSuiteResult {
  const { numericVars, categoricalVars } = getActiveSourceVariables(model, preprocessed);
  const rows = preprocessed.cleanedRows;
  const encRows = preprocessed.encodedRows;
  const target = model.targetVariable;

  // Order numeric vars by absolute correlation with Y so the strongest driver acts as anchor for auxiliary regressions
  const yVec = encRows.map((r) => r[target]);
  const numericOrdered = [...numericVars].sort((a, b) => {
    const rA = Math.abs(pearsonCorrelation(encRows.map((r) => r[a]), yVec));
    const rB = Math.abs(pearsonCorrelation(encRows.map((r) => r[b]), yVec));
    return rB - rA;
  });

  const statsMap = new Map<
    string,
    {
      vals: number[];
      sorted: number[];
      min: number;
      max: number;
      mean: number;
      std: number;
      skew: number;
      isInt: boolean;
      uniqueCount: number;
    }
  >();

  for (const col of numericOrdered) {
    const vals = encRows.map((r) => r[col]);
    const sorted = [...vals].sort((a, b) => a - b);
    const avg = mean(vals);
    const sd = sampleStdDev(vals, avg);
    const skew = sampleSkewness(vals);
    const isInt = vals.every((v) => Math.abs(v - Math.round(v)) < 1e-6);
    statsMap.set(col, {
      vals,
      sorted,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean: avg,
      std: sd,
      skew,
      isInt,
      uniqueCount: new Set(vals).size,
    });
  }

  const variablePlans: VariableSimulationPlan[] = [];
  const generatedNumericDrivers: string[] = [];

  for (const col of numericOrdered) {
    const st = statsMap.get(col)!;

    // Check if an already-modeled primary driver strongly predicts this variable (|r| >= 0.45)
    let bestDriver: string | null = null;
    let bestAbsR = 0;
    let bestR = 0;

    for (const driver of generatedNumericDrivers) {
      const driverVals = statsMap.get(driver)!.vals;
      const r = pearsonCorrelation(driverVals, st.vals);
      if (Math.abs(r) > bestAbsR) {
        bestAbsR = Math.abs(r);
        bestR = r;
        bestDriver = driver;
      }
    }

    if (bestDriver && bestAbsR >= 0.45) {
      const drv = statsMap.get(bestDriver)!;
      const slope = drv.std > 1e-10 ? bestR * (st.std / drv.std) : 0;
      const intercept = st.mean - slope * drv.mean;
      const r2Aux = bestR * bestR;
      const residStd = st.std * Math.sqrt(Math.max(0.02, 1 - r2Aux));

      variablePlans.push({
        variable: col,
        kind: 'numeric',
        method: 'auxiliary_regression',
        methodLabel: `Regresión auxiliar sobre ${bestDriver}`,
        driverVariable: bestDriver,
        auxSlope: slope,
        auxIntercept: intercept,
        auxR2: r2Aux,
        auxResidualStd: residStd,
        rationale: `Presenta una correlación estructural significativa (r = ${formatNumber(bestR, 2)}) con ${bestDriver}. Proyectarla mediante regresión auxiliar preserva combinaciones realistas entre atributos.`,
        paramsSummary: `${col} = ${formatNumber(intercept, 2)} + ${formatNumber(slope, 3)}·${bestDriver} + ε (σ=${formatNumber(residStd, 2)}, R²=${formatNumber(r2Aux, 2)})`,
      });
    } else if (st.isInt && st.uniqueCount <= 12) {
      variablePlans.push({
        variable: col,
        kind: 'numeric',
        method: 'empirical_discrete',
        methodLabel: 'Distribución discreta empírica',
        rationale: `Variable entera con ${st.uniqueCount} valores posibles (${st.min} a ${st.max}). El muestreo empírico respeta exactamente las frecuencias históricas observadas.`,
        paramsSummary: `Soporte entero [${st.min}, ${st.max}] · Media ${formatNumber(st.mean, 2)}`,
      });
    } else if (st.min > 0 && st.skew > 0.7) {
      const logVals = st.vals.map((v) => Math.log(v));
      const muLog = mean(logVals);
      const sdLog = sampleStdDev(logVals, muLog);
      variablePlans.push({
        variable: col,
        kind: 'numeric',
        method: 'lognormal',
        methodLabel: 'Distribución Log-Normal ajustada',
        rationale: `Variable estrictamente positiva con asimetría derecha (asimetría = ${formatNumber(st.skew, 2)}). La ley Log-Normal reproduce la cola superior sin generar valores negativos.`,
        paramsSummary: `μ_ln = ${formatNumber(muLog, 2)}, σ_ln = ${formatNumber(sdLog, 2)} · Rango [${formatNumber(st.min, 1)}, ${formatNumber(st.max, 1)}]`,
      });
    } else {
      variablePlans.push({
        variable: col,
        kind: 'numeric',
        method: 'truncated_normal',
        methodLabel: 'Distribución Normal truncada',
        rationale: `Comportamiento continuo aproximadamente simétrico (asimetría = ${formatNumber(st.skew, 2)}). Se ajusta una normal acotada al rango operativo histórico.`,
        paramsSummary: `μ = ${formatNumber(st.mean, 2)}, σ = ${formatNumber(st.std, 2)} · Rango [${formatNumber(st.min, 1)}, ${formatNumber(st.max, 1)}]`,
      });
    }

    generatedNumericDrivers.push(col);
  }

  // Categorical variable plans (Empirical Multinomial)
  const catProbsMap = new Map<string, { category: string; prob: number }[]>();
  for (const catCol of categoricalVars) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const val = String(r[catCol]);
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    const dist = [...counts.entries()]
      .map(([category, c]) => ({ category, prob: c / Math.max(1, rows.length) }))
      .sort((a, b) => b.prob - a.prob);
    catProbsMap.set(catCol, dist);

    const topSummary = dist
      .slice(0, 3)
      .map((d) => `${d.category} (${formatNumber(d.prob * 100, 0)}%)`)
      .join(', ');

    variablePlans.push({
      variable: catCol,
      kind: 'categorical',
      method: 'multinomial',
      methodLabel: 'Distribución multinomial empírica',
      rationale: `Variable cualitativa con ${dist.length} categorías. Se muestrea respetando las cuotas reales observadas en el mercado histórico.`,
      paramsSummary: topSummary,
    });
  }

  // Monte Carlo simulation (N = 500 realistic observations)
  const nSimulations = 500;
  const rng = createSeededRandom(42071);
  const simPrices: number[] = [];
  const sampleRows: MonteCarloSummary['sampleRows'] = [];

  for (let s = 0; s < nSimulations; s++) {
    const numInputs: Record<string, number> = {};
    const catInputs: Record<string, string> = {};

    for (const plan of variablePlans) {
      if (plan.kind === 'numeric') {
        const st = statsMap.get(plan.variable)!;
        let drawn = st.mean;

        if (plan.method === 'auxiliary_regression' && plan.driverVariable) {
          const drvVal = numInputs[plan.driverVariable] ?? statsMap.get(plan.driverVariable)!.mean;
          drawn =
            (plan.auxIntercept ?? 0) +
            (plan.auxSlope ?? 0) * drvVal +
            randomStandardNormal(rng) * (plan.auxResidualStd ?? st.std * 0.5);
          drawn = clamp(drawn, st.min, st.max);
          if (st.isInt) drawn = Math.round(drawn);
        } else if (plan.method === 'empirical_discrete') {
          const idx = Math.floor(rng() * st.vals.length);
          drawn = st.vals[idx];
        } else if (plan.method === 'lognormal') {
          const logVals = st.vals.map((v) => Math.log(v));
          const muLog = mean(logVals);
          const sdLog = sampleStdDev(logVals, muLog);
          drawn = Math.exp(muLog + randomStandardNormal(rng) * sdLog);
          drawn = clamp(drawn, st.min, st.max);
          if (st.isInt) drawn = Math.round(drawn);
        } else {
          drawn = st.mean + randomStandardNormal(rng) * st.std;
          drawn = clamp(drawn, st.min, st.max);
          if (st.isInt) drawn = Math.round(drawn);
        }

        numInputs[plan.variable] = st.isInt ? Math.round(drawn) : Number(drawn.toFixed(2));
      } else {
        const dist = catProbsMap.get(plan.variable) ?? [];
        const u = rng();
        let acc = 0;
        let chosen = dist[0]?.category ?? '';
        for (const item of dist) {
          acc += item.prob;
          if (u <= acc) {
            chosen = item.category;
            break;
          }
        }
        catInputs[plan.variable] = chosen;
      }
    }

    const evalRes = evaluateScenario(
      `Sim-${s + 1}`,
      '',
      { numeric: numInputs, categorical: catInputs },
      model,
      preprocessed
    );

    simPrices.push(evalRes.predictedPrice);
    if (s < 8) {
      sampleRows.push({
        id: s + 1,
        predictedPrice: evalRes.predictedPrice,
        inputs: { ...numInputs, ...catInputs },
      });
    }
  }

  const sortedPrices = [...simPrices].sort((a, b) => a - b);
  const mcMean = mean(simPrices);
  const monteCarlo: MonteCarloSummary = {
    nSimulations,
    mean: mcMean,
    stdDev: sampleStdDev(simPrices, mcMean),
    p10: quantile(sortedPrices, 0.1),
    p25: quantile(sortedPrices, 0.25),
    p50: quantile(sortedPrices, 0.5),
    p75: quantile(sortedPrices, 0.75),
    p90: quantile(sortedPrices, 0.9),
    min: sortedPrices[0] ?? 0,
    max: sortedPrices[sortedPrices.length - 1] ?? 0,
    histogram: buildHistogram(simPrices, 12),
    sampleRows,
  };

  // Build 3 coherent executive preset scenarios (Conservador, Base, Optimista/Premium)
  const buildPresetInputs = (mode: 'conservative' | 'base' | 'optimistic'): ScenarioInputValues => {
    const numeric: Record<string, number> = {};
    const categorical: Record<string, string> = {};

    for (const plan of variablePlans) {
      if (plan.kind === 'numeric') {
        const st = statsMap.get(plan.variable)!;
        const coef = model.coefficients.find((c) => c.name === plan.variable);
        const isPositiveDriver = (coef?.estimate ?? 1) >= 0;

        let val: number;
        if (mode === 'base') {
          val = quantile(st.sorted, 0.5);
        } else if (plan.method === 'auxiliary_regression' && plan.driverVariable) {
          // Project coherently from driver value
          const drvVal = numeric[plan.driverVariable] ?? quantile(statsMap.get(plan.driverVariable)!.sorted, 0.5);
          val = clamp((plan.auxIntercept ?? 0) + (plan.auxSlope ?? 0) * drvVal, st.min, st.max);
        } else if (mode === 'optimistic') {
          val = isPositiveDriver ? quantile(st.sorted, 0.8) : quantile(st.sorted, 0.2);
        } else {
          val = isPositiveDriver ? quantile(st.sorted, 0.2) : quantile(st.sorted, 0.8);
        }

        numeric[plan.variable] = st.isInt ? Math.round(val) : Number(val.toFixed(1));
      } else {
        // Rank categories by estimated model effect
        const prof = preprocessed.profiles.find((p) => p.name === plan.variable);
        const cats = prof?.categories ?? [];
        const ref = prof?.referenceCategory ?? cats[0] ?? '';

        const rankedCats = cats
          .map((cat) => {
            if (cat === ref) return { cat, effect: 0 };
            const dummyName = `${plan.variable}_${cat.replace(/\s+/g, '_')}`;
            const coef = model.coefficients.find((c) => c.name === dummyName);
            return { cat, effect: coef?.estimate ?? 0 };
          })
          .sort((a, b) => a.effect - b.effect);

        if (mode === 'conservative') {
          categorical[plan.variable] = rankedCats[0]?.cat ?? ref;
        } else if (mode === 'optimistic') {
          categorical[plan.variable] = rankedCats[rankedCats.length - 1]?.cat ?? ref;
        } else {
          // Most frequent category (reference) for base market profile
          categorical[plan.variable] = ref;
        }
      }
    }

    return { numeric, categorical };
  };

  const presetScenarios: ScenarioEvaluation[] = [
    evaluateScenario(
      'Escenario Conservador',
      'Perfil de entrada (percentil 20 en impulsores positivos y segmentos base)',
      buildPresetInputs('conservative'),
      model,
      preprocessed
    ),
    evaluateScenario(
      'Escenario Base de Mercado',
      'Perfil mediano histórico con atributos típicos de la cartera',
      buildPresetInputs('base'),
      model,
      preprocessed
    ),
    evaluateScenario(
      'Escenario Optimista / Premium',
      'Perfil de alto valor (percentil 80 y categorías de mayor prima)',
      buildPresetInputs('optimistic'),
      model,
      preprocessed
    ),
  ];

  // Generate dynamic, business-oriented strategic recommendations
  const recommendations = generateStrategicRecommendations(
    model,
    monteCarlo,
    presetScenarios,
    businessContext,
    businessQuestion
  );

  const executiveAnswer = buildExecutiveAnswer(
    model,
    monteCarlo,
    presetScenarios,
    businessQuestion
  );

  return {
    variablePlans,
    monteCarlo,
    presetScenarios,
    recommendations,
    executiveAnswer,
  };
}

function generateStrategicRecommendations(
  model: RegressionModelResult,
  monteCarlo: MonteCarloSummary,
  presets: ScenarioEvaluation[],
  businessContext: string,
  businessQuestion: string
): StrategicRecommendation[] {
  const target = model.targetVariable;
  const recs: StrategicRecommendation[] = [];

  const nonIntercept = model.coefficients.filter((c) => !c.isIntercept);
  const sigNumeric = nonIntercept
    .filter((c) => !c.isDummy && c.significant)
    .sort((a, b) => Math.abs(b.stdBeta ?? 0) - Math.abs(a.stdBeta ?? 0));

  const positiveNumeric = sigNumeric.filter((c) => c.estimate > 0);
  const negativeNumeric = sigNumeric.filter((c) => c.estimate < 0);
  const sigDummies = nonIntercept
    .filter((c) => c.isDummy && c.significant)
    .sort((a, b) => Math.abs(b.estimate) - Math.abs(a.estimate));

  // Recommendation 1: Primary commercial value lever
  if (positiveNumeric.length > 0) {
    const topPos = positiveNumeric[0];
    recs.push({
      priority: 'Clave',
      title: `Priorizar la captura de valor sobre "${topPos.name}"`,
      impactHeadline: `+${formatCurrencyLike(topPos.estimate, target)} por cada unidad adicional`,
      rationale: `Es la palanca cuantitativa con mayor capacidad demostrada para elevar ${target} en la cartera analizada. Su efecto marginal positivo y altamente consistente respalda decisiones de inversión y posicionamiento comercial.`,
      actionStep: `Estructurar listas de precios escalonadas tomando "${topPos.name}" como eje principal de diferenciación y comunicar explícitamente su aporte de valor al cliente final.`,
    });
  }

  // Recommendation 2: Categorical premium / positioning strategy
  if (sigDummies.length > 0) {
    const topDummy = sigDummies[0];
    const isPremium = topDummy.estimate >= 0;
    recs.push({
      priority: 'Alta',
      title: isPremium
        ? `Capitalizar la prima comercial del segmento "${topDummy.dummyCategory}"`
        : `Mitigar el descuento observado en "${topDummy.dummyCategory}"`,
      impactHeadline: `${isPremium ? '+' : '−'}${formatCurrencyLike(Math.abs(topDummy.estimate), target)} frente a "${topDummy.referenceCategory}"`,
      rationale: `La segmentación por ${topDummy.sourceColumn} genera brechas económicas sustanciales incluso a igualdad de características físicas. El mercado reconoce un diferencial claro para "${topDummy.dummyCategory}" respecto a la categoría base "${topDummy.referenceCategory}".`,
      actionStep: isPremium
        ? `Concentrar inventario, presupuesto de marketing o mejoras de producto en el segmento "${topDummy.dummyCategory}" para proteger márgenes superiores.`
        : `Aplicar estrategias de reposicionamiento, incentivos o diferenciación en "${topDummy.dummyCategory}" para cerrar la brecha de precio frente a "${topDummy.referenceCategory}".`,
    });
  }

  // Recommendation 3: Value leakage / depreciation mitigation
  if (negativeNumeric.length > 0) {
    const topNeg = negativeNumeric[0];
    recs.push({
      priority: 'Alta',
      title: `Controlar la erosión de precio asociada a "${topNeg.name}"`,
      impactHeadline: `−${formatCurrencyLike(Math.abs(topNeg.estimate), target)} por cada unidad adicional`,
      rationale: `Cada incremento en "${topNeg.name}" penaliza directamente la disposición a pagar del mercado, reduciendo el valor realizable del activo.`,
      actionStep: `Establecer topes operativos o planes de compensación (p. ej. mantenimiento, actualización o descuentos tácticos transparentes) cuando "${topNeg.name}" supere la mediana histórica.`,
    });
  }

  // Recommendation 4: Pricing corridor & margin governance using Monte Carlo + RMSE
  const baseScenario = presets[1];
  const spreadP90P10 = monteCarlo.p90 - monteCarlo.p10;
  recs.push({
    priority: 'Media',
    title: 'Implementar bandas tarifarias con margen de negociación controlado',
    impactHeadline: `Banda operativa P10–P90: ${formatCurrencyLike(monteCarlo.p10, target)} a ${formatCurrencyLike(monteCarlo.p90, target)}`,
    rationale: `Con una precisión promedio de ±${formatCurrencyLike(model.rmse, target)} (RMSE) y una amplitud de mercado de ${formatCurrencyLike(spreadP90P10, target)} en la simulación Monte Carlo (${monteCarlo.nSimulations} escenarios realistas), el modelo permite fijar precios de lista objetivos sin depender de estimaciones subjetivas.`,
    actionStep: `Utilizar el precio estimado del escenario base (${baseScenario ? formatCurrencyLike(baseScenario.predictedPrice, target) : formatCurrencyLike(monteCarlo.p50, target)}) como tarifa de referencia y limitar descuentos comerciales discrecionales dentro de ±${formatNumber(Math.min(12, Math.max(3, model.mape * 0.6)), 1)}%.`,
  });

  // Ensure business context alignment note if non-significant variables exist
  const nonSigCount = nonIntercept.filter((c) => !c.significant).length;
  if (nonSigCount > 0 && recs.length < 4) {
    recs.push({
      priority: 'Media',
      title: 'Simplificar criterios comerciales sin impacto demostrado',
      impactHeadline: `${nonSigCount} atributo(s) sin impacto estadístico significativo`,
      rationale: `En línea con el contexto planteado (${businessContext.slice(0, 90).trim()}...), no todas las características evaluadas mueven realmente el precio final.`,
      actionStep: `Evitar sobrecostos en atributos sin retorno demostrado en precio y concentrar la propuesta comercial en las variables validadas por el modelo.`,
    });
  }

  void businessQuestion;
  return recs;
}

function buildExecutiveAnswer(
  model: RegressionModelResult,
  monteCarlo: MonteCarloSummary,
  presets: ScenarioEvaluation[],
  businessQuestion: string
): string {
  const target = model.targetVariable;
  const sigCoefs = model.coefficients
    .filter((c) => !c.isIntercept && c.significant)
    .sort((a, b) => Math.abs(b.stdBeta ?? 0) - Math.abs(a.stdBeta ?? 0));

  const topDriversText =
    sigCoefs.length > 0
      ? sigCoefs
          .slice(0, 3)
          .map((c) =>
            c.isDummy
              ? `${c.sourceColumn} (${c.dummyCategory})`
              : c.name
          )
          .join(', ')
      : model.features.slice(0, 3).join(', ');

  const cons = presets[0];
  const base = presets[1];
  const opt = presets[2];

  const questionPrefix = businessQuestion.trim()
    ? `En respuesta directa a la pregunta de negocio planteada, `
    : `De acuerdo con la evidencia econométrica de la cartera, `;

  return `${questionPrefix}el modelo seleccionado (${model.label}) explica el ${formatNumber(model.adjRSquared * 100, 1)}% de la variación ajustada de ${target} con un error típico de ${formatCurrencyLike(model.rmse, target)}. Los determinantes económicos más influyentes son ${topDriversText}. La simulación realista posiciona el precio esperado de mercado en ${base ? formatCurrencyLike(base.predictedPrice, target) : formatCurrencyLike(monteCarlo.p50, target)} para un perfil estándar, con un corredor competitivo desde ${cons ? formatCurrencyLike(cons.predictedPrice, target) : formatCurrencyLike(monteCarlo.p10, target)} (conservador) hasta ${opt ? formatCurrencyLike(opt.predictedPrice, target) : formatCurrencyLike(monteCarlo.p90, target)} (premium).`;
}
