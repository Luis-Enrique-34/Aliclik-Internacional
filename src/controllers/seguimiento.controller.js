// =====================================================================
//  CONTROLADOR del seguimiento por actor y de los acuerdos de trato especial.
// =====================================================================
const { seguimientoService } = require("../services");
const { ipDe } = require("../utils/HttpError");

const u = (req) => req.usuario.id;

module.exports = {
  listar: async (req, res) => {
    const { tipo: t, ...f } = req.datos;
    res.json({ ok: true, ...(await seguimientoService.listar(t, f)) });
  },
  alertas: async (req, res) => res.json({ ok: true, alertas: await seguimientoService.alertasGenerales(Math.min(Number(req.query.limite) || 30, 50)) }),
  ficha: async (req, res) => res.json({ ok: true, ...(await seguimientoService.ficha(req.datos.id)) }),
  plan: async (req, res) => res.json({ ok: true, mensaje: "Plan de seguimiento actualizado", plan: await seguimientoService.actualizarPlan(req.datos.id, req.body, u(req), ipDe(req)) }),

  acuerdos: async (req, res) => res.json({ ok: true, acuerdos: await seguimientoService.listarAcuerdos(req.datos) }),
  crearAcuerdo: async (req, res) => res.status(201).json({ ok: true, mensaje: "Acuerdo registrado", acuerdo: await seguimientoService.crearAcuerdo(req.body, u(req), ipDe(req)) }),
  editarAcuerdo: async (req, res) => res.json({ ok: true, mensaje: "Acuerdo actualizado", acuerdo: await seguimientoService.actualizarAcuerdo(req.datos.id, req.body, u(req), ipDe(req)) }),
  eliminarAcuerdo: async (req, res) => { await seguimientoService.eliminarAcuerdo(req.datos.id, u(req), ipDe(req)); res.json({ ok: true, mensaje: "Acuerdo eliminado" }); },
};
