import * as XLSX from 'xlsx';
import { CellValue, RawDataset } from '../types/analytics';

const MISSING_TOKENS = new Set([
  '',
  'na',
  'n/a',
  'null',
  'none',
  'nan',
  'nd',
  'n/d',
  '-',
  '--',
  '?',
  'sin dato',
  'desconocido',
]);

function normalizeCellValue(raw: unknown, allowCommaDecimal: boolean): CellValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'boolean') {
    return raw ? 'Sí' : 'No';
  }
  const str = String(raw).trim();
  if (MISSING_TOKENS.has(str.toLowerCase())) {
    return null;
  }

  // Try parsing clean numeric strings including currency symbols or formatted thousands
  const stripped = str.replace(/^[$€£¥]\s*/, '').replace(/\s*%$/, '').trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(stripped)) {
    const n = Number(stripped);
    if (Number.isFinite(n)) return n;
  }

  // Handle US thousands format like 1,250,000 or 1,250.50
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(stripped)) {
    const n = Number(stripped.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }

  // Handle European/Spanish decimal format (e.g., 12,5 or 1.250,50) when delimiter is not comma
  if (allowCommaDecimal) {
    if (/^[+-]?\d+,\d+$/.test(stripped)) {
      const n = Number(stripped.replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(stripped)) {
      const n = Number(stripped.replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }

  return str;
}

function detectDelimiter(sampleLines: string[]): string {
  const candidates = [',', ';', '\t', '|'];
  let bestDelim = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = sampleLines.map((line) => {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === delim && !inQuotes) {
          count++;
        }
      }
      return count;
    });

    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function deduplicateHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((h, idx) => {
    const cleaned = (h || `Columna_${idx + 1}`).replace(/^\uFEFF/, '').trim() || `Columna_${idx + 1}`;
    const count = seen.get(cleaned) ?? 0;
    seen.set(cleaned, count + 1);
    return count === 0 ? cleaned : `${cleaned}_${count + 1}`;
  });
}

export async function parseUploadedFile(file: File): Promise<RawDataset> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const warnings: string[] = [];

  if (!['csv', 'txt', 'xls', 'xlsx'].includes(ext)) {
    throw new Error(
      `Formato ".${ext}" no soportado. Carga un archivo en formato .csv, .txt, .xls o .xlsx.`
    );
  }

  if (ext === 'xls' || ext === 'xlsx') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('El libro de Excel no contiene hojas válidas.');
    }
    if (workbook.SheetNames.length > 1) {
      warnings.push(
        `El archivo contiene ${workbook.SheetNames.length} hojas. Se cargó automáticamente la primera hoja ("${firstSheetName}").`
      );
    }

    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const nonEmptyRows = matrix.filter(
      (row) => Array.isArray(row) && row.some((cell) => cell !== null && String(cell).trim() !== '')
    );

    if (nonEmptyRows.length < 6) {
      throw new Error(
        'El archivo contiene muy pocos registros (mínimo 5 filas de datos además del encabezado).'
      );
    }

    const rawHeaders = nonEmptyRows[0].map((c, i) => (c !== null ? String(c) : `Columna_${i + 1}`));
    const headers = deduplicateHeaders(rawHeaders);

    const rows: Record<string, CellValue>[] = [];
    for (let r = 1; r < nonEmptyRows.length; r++) {
      const line = nonEmptyRows[r];
      const obj: Record<string, CellValue> = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = normalizeCellValue(line[c], true);
      }
      rows.push(obj);
    }

    return {
      fileName,
      fileFormat: ext.toUpperCase(),
      headers,
      rows,
      warnings,
    };
  }

  // CSV or TXT parsing with robust delimiter detection
  const rawText = await file.text();
  const text = rawText.replace(/^\uFEFF/, '');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 6) {
    throw new Error(
      'El archivo de texto contiene muy pocos registros (se requieren encabezados y al menos 5 filas).'
    );
  }

  const delimiter = detectDelimiter(lines.slice(0, Math.min(15, lines.length)));
  const allowCommaDecimal = delimiter !== ',';
  const rawHeaders = parseDelimitedLine(lines[0], delimiter);

  if (rawHeaders.length < 2) {
    throw new Error(
      'No se pudieron detectar múltiples columnas. Verifica que el archivo utilice un separador consistente (coma, punto y coma, tabulación o barra vertical).'
    );
  }

  const headers = deduplicateHeaders(rawHeaders);
  const rows: Record<string, CellValue>[] = [];
  let raggedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseDelimitedLine(lines[i], delimiter);
    if (fields.length !== headers.length) {
      raggedRows++;
    }
    const obj: Record<string, CellValue> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = normalizeCellValue(fields[c] ?? null, allowCommaDecimal);
    }
    rows.push(obj);
  }

  if (raggedRows > 0) {
    warnings.push(
      `Se ajustaron ${raggedRows} filas con número irregular de columnas completando con valores nulos donde correspondía.`
    );
  }

  const delimiterName =
    delimiter === ','
      ? 'coma (,)'
      : delimiter === ';'
      ? 'punto y coma (;)'
      : delimiter === '\t'
      ? 'tabulación (TAB)'
      : 'barra vertical (|)';

  return {
    fileName,
    fileFormat: `${ext.toUpperCase()} · Separador ${delimiterName}`,
    headers,
    rows,
    detectedDelimiter: delimiter,
    warnings,
  };
}
