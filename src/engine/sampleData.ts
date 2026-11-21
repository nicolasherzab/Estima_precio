import { CellValue, RawDataset } from '../types/analytics';
import { createSeededRandom, randomStandardNormal } from './mathStats';

export const DEFAULT_BUSINESS_CONTEXT =
  'Empresa desarrolladora e inmobiliaria urbana que evalúa su cartera de propiedades residenciales en cuatro zonas metropolitanas para estandarizar su política de precios de venta, optimizar márgenes en remodelaciones y fijar tarifas competitivas en nuevos lanzamientos.';

export const DEFAULT_BUSINESS_QUESTION =
  '¿Qué atributos físicos y de ubicación explican con mayor precisión el precio de venta de una propiedad residencial y cuál debería ser el precio óptimo estimado para distintos perfiles de activos?';

/**
 * Generates a realistic, reproducible 150-row residential real-estate pricing dataset
 * with realistic cross-variable correlations, categorical premiums, and ~4-7% missing values
 * so that missing-data imputation and dummy encoding can be demonstrated transparently.
 */
export function buildSampleDataset(): RawDataset {
  const rng = createSeededRandom(20260419);

  const zonas = [
    { name: 'Norte', weight: 0.30, premium: 44000, distBase: 4.2 },
    { name: 'Centro', weight: 0.25, premium: 29000, distBase: 1.8 },
    { name: 'Este', weight: 0.25, premium: 15500, distBase: 6.4 },
    { name: 'Sur', weight: 0.20, premium: 0, distBase: 9.2 },
  ];

  const tipos = [
    { name: 'Apartamento', weight: 0.54, premium: 0, areaShift: 0 },
    { name: 'Casa', weight: 0.30, premium: 26000, areaShift: 48 },
    { name: 'Penthouse', weight: 0.16, premium: 54000, areaShift: 62 },
  ];

  const estados = [
    { name: 'Original', weight: 0.38, premium: 0, ageShift: 14 },
    { name: 'Remodelado', weight: 0.36, premium: 21500, ageShift: 8 },
    { name: 'Nuevo', weight: 0.26, premium: 38500, ageShift: 1 },
  ];

  const pickWeighted = <T extends { weight: number }>(items: T[]): T => {
    const r = rng();
    let acc = 0;
    for (const item of items) {
      acc += item.weight;
      if (r <= acc) return item;
    }
    return items[items.length - 1];
  };

  const headers = [
    'ID_Propiedad',
    'Superficie_m2',
    'Habitaciones',
    'Banos',
    'Antiguedad_Anios',
    'Distancia_Centro_km',
    'Estacionamientos',
    'Zona',
    'Tipo_Propiedad',
    'Estado_Conservacion',
    'Precio_USD',
  ];

  const rows: Record<string, CellValue>[] = [];

  for (let i = 1; i <= 150; i++) {
    const zona = pickWeighted(zonas);
    const tipo = pickWeighted(tipos);
    const estado = pickWeighted(estados);

    const rawArea = 88 + tipo.areaShift + randomStandardNormal(rng) * 32;
    const superficie = Math.round(Math.max(42, Math.min(285, rawArea)));

    // Realistic structural correlations with Superficie_m2
    const habRaw = 1.1 + superficie / 46 + randomStandardNormal(rng) * 0.55;
    const habitaciones = Math.max(1, Math.min(6, Math.round(habRaw)));

    const banosRaw = 0.7 + superficie / 64 + habitaciones * 0.18 + randomStandardNormal(rng) * 0.4;
    const banos = Math.max(1, Math.min(5, Math.round(banosRaw)));

    const antiguedadRaw =
      estado.name === 'Nuevo'
        ? Math.abs(randomStandardNormal(rng) * 1.4)
        : estado.ageShift + Math.abs(randomStandardNormal(rng) * 7.5);
    const antiguedad = Math.round(Math.max(0, Math.min(38, antiguedadRaw)));

    const distanciaRaw = zona.distBase + randomStandardNormal(rng) * 2.1;
    const distancia = Number(Math.max(0.5, Math.min(18.5, distanciaRaw)).toFixed(1));

    const estacRaw = 0.4 + superficie / 95 + (tipo.name === 'Apartamento' ? 0 : 0.6) + randomStandardNormal(rng) * 0.45;
    const estacionamientos = Math.max(0, Math.min(4, Math.round(estacRaw)));

    // Economic true price generating function + realistic market noise (~$13k std)
    const noise = randomStandardNormal(rng) * 13500;
    const truePrice =
      38000 +
      1480 * superficie +
      9400 * habitaciones +
      14200 * banos -
      1850 * antiguedad -
      3400 * distancia +
      8900 * estacionamientos +
      zona.premium +
      tipo.premium +
      estado.premium +
      noise;

    const precio = Math.round(Math.max(68000, truePrice) / 100) * 100;

    // Introduce realistic scattered missing values (~4-6% in selected predictors)
    const row: Record<string, CellValue> = {
      ID_Propiedad: `PROP-${String(1000 + i)}`,
      Superficie_m2: rng() < 0.04 ? null : superficie,
      Habitaciones: rng() < 0.03 ? null : habitaciones,
      Banos: rng() < 0.04 ? null : banos,
      Antiguedad_Anios: rng() < 0.06 ? null : antiguedad,
      Distancia_Centro_km: rng() < 0.05 ? null : distancia,
      Estacionamientos: rng() < 0.05 ? null : estacionamientos,
      Zona: rng() < 0.03 ? null : zona.name,
      Tipo_Propiedad: tipo.name,
      Estado_Conservacion: rng() < 0.04 ? null : estado.name,
      Precio_USD: precio,
    };

    rows.push(row);
  }

  return {
    fileName: 'cartera_inmobiliaria_ejemplo.csv',
    fileFormat: 'CSV (Dataset de ejemplo)',
    headers,
    rows,
    detectedDelimiter: ',',
    warnings: [],
  };
}
