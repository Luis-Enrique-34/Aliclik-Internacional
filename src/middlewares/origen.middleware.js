// =====================================================================
//  PROTECCIÓN CSRF (segunda capa, además de la cookie SameSite=Strict).
//  Toda petición que modifica datos (POST, PUT, PATCH, DELETE) debe venir
//  de nuestra propia página: se compara la cabecera Origin (o Referer)
//  con la URL de la app. Los webhooks de Google y el cron se excluyen
//  porque se autentican con su propio token secreto.
// =====================================================================
const { APP_URL, IS_PROD } = require("../config/env");

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXCLUIDAS = ["/calendario/google/webhook", "/cron/"];

function origenDe(req) {
  const o = req.get("origin");
  if (o && o !== "null") return o;
  const r = req.get("referer");
  try { return r ? new URL(r).origin : null; } catch { return null; }
}

function verificarOrigen(req, res, next) {
  if (SEGUROS.has(req.method) || EXCLUIDAS.some((p) => req.path.startsWith(p))) return next();
  const origen = origenDe(req);
  const permitidos = new Set([new URL(APP_URL).origin, `${req.protocol}://${req.get("host")}`]);
  if (!origen && !IS_PROD) return next(); // herramientas locales (curl/pruebas) en desarrollo
  if (!origen || !permitidos.has(origen)) {
    return res.status(403).json({ ok: false, mensaje: "Origen de la petición no permitido" });
  }
  next();
}

module.exports = { verificarOrigen };
