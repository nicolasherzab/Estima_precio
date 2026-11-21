import {
  ColumnProfile,
  DummyMapping,
  ImputationStrategy,
  NumericImputationMethod,
  PreprocessedDataset,
  RawDataset,
  VariableRoleType,
} from '../types/analytics';
import { mean, median, sampleSkewness } from './mathStats';

const EXCESSIVE_NULL_THRESHOLD = 0.5; // Drop columns with >50% missing values
const MAX_DUMMY_LEVELS = 8; // Group rare levels beyond top 8 to prevent high-dimensional overfitting

function looksLikeIdentifierColumn(name: string, uniqueRatio: number, isString: boolean): boolean {
  const lower = name.toLowerCase();
  const idPatterns = ['^id$', '^id_', '_id$', '^codigo', '^folio', '^sku', '^rut', '^dni', '^index', '^registro'];
  const nameMatchesId = idPatterns.some((pat) => new RegExp(pat).test(lower));
  if (nameMatchesId && uniqueRatio > 0.85) return true;
  if (isString && uniqueRatio > 0.92) return true;
  return false;
}

export function preprocessDataset(
  raw: RawDataset,
  imputationOverrides: Record<string, NumericImputationMethod> = {}
): PreprocessedDataset {
  const nRows = raw.rows.length;
  const profiles: ColumnProfile[] = [];
  const numericColumns: string[] = [];
  const categoricalColumns: string[] = [];
  const excludedColumns: string[] = [];

  let totalMissingImputed = 0;

  // Step 1: Analyze each column for missingness, type, and imputation value
  for (const col of raw.headers) {
    const nonNullValues: (string | number)[] = [];
    let missingCount = 0;

    for (const row of raw.rows) {
      const val = row[col];
      if (val === null || val === undefined || val === '') {
        missingCount++;
      } else {
        nonNullValues.push(val);
      }
    }

    const missingPercent = nRows > 0 ? (missingCount / nRows) * 100 : 0;
    const uniqueValues = new Set(nonNullValues.map((v) => String(v)));
    const uniqueCount = uniqueValues.size;
    const uniqueRatio = nonNullValues.length > 0 ? uniqueCount / nonNullValues.length : 0;

    // Check excessive nulls or zero variance
    if (missingCount / Math.max(1, nRows) > EXCESSIVE_NULL_THRESHOLD) {
      excludedColumns.push(col);
      profiles.push({
        name: col,
        detectedType: 'excluded',
        missingCount,
        missingPercent,
        uniqueCount,
        imputationStrategy: 'dropped',
        imputedValue: null,
        excludedReason: `Exceso de valores nulos (${missingPercent.toFixed(1)}% > 50%)`,
      });
      continue;
    }

    if (uniqueCount <= 1) {
      excludedColumns.push(col);
      profiles.push({
        name: col,
        detectedType: 'excluded',
        missingCount,
        missingPercent,
        uniqueCount,
        imputationStrategy: 'dropped',
        imputedValue: null,
        excludedReason: 'Varianza nula (un único valor en toda la columna)',
      });
      continue;
    }

    // Determine numeric vs categorical
    const numericParsed = nonNullValues
      .map((v) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.'))))
      .filter((v) => Number.isFinite(v));
    const numericRatio = nonNullValues.length > 0 ? numericParsed.length / nonNullValues.length : 0;
    const isNumeric = numericRatio >= 0.9;

    // Detect ID-like columns
    if (looksLikeIdentifierColumn(col, uniqueRatio, !isNumeric)) {
      excludedColumns.push(col);
      profiles.push({
        name: col,
        detectedType: 'excluded',
        missingCount,
        missingPercent,
        uniqueCount,
        imputationStrategy: 'none',
        imputedValue: null,
        excludedReason: 'Columna identificadora o texto único sin poder predictivo',
      });
      continue;
    }

    if (isNumeric) {
      numericColumns.push(col);
      const skew = sampleSkewness(numericParsed);
      const autoMethod: NumericImputationMethod = Math.abs(skew) > 0.85 ? 'median' : 'mean';
      const chosenMethod: NumericImputationMethod = imputationOverrides[col] ?? autoMethod;
      const imputedVal =
        chosenMethod === 'median'
          ? Number(median(numericParsed).toFixed(4))
          : Number(mean(numericParsed).toFixed(4));

      const strategy: ImputationStrategy = missingCount > 0 ? chosenMethod : 'none';
      if (missingCount > 0) totalMissingImputed += missingCount;

      profiles.push({
        name: col,
        detectedType: 'numeric',
        missingCount,
        missingPercent,
        uniqueCount,
        imputationStrategy: strategy,
        imputedValue: imputedVal,
        skewness: skew,
      });
    } else {
      categoricalColumns.push(col);
      const freq = new Map<string, number>();
      for (const v of nonNullValues) {
        const s = String(v).trim();
        freq.set(s, (freq.get(s) ?? 0) + 1);
      }
      const sortedCats = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      const modeVal = sortedCats[0]?.[0] ?? 'Desconocido';

      // Cap high cardinality by grouping rare levels into "Otros"
      let finalCategories = sortedCats.map(([c]) => c);
      if (finalCategories.length > MAX_DUMMY_LEVELS) {
        finalCategories = [...finalCategories.slice(0, MAX_DUMMY_LEVELS - 1), 'Otros'];
      }

      const referenceCategory = finalCategories[0];
      const dummyColumns = finalCategories
        .slice(1)
        .map((cat) => `${col}_${cat.replace(/\s+/g, '_')}`);

      const strategy: ImputationStrategy = missingCount > 0 ? 'mode' : 'none';
      if (missingCount > 0) totalMissingImputed += missingCount;

      profiles.push({
        name: col,
        detectedType: 'categorical',
        missingCount,
        missingPercent,
        uniqueCount,
        imputationStrategy: strategy,
        imputedValue: modeVal,
        categories: finalCategories,
        referenceCategory,
        dummyColumns,
      });
    }
  }

  // Step 2: Build cleaned rows (imputed values applied) and encoded rows (numeric + k-1 dummies)
  const profileMap = new Map<string, ColumnProfile>(profiles.map((p) => [p.name, p]));
  const dummyMappings: DummyMapping[] = [];

  for (const catCol of categoricalColumns) {
    const prof = profileMap.get(catCol)!;
    const cats = prof.categories ?? [];
    const ref = prof.referenceCategory ?? cats[0] ?? '';
    for (let i = 1; i < cats.length; i++) {
      const catVal = cats[i];
      dummyMappings.push({
        dummyName: `${catCol}_${catVal.replace(/\s+/g, '_')}`,
        sourceColumn: catCol,
        categoryValue: catVal,
        referenceCategory: ref,
      });
    }
  }

  const cleanedRows: Record<string, string | number>[] = [];
  const encodedRows: Record<string, number>[] = [];

  for (const row of raw.rows) {
    const cleanRow: Record<string, string | number> = {};
    const encRow: Record<string, number> = {};

    for (const col of numericColumns) {
      const prof = profileMap.get(col)!;
      const rawVal = row[col];
      let numVal: number;
      if (rawVal === null || rawVal === undefined || rawVal === '') {
        numVal = Number(prof.imputedValue ?? 0);
      } else {
        const parsed = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).replace(',', '.'));
        numVal = Number.isFinite(parsed) ? parsed : Number(prof.imputedValue ?? 0);
      }
      cleanRow[col] = numVal;
      encRow[col] = numVal;
    }

    for (const col of categoricalColumns) {
      const prof = profileMap.get(col)!;
      const cats = prof.categories ?? [];
      const rawVal = row[col];
      let strVal =
        rawVal === null || rawVal === undefined || rawVal === ''
          ? String(prof.imputedValue ?? cats[0] ?? '')
          : String(rawVal).trim();

      if (cats.includes('Otros') && !cats.includes(strVal)) {
        strVal = 'Otros';
      }
      cleanRow[col] = strVal;

      // k-1 One-Hot Encoding (omitting referenceCategory)
      for (let i = 1; i < cats.length; i++) {
        const catVal = cats[i];
        const dummyName = `${col}_${catVal.replace(/\s+/g, '_')}`;
        encRow[dummyName] = strVal === catVal ? 1 : 0;
      }
    }

    cleanedRows.push(cleanRow);
    encodedRows.push(encRow);
  }

  const allModelFeatures = [...numericColumns, ...dummyMappings.map((d) => d.dummyName)];

  return {
    profiles,
    cleanedRows,
    encodedRows,
    numericColumns,
    categoricalColumns,
    excludedColumns,
    dummyMappings,
    allModelFeatures,
    totalMissingImputed,
    imputationOverrides,
  };
}

export function getVariableTypeLabel(type: VariableRoleType): string {
  if (type === 'numeric') return 'Numérica';
  if (type === 'categorical') return 'Categórica (Dummy)';
  return 'Excluida';
}
