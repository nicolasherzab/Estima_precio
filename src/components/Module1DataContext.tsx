import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, ArrowRight, Database } from 'lucide-react';
import { RawDataset } from '../types/analytics';
import { formatNumber } from '../engine/mathStats';

interface Module1DataContextProps {
  businessContext: string;
  businessQuestion: string;
  onBusinessContextChange: (val: string) => void;
  onBusinessQuestionChange: (val: string) => void;
  rawDataset: RawDataset | null;
  uploadError: string | null;
  isParsing: boolean;
  onFileSelected: (file: File) => void;
  onLoadSampleData: () => void;
  onContinue: () => void;
}

export const Module1DataContext: React.FC<Module1DataContextProps> = ({
  businessContext,
  businessQuestion,
  onBusinessContextChange,
  onBusinessQuestionChange,
  rawDataset,
  uploadError,
  isParsing,
  onFileSelected,
  onLoadSampleData,
  onContinue,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
      e.target.value = '';
    }
  };

  const previewRows = rawDataset ? rawDataset.rows.slice(0, 5) : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-700">Módulo 1 de 5 · Definición del problema y fuente de datos</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Contexto de negocio y carga de datos
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Describe el escenario comercial y carga tu archivo de datos históricos (.csv, .txt, .xls, .xlsx) o inicia de inmediato con el conjunto de datos de ejemplo.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onLoadSampleData}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Database className="w-4 h-4" />
            Usar datos de ejemplo
          </button>
          {rawDataset && (
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Continuar a Preprocesamiento
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main 2-column grid: Business context + File upload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Business Context & Question */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-5">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                01. Enfoque económico y pregunta de negocio
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Esta información alinea la recomendación automática de variables y traduce el modelo final a decisiones comerciales.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="business-context"
                className="block text-sm font-medium text-slate-800"
              >
                Contexto de negocio
              </label>
              <textarea
                id="business-context"
                rows={4}
                value={businessContext}
                onChange={(e) => onBusinessContextChange(e.target.value)}
                placeholder="Ej. Comercializadora de vehículos seminuevos que busca fijar precios competitivos según kilometraje, año, marca y tipo de transmisión..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 transition-colors resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="business-question"
                className="block text-sm font-medium text-slate-800"
              >
                Pregunta principal de negocio
              </label>
              <textarea
                id="business-question"
                rows={3}
                value={businessQuestion}
                onChange={(e) => onBusinessQuestionChange(e.target.value)}
                placeholder="Ej. ¿Qué factores determinan el precio óptimo de venta y qué margen de valoración corresponde a cada segmento?"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 transition-colors resize-y"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>Alineación automática con selección de variables (Módulo 3) y recomendaciones (Módulo 5).</span>
          </div>
        </section>

        {/* Right: Dataset Dropzone */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                02. Carga del conjunto de datos
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Formatos admitidos: .csv · .txt · .xls · .xlsx (detección automática de delimitadores).
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed rounded-lg p-7 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-blue-700 bg-blue-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xls,.xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="mx-auto w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 mb-3">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-900">
                {isParsing ? 'Procesando archivo...' : 'Arrastra tu archivo aquí o haz clic para examinar'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Soporta coma, punto y coma, tabulación o libros de Excel
              </p>
            </div>

            {uploadError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {rawDataset && rawDataset.warnings.length > 0 && (
              <div className="space-y-1.5 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                {rawDataset.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">¿Sin archivo a la mano?</span>
            <button
              type="button"
              onClick={onLoadSampleData}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cargar cartera inmobiliaria (150 filas)
            </button>
          </div>
        </section>
      </div>

      {/* Preview Table: First 5 Rows */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Vista previa del dataset (5 filas iniciales)
            </h2>
            {rawDataset ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                <span className="font-medium text-slate-700">{rawDataset.fileName}</span>
                <span aria-hidden="true">·</span>
                <span>{rawDataset.fileFormat}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{rawDataset.rows.length} registros</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{rawDataset.headers.length} columnas</span>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                Aún no se ha cargado ningún conjunto de datos.
              </p>
            )}
          </div>
          {rawDataset && (
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ejecutar limpieza y codificación
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {rawDataset ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2.5 px-4 font-semibold text-slate-500 w-12 text-right">#</th>
                  {rawDataset.headers.map((header) => (
                    <th
                      key={header}
                      className="py-2.5 px-4 font-semibold text-slate-700 whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400 text-right">
                      {idx + 1}
                    </td>
                    {rawDataset.headers.map((header) => {
                      const val = row[header];
                      const isNull = val === null || val === undefined || val === '';
                      const isNum = typeof val === 'number';
                      return (
                        <td
                          key={header}
                          className={`py-2.5 px-4 whitespace-nowrap ${
                            isNull
                              ? 'text-amber-700 italic font-mono'
                              : isNum
                              ? 'font-mono tabular-nums text-slate-900 text-right'
                              : 'text-slate-700'
                          }`}
                        >
                          {isNull
                            ? 'Nulo'
                            : isNum
                            ? formatNumber(val, Number.isInteger(val) ? 0 : 2)
                            : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center space-y-3">
            <div className="mx-auto w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">Sin datos cargados</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Sube un archivo en formato CSV, TXT o Excel, o haz clic en "Usar datos de ejemplo" para inspeccionar inmediatamente las 5 primeras filas y ejecutar el análisis completo.
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={onLoadSampleData}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                Usar datos de ejemplo
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
