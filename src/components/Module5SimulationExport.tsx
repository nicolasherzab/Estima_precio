import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { ArrowLeft, Download, FileCode, RotateCcw } from 'lucide-react';
import {
  EdaResult,
  PreprocessedDataset,
  RegressionModelResult,
  ScenarioEvaluation,
  ScenarioInputValues,
  SimulationSuiteResult,
} from '../types/analytics';
import { formatCurrencyLike, formatNumber } from '../engine/mathStats';

interface Module5SimulationExportProps {
  businessQuestion: string;
  preprocessed: PreprocessedDataset;
  eda: EdaResult;
  model: RegressionModelResult;
  simulation: SimulationSuiteResult;
  customInputs: ScenarioInputValues;
  customEvaluation: ScenarioEvaluation;
  onUpdateNumericInput: (col: string, val: number) => void;
  onUpdateCategoricalInput: (col: string, val: string) => void;
  onLoadPreset: (inputs: ScenarioInputValues) => void;
  onExportPdf: () => void;
  onExportHtml: () => void;
  onBack: () => void;
}

export const Module5SimulationExport: React.FC<Module5SimulationExportProps> = ({
  businessQuestion,
  preprocessed,
  eda,
  model,
  simulation,
  customInputs,
  customEvaluation,
  onUpdateNumericInput,
  onUpdateCategoricalInput,
  onLoadPreset,
  onExportPdf,
  onExportHtml,
  onBack,
}) => {
  const target = model.targetVariable;
  const numericPlans = simulation.variablePlans.filter((p) => p.kind === 'numeric');
  const categoricalPlans = simulation.variablePlans.filter((p) => p.kind === 'categorical');

  return (
    <div className="space-y-8">
      {/* Header with primary Export Actions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-700">Módulo 5 de 5 · Proyección, estrategia y entregables ejecutivos</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Simulación de escenarios, recomendaciones y exportación
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Proyecta escenarios realistas basados en regresiones auxiliares y distribuciones ajustadas, evalúa precios personalizados en tiempo real y descarga el informe ejecutivo final.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
            onClick={onExportHtml}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCode className="w-4 h-4 text-slate-600" />
            Exportar HTML
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Executive Answer to Business Question */}
      <section className="bg-blue-50/70 border border-blue-200 rounded-lg p-6 space-y-2">
        <p className="text-xs font-semibold text-blue-800">
          Respuesta ejecutiva a la pregunta de negocio
        </p>
        {businessQuestion.trim() && (
          <p className="text-sm font-semibold text-slate-900">
            "{businessQuestion}"
          </p>
        )}
        <p className="text-sm text-slate-800 leading-relaxed">
          {simulation.executiveAnswer}
        </p>
      </section>

      {/* Interactive Custom Scenario Simulator */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              01. Simulador interactivo de precios por escenario
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ajusta los atributos del perfil a valorar o carga cualquiera de los escenarios de referencia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {simulation.presetScenarios.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onLoadPreset(preset.inputs)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
              >
                {preset.name.replace('Escenario ', '')}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onLoadPreset(simulation.presetScenarios[1].inputs)}
              title="Restablecer al escenario base"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Interactive Controls */}
          <div className="lg:col-span-6 space-y-5">
            {numericPlans.map((plan) => {
              const summary = eda.numericSummaries.find((s) => s.column === plan.variable);
              if (!summary) return null;
              const val = customInputs.numeric[plan.variable] ?? summary.median;
              const step = summary.isInteger
                ? 1
                : Number(((summary.max - summary.min) / 100).toFixed(2)) || 0.1;

              return (
                <div key={plan.variable} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label
                      htmlFor={`sim-${plan.variable}`}
                      className="font-semibold text-slate-800"
                    >
                      {plan.variable}
                    </label>
                    <input
                      id={`sim-${plan.variable}`}
                      type="number"
                      step={step}
                      min={summary.min}
                      max={summary.max}
                      value={val}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (Number.isFinite(parsed)) onUpdateNumericInput(plan.variable, parsed);
                      }}
                      className="w-24 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 border border-slate-300 rounded px-2 py-1 focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    aria-label={plan.variable}
                    min={summary.min}
                    max={summary.max}
                    step={step}
                    value={Math.max(summary.min, Math.min(summary.max, val))}
                    onChange={(e) => onUpdateNumericInput(plan.variable, Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
                    <span>Mín: {formatNumber(summary.min, summary.isInteger ? 0 : 1)}</span>
                    <span>Mediana: {formatNumber(summary.median, summary.isInteger ? 0 : 1)}</span>
                    <span>Máx: {formatNumber(summary.max, summary.isInteger ? 0 : 1)}</span>
                  </div>
                </div>
              );
            })}

            {categoricalPlans.map((plan) => {
              const prof = preprocessed.profiles.find((p) => p.name === plan.variable);
              const cats = prof?.categories ?? [];
              const activeVal = customInputs.categorical[plan.variable] ?? prof?.referenceCategory ?? '';
              return (
                <div key={plan.variable} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-800">{plan.variable}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => onUpdateCategoricalInput(plan.variable, cat)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                          activeVal === cat
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Live Price Estimation & Contribution Breakdown */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-6 border-t lg:border-t-0 lg:border-l border-slate-200 pt-6 lg:pt-0 lg:pl-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Precio estimado para el escenario configurado ({target})
                </p>
                <p className="text-4xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatCurrencyLike(customEvaluation.predictedPrice, target)}
                </p>
                <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
                  {customEvaluation.deltaVsMeanPct >= 0 ? '+' : ''}
                  {formatNumber(customEvaluation.deltaVsMeanPct, 1)}% frente al promedio histórico (
                  {formatCurrencyLike(model.meanY, target)})
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Intervalo de confianza 95% (media)</p>
                  <p className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatCurrencyLike(customEvaluation.ciLower, target)} –{' '}
                    {formatCurrencyLike(customEvaluation.ciUpper, target)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Intervalo de predicción 95% (activo individual)</p>
                  <p className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatCurrencyLike(customEvaluation.piLower, target)} –{' '}
                    {formatCurrencyLike(customEvaluation.piUpper, target)}
                  </p>
                </div>
              </div>
            </div>

            {/* Contribution Breakdown Chart */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-800">
                Descomposición económica del precio estimado
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={customEvaluation.contributions}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => formatNumber(v, 0)}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={136}
                      tick={{ fontSize: 10.5, fill: '#334155' }}
                    />
                    <ReferenceLine x={0} stroke="#94a3b8" />
                    <Tooltip
                      formatter={(val: unknown) => [
                        formatCurrencyLike(Number(val), target),
                        'Contribución',
                      ]}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="contribution" radius={[3, 3, 3, 3]}>
                      {customEvaluation.contributions.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.contribution >= 0 ? '#1d4ed8' : '#be123c'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Preset Scenarios Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            02. Comparativa de escenarios ejecutivos proyectados
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Escenarios coherentes construidos preservando las correlaciones estructurales entre variables independientes.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 font-semibold text-slate-700">Escenario</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Precio estimado</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">IC 95% (Media)</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">IP 95% (Individual)</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Vs. Promedio</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {simulation.presetScenarios.map((sc) => (
                <tr key={sc.name} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900">{sc.name}</p>
                    <p className="text-[11px] text-slate-500">{sc.subtitle}</p>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right font-bold text-slate-900 whitespace-nowrap">
                    {formatCurrencyLike(sc.predictedPrice, target)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-700 whitespace-nowrap">
                    {formatCurrencyLike(sc.ciLower, target)} – {formatCurrencyLike(sc.ciUpper, target)}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                    {formatCurrencyLike(sc.piLower, target)} – {formatCurrencyLike(sc.piUpper, target)}
                  </td>
                  <td
                    className={`py-3 px-4 font-mono tabular-nums text-right font-semibold whitespace-nowrap ${
                      sc.deltaVsMeanPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {sc.deltaVsMeanPct >= 0 ? '+' : ''}
                    {formatNumber(sc.deltaVsMeanPct, 1)}%
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onLoadPreset(sc.inputs)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800 underline underline-offset-4 cursor-pointer"
                    >
                      Cargar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Statistical Path for Realistic Simulation + Monte Carlo Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              03. Estrategia estadística para proyección realista de variables (X)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada variable independiente adopta el camino estadístico más riguroso (regresión auxiliar si existe correlación estructural o distribución ajustada a los datos históricos).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2.5 px-4 font-semibold text-slate-700">Variable (X)</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-700">Método seleccionado</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-700">Justificación y parámetros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {simulation.variablePlans.map((plan) => (
                  <tr key={plan.variable} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap align-top">
                      {plan.variable}
                    </td>
                    <td className="py-3 px-4 text-blue-800 font-medium whitespace-nowrap align-top">
                      {plan.methodLabel}
                    </td>
                    <td className="py-3 px-4 text-slate-600 leading-relaxed">
                      <p>{plan.rationale}</p>
                      <p className="font-mono text-[11px] text-slate-500 mt-1">
                        {plan.paramsSummary}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              04. Distribución simulada (Monte Carlo · N={simulation.monteCarlo.nSimulations})
            </h2>
            <p className="text-xs text-slate-500">
              Rango esperado de precios en el mercado simulado preservando dependencias reales.
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={simulation.monteCarlo.histogram}
                margin={{ top: 8, right: 8, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  angle={-24}
                  textAnchor="end"
                  height={44}
                  interval={1}
                />
                <YAxis tick={{ fontSize: 10.5, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: unknown) => [`${v} escenarios`, 'Frecuencia']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#0f172a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div>
              <p className="text-slate-500">Percentil 10</p>
              <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {formatCurrencyLike(simulation.monteCarlo.p10, target)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Mediana (P50)</p>
              <p className="font-mono tabular-nums font-semibold text-blue-700 mt-0.5">
                {formatCurrencyLike(simulation.monteCarlo.p50, target)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Percentil 90</p>
              <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {formatCurrencyLike(simulation.monteCarlo.p90, target)}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Actionable Strategic Recommendations */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            05. Recomendaciones estratégicas accionables
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Traducidas directamente a decisiones de política comercial, fijación de tarifas y gestión de márgenes.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {simulation.recommendations.map((rec, idx) => (
            <div key={idx} className="px-6 py-5 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-xs font-semibold text-slate-400">
                    0{idx + 1}.
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">{rec.title}</h3>
                  <span className="text-xs text-slate-400">·</span>
                  <span
                    className={`text-xs font-medium ${
                      rec.priority === 'Clave'
                        ? 'text-blue-700'
                        : rec.priority === 'Alta'
                        ? 'text-emerald-700'
                        : 'text-slate-600'
                    }`}
                  >
                    Prioridad {rec.priority}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-semibold text-blue-700 whitespace-nowrap">
                  {rec.impactHeadline}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{rec.rationale}</p>
              <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200/80 rounded-md px-3.5 py-2.5">
                <span className="font-semibold text-slate-900">Acción recomendada:</span>{' '}
                {rec.actionStep}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Executive Export Panel */}
      <section className="bg-slate-900 text-white rounded-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white">
            Descargar reporte ejecutivo consolidado
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl">
            Incluye el contexto de negocio, resumen del AED, ecuación matemática, métricas de validación (R², R² ajustado, RMSE, F, t, p-valores), tabla de escenarios simulados y recomendaciones estratégicas.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onExportHtml}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-900 bg-white rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCode className="w-4 h-4" />
            Descargar HTML
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>
      </section>
    </div>
  );
};
