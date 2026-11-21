export type CellValue = string | number | null;

export interface RawDataset {
  fileName: string;
  fileFormat: string;
  headers: string[];
  rows: Record<string, CellValue>[];
  detectedDelimiter?: string;
  warnings: string[];
}

export type VariableRoleType = 'numeric' | 'categorical' | 'excluded';
export type NumericImputationMethod = 'mean' | 'median';
export type ImputationStrategy = 'mean' | 'median' | 'mode' | 'none' | 'dropped';

export interface ColumnProfile {
  name: string;
  detectedType: VariableRoleType;
  missingCount: number;
  missingPercent: number;
  uniqueCount: number;
  imputationStrategy: ImputationStrategy;
  imputedValue: string | number | null;
  skewness?: number;
  excludedReason?: string;
  categories?: string[];
  referenceCategory?: string;
  dummyColumns?: string[];
}

export interface DummyMapping {
  dummyName: string;
  sourceColumn: string;
  categoryValue: string;
  referenceCategory: string;
}

export interface PreprocessedDataset {
  profiles: ColumnProfile[];
  cleanedRows: Record<string, string | number>[];
  encodedRows: Record<string, number>[];
  numericColumns: string[];
  categoricalColumns: string[];
  excludedColumns: string[];
  dummyMappings: DummyMapping[];
  allModelFeatures: string[];
  totalMissingImputed: number;
  imputationOverrides: Record<string, NumericImputationMethod>;
}

export interface NumericSummary {
  column: string;
  count: number;
  min: number;
  q1: number;
  median: number;
  mean: number;
  q3: number;
  max: number;
  stdDev: number;
  skewness: number;
  outlierCount: number;
  isInteger: boolean;
  histogram: { label: string; min: number; max: number; count: number }[];
}

export interface CategoryBreakdown {
  column: string;
  groups: {
    category: string;
    count: number;
    share: number;
    meanTarget: number;
    medianTarget: number;
  }[];
}

export interface CorrelationPair {
  varA: string;
  varB: string;
  r: number;
}

export interface BusinessRuleInsight {
  title: string;
  detail: string;
  metric: string;
}

export interface VariableRecommendation {
  suggestedTarget: string;
  targetJustification: string;
  suggestedFeatures: string[];
  featureJustifications: Record<string, { recommended: boolean; reason: string; corrWithY: number }>;
  contextKeywordsMatched: string[];
}

export interface EdaResult {
  numericSummaries: NumericSummary[];
  categoricalBreakdowns: CategoryBreakdown[];
  correlationColumns: string[];
  correlationMatrix: number[][];
  highCollinearityPairs: CorrelationPair[];
  businessRules: BusinessRuleInsight[];
  recommendation: VariableRecommendation;
}

export interface CoefficientResult {
  name: string;
  sourceColumn: string;
  isIntercept: boolean;
  isDummy: boolean;
  dummyCategory?: string;
  referenceCategory?: string;
  estimate: number;
  stdError: number;
  tStat: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  vif: number | null;
  stdBeta: number | null;
  significant: boolean;
  businessExplanation: string;
}

export interface ResidualPoint {
  index: number;
  actual: number;
  predicted: number;
  residual: number;
}

export interface RegressionModelResult {
  id: 'full' | 'stepwise' | 'parsimonious';
  label: string;
  description: string;
  targetVariable: string;
  features: string[];
  droppedForCollinearity: string[];
  n: number;
  k: number;
  dfModel: number;
  dfResidual: number;
  rSquared: number;
  adjRSquared: number;
  rmse: number;
  mae: number;
  mape: number;
  residualStdError: number;
  fStat: number;
  fPValue: number;
  aic: number;
  aicc: number;
  bic: number;
  durbinWatson: number;
  coefficients: CoefficientResult[];
  equationText: string;
  residuals: ResidualPoint[];
  xtxInverse: number[][];
  meanY: number;
  stdY: number;
}

export interface ModelingSuiteResult {
  models: RegressionModelResult[];
  recommendedModelId: 'full' | 'stepwise' | 'parsimonious';
  selectionRationale: string;
  warnings: string[];
}

export type SimulationMethodType =
  | 'auxiliary_regression'
  | 'lognormal'
  | 'truncated_normal'
  | 'empirical_discrete'
  | 'multinomial';

export interface VariableSimulationPlan {
  variable: string;
  kind: 'numeric' | 'categorical';
  method: SimulationMethodType;
  methodLabel: string;
  rationale: string;
  driverVariable?: string;
  auxSlope?: number;
  auxIntercept?: number;
  auxR2?: number;
  auxResidualStd?: number;
  paramsSummary: string;
}

export interface ScenarioInputValues {
  numeric: Record<string, number>;
  categorical: Record<string, string>;
}

export interface FeatureContribution {
  label: string;
  contribution: number;
  detail: string;
}

export interface ScenarioEvaluation {
  name: string;
  subtitle: string;
  inputs: ScenarioInputValues;
  predictedPrice: number;
  ciLower: number;
  ciUpper: number;
  piLower: number;
  piUpper: number;
  deltaVsMeanPct: number;
  contributions: FeatureContribution[];
}

export interface MonteCarloSummary {
  nSimulations: number;
  mean: number;
  stdDev: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
  histogram: { label: string; min: number; max: number; count: number }[];
  sampleRows: {
    id: number;
    predictedPrice: number;
    inputs: Record<string, string | number>;
  }[];
}

export interface StrategicRecommendation {
  priority: 'Alta' | 'Media' | 'Clave';
  title: string;
  impactHeadline: string;
  rationale: string;
  actionStep: string;
}

export interface SimulationSuiteResult {
  variablePlans: VariableSimulationPlan[];
  monteCarlo: MonteCarloSummary;
  presetScenarios: ScenarioEvaluation[];
  recommendations: StrategicRecommendation[];
  executiveAnswer: string;
}
