// =====================================================================
//  CONTROLADOR de autenticación (la "C" de MVC): traduce HTTP ↔ servicio.
// =====================================================================
const { authService } = require("../services");
const { COOKIE_NAME, COOKIE_OPTIONS } = require("../config/security");
const { limpiarCookie } = require("../middlewares/auth.middleware");
const { ipDe } = require("../utils/HttpError");

const iniciarSesion = (res, usuario) => res.cookie(COOKIE_NAME, authService.emitirToken(usuario), COOKIE_OPTIONS);

/** POST /api/auth/registro — la cuenta queda pendiente de aprobación (salvo la primera). */
async function registrar(req, res) {
  const r = await authService.registrar(req.body, ipDe(req));
  if (!r.pendiente) {
    iniciarSesion(res, r.usuario);
    return res.status(201).json({ ok: true, mensaje: "Cuenta de administrador creada. ¡Bienvenido!", sesion: true });
  }
  res.status(201).json({ ok: true, sesion: false, mensaje: "Solicitud enviada. Un administrador debe aprobar tu cuenta antes de que puedas ingresar." });
}

/** POST /api/auth/login */
async function login(req, res) {
  const usuario = await authService.login(req.body, ipDe(req));
  iniciarSesion(res, usuario);
  res.json({ ok: true, mensaje: "Bienvenido", usuario: { nombres: usuario.nombres, rol: usuario.rol } });
}

/** POST /api/auth/logout */
function logout(req, res) {
  limpiarCookie(res);
  res.json({ ok: true, mensaje: "Sesión cerrada" });
}

/** GET /api/auth/me */
async function me(req, res) {
  const u = await authService.usuarioActual(req.usuario.id);
  const { version_sesion, intentos_fallidos, bloqueado_hasta, ...usuario } = u;
  res.json({ ok: true, usuario });
}

/** PUT /api/auth/perfil */
async function perfil(req, res) {
  const u = await authService.actualizarPerfil(req.usuario.id, req.body);
  res.json({ ok: true, mensaje: "Perfil actualizado", usuario: { nombres: u.nombres, apellidos: u.apellidos, cargo: u.cargo } });
}

/** PUT /api/auth/password — revoca las demás sesiones y renueva la actual. */
async function password(req, res) {
  const version = await authService.cambiarPassword(req.usuario.id, req.body, ipDe(req));
  iniciarSesion(res, { id: req.usuario.id, rol: req.usuario.rol, version_sesion: version });
  res.json({ ok: true, mensaje: "Contraseña actualizada. Se cerraron tus sesiones en otros equipos." });
}

module.exports = { registrar, login, logout, me, perfil, password };
