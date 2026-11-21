import React from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react';
import { ModelingSuiteResult, RegressionModelResult } from '../types/analytics';
import { formatCurrencyLike, formatNumber, formatPValue } from '../engine/mathStats';

interface Module4RegressionModelProps {
  modelingSuite: ModelingSuiteResult;
  activeModelId: 'full' | 'stepwise' | 'parsimonious';
  onSelectModel: (id: 'full' | 'stepwise' | 'parsimonious') => void;
  onBack: () => void;
  onContinue: () => void;
}

export const Module4RegressionModel: React.FC<Module4RegressionModelProps> = ({
  modelingSuite,
  activeModelId,
  onSelectModel,
  onBack,
  onContinue,
}) => {
  const activeModel: RegressionModelResult | undefined =
    modelingSuite.models.find((m) => m.id === activeModelId) ?? modelingSuite.models[0];

  if (!activeModel) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
        <h1 className="text-xl font-bold text-slate-900">No se pudo estimar el modelo</h1>
        <p className="text-sm text-slate-600">{modelingSuite.selectionRationale}</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Revisar selección de variables
        </button>
      </div>
    );
  }

  const target = activeModel.targetVariable;

  // Domain bounds for 45-degree reference line in Actual vs Predicted
  const allVals = activeModel.residuals.flatMap((p) => [p.actual, p.predicted]);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);

  // Standardized beta chart data (relative importance)
  const importanceData = activeModel.coefficients
    .filter((c) => !c.isIntercept && c.stdBeta !== null)
    .map((c) => ({
      name: c.name,
      stdBeta: Number((c.stdBeta ?? 0).toFixed(3)),
      absBeta: Math.abs(c.stdBeta ?? 0),
    }))
    .sort((a, b) => b.absBeta - a.absBeta)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-700">Módulo 4 de 5 · Inferencia econométrica y validación</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Modelado de Regresión Lineal Múltiple
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Estimación exacta por Mínimos Cuadrados Ordinarios (MCO), contraste comparativo de modelos, validación estadística integral y traducción de cada coeficiente a impacto económico.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Simular Escenarios y Exportar
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Warnings if any */}
      {modelingSuite.warnings.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1.5">
          {modelingSuite.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Candidate Model Comparison & Automatic Selection */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              01. Selección comparativa del mejor modelo
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              {modelingSuite.selectionRationale}
            </p>
          </div>
          {modelingSuite.models.length > 1 && (
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start">
              {modelingSuite.models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectModel(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activeModel.id === m.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.id === 'full'
                    ? 'Completo'
                    : m.id === 'stepwise'
                    ? 'Optimizado'
                    : 'Parsimonioso'}
                  {m.id === modelingSuite.recommendedModelId ? ' ★' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200">
                <th className="py-2.5 px-4 font-semibold text-slate-700">Especificación</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Variables (k)</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">R²</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">R² Ajustado</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">RMSE</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Estadístico F</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">AICc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modelingSuite.models.map((m) => {
                const isSelected = m.id === activeModel.id;
                const isBest = m.id === modelingSuite.recommendedModelId;
                return (
                  <tr
                    key={m.id}
                    onClick={() => onSelectModel(m.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-slate-900">{m.label}</span>
                      {isBest && (
                        <span className="ml-2 text-blue-700 font-medium">· Mejor ajuste</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                      {m.k}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                      {formatNumber(m.rSquared * 100, 2)}%
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {formatNumber(m.adjRSquared * 100, 2)}%
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-800">
                      {formatCurrencyLike(m.rmse, target)}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                      {formatNumber(m.fStat, 2)}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-600">
                      {formatNumber(m.aicc, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Core Statistical Validation Metrics with Explanatory Footnotes */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs text-slate-500">R² (Determinación)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatNumber(activeModel.rSquared * 100, 2)}%
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Proporción de la variabilidad total de {target} explicada por las variables del modelo.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs text-slate-500">R² Ajustado</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-blue-700">
            {formatNumber(activeModel.adjRSquared * 100, 2)}%
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Penaliza variables irrelevantes; métrica clave para comparar modelos con distinto número de predictores.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs text-slate-500">RMSE (Error típico)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrencyLike(activeModel.rmse, target)}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Desviación media cuadrática en la misma unidad de {target} (MAPE: {formatNumber(activeModel.mape, 1)}%).
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs text-slate-500">Estadístico F global</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatNumber(activeModel.fStat, 2)}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Contrastado con gl ({activeModel.dfModel}, {activeModel.dfResidual}). Evalúa si el modelo conjunto supera al promedio simple.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs text-slate-500">P-valor global (F)</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums ${
              activeModel.fPValue < 0.05 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatPValue(activeModel.fPValue)}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {activeModel.fPValue < 0.05
              ? 'Modelo globalmente significativo (p < 0,05). Evidencia sólida de capacidad explicativa.'
              : 'No significativo al 95% (p ≥ 0,05). Revisa la selección de predictores.'}
          </p>
        </div>
      </section>

      {/* Final Mathematical Equation */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            02. Ecuación matemática final del modelo
          </h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            n = {activeModel.n} · k = {activeModel.k} · Durbin-Watson = {formatNumber(activeModel.durbinWatson, 2)}
          </span>
        </div>
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs sm:text-sm text-slate-900 leading-relaxed overflow-x-auto">
          {activeModel.equationText}
        </div>
      </section>

      {/* OLS Coefficients Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            03. Estimación de parámetros y pruebas de hipótesis (Estadístico t y P-valor)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            El estadístico t mide cuántas veces supera el coeficiente a su error estándar; un P-valor &lt; 0,05 confirma significancia estadística al 95% de confianza.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 font-semibold text-slate-700">Variable</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Coeficiente (β)</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Error Est.</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Estadístico t</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">P-valor</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">IC 95%</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">VIF</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeModel.coefficients.map((c) => (
                <tr key={c.name} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                    {c.name}
                    {c.isDummy && c.referenceCategory && (
                      <span className="block text-[11px] font-normal text-slate-500">
                        vs. base "{c.referenceCategory}"
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-3 px-4 font-mono tabular-nums text-right font-semibold whitespace-nowrap ${
                      c.isIntercept
                        ? 'text-slate-900'
                        : c.estimate >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {c.estimate >= 0 && !c.isIntercept ? '+' : ''}
                    {formatNumber(c.estimate, 2)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600">
                    {formatNumber(c.stdError, 2)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-800">
                    {formatNumber(c.tStat, 2)}
                  </td>
                  <td
                    className={`py-3 px-4 font-mono tabular-nums text-right ${
                      c.pValue < 0.05 ? 'text-slate-900 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {formatPValue(c.pValue)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                    [{formatNumber(c.ciLower, 1)}; {formatNumber(c.ciUpper, 1)}]
                  </td>
                  <td
                    className={`py-3 px-4 font-mono tabular-nums text-right ${
                      c.vif !== null && c.vif > 5 ? 'text-amber-700 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    {c.vif !== null ? formatNumber(c.vif, 2) : '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {c.isIntercept ? (
                      <span className="text-slate-500">Intercepto</span>
                    ) : c.significant ? (
                      <span className="text-emerald-700 font-medium">Significativa</span>
                    ) : (
                      <span className="text-slate-500">No significativa</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Business-Language Coefficient Interpretation */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            04. Interpretación de negocio de cada coeficiente (impacto marginal sobre el precio)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Traducción directa de cada parámetro estimado a impacto económico accionable para decisiones de pricing.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {activeModel.coefficients.map((c) => (
            <div
              key={c.name}
              className="px-6 py-4 flex flex-col md:flex-row md:items-baseline gap-2 md:gap-6"
            >
              <div className="md:w-56 shrink-0">
                <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                <p
                  className={`text-xs font-mono tabular-nums font-semibold mt-0.5 ${
                    c.isIntercept
                      ? 'text-slate-600'
                      : c.estimate >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {c.isIntercept
                    ? formatCurrencyLike(c.estimate, target)
                    : `${c.estimate >= 0 ? '+' : '−'}${formatCurrencyLike(Math.abs(c.estimate), target)}`}
                </p>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed flex-1">
                {c.businessExplanation}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Diagnostic Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actual vs Predicted */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              05. Diagnóstico: Precio real vs. precio predicho
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cuanto más cerca estén los puntos de la línea diagonal, mayor precisión del modelo.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, bottom: 16, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="Real"
                  domain={[minVal, maxVal]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(v, 0)}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="Predicho"
                  domain={[minVal, maxVal]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(v, 0)}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatCurrencyLike(Number(value), target),
                    String(name),
                  ]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <ReferenceLine
                  segment={[
                    { x: minVal, y: minVal },
                    { x: maxVal, y: maxVal },
                  ]}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                />
                <Scatter
                  name="Observaciones"
                  data={activeModel.residuals}
                  fill="#1d4ed8"
                  fillOpacity={0.65}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Residuals vs Fitted OR Standardized Importance */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              06. Diagnóstico: Residuos frente a valores ajustados
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Una nube dispersa alrededor de cero valida homocedasticidad y linealidad del modelo.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, bottom: 16, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="predicted"
                  name="Valor ajustado"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(v, 0)}
                />
                <YAxis
                  type="number"
                  dataKey="residual"
                  name="Residuo"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(v, 0)}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatCurrencyLike(Number(value), target),
                    String(name),
                  ]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <ReferenceLine y={0} stroke="#0f172a" strokeDasharray="4 4" />
                <Scatter
                  name="Residuo"
                  data={activeModel.residuals}
                  fill="#0f172a"
                  fillOpacity={0.55}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Relative Importance (Standardized Beta) */}
      {importanceData.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              07. Peso relativo de los impulsores (coeficientes estandarizados β*)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Permite comparar la fuerza relativa de variables medidas en distintas unidades (en desviaciones estándar).
            </p>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={importanceData}
                layout="vertical"
                margin={{ top: 6, right: 24, left: 20, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 11, fill: '#334155' }}
                />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(Number(v), 3), 'Beta estandarizado']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="stdBeta" radius={[3, 3, 3, 3]}>
                  {importanceData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.stdBeta >= 0 ? '#1d4ed8' : '#be123c'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
};
