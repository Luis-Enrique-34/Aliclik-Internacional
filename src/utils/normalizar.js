// =====================================================================
//  Conversión tolerante de los valores que llegan en un CSV (exportado
//  desde DBeaver, MySQL Workbench o abierto/guardado con Excel).
// =====================================================================
const PAISES = {
  GT: "GT", GTM: "GT", GUATEMALA: "GT",
  HN: "HN", HND: "HN", HONDURAS: "HN",
  AR: "AR", ARG: "AR", ARGENTINA: "AR",
  MX: "MX", MEX: "MX", MEXICO: "MX",
  CO: "CO", COL: "CO", COLOMBIA: "CO",
  EC: "EC", ECU: "EC", ECUADOR: "EC",
  CL: "CL", CHL: "CL", CHILE: "CL",
  PE: "PE", PER: "PE", PERU: "PE",
};

const sinTildes = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "");

function pais(v) {
  if (v == null || v === "") return null;
  return PAISES[sinTildes(v).trim().toUpperCase()] || null;
}

function entero(v) {
  if (v == null || v === "" || /^null$/i.test(v)) return null;
  const n = Number(String(v).replace(/[\s,]/g, ""));
  return Number.isSafeInteger(n) ? n : NaN;
}

/** "1,234.50" · "1.234,50" · "1234,5" · "1234.5" → número */
function decimal(v) {
  if (v == null || v === "" || /^null$/i.test(v)) return null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma > -1 && punto > -1) s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (coma > -1) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function booleano(v) {
  if (v == null || v === "" || /^null$/i.test(v)) return null;
  return /^(1|true|t|si|sí|s|yes|y|x)$/i.test(String(v).trim());
}

/**
 * Fecha y hora → Date.
 *  · ISO con zona (2026-10-29T15:04:05Z) se respeta.
 *  · Sin zona (2026-10-29 15:04:05) se interpreta en `zonaSinOffset` (UTC por defecto: así guarda Aurora).
 *  · dd/mm/aaaa [hh:mm[:ss]] (Excel en español) se interpreta en hora de Lima (UTC-5).
 */
function fechaHora(v, { zonaSinOffset = "UTC" } = {}) {
  if (v == null || v === "" || /^null$/i.test(v)) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, d, mes, a, h = "0", mi = "0", se = "0"] = m;
    return new Date(Date.UTC(+a, +mes - 1, +d, +h + 5, +mi, +se)); // Lima = UTC-5 (sin horario de verano)
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
  if (m) {
    const [, a, mes, d, h = "0", mi = "0", se = "0"] = m;
    const desfase = zonaSinOffset === "America/Lima" ? 5 : 0;
    return new Date(Date.UTC(+a, +mes - 1, +d, +h + desfase, +mi, +se));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(NaN) : d;
}

/** Fecha sin hora → "AAAA-MM-DD" */
function soloFecha(v) {
  if (v == null || v === "" || /^null$/i.test(v)) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "invalida";
}

const textoCorto = (v, max = 160) => {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return s && !/^null$/i.test(s) ? s.slice(0, max) : null;
};

module.exports = { pais, entero, decimal, booleano, fechaHora, soloFecha, textoCorto };
