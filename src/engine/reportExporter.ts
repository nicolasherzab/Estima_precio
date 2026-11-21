import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  EdaResult,
  PreprocessedDataset,
  RawDataset,
  RegressionModelResult,
  ScenarioEvaluation,
  SimulationSuiteResult,
} from '../types/analytics';
import { formatCurrencyLike, formatNumber, formatPValue } from './mathStats';

export interface ExecutiveReportPayload {
  businessContext: string;
  businessQuestion: string;
  rawDataset: RawDataset;
  preprocessed: PreprocessedDataset;
  eda: EdaResult;
  model: RegressionModelResult;
  simulation: SimulationSuiteResult;
  customScenario: ScenarioEvaluation | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildActualVsPredictedSvg(model: RegressionModelResult): string {
  const width = 520;
  const height = 240;
  const pad = { top: 20, right: 20, bottom: 38, left: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const vals = model.residuals.flatMap((p) => [p.actual, p.predicted]);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(1e-6, maxV - minV);

  const scaleX = (v: number) => pad.left + ((v - minV) / span) * plotW;
  const scaleY = (v: number) => pad.top + plotH - ((v - minV) / span) * plotH;

  const dots = model.residuals
    .slice(0, 250)
    .map(
      (p) =>
        `<circle cx="${scaleX(p.actual).toFixed(1)}" cy="${scaleY(p.predicted).toFixed(1)}" r="3.2" fill="#1d4ed8" fill-opacity="0.62" />`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;max-width:520px;height:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="#94a3b8" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#94a3b8" stroke-width="1"/>
    <line x1="${scaleX(minV).toFixed(1)}" y1="${scaleY(minV).toFixed(1)}" x2="${scaleX(maxV).toFixed(1)}" y2="${scaleY(maxV).toFixed(1)}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="5 4"/>
    ${dots}
    <text x="${pad.left + plotW / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#475569" font-family="sans-serif">Real (${escapeHtml(model.targetVariable)})</text>
    <text x="14" y="${pad.top + plotH / 2}" text-anchor="middle" font-size="11" fill="#475569" font-family="sans-serif" transform="rotate(-90 14 ${pad.top + plotH / 2})">Predicho</text>
  </svg>`;
}

function buildMonteCarloHistogramSvg(simulation: SimulationSuiteResult, target: string): string {
  const width = 520;
  const height = 240;
  const pad = { top: 20, right: 20, bottom: 44, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const bins = simulation.monteCarlo.histogram;
  const maxC = Math.max(1, ...bins.map((b) => b.count));
  const barW = plotW / Math.max(1, bins.length);

  const bars = bins
    .map((b, i) => {
      const h = (b.count / maxC) * plotH;
      const x = pad.left + i * barW + 2;
      const y = pad.top + plotH - h;
      const label = i % 2 === 0 ? `<text x="${(x + barW / 2 - 2).toFixed(1)}" y="${height - 14}" text-anchor="middle" font-size="9" fill="#64748b" font-family="monospace">${escapeHtml(b.label.split('–')[0])}</text>` : '';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(4, barW - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#1e40af" fill-opacity="0.82"/>${label}`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;max-width:520px;height:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="#94a3b8" stroke-width="1"/>
    ${bars}
    <text x="${pad.left + plotW / 2}" y="${height - 2}" text-anchor="middle" font-size="10" fill="#475569" font-family="sans-serif">Distribución simulada de ${escapeHtml(target)} (N=${simulation.monteCarlo.nSimulations})</text>
  </svg>`;
}

export function exportExecutiveHtmlReport(payload: ExecutiveReportPayload): void {
  const {
    businessContext,
    businessQuestion,
    rawDataset,
    preprocessed,
    eda,
    model,
    simulation,
    customScenario,
  } = payload;
  const target = model.targetVariable;
  const generatedDate = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const scenariosList = customScenario
    ? [...simulation.presetScenarios, customScenario]
    : simulation.presetScenarios;

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reporte Ejecutivo de Estimación de Precios — ValoraMetric</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 36px 24px; background: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.55; }
    .container { max-width: 1020px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 40px 44px; }
    header { border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
    .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: #1d4ed8; text-transform: uppercase; }
    h1 { margin: 6px 0 4px; font-size: 26px; font-weight: 700; color: #0f172a; }
    .meta { font-size: 12.5px; color: #64748b; }
    h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
    h3 { font-size: 14.5px; font-weight: 600; color: #1e293b; margin: 18px 0 8px; }
    p { margin: 0 0 12px; font-size: 14px; color: #334155; }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 16px 0 22px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
    .kpi-label { font-size: 12px; color: #64748b; }
    .kpi-value { font-size: 20px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, monospace; color: #0f172a; margin-top: 4px; }
    .equation { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px 18px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; color: #0f172a; overflow-x: auto; margin: 12px 0 20px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 12.5px; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #334155; }
    td.num, th.num { text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }
    .charts-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; margin: 16px 0 22px; }
    .rec-item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin-bottom: 12px; background: #ffffff; }
    .rec-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }
    .rec-title { font-weight: 700; font-size: 14.5px; color: #0f172a; }
    .rec-impact { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; font-weight: 600; color: #1d4ed8; }
    .answer-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 18px 20px; margin: 14px 0 22px; color: #1e3a8a; font-size: 14px; }
    footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; }
    @media print { body { background: #fff; padding: 0; } .container { border: none; padding: 16px; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="brand">ValoraMetric · Reporte Ejecutivo Econométrico</div>
        <h1>Estimación de Precios mediante Regresión Lineal Múltiple</h1>
        <div class="meta">Dataset: ${escapeHtml(rawDataset.fileName)} · ${preprocessed.cleanedRows.length} registros · Variable objetivo: ${escapeHtml(target)}</div>
      </div>
      <div class="meta">Generado el ${escapeHtml(generatedDate)}</div>
    </header>

    <h2>1. Contexto y Respuesta Ejecutiva</h2>
    <p><strong>Contexto de negocio:</strong> ${escapeHtml(businessContext || 'No especificado')}</p>
    <p><strong>Pregunta principal de negocio:</strong> ${escapeHtml(businessQuestion || 'No especificada')}</p>
    <div class="answer-box">
      <strong>Conclusión ejecutiva:</strong> ${escapeHtml(simulation.executiveAnswer)}
    </div>

    <h2>2. Resumen del Análisis Exploratorio (AED) y Limpieza</h2>
    <p>Se procesaron ${rawDataset.rows.length} observaciones originales, imputando automáticamente ${preprocessed.totalMissingImputed} celdas faltantes y codificando ${preprocessed.categoricalColumns.length} variables categóricas en ${preprocessed.dummyMappings.length} variables Dummy (esquema k−1 con categoría de referencia).</p>
    <table>
      <thead>
        <tr>
          <th>Variable numérica</th>
          <th class="num">Mínimo</th>
          <th class="num">Mediana</th>
          <th class="num">Media</th>
          <th class="num">Máximo</th>
          <th class="num">Desv. Est.</th>
          <th class="num">Atípicos (IQR)</th>
        </tr>
      </thead>
      <tbody>
        ${eda.numericSummaries
          .map(
            (s) => `<tr>
          <td>${escapeHtml(s.column)}</td>
          <td class="num">${formatNumber(s.min, 2)}</td>
          <td class="num">${formatNumber(s.median, 2)}</td>
          <td class="num">${formatNumber(s.mean, 2)}</td>
          <td class="num">${formatNumber(s.max, 2)}</td>
          <td class="num">${formatNumber(s.stdDev, 2)}</td>
          <td class="num">${s.outlierCount}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2>3. Modelo Seleccionado y Métricas de Validación</h2>
    <p><strong>Modelo activo:</strong> ${escapeHtml(model.label)} — ${escapeHtml(model.description)}</p>
    <div class="grid-4">
      <div class="kpi"><div class="kpi-label">R² (Determinación)</div><div class="kpi-value">${formatNumber(model.rSquared * 100, 2)}%</div></div>
      <div class="kpi"><div class="kpi-label">R² Ajustado</div><div class="kpi-value">${formatNumber(model.adjRSquared * 100, 2)}%</div></div>
      <div class="kpi"><div class="kpi-label">RMSE (Error típico)</div><div class="kpi-value">${escapeHtml(formatCurrencyLike(model.rmse, target))}</div></div>
      <div class="kpi"><div class="kpi-label">Estadístico F (P-valor)</div><div class="kpi-value">${formatNumber(model.fStat, 2)} (${escapeHtml(formatPValue(model.fPValue))})</div></div>
    </div>
    <h3>Ecuación Matemática Final</h3>
    <div class="equation">${escapeHtml(model.equationText)}</div>

    <table>
      <thead>
        <tr>
          <th>Variable</th>
          <th class="num">Coeficiente (β)</th>
          <th class="num">Error Est.</th>
          <th class="num">Estadístico t</th>
          <th class="num">P-valor</th>
          <th class="num">VIF</th>
          <th>Interpretación de impacto en negocio</th>
        </tr>
      </thead>
      <tbody>
        ${model.coefficients
          .map(
            (c) => `<tr>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td class="num">${formatNumber(c.estimate, 2)}</td>
          <td class="num">${formatNumber(c.stdError, 2)}</td>
          <td class="num">${formatNumber(c.tStat, 2)}</td>
          <td class="num">${escapeHtml(formatPValue(c.pValue))}</td>
          <td class="num">${c.vif !== null ? formatNumber(c.vif, 2) : '—'}</td>
          <td>${escapeHtml(c.businessExplanation)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <div class="charts-row">
      <div>
        <h3>Ajuste: Valores Reales vs. Predichos</h3>
        ${buildActualVsPredictedSvg(model)}
      </div>
      <div>
        <h3>Simulación Monte Carlo de ${escapeHtml(target)}</h3>
        ${buildMonteCarloHistogramSvg(simulation, target)}
      </div>
    </div>

    <h2>4. Simulación de Escenarios Realistas</h2>
    <p>Proyección generada mediante ${simulation.monteCarlo.nSimulations} iteraciones combinando regresiones auxiliares y distribuciones ajustadas por variable. Mediana simulada: <strong>${escapeHtml(formatCurrencyLike(simulation.monteCarlo.p50, target))}</strong> (P10: ${escapeHtml(formatCurrencyLike(simulation.monteCarlo.p10, target))} · P90: ${escapeHtml(formatCurrencyLike(simulation.monteCarlo.p90, target))}).</p>
    <table>
      <thead>
        <tr>
          <th>Escenario</th>
          <th>Descripción</th>
          <th class="num">Precio Estimado</th>
          <th class="num">IC 95% (Media)</th>
          <th class="num">Vs. Promedio Histórico</th>
        </tr>
      </thead>
      <tbody>
        ${scenariosList
          .map(
            (sc) => `<tr>
          <td><strong>${escapeHtml(sc.name)}</strong></td>
          <td>${escapeHtml(sc.subtitle)}</td>
          <td class="num"><strong>${escapeHtml(formatCurrencyLike(sc.predictedPrice, target))}</strong></td>
          <td class="num">${escapeHtml(formatCurrencyLike(sc.ciLower, target))} – ${escapeHtml(formatCurrencyLike(sc.ciUpper, target))}</td>
          <td class="num">${sc.deltaVsMeanPct >= 0 ? '+' : ''}${formatNumber(sc.deltaVsMeanPct, 1)}%</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2>5. Recomendaciones Estratégicas Accionables</h2>
    ${simulation.recommendations
      .map(
        (rec, idx) => `<div class="rec-item">
      <div class="rec-head">
        <div class="rec-title">${idx + 1}. ${escapeHtml(rec.title)} (Prioridad: ${escapeHtml(rec.priority)})</div>
        <div class="rec-impact">${escapeHtml(rec.impactHeadline)}</div>
      </div>
      <p>${escapeHtml(rec.rationale)}</p>
      <p><strong>Acción sugerida:</strong> ${escapeHtml(rec.actionStep)}</p>
    </div>`
      )
      .join('')}

    <footer>
      <span>ValoraMetric · Analítica Econométrica de Precios</span>
      <span>Documento generado automáticamente · ${escapeHtml(generatedDate)}</span>
    </footer>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerFileDownload(blob, 'Reporte_Ejecutivo_Estimacion_Precios.html');
}

export function exportExecutivePdfReport(payload: ExecutiveReportPayload): void {
  const {
    businessContext,
    businessQuestion,
    rawDataset,
    preprocessed,
    eda,
    model,
    simulation,
    customScenario,
  } = payload;
  const target = model.targetVariable;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  let y = 16;

  const addSectionHeader = (title: string) => {
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  const addParagraph = (text: string, boldPrefix?: string) => {
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const full = boldPrefix ? `${boldPrefix} ${text}` : text;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(full, maxWidth);
    if (y + lines.length * 4.5 > 280) {
      doc.addPage();
      y = 18;
    }
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 2.5;
  };

  // Title Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(29, 78, 216);
  doc.text('VALORAMETRIC · REPORTE EJECUTIVO DE ESTIMACIÓN DE PRECIOS', margin, y);
  y += 6.5;

  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text('Modelo de Regresión Lineal Múltiple y Escenarios', margin, y);
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const dateStr = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date());
  doc.text(
    `Archivo: ${rawDataset.fileName}  |  Registros: ${preprocessed.cleanedRows.length}  |  Objetivo (Y): ${target}  |  Fecha: ${dateStr}`,
    margin,
    y
  );
  y += 8;

  // Section 1: Context & Executive Conclusion
  addSectionHeader('1. Contexto de Negocio y Conclusión Ejecutiva');
  addParagraph(businessContext || 'No especificado.', 'Contexto:');
  addParagraph(businessQuestion || 'No especificada.', 'Pregunta clave:');
  addParagraph(simulation.executiveAnswer, 'Respuesta ejecutiva:');

  // Section 2: EDA Summary Table
  addSectionHeader('2. Resumen Exploratorio de Datos (AED)');
  addParagraph(
    `Imputaciones automáticas realizadas: ${preprocessed.totalMissingImputed}. Variables categóricas transformadas a Dummy (k-1): ${preprocessed.categoricalColumns.length} (${preprocessed.dummyMappings.length} columnas).`
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Variable', 'Mínimo', 'Mediana', 'Media', 'Máximo', 'Desv. Est.', 'Atípicos']],
    body: eda.numericSummaries.map((s) => [
      s.column,
      formatNumber(s.min, 2),
      formatNumber(s.median, 2),
      formatNumber(s.mean, 2),
      formatNumber(s.max, 2),
      formatNumber(s.stdDev, 2),
      String(s.outlierCount),
    ]),
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Section 3: Model Validation & Equation
  addSectionHeader('3. Modelo Seleccionado, Ecuación y Validación Estadística');
  addParagraph(`${model.label}: ${model.description}`);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['R²', 'R² Ajustado', 'RMSE', 'MAE', 'Estadístico F', 'P-valor (F)']],
    body: [
      [
        `${formatNumber(model.rSquared * 100, 2)}%`,
        `${formatNumber(model.adjRSquared * 100, 2)}%`,
        formatCurrencyLike(model.rmse, target),
        formatCurrencyLike(model.mae, target),
        formatNumber(model.fStat, 2),
        formatPValue(model.fPValue),
      ],
    ],
    styles: { fontSize: 8.5, halign: 'center', cellPadding: 2.8 },
    headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Equation block
  const eqLines = doc.splitTextToSize(`Ecuación: ${model.equationText}`, maxWidth - 6);
  if (y + eqLines.length * 4.5 + 6 > 280) {
    doc.addPage();
    y = 18;
  }
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 3, maxWidth, eqLines.length * 4.5 + 5, 'F');
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(eqLines, margin + 3, y + 1);
  y += eqLines.length * 4.5 + 7;

  // Coefficients table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Variable', 'Coef. (β)', 'Error Est.', 't-stat', 'P-valor', 'VIF', 'Sig.']],
    body: model.coefficients.map((c) => [
      c.name,
      formatNumber(c.estimate, 2),
      formatNumber(c.stdError, 2),
      formatNumber(c.tStat, 2),
      formatPValue(c.pValue),
      c.vif !== null ? formatNumber(c.vif, 2) : '—',
      c.isIntercept ? 'Base' : c.significant ? 'Sí (p<0,05)' : 'No',
    ]),
    styles: { fontSize: 7.8, cellPadding: 2.1 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Section 4: Simulated Scenarios
  addSectionHeader('4. Simulación de Escenarios y Proyección Monte Carlo');
  addParagraph(
    `Distribución simulada (${simulation.monteCarlo.nSimulations} escenarios realistas): P10 = ${formatCurrencyLike(simulation.monteCarlo.p10, target)} | Mediana (P50) = ${formatCurrencyLike(simulation.monteCarlo.p50, target)} | Media = ${formatCurrencyLike(simulation.monteCarlo.mean, target)} | P90 = ${formatCurrencyLike(simulation.monteCarlo.p90, target)}.`
  );

  const scenariosList = customScenario
    ? [...simulation.presetScenarios, customScenario]
    : simulation.presetScenarios;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Escenario', 'Precio Estimado', 'IC 95% (Media)', 'IP 95% (Individual)', 'Vs. Promedio']],
    body: scenariosList.map((sc) => [
      sc.name,
      formatCurrencyLike(sc.predictedPrice, target),
      `${formatCurrencyLike(sc.ciLower, target)} – ${formatCurrencyLike(sc.ciUpper, target)}`,
      `${formatCurrencyLike(sc.piLower, target)} – ${formatCurrencyLike(sc.piUpper, target)}`,
      `${sc.deltaVsMeanPct >= 0 ? '+' : ''}${formatNumber(sc.deltaVsMeanPct, 1)}%`,
    ]),
    styles: { fontSize: 8, cellPadding: 2.3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Section 5: Actionable Recommendations
  addSectionHeader('5. Recomendaciones Estratégicas Accionables');
  simulation.recommendations.forEach((rec, idx) => {
    addParagraph(
      `${rec.title} (${rec.impactHeadline}) — ${rec.rationale} Acción sugerida: ${rec.actionStep}`,
      `${idx + 1}. [${rec.priority}]`
    );
  });

  // Add subtle page numbers in footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ValoraMetric · Reporte Ejecutivo de Estimación de Precios`,
      margin,
      290
    );
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, 290, { align: 'right' });
  }

  doc.save('Reporte_Ejecutivo_Estimacion_Precios.pdf');
}
