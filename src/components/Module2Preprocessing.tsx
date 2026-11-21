import React from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import {
  NumericImputationMethod,
  PreprocessedDataset,
  RawDataset,
} from '../types/analytics';
import { formatNumber } from '../engine/mathStats';
import { getVariableTypeLabel } from '../engine/preprocessing';

interface Module2PreprocessingProps {
  rawDataset: RawDataset;
  preprocessed: PreprocessedDataset;
  onImputationOverrideChange: (column: string, method: NumericImputationMethod) => void;
  onBack: () => void;
  onContinue: () => void;
}

export const Module2Preprocessing: React.FC<Module2PreprocessingProps> = ({
  rawDataset,
  preprocessed,
  onImputationOverrideChange,
  onBack,
  onContinue,
}) => {
  const columnsWithMissing = preprocessed.profiles.filter((p) => p.missingCount > 0);
  const encodedPreview = preprocessed.encodedRows.slice(0, 5);
  const encodedPreviewCols = preprocessed.allModelFeatures.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-700">Módulo 2 de 5 · Auditoría de calidad y transformación</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Preprocesamiento y codificación de variables
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Se auditan los valores faltantes por columna, se imputan automáticamente según tipo y asimetría, y se codifican las variables categóricas en variables Dummy (esquema k−1 para evitar multicolinealidad perfecta).
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
            Continuar a AED y Selección
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Strip: Flat, clean tabular summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Registros procesados</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {rawDataset.rows.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {rawDataset.headers.length} columnas de entrada
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Celdas nulas imputadas</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {preprocessed.totalMissingImputed}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            En {columnsWithMissing.length} columna(s) afectada(s)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Variables numéricas</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {preprocessed.numericColumns.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Conservadas en escala original
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-500">Variables Dummy generadas</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {preprocessed.dummyMappings.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            De {preprocessed.categoricalColumns.length} variable(s) categórica(s)
          </p>
        </div>
      </div>

      {/* Missing data & Imputation Audit Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              01. Análisis de valores faltantes e imputación automática
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Para columnas numéricas con nulos, el motor elige mediana si existe asimetría (|asimetría| &gt; 0,85) o media en distribuciones simétricas. Puedes ajustar el método manualmente.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 font-semibold text-slate-700">Columna</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Tipo detectado</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Nulos</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">% Nulos</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Únicos</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Estrategia aplicada</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Valor imputado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preprocessed.profiles.map((prof) => {
                const isExcluded = prof.detectedType === 'excluded';
                const canToggleMethod =
                  prof.detectedType === 'numeric' && prof.missingCount > 0;

                return (
                  <tr key={prof.name} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {prof.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      <span
                        className={
                          isExcluded
                            ? 'text-slate-400'
                            : prof.detectedType === 'categorical'
                            ? 'text-blue-700 font-medium'
                            : 'text-slate-700'
                        }
                      >
                        {getVariableTypeLabel(prof.detectedType)}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 font-mono tabular-nums text-right ${
                        prof.missingCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {prof.missingCount}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-700">
                      {formatNumber(prof.missingPercent, 1)}%
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600">
                      {prof.uniqueCount}
                    </td>
                    <td className="py-3 px-4">
                      {isExcluded ? (
                        <span className="text-slate-500">{prof.excludedReason}</span>
                      ) : canToggleMethod ? (
                        <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                          <button
                            type="button"
                            onClick={() => onImputationOverrideChange(prof.name, 'mean')}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                              prof.imputationStrategy === 'mean'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Media
                          </button>
                          <button
                            type="button"
                            onClick={() => onImputationOverrideChange(prof.name, 'median')}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                              prof.imputationStrategy === 'median'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Mediana
                          </button>
                        </div>
                      ) : prof.imputationStrategy === 'mode' ? (
                        <span className="text-slate-800 font-medium">Moda categórica</span>
                      ) : (
                        <span className="text-emerald-700">Sin valores faltantes</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap">
                      {prof.missingCount > 0 && prof.imputedValue !== null
                        ? typeof prof.imputedValue === 'number'
                          ? formatNumber(prof.imputedValue, 2)
                          : String(prof.imputedValue)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Categorical Dummy Encoding Summary */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            02. Transformación a variables Dummy (One-Hot Encoding k−1)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada variable categórica se descompone en variables binarias (0 o 1), tomando automáticamente la categoría más frecuente como categoría de referencia (base de comparación del intercepto).
          </p>
        </div>

        {preprocessed.categoricalColumns.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {preprocessed.categoricalColumns.map((catCol) => {
              const prof = preprocessed.profiles.find((p) => p.name === catCol)!;
              const dummies = preprocessed.dummyMappings.filter((d) => d.sourceColumn === catCol);
              return (
                <div
                  key={catCol}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{catCol}</p>
                    <p className="text-xs text-slate-500">
                      Categoría de referencia (base = 0):{' '}
                      <span className="font-medium text-slate-800">{prof.referenceCategory}</span>
                      {' · '}
                      {(prof.categories ?? []).length} niveles totales
                    </p>
                  </div>
                  <div className="text-xs text-slate-700 font-mono">
                    {dummies.map((d) => d.dummyName).join('  ·  ')}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-8 text-xs text-slate-500">
            El conjunto de datos cargado contiene únicamente variables numéricas; no se requirieron variables Dummy adicionales.
          </div>
        )}
      </section>

      {/* Encoded Model Matrix Preview */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              03. Vista previa de la matriz lista para modelado
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Primeras 5 observaciones imputadas y codificadas ({preprocessed.allModelFeatures.length} columnas numéricas/binarias totales; mostrando las primeras {encodedPreviewCols.length}).
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-2.5 px-4 font-semibold text-slate-500 text-right w-10">#</th>
                {encodedPreviewCols.map((col) => (
                  <th
                    key={col}
                    className="py-2.5 px-4 font-semibold text-slate-700 text-right whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {encodedPreview.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400 text-right">
                    {idx + 1}
                  </td>
                  {encodedPreviewCols.map((col) => (
                    <td
                      key={col}
                      className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap"
                    >
                      {formatNumber(row[col], Number.isInteger(row[col]) ? 0 : 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
