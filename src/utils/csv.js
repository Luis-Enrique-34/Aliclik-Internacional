// =====================================================================
//  CSV: lectura (cargas desde Aurora/DBeaver/Workbench) y exportación
//  compatible con Excel.
//   · Lectura: detecta el separador (, ; o tabulación), comillas dobles,
//     saltos de línea dentro de comillas y BOM. Sin librerías externas.
//   · Exportación: separador ";" + BOM UTF-8 (Excel en español abre bien
//     las tildes) y protección contra "CSV injection" (=, +, -, @).
// =====================================================================
const BOM = "﻿";

function detectarSeparador(primeraLinea) {
  const conteo = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let enComillas = false;
  for (const ch of primeraLinea) {
    if (ch === '"') enComillas = !enComillas;
    else if (!enComillas && ch in conteo) conteo[ch]++;
  }
  const [mejor, veces] = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
  return veces > 0 ? mejor : ",";
}

/**
 * Convierte texto CSV en { columnas, filas } (filas = arreglo de objetos).
 * Las columnas se normalizan: minúsculas, sin tildes y con "_".
 * @param {string} texto
 * @param {{ maxFilas?: number }} [opciones]
 */
function parsearCsv(texto, { maxFilas = Infinity } = {}) {
  if (texto.startsWith(BOM)) texto = texto.slice(1);
  const finPrimera = texto.search(/\r?\n/);
  const sep = detectarSeparador(finPrimera === -1 ? texto : texto.slice(0, finPrimera));

  const registros = [];
  let campo = "";
  let fila = [];
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"' && campo === "") enComillas = true;
    else if (ch === sep) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((c) => c !== "")) registros.push(fila);
      fila = [];
      if (registros.length > maxFilas + 1) throw new Error(`El archivo supera el máximo de ${maxFilas} filas`);
    } else campo += ch;
  }
  if (enComillas) throw new Error("El archivo tiene comillas sin cerrar");
  fila.push(campo);
  if (fila.some((c) => c !== "")) registros.push(fila);
  if (registros.length > maxFilas + 1) throw new Error(`El archivo supera el máximo de ${maxFilas} filas`);

  if (!registros.length) return { columnas: [], filas: [], separador: sep };
  const columnas = registros[0].map(normalizarColumna);
  const filas = registros.slice(1).map((r) => Object.fromEntries(columnas.map((c, j) => [c, (r[j] ?? "").trim()])));
  return { columnas, filas, separador: sep };
}

const normalizarColumna = (c) =>
  String(c).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Valor seguro para una celda (evita que Excel ejecute fórmulas). */
function celda(valor) {
  let s = valor instanceof Date ? valor.toISOString() : valor == null ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** @param {object[]} filas  @param {{campo:string, titulo:string}[]} columnas */
function aCsv(filas, columnas) {
  const encabezado = columnas.map((c) => celda(c.titulo)).join(";");
  const cuerpo = filas.map((f) => columnas.map((c) => celda(f[c.campo])).join(";"));
  return BOM + [encabezado, ...cuerpo].join("\r\n");
}

module.exports = { parsearCsv, aCsv, celda, normalizarColumna };
