import { useMemo, useState } from 'react';
import {
  NumericImputationMethod,
  RawDataset,
  ScenarioInputValues,
} from './types/analytics';
import {
  buildSampleDataset,
  DEFAULT_BUSINESS_CONTEXT,
  DEFAULT_BUSINESS_QUESTION,
} from './engine/sampleData';
import { parseUploadedFile } from './engine/fileParser';
import { preprocessDataset } from './engine/preprocessing';
import { runEdaAnalysis } from './engine/edaAndSelection';
import { trainAndSelectModels } from './engine/regression';
import {
  buildSimulationSuite,
  evaluateScenario,
} from './engine/simulationAndRecommendations';
import {
  exportExecutiveHtmlReport,
  exportExecutivePdfReport,
} from './engine/reportExporter';
import { formatCurrencyLike, formatNumber } from './engine/mathStats';
import { Module1DataContext } from './components/Module1DataContext';
import { Module2Preprocessing } from './components/Module2Preprocessing';
import { Module3EdaSelection } from './components/Module3EdaSelection';
import { Module4RegressionModel } from './components/Module4RegressionModel';
import { Module5SimulationExport } from './components/Module5SimulationExport';

type ModuleStep = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: ModuleStep; navLabel: string; title: string; subtitle: string }[] = [
  { id: 1, navLabel: '1. Datos', title: 'Contexto y Datos', subtitle: 'Carga y vista previa' },
  { id: 2, navLabel: '2. Limpieza', title: 'Preprocesamiento', subtitle: 'Nulos y Dummies' },
  { id: 3, navLabel: '3. Exploración', title: 'AED y Selección', subtitle: 'Correlación, Y y X' },
  { id: 4, navLabel: '4. Modelo', title: 'Regresión Múltiple', subtitle: 'MCO y validación' },
  { id: 5, navLabel: '5. Simulación', title: 'Simulación y Reporte', subtitle: 'Escenarios y PDF/HTML' },
];

export default function App() {
  const [activeStep, setActiveStep] = useState<ModuleStep>(1);
  const [businessContext, setBusinessContext] = useState<string>('');
  const [businessQuestion, setBusinessQuestion] = useState<string>('');
  const [rawDataset, setRawDataset] = useState<RawDataset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  // Module 2 state
  const [imputationOverrides, setImputationOverrides] = useState<
    Record<string, NumericImputationMethod>
  >({});

  // Module 3 state
  const [targetVariable, setTargetVariable] = useState<string>('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  // Module 4 state
  const [selectedModelId, setSelectedModelId] = useState<'full' | 'stepwise' | 'parsimonious' | null>(
    null
  );

  // Module 5 state (interactive custom scenario overrides)
  const [customScenarioOverrides, setCustomScenarioOverrides] = useState<ScenarioInputValues | null>(
    null
  );

  // Derived Pipeline Stage 2: Preprocessed Dataset
  const preprocessed = useMemo(() => {
    if (!rawDataset) return null;
    return preprocessDataset(rawDataset, imputationOverrides);
  }, [rawDataset, imputationOverrides]);

  // Derived Pipeline Stage 3: EDA & Context-Aligned Recommendation
  const eda = useMemo(() => {
    if (!preprocessed) return null;
    return runEdaAnalysis(
      preprocessed,
      targetVariable,
      businessContext,
      businessQuestion
    );
  }, [preprocessed, targetVariable, businessContext, businessQuestion]);

  const effectiveTarget = useMemo(() => {
    if (!preprocessed || !eda) return '';
    if (targetVariable && preprocessed.numericColumns.includes(targetVariable)) {
      return targetVariable;
    }
    return eda.recommendation.suggestedTarget;
  }, [preprocessed, eda, targetVariable]);

  const effectiveFeatures = useMemo(() => {
    if (!preprocessed || !eda) return [];
    const valid = selectedFeatures.filter(
      (f) =>
        f !== effectiveTarget &&
        (preprocessed.numericColumns.includes(f) || preprocessed.categoricalColumns.includes(f))
    );
    if (valid.length > 0) return valid;
    return eda.recommendation.suggestedFeatures.filter((f) => f !== effectiveTarget);
  }, [preprocessed, eda, selectedFeatures, effectiveTarget]);

  // Derived Pipeline Stage 4: Multiple Linear Regression Suite
  const modelingSuite = useMemo(() => {
    if (!preprocessed || !effectiveTarget || effectiveFeatures.length === 0) return null;
    return trainAndSelectModels(preprocessed, effectiveTarget, effectiveFeatures);
  }, [preprocessed, effectiveTarget, effectiveFeatures]);

  const activeModelId = useMemo<'full' | 'stepwise' | 'parsimonious'>(() => {
    if (!modelingSuite || modelingSuite.models.length === 0) return 'full';
    if (selectedModelId && modelingSuite.models.some((m) => m.id === selectedModelId)) {
      return selectedModelId;
    }
    return modelingSuite.recommendedModelId;
  }, [modelingSuite, selectedModelId]);

  const activeModel = useMemo(() => {
    if (!modelingSuite) return null;
    return modelingSuite.models.find((m) => m.id === activeModelId) ?? modelingSuite.models[0] ?? null;
  }, [modelingSuite, activeModelId]);

  // Derived Pipeline Stage 5: Realistic Simulation & Strategic Recommendations
  const simulationSuite = useMemo(() => {
    if (!activeModel || !preprocessed) return null;
    return buildSimulationSuite(
      activeModel,
      preprocessed,
      businessContext,
      businessQuestion
    );
  }, [activeModel, preprocessed, businessContext, businessQuestion]);

  const effectiveCustomInputs = useMemo<ScenarioInputValues>(() => {
    const basePreset = simulationSuite?.presetScenarios[1]?.inputs ?? {
      numeric: {},
      categorical: {},
    };
    if (!customScenarioOverrides) return basePreset;
    return {
      numeric: { ...basePreset.numeric, ...customScenarioOverrides.numeric },
      categorical: { ...basePreset.categorical, ...customScenarioOverrides.categorical },
    };
  }, [simulationSuite, customScenarioOverrides]);

  const customEvaluation = useMemo(() => {
    if (!activeModel || !preprocessed) return null;
    return evaluateScenario(
      'Escenario Personalizado',
      'Perfil configurado interactivamente por el usuario',
      effectiveCustomInputs,
      activeModel,
      preprocessed
    );
  }, [activeModel, preprocessed, effectiveCustomInputs]);

  // Handlers
  const initializePipelineForDataset = (
    dataset: RawDataset,
    contextText: string,
    questionText: string
  ) => {
    setRawDataset(dataset);
    setImputationOverrides({});
    setSelectedModelId(null);
    setCustomScenarioOverrides(null);

    const prep = preprocessDataset(dataset, {});
    const edaInit = runEdaAnalysis(prep, '', contextText, questionText);
    setTargetVariable(edaInit.recommendation.suggestedTarget);
    setSelectedFeatures(edaInit.recommendation.suggestedFeatures);
  };

  const handleLoadSampleData = () => {
    setUploadError(null);
    const sample = buildSampleDataset();
    const nextContext = businessContext.trim() ? businessContext : DEFAULT_BUSINESS_CONTEXT;
    const nextQuestion = businessQuestion.trim() ? businessQuestion : DEFAULT_BUSINESS_QUESTION;
    setBusinessContext(nextContext);
    setBusinessQuestion(nextQuestion);
    initializePipelineForDataset(sample, nextContext, nextQuestion);
  };

  const handleFileSelected = async (file: File) => {
    setUploadError(null);
    setIsParsing(true);
    try {
      const parsed = await parseUploadedFile(file);
      const prepCheck = preprocessDataset(parsed, {});
      if (prepCheck.numericColumns.length < 2 && prepCheck.categoricalColumns.length === 0) {
        throw new Error(
          'El archivo debe contener al menos una variable numérica objetivo (Y) y una variable independiente (X) válida.'
        );
      }
      initializePipelineForDataset(parsed, businessContext, businessQuestion);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error inesperado al procesar el archivo.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleImputationOverrideChange = (
    col: string,
    method: NumericImputationMethod
  ) => {
    setImputationOverrides((prev) => ({ ...prev, [col]: method }));
    setCustomScenarioOverrides(null);
  };

  const handleTargetChange = (col: string) => {
    setTargetVariable(col);
    setSelectedFeatures((prev) => prev.filter((f) => f !== col));
    setSelectedModelId(null);
    setCustomScenarioOverrides(null);
  };

  const handleToggleFeature = (col: string) => {
    setSelectedFeatures((prev) => {
      const base = prev.length > 0 ? prev : effectiveFeatures;
      if (base.includes(col)) {
        return base.filter((item) => item !== col);
      }
      return [...base, col];
    });
    setSelectedModelId(null);
    setCustomScenarioOverrides(null);
  };

  const handleApplyRecommendation = () => {
    if (!eda) return;
    setTargetVariable(eda.recommendation.suggestedTarget);
    setSelectedFeatures(eda.recommendation.suggestedFeatures);
    setSelectedModelId(null);
    setCustomScenarioOverrides(null);
  };

  const handleExportPdf = () => {
    if (!rawDataset || !preprocessed || !eda || !activeModel || !simulationSuite) return;
    exportExecutivePdfReport({
      businessContext,
      businessQuestion,
      rawDataset,
      preprocessed,
      eda,
      model: activeModel,
      simulation: simulationSuite,
      customScenario: customEvaluation,
    });
  };

  const handleExportHtml = () => {
    if (!rawDataset || !preprocessed || !eda || !activeModel || !simulationSuite) return;
    exportExecutiveHtmlReport({
      businessContext,
      businessQuestion,
      rawDataset,
      preprocessed,
      eda,
      model: activeModel,
      simulation: simulationSuite,
      customScenario: customEvaluation,
    });
  };

  const canNavigateTo = (step: ModuleStep): boolean => {
    if (step === 1) return true;
    if (!rawDataset || !preprocessed) return false;
    if (step === 2 || step === 3) return true;
    if (step === 4) return Boolean(eda && effectiveTarget && effectiveFeatures.length > 0);
    if (step === 5) return Boolean(activeModel && simulationSuite);
    return false;
  };

  const handleStepSelect = (step: ModuleStep) => {
    if (!canNavigateTo(step)) return;
    setActiveStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => handleStepSelect(1)}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ValoraMetric
        </button>

        {/* Zone 2: 5 clean single-line navigation links */}
        <nav
          aria-label="Módulos analíticos"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {STEPS.map((step) => {
            const enabled = canNavigateTo(step.id);
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                disabled={!enabled}
                onClick={() => handleStepSelect(step.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-blue-700 text-slate-900 font-semibold'
                    : enabled
                    ? 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300 cursor-pointer'
                    : 'border-transparent text-slate-300 cursor-not-allowed'
                }`}
              >
                {step.navLabel}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {activeModel && simulationSuite ? (
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Exportar PDF
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLoadSampleData}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Usar datos de ejemplo
            </button>
          )}
        </div>
      </header>

      {/* Mobile compact step bar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {STEPS.map((step) => {
            const enabled = canNavigateTo(step.id);
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                disabled={!enabled}
                onClick={() => handleStepSelect(step.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : enabled
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-slate-50 text-slate-300'
                }`}
              >
                {step.navLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Canvas: Left Sidebar (256px) + Main Content Viewport */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Left Sequential Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white px-5 py-6">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-slate-500">Flujo econométrico</p>
              <ol className="mt-3 space-y-1">
                {STEPS.map((step) => {
                  const enabled = canNavigateTo(step.id);
                  const isActive = activeStep === step.id;
                  const isDone = enabled && activeStep > step.id;

                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => handleStepSelect(step.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-3 ${
                          isActive
                            ? 'bg-blue-50 text-blue-900'
                            : enabled
                            ? 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        <span
                          className={`font-mono text-xs font-semibold mt-0.5 tabular-nums ${
                            isActive
                              ? 'text-blue-700'
                              : isDone
                              ? 'text-emerald-700'
                              : enabled
                              ? 'text-slate-400'
                              : 'text-slate-300'
                          }`}
                        >
                          0{step.id}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`text-sm leading-tight truncate ${
                              isActive ? 'font-semibold text-slate-900' : 'font-medium'
                            }`}
                          >
                            {step.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {step.subtitle}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Active Session Summary (clean unboxed tabular text) */}
            {rawDataset && preprocessed && (
              <div className="pt-5 border-t border-slate-200 space-y-3">
                <p className="text-xs font-semibold text-slate-500">Resumen del análisis</p>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Registros</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {preprocessed.cleanedRows.length}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Objetivo (Y)</dt>
                    <dd className="font-mono font-medium text-slate-900 truncate max-w-[120px]" title={effectiveTarget}>
                      {effectiveTarget || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Predictores (X)</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {effectiveFeatures.length}
                    </dd>
                  </div>
                  {activeModel && (
                    <>
                      <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
                        <dt className="text-slate-500">R² ajustado</dt>
                        <dd className="font-mono tabular-nums font-semibold text-blue-700">
                          {formatNumber(activeModel.adjRSquared * 100, 1)}%
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">RMSE</dt>
                        <dd className="font-mono tabular-nums font-medium text-slate-900">
                          {formatCurrencyLike(activeModel.rmse, activeModel.targetVariable)}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 text-[11px] text-slate-400">
            ValoraMetric · Regresión Lineal Múltiple
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-8">
          <div className="max-w-5xl mx-auto">
            {activeStep === 1 && (
              <Module1DataContext
                businessContext={businessContext}
                businessQuestion={businessQuestion}
                onBusinessContextChange={setBusinessContext}
                onBusinessQuestionChange={setBusinessQuestion}
                rawDataset={rawDataset}
                uploadError={uploadError}
                isParsing={isParsing}
                onFileSelected={handleFileSelected}
                onLoadSampleData={handleLoadSampleData}
                onContinue={() => handleStepSelect(2)}
              />
            )}

            {activeStep === 2 && rawDataset && preprocessed && (
              <Module2Preprocessing
                rawDataset={rawDataset}
                preprocessed={preprocessed}
                onImputationOverrideChange={handleImputationOverrideChange}
                onBack={() => handleStepSelect(1)}
                onContinue={() => handleStepSelect(3)}
              />
            )}

            {activeStep === 3 && preprocessed && eda && (
              <Module3EdaSelection
                preprocessed={preprocessed}
                eda={eda}
                targetVariable={effectiveTarget}
                selectedFeatures={effectiveFeatures}
                onTargetChange={handleTargetChange}
                onToggleFeature={handleToggleFeature}
                onApplyRecommendation={handleApplyRecommendation}
                onBack={() => handleStepSelect(2)}
                onContinue={() => handleStepSelect(4)}
              />
            )}

            {activeStep === 4 && modelingSuite && (
              <Module4RegressionModel
                modelingSuite={modelingSuite}
                activeModelId={activeModelId}
                onSelectModel={(id) => {
                  setSelectedModelId(id);
                  setCustomScenarioOverrides(null);
                }}
                onBack={() => handleStepSelect(3)}
                onContinue={() => handleStepSelect(5)}
              />
            )}

            {activeStep === 5 &&
              preprocessed &&
              eda &&
              activeModel &&
              simulationSuite &&
              customEvaluation && (
                <Module5SimulationExport
                  businessQuestion={businessQuestion}
                  preprocessed={preprocessed}
                  eda={eda}
                  model={activeModel}
                  simulation={simulationSuite}
                  customInputs={effectiveCustomInputs}
                  customEvaluation={customEvaluation}
                  onUpdateNumericInput={(col, val) =>
                    setCustomScenarioOverrides((prev) => ({
                      numeric: { ...(prev?.numeric ?? {}), [col]: val },
                      categorical: { ...(prev?.categorical ?? {}) },
                    }))
                  }
                  onUpdateCategoricalInput={(col, val) =>
                    setCustomScenarioOverrides((prev) => ({
                      numeric: { ...(prev?.numeric ?? {}) },
                      categorical: { ...(prev?.categorical ?? {}), [col]: val },
                    }))
                  }
                  onLoadPreset={(inputs) =>
                    setCustomScenarioOverrides({
                      numeric: { ...inputs.numeric },
                      categorical: { ...inputs.categorical },
                    })
                  }
                  onExportPdf={handleExportPdf}
                  onExportHtml={handleExportHtml}
                  onBack={() => handleStepSelect(4)}
                />
              )}
          </div>
        </main>
      </div>
    </div>
  );
}
