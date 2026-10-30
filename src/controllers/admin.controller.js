// =====================================================================
//  CONTROLADOR de administración (solo rol admin).
// =====================================================================
const { adminService, calendarioService } = require("../services");
const { auditoriaDAO } = require("../dao");
const { ipDe } = require("../utils/HttpError");
const { CRON_SECRET } = require("../config/env");
const { igualesSeguro } = require("../utils/cifrado");

async function usuarios(req, res) {
  res.json({ ok: true, usuarios: await adminService.listarUsuarios() });
}

async function acceso(req, res) {
  const usuario = await adminService.actualizarAcceso(req.usuario.id, req.datos.id, req.body, ipDe(req));
  res.json({ ok: true, mensaje: "Acceso actualizado", usuario });
}

async function desbloquear(req, res) {
  await adminService.desbloquear(req.usuario.id, req.datos.id, ipDe(req));
  res.json({ ok: true, mensaje: "Cuenta desbloqueada" });
}

async function auditoria(req, res) {
  const { accion, usuario_id: usuarioId, grupo, desde, hasta, ip, q, orden, limite } = req.datos;
  const [registros, acciones] = await Promise.all([
    adminService.auditoriaListar({ accion, usuarioId, grupo, desde, hasta, ip, q, orden, limite }),
    auditoriaDAO.acciones(),
  ]);
  res.json({ ok: true, registros, acciones: acciones.map((a) => a.accion) });
}

/** GET /api/cron/calendario — Vercel Cron envía "Authorization: Bearer <CRON_SECRET>". */
async function cronCalendario(req, res) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || !igualesSeguro(token, CRON_SECRET)) return res.status(401).json({ ok: false });
  res.json({ ok: true, ...(await calendarioService.sincronizarTodos()) });
}

module.exports = { usuarios, acceso, desbloquear, auditoria, cronCalendario };
