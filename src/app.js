// =====================================================================
//  APLICACIÓN EXPRESS: la cadena por la que pasa cada petición.
//    1. Seguridad (helmet + Permissions-Policy)   4. API REST (/api)
//    2. Lectura de JSON y cookies                 5. Vistas (public/)
//    3. Registro de peticiones                    6. Manejador central de errores
// =====================================================================
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { IS_PROD } = require("./config/env");
const { HELMET_OPTIONS, PERMISSIONS_POLICY } = require("./config/security");
const logger = require("./utils/logger");
const { HttpError } = require("./utils/HttpError");
const apiRouter = require("./routes");

const app = express();
const PUBLIC_DIR = path.join(__dirname, "..", "public");

app.disable("x-powered-by");
app.set("trust proxy", IS_PROD ? 1 : false); // detrás del proxy de Vercel, para ver la IP real

// 1-3 ---------- middlewares globales
app.use(helmet(HELMET_OPTIONS));
app.use((req, res, next) => { res.setHeader("Permissions-Policy", PERMISSIONS_POLICY); next(); });
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());
app.use(logger.httpLogger);

// Las respuestas de la API nunca se guardan en caché (contienen datos privados)
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

// 4 ---------- API REST
app.use("/api", apiRouter);

// 5 ---------- Vistas
app.get("/", (req, res) => res.redirect(302, "/login.html"));
// Fuentes e íconos no cambian: caché larga. El resto, 1 hora en producción (ETag revalida).
app.use("/assets/vendor", express.static(path.join(PUBLIC_DIR, "assets", "vendor"), { maxAge: IS_PROD ? "30d" : 0, immutable: IS_PROD }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: IS_PROD ? "1h" : 0, index: false }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html")));

// 6 ---------- Manejador central de errores (nunca envía detalles técnicos al navegador)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, mensaje: "JSON mal formado" });
  if (err.type === "entity.too.large") return res.status(413).json({ ok: false, mensaje: "El archivo o la petición es demasiado grande" });
  if (err instanceof HttpError) {
    return res.status(err.status).json({ ok: false, mensaje: err.message, ...(err.errores && { errores: err.errores }) });
  }
  if (err.name === "GoogleError") {
    logger.warn("Error de Google Calendar", { status: err.status, error: err.message });
    return res.status(502).json({ ok: false, mensaje: "Google Calendar no respondió correctamente. Intenta de nuevo." });
  }
  if (err.code === "23503") return res.status(409).json({ ok: false, mensaje: "El registro está relacionado con otros datos" });
  if (err.code === "23514" || err.code === "22P02") return res.status(400).json({ ok: false, mensaje: "Algún dato no cumple las reglas" });
  if (err.code === "23505") return res.status(409).json({ ok: false, mensaje: "El registro ya existe" });

  logger.error("Error no controlado", { ruta: `${req.method} ${req.path}`, error: err.message, code: err.code });
  res.status(500).json({ ok: false, mensaje: "Error interno del servidor" });
});

module.exports = app;
