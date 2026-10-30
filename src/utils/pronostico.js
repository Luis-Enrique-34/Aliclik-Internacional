// =====================================================================
//  PRONÓSTICOS sobre series históricas (funciones puras, sin librerías)
//
//  Método explicable, pensado para presentar:
//   1. Tendencia: regresión lineal sobre los últimos N días.
//   2. Estacionalidad semanal: cuánto se aleja cada día de la semana de
//      su tendencia (los lunes suelen tener más pedidos que los domingos).
//   3. Banda de confianza ±1,28 σ de los errores históricos (≈ 80 %).
//  Con poca historia (< 14 días) se usa el promedio de los últimos 7 días.
// =====================================================================

/** Regresión lineal por mínimos cuadrados: y = a + b·x */
function regresion(ys) {
  const n = ys.length;
  if (!n) return { a: 0, b: 0 };
  if (n === 1) return { a: ys[0], b: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  ys.forEach((y, x) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const den = n * sxx - sx * sx;
  const b = den ? (n * sxy - sx * sy) / den : 0;
  return { a: (sy - b * sx) / n, b };
}

const media = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
function desviacion(xs) {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

/** Día de la semana (0 = domingo) de "AAAA-MM-DD". */
const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Pronóstico diario.
 * @param {{dia:string, valor:number}[]} historia serie diaria completa (sin huecos), ordenada
 * @param {number} horizonte días a pronosticar
 * @param {{ventana?:number}} [op] días de historia usados para la tendencia (por defecto 56 = 8 semanas)
 * @returns {{ dias:string[], pred:number[], bajo:number[], alto:number[], metodo:string, tendenciaDiaria:number }}
 */
function pronosticoDiario(historia, horizonte = 14, { ventana = 56 } = {}) {
  const serie = historia.slice(-ventana);
  const ultimo = historia.at(-1)?.dia;
  if (!ultimo) return { dias: [], pred: [], bajo: [], alto: [], metodo: "sin datos", tendenciaDiaria: 0 };
  const dias = Array.from({ length: horizonte }, (_, i) => sumarDias(ultimo, i + 1));
  const ys = serie.map((p) => Number(p.valor) || 0);

  if (ys.length < 14) {
    const base = media(ys.slice(-7));
    const sd = desviacion(ys.slice(-7));
    return {
      dias, pred: dias.map(() => base), bajo: dias.map(() => Math.max(0, base - 1.28 * sd)), alto: dias.map(() => base + 1.28 * sd),
      metodo: "promedio de los últimos 7 días (historia corta)", tendenciaDiaria: 0,
    };
  }

  const { a, b } = regresion(ys);
  const tendencia = (x) => a + b * x;
  // Factor por día de la semana = promedio de (real / tendencia) en ese día
  const acum = Array.from({ length: 7 }, () => []);
  serie.forEach((p, x) => { const t = tendencia(x); if (t > 0) acum[diaSemana(p.dia)].push(ys[x] / t); });
  const factor = acum.map((v) => (v.length ? media(v) : 1));
  const prom = media(factor) || 1;
  const fs = factor.map((f) => f / prom); // normalizado: promedio 1

  const ajustado = serie.map((p, x) => Math.max(0, tendencia(x) * fs[diaSemana(p.dia)]));
  const sd = desviacion(ys.map((y, i) => y - ajustado[i]));
  const n = ys.length;
  const pred = dias.map((d, i) => Math.max(0, tendencia(n + i) * fs[diaSemana(d)]));
  return {
    dias,
    pred: pred.map((v) => Math.round(v * 10) / 10),
    bajo: pred.map((v) => Math.max(0, Math.round((v - 1.28 * sd) * 10) / 10)),
    alto: pred.map((v) => Math.round((v + 1.28 * sd) * 10) / 10),
    metodo: "tendencia lineal de 8 semanas con estacionalidad por día de la semana",
    tendenciaDiaria: Math.round(b * 100) / 100,
  };
}

/**
 * Proyección de cierre de mes: lo ya ocurrido + el pronóstico de los días que faltan.
 * @param {number} acumulado valor del mes hasta hoy
 * @param {number[]} predRestante pronóstico de los días restantes del mes
 */
function cierreDeMes(acumulado, predRestante, bajo = [], alto = []) {
  const s = (xs) => xs.reduce((t, v) => t + v, 0);
  return { valor: Math.round(acumulado + s(predRestante)), bajo: Math.round(acumulado + s(bajo)), alto: Math.round(acumulado + s(alto)) };
}

/**
 * Pronóstico por periodos (semanas o meses) con tendencia lineal.
 * @param {number[]} valores historia por periodo (el último puede estar incompleto: no se incluye)
 */
function pronosticoPeriodos(valores, horizonte = 3) {
  if (!valores.length) return [];
  const { a, b } = regresion(valores);
  return Array.from({ length: horizonte }, (_, i) => Math.max(0, Math.round((a + b * (valores.length + i)) * 10) / 10));
}

/** Detección de picos: días por encima de media + k·σ. */
function anomalias(valores, k = 2) {
  const m = media(valores), sd = desviacion(valores);
  if (!sd) return [];
  return valores.map((v, i) => ({ i, v, z: (v - m) / sd })).filter((p) => p.z > k);
}

/** Estado de un indicador frente a su meta: ok · warn (dentro de la tolerancia) · danger. */
function estadoMeta(valor, { meta, tipo }, tolerancia = 0.15) {
  if (valor == null || Number.isNaN(valor)) return "neutro";
  if (tipo === "min") {
    if (valor >= meta) return "ok";
    return valor >= meta * (1 - tolerancia) ? "warn" : "danger";
  }
  if (valor <= meta) return "ok";
  return valor <= meta * (1 + tolerancia) ? "warn" : "danger";
}

module.exports = { regresion, media, desviacion, pronosticoDiario, cierreDeMes, pronosticoPeriodos, anomalias, estadoMeta, sumarDias };
