// =====================================================================
//  CONTROLADOR de entidades, integraciones, observaciones y seguimiento.
// =====================================================================
const { negocioService } = require("../services");
const { ipDe } = require("../utils/HttpError");

const u = (req) => req.usuario.id;

module.exports = {
  // Entidades
  opcionesEntidad: async (req, res) => res.json({ ok: true, opciones: await negocioService.opciones(req.datos.tipo) }),
  entidad: async (req, res) => res.json({ ok: true, entidad: await negocioService.obtenerEntidad(req.datos.id) }),
  crearEntidad: async (req, res) => res.status(201).json({ ok: true, mensaje: "Registro creado", entidad: await negocioService.crearEntidad(req.body, u(req), ipDe(req)) }),
  editarEntidad: async (req, res) => res.json({ ok: true, mensaje: "Cambios guardados", entidad: await negocioService.actualizarEntidad(req.datos.id, req.body, u(req), ipDe(req)) }),

  // Integraciones
  integraciones: async (req, res) => res.json({ ok: true, integraciones: await negocioService.listarIntegraciones(req.datos), resumen: await negocioService.resumenIntegraciones() }),
  integracion: async (req, res) => res.json({ ok: true, integracion: await negocioService.obtenerIntegracion(req.datos.id) }),
  crearIntegracion: async (req, res) => res.status(201).json({ ok: true, mensaje: "Integración registrada", integracion: await negocioService.crearIntegracion(req.body, u(req), ipDe(req)) }),
  editarIntegracion: async (req, res) => res.json({ ok: true, mensaje: "Cambios guardados", integracion: await negocioService.actualizarIntegracion(req.datos.id, req.body, u(req), ipDe(req)) }),
  marcarCheck: async (req, res) => res.json({ ok: true, ...(await negocioService.marcarCheck(req.datos.id, req.body, u(req), ipDe(req))) }),
  eliminarIntegracion: async (req, res) => { await negocioService.eliminarIntegracion(req.datos.id, u(req), ipDe(req)); res.json({ ok: true, mensaje: "Integración eliminada" }); },

  // Observaciones
  observaciones: async (req, res) => res.json({ ok: true, observaciones: await negocioService.listarObservaciones(req.datos) }),
  crearObservacion: async (req, res) => res.status(201).json({ ok: true, mensaje: "Observación registrada", observacion: await negocioService.crearObservacion(req.body, u(req), ipDe(req)) }),
  editarObservacion: async (req, res) => res.json({ ok: true, mensaje: "Cambios guardados", observacion: await negocioService.actualizarObservacion(req.datos.id, req.body, u(req), ipDe(req)) }),
  eliminarObservacion: async (req, res) => { await negocioService.eliminarObservacion(req.datos.id, u(req), ipDe(req)); res.json({ ok: true, mensaje: "Observación eliminada" }); },

  // Seguimiento
  seguimiento: async (req, res) => res.json({ ok: true, seguimiento: await negocioService.listarSeguimiento(req.datos.recurso, req.datos.id) }),
  comentar: async (req, res) => res.status(201).json({ ok: true, mensaje: "Comentario agregado", item: await negocioService.comentar(req.datos.recurso, req.datos.id, req.body, u(req), ipDe(req)) }),
  actividad: async (req, res) => res.json({ ok: true, actividad: await negocioService.actividadReciente() }),
};
