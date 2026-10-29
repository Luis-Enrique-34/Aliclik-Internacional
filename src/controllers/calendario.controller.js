// =====================================================================
//  CONTROLADOR del calendario y la conexión con Google Calendar.
// =====================================================================
const { calendarioService } = require("../services");
const { OAUTH_COOKIE, OAUTH_COOKIE_OPTIONS } = require("../config/security");
const { ipDe } = require("../utils/HttpError");
const logger = require("../utils/logger");

const u = (req) => req.usuario.id;

async function listar(req, res) {
  const [eventos, estado] = await Promise.all([calendarioService.listar(u(req), req.datos), calendarioService.estado(u(req))]);
  res.json({ ok: true, eventos, google: estado });
}

async function tareas(req, res) {
  res.json({ ok: true, tareas: await calendarioService.tareas(u(req)) });
}

async function crear(req, res) {
  const evento = await calendarioService.crear(u(req), req.body, ipDe(req));
  res.status(201).json({ ok: true, mensaje: evento.aviso || "Guardado en tu calendario", evento });
}

async function editar(req, res) {
  const evento = await calendarioService.actualizar(u(req), req.datos.id, req.body, ipDe(req));
  res.json({ ok: true, mensaje: evento.aviso || "Cambios guardados", evento });
}

async function estadoTarea(req, res) {
  res.json({ ok: true, evento: await calendarioService.cambiarEstadoTarea(u(req), req.datos.id, req.body.estado) });
}

async function eliminar(req, res) {
  await calendarioService.eliminar(u(req), req.datos.id, ipDe(req));
  res.json({ ok: true, mensaje: "Evento eliminado" });
}

async function sincronizar(req, res) {
  const r = await calendarioService.sincronizar(u(req));
  res.json({ ok: true, resultado: r, google: await calendarioService.estado(u(req)) });
}

/** GET /api/calendario/google/conectar → redirige a Google */
function conectar(req, res) {
  const { url, cookie } = calendarioService.iniciarConexion(req.usuario);
  res.cookie(OAUTH_COOKIE, cookie, OAUTH_COOKIE_OPTIONS);
  res.redirect(302, url);
}

/** GET /api/calendario/google/callback → vuelve de Google */
async function callback(req, res) {
  const { maxAge, ...op } = OAUTH_COOKIE_OPTIONS;
  const cookie = req.cookies?.[OAUTH_COOKIE];
  res.clearCookie(OAUTH_COOKIE, op);
  try {
    await calendarioService.completarConexion(cookie, {
      code: typeof req.query.code === "string" ? req.query.code : null,
      state: typeof req.query.state === "string" ? req.query.state : null,
      error: typeof req.query.error === "string" ? req.query.error : null,
    }, ipDe(req));
    res.redirect(302, "/app.html#/calendario?google=ok");
  } catch (e) {
    logger.warn("Conexión con Google fallida", { error: e.message });
    const msg = e.status && e.status < 500 ? e.message : "No se pudo conectar con Google";
    res.redirect(302, `/app.html#/calendario?google=error&msg=${encodeURIComponent(msg.slice(0, 160))}`);
  }
}

async function desconectar(req, res) {
  await calendarioService.desconectar(u(req), ipDe(req));
  res.json({ ok: true, mensaje: "Google Calendar desconectado" });
}

/** POST /api/calendario/google/webhook — aviso de cambios de Google (sin sesión, validado por token). */
async function webhook(req, res) {
  const valido = await calendarioService.recibirAviso({
    canalId: req.get("x-goog-channel-id"),
    token: req.get("x-goog-channel-token"),
    estado: req.get("x-goog-resource-state"),
  });
  res.status(valido ? 200 : 404).end();
}

module.exports = { listar, tareas, crear, editar, estadoTarea, eliminar, sincronizar, conectar, callback, desconectar, webhook };
