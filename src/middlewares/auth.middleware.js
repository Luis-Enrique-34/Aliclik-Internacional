// =====================================================================
//  MIDDLEWARES de autenticación y autorización.
//   requireAuth   → exige una sesión válida (cookie HttpOnly con JWT) y
//                   comprueba EN LA BASE que la cuenta siga activa y que la
//                   sesión no haya sido revocada (cambio de contraseña/rol).
//   requireRol    → autorización por rol (admin, editor, lector).
//   puedeEscribir → atajo: admin o editor.
// =====================================================================
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");
const { COOKIE_NAME, COOKIE_OPTIONS, JWT_OPTIONS, JWT_VERIFY_OPTIONS } = require("../config/security");
const { usuarioDAO } = require("../dao");
const cacheSesion = require("../utils/cacheSesion");

const limpiarCookie = (res) => {
  const { maxAge, ...op } = COOKIE_OPTIONS;
  res.clearCookie(COOKIE_NAME, op);
};

async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, mensaje: "No has iniciado sesión" });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS); // firma + expiración + algoritmo fijo
  } catch {
    limpiarCookie(res);
    return res.status(401).json({ ok: false, mensaje: "Sesión inválida o expirada" });
  }

  let u = cacheSesion.obtener(payload.sub);
  if (!u) {
    u = await usuarioDAO.buscarPorId(payload.sub);
    if (u) cacheSesion.guardar(payload.sub, u);
  }
  if (!u || u.estado !== "activo" || u.version_sesion !== payload.sv) {
    limpiarCookie(res);
    return res.status(401).json({ ok: false, mensaje: "Tu sesión ya no es válida. Inicia sesión de nuevo." });
  }
  req.usuario = { id: u.id, rol: u.rol, email: u.email, nombres: u.nombres, apellidos: u.apellidos };

  // Renovación deslizante: si quedan menos de 2 h, se emite un token nuevo
  if (payload.exp * 1000 - Date.now() < 2 * 60 * 60 * 1000) {
    const nuevo = jwt.sign({ sub: u.id, rol: u.rol, sv: u.version_sesion }, JWT_SECRET, JWT_OPTIONS);
    res.cookie(COOKIE_NAME, nuevo, COOKIE_OPTIONS);
  }
  next();
}

const requireRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario?.rol)) {
    return res.status(403).json({ ok: false, mensaje: "No tienes permiso para esta acción" });
  }
  next();
};

const puedeEscribir = requireRol("admin", "editor");

module.exports = { requireAuth, requireRol, puedeEscribir, limpiarCookie };
