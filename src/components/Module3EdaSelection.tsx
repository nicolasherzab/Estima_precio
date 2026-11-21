import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ArrowLeft, ArrowRight, AlertTriangle, Check } from 'lucide-react';
import { EdaResult, PreprocessedDataset } from '../types/analytics';
import { formatCurrencyLike, formatNumber } from '../engine/mathStats';

interface Module3EdaSelectionProps {
  preprocessed: PreprocessedDataset;
  eda: EdaResult;
  targetVariable: string;
  selectedFeatures: string[];
  onTargetChange: (col: string) => void;
  onToggleFeature: (col: string) => void;
  onApplyRecommendation: () => void;
  onBack: () => void;
  onContinue: () => void;
}

function getCorrelationCellStyle(r: number, isDiagonal: boolean): { bg: string; text: string } {
  if (isDiagonal) return { bg: 'bg-slate-100', text: 'text-slate-500' };
  const abs = Math.abs(r);
  if (r > 0) {
    if (abs >= 0.75) return { bg: 'bg-blue-700', text: 'text-white' };
    if (abs >= 0.45) return { bg: 'bg-blue-500', text: 'text-white' };
    if (abs >= 0.2) return { bg: 'bg-blue-100', text: 'text-blue-950' };
    return { bg: 'bg-slate-50', text: 'text-slate-600' };
  } else {
    if (abs >= 0.75) return { bg: 'bg-rose-700', text: 'text-white' };
    if (abs >= 0.45) return { bg: 'bg-rose-500', text: 'text-white' };
    if (abs >= 0.2) return { bg: 'bg-rose-100', text: 'text-rose-950' };
    return { bg: 'bg-slate-50', text: 'text-slate-600' };
  }
}

export const Module3EdaSelection: React.FC<Module3EdaSelectionProps> = ({
  preprocessed,
  eda,
  targetVariable,
  selectedFeatures,
  onTargetChange,
  onToggleFeature,
  onApplyRecommendation,
  onBack,
  onContinue,
}) => {
  const [selectedDistCol, setSelectedDistCol] = useState<string>(
    targetVariable || preprocessed.numericColumns[0] || ''
  );
  const [selectedCatCol, setSelectedCatCol] = useState<string>(
    preprocessed.categoricalColumns[0] || ''
  );

  const activeDistSummary =
    eda.numericSummaries.find((s) => s.column === selectedDistCol) ?? eda.numericSummaries[0];
  const activeCatBreakdown =
    eda.categoricalBreakdowns.find((c) => c.column === selectedCatCol) ??
    eda.categoricalBreakdowns[0];

  const allCandidateFeatures = [
    ...preprocessed.numericColumns.filter((c) => c !== targetVariable),
    ...preprocessed.categoricalColumns,
  ];

  const canProceed = Boolean(targetVariable) && selectedFeatures.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-700">Módulo 3 de 5 · Diagnóstico exploratorio y diseño del modelo</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Análisis Exploratorio (AED) y selección de variables
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Examina las distribuciones históricas, reglas de negocio y matriz de correlaciones, y valida la selección sugerida de variable dependiente (Y) e independientes (X).
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
            disabled={!canProceed}
            onClick={onContinue}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Entrenar Regresión Múltiple
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Business Rules extracted from EDA */}
      {eda.businessRules.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {eda.businessRules.map((rule, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-2"
            >
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500">{rule.title}</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {rule.metric}
                </p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{rule.detail}</p>
            </div>
          ))}
        </section>
      )}

      {/* Variable Selection & Context-Aligned Recommendation */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              01. Recomendación justificada de variables (Y y X)
            </h2>
            <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
              {eda.recommendation.targetJustification}
            </p>
          </div>
          <button
            type="button"
            onClick={onApplyRecommendation}
            className="px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Restaurar selección recomendada
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Dependent Variable Y Selector */}
          <div className="lg:col-span-4 space-y-3">
            <label htmlFor="target-select" className="block text-sm font-semibold text-slate-900">
              Variable dependiente (Y — Precio a estimar)
            </label>
            <select
              id="target-select"
              value={targetVariable}
              onChange={(e) => onTargetChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            >
              {preprocessed.numericColumns.map((col) => (
                <option key={col} value={col}>
                  {col} {col === eda.recommendation.suggestedTarget ? '(Sugerida)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sugerencia alineada al contexto de negocio:{' '}
              <span className="font-medium text-slate-800">{eda.recommendation.suggestedTarget}</span>.
              {eda.recommendation.contextKeywordsMatched.length > 0 && (
                <>
                  {' '}
                  Términos clave detectados: {eda.recommendation.contextKeywordsMatched.join(', ')}.
                </>
              )}
            </p>
          </div>

          {/* Independent Variables X Checkboxes */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Variables independientes (X — Predictores explicativos)
              </p>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {selectedFeatures.length} de {allCandidateFeatures.length} seleccionadas
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
              {allCandidateFeatures.map((col) => {
                const isSelected = selectedFeatures.includes(col);
                const info = eda.recommendation.featureJustifications[col];
                const isCat = preprocessed.categoricalColumns.includes(col);
                return (
                  <label
                    key={col}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleFeature(col)}
                      className="sr-only"
                    />
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">{col}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">
                          {isCat ? 'Categórica (Dummies)' : 'Numérica'}
                        </span>
                        {info?.recommended && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-blue-700 font-medium">Recomendada</span>
                          </>
                        )}
                      </div>
                      {info && (
                        <p className="text-xs text-slate-600 leading-relaxed">{info.reason}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Distributions & Categorical Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Histogram */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                02. Distribución de variables numéricas
              </h2>
              {activeDistSummary && (
                <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  Mín {formatNumber(activeDistSummary.min, 1)} · Mediana {formatNumber(activeDistSummary.median, 1)} · Media {formatNumber(activeDistSummary.mean, 1)} · Máx {formatNumber(activeDistSummary.max, 1)}
                </p>
              )}
            </div>
            <select
              aria-label="Seleccionar variable numérica para histograma"
              value={activeDistSummary?.column ?? ''}
              onChange={(e) => setSelectedDistCol(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
            >
              {eda.numericSummaries.map((s) => (
                <option key={s.column} value={s.column}>
                  {s.column}
                </option>
              ))}
            </select>
          </div>

          {activeDistSummary && (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeDistSummary.histogram}
                  margin={{ top: 10, right: 12, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    angle={-22}
                    textAnchor="end"
                    height={46}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val: unknown) => [`${val} registros`, 'Frecuencia']}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Categorical average target comparison */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                03. {targetVariable} promedio por categoría
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Diferenciación de precios entre segmentos cualitativos
              </p>
            </div>
            {eda.categoricalBreakdowns.length > 0 && (
              <select
                aria-label="Seleccionar variable categórica"
                value={activeCatBreakdown?.column ?? ''}
                onChange={(e) => setSelectedCatCol(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
              >
                {eda.categoricalBreakdowns.map((c) => (
                  <option key={c.column} value={c.column}>
                    {c.column}
                  </option>
                ))}
              </select>
            )}
          </div>

          {activeCatBreakdown ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeCatBreakdown.groups}
                  layout="vertical"
                  margin={{ top: 8, right: 18, left: 10, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(v) => formatNumber(v, 0)}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={92}
                    tick={{ fontSize: 11, fill: '#334155' }}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [
                      formatCurrencyLike(Number(val), targetVariable),
                      `Promedio ${targetVariable}`,
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="meanTarget" fill="#0f172a" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500">
              No hay variables categóricas en este dataset.
            </div>
          )}
        </section>
      </div>

      {/* Correlation Matrix Heatmap */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              04. Matriz de correlaciones de Pearson (r)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Azul indica asociación lineal positiva; rojo indica asociación inversa. La primera fila/columna corresponde a {targetVariable}.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            −1,00 (Inversa) · 0,00 (Nula) · +1,00 (Directa)
          </div>
        </div>

        {eda.highCollinearityPairs.length > 0 && (
          <div className="mx-6 mt-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <span className="font-semibold">Alerta de colinealidad entre predictores:</span>{' '}
              {eda.highCollinearityPairs
                .map((p) => `${p.varA} y ${p.varB} (r = ${formatNumber(p.r, 2)})`)
                .join(' · ')}
              . El Módulo 4 monitoreará el VIF y probará modelos optimizados para mitigar redundancia.
            </div>
          </div>
        )}

        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="py-2 px-3 text-left font-semibold text-slate-600">Variable</th>
                {eda.correlationColumns.map((col) => (
                  <th
                    key={col}
                    className="py-2 px-2 text-center font-semibold text-slate-700 whitespace-nowrap max-w-[110px] truncate"
                    title={col}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eda.correlationColumns.map((rowCol, i) => (
                <tr key={rowCol}>
                  <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap border-t border-slate-100">
                    {rowCol}
                  </td>
                  {eda.correlationColumns.map((colCol, j) => {
                    const r = eda.correlationMatrix[i][j];
                    const style = getCorrelationCellStyle(r, i === j);
                    return (
                      <td
                        key={colCol}
                        title={`${rowCol} vs ${colCol}: r = ${formatNumber(r, 4)}`}
                        className={`py-2 px-2 text-center font-mono tabular-nums border border-white ${style.bg} ${style.text}`}
                      >
                        {formatNumber(r, 2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full Numeric Summary Statistics Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            05. Estadísticos descriptivos completos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-2.5 px-4 font-semibold text-slate-700">Variable</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Mínimo</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Q1 (25%)</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Mediana</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Media</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Q3 (75%)</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Máximo</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Desv. Est.</th>
                <th className="py-2.5 px-4 font-semibold text-slate-700 text-right">Atípicos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eda.numericSummaries.map((s) => (
                <tr key={s.column} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                    {s.column}
                    {s.column === targetVariable && (
                      <span className="ml-2 text-blue-700 font-semibold">(Y)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                    {formatNumber(s.min, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                    {formatNumber(s.q1, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-900 font-medium">
                    {formatNumber(s.median, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                    {formatNumber(s.mean, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                    {formatNumber(s.q3, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                    {formatNumber(s.max, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-600">
                    {formatNumber(s.stdDev, 2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                    {s.outlierCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
