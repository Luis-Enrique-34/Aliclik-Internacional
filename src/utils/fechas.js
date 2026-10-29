// Utilidades de fecha con zona horaria (sin librerías).
const { ZONA_HORARIA } = require("../config/env");

/** "AAAA-MM-DD" del instante `d` en la zona indicada. */
function fechaEnZona(d, tz = ZONA_HORARIA) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

/** Desfase de la zona en minutos para ese instante (Lima → -300). */
function desfaseMin(d, tz = ZONA_HORARIA) {
  const nombre = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(new Date(d)).find((p) => p.type === "timeZoneName")?.value || "GMT";
  const m = nombre.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}

/** Instante (Date) de "AAAA-MM-DD hh:mm:ss" interpretado en la zona. */
function instanteEnZona(fecha, hora = "00:00:00", tz = ZONA_HORARIA) {
  const base = Date.parse(`${fecha}T${hora}Z`);
  return new Date(base - desfaseMin(base, tz) * 60000);
}

/** Suma días a "AAAA-MM-DD". */
function sumarDias(fecha, n) {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

module.exports = { fechaEnZona, desfaseMin, instanteEnZona, sumarDias };
