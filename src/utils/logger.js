// =====================================================================
//  LOGGER centralizado (equivalente a Logback en Java): niveles debug/info/warn/error.
//  - En desarrollo imprime líneas legibles con color.
//  - En producción imprime JSON (una línea por evento), fácil de procesar
//    por herramientas de monitoreo (Vercel, CloudWatch, Grafana Loki, etc.).
//  - Nunca registra contraseñas, tokens ni la cadena de conexión: los
//    datos se pasan por ocultar() antes de imprimirse.
// =====================================================================
const NIVELES = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const COLOR = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" };
const IS_PROD = process.env.NODE_ENV === "production";
const MINIMO = NIVELES[process.env.LOG_LEVEL] ?? (IS_PROD ? NIVELES.info : NIVELES.debug);
const MAX_RECIENTES = 100;

const recientes = []; // buffer circular
const peticiones = []; // últimas peticiones HTTP

const SENSIBLE = /pass|token|secret|cookie|authorization|clave|hash/i;
/** Reemplaza valores de claves sensibles por "***" (defensa por si alguien los pasa al log). */
function ocultar(datos) {
  if (!datos || typeof datos !== "object") return datos;
  return Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, SENSIBLE.test(k) ? "***" : v]));
}

function registrar(nivel, mensaje, datos) {
  if (NIVELES[nivel] < MINIMO) return;
  datos = ocultar(datos);
  const evento = { fecha: new Date().toISOString(), nivel, mensaje, ...(datos && { datos }) };
  recientes.push(evento);
  if (recientes.length > MAX_RECIENTES) recientes.shift();

  if (IS_PROD) {
    console.log(JSON.stringify(evento));
  } else {
    const hora = evento.fecha.slice(11, 19);
    const extra = datos ? " " + JSON.stringify(datos) : "";
    const etiqueta = `${COLOR[nivel]}${hora} ${nivel.toUpperCase().padEnd(5)}\x1b[0m`;
    console.log(`${etiqueta} ${mensaje}${extra}`);
  }
}

/** Middleware: registra cada petición a la API con su estado y duración. */
function httpLogger(req, res, next) {
  if (!req.path.startsWith("/api")) return next();
  const inicio = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e5) / 10;
    const item = { fecha: new Date().toISOString(), metodo: req.method, ruta: req.originalUrl.split("?")[0], estado: res.statusCode, ms };
    peticiones.push(item);
    if (peticiones.length > MAX_RECIENTES) peticiones.shift();
    const nivel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "debug";
    registrar(nivel, `${req.method} ${item.ruta} → ${res.statusCode} (${ms} ms)`);
  });
  next();
}

module.exports = {
  debug: (m, d) => registrar("debug", m, d),
  info: (m, d) => registrar("info", m, d),
  warn: (m, d) => registrar("warn", m, d),
  error: (m, d) => registrar("error", m, d),
  httpLogger,
  recientes: () => [...recientes].reverse(),
  peticiones: () => [...peticiones].reverse(),
};
