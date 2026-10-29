// =====================================================================
//  SERVICIO de gestión: entidades, integraciones, observaciones y la
//  bitácora de seguimiento (comentarios + cambios de estado).
// =====================================================================
const { HttpError, noEncontrado } = require("../utils/HttpError");
const { ESTADOS_INT, ESTADOS_OBS } = require("../validators/negocio.schemas");

class NegocioService {
  constructor({ entidadDAO, integracionDAO, observacionDAO, seguimientoDAO, auditoriaDAO }) {
    this.entidades = entidadDAO;
    this.integraciones = integracionDAO;
    this.observaciones = observacionDAO;
    this.seguimientos = seguimientoDAO;
    this.auditoria = auditoriaDAO;
  }

  // ------------------------------------------------------------- Entidades
  opciones(tipo) { return this.entidades.opciones(tipo); }

  async obtenerEntidad(id) {
    const e = await this.entidades.obtener(id);
    if (!e) throw noEncontrado("la entidad");
    return e;
  }

  async crearEntidad(datos, usuarioId, ip) {
    try {
      const e = await this.entidades.crear(datos);
      await this.auditoria.registrar({ usuarioId, accion: "ENTIDAD_CREADA", entidad: "entidades", entidadId: e.id, ip, detalle: { tipo: e.tipo, nombre: e.nombre } });
      return e;
    } catch (err) {
      if (err.code === "23505") throw new HttpError(409, "Ya existe una entidad con ese ID de Aurora o nombre", { aurora_id: "Duplicado" });
      throw err;
    }
  }

  async actualizarEntidad(id, datos, usuarioId, ip) {
    try {
      const e = await this.entidades.actualizar(id, datos);
      if (!e) throw noEncontrado("la entidad");
      await this.auditoria.registrar({ usuarioId, accion: "ENTIDAD_EDITADA", entidad: "entidades", entidadId: id, ip });
      return e;
    } catch (err) {
      if (err.code === "23505") throw new HttpError(409, "Ya existe una entidad con ese ID de Aurora o nombre", { aurora_id: "Duplicado" });
      throw err;
    }
  }

  // ------------------------------------------------------------- Integraciones
  listarIntegraciones(f) { return this.integraciones.listar(f); }
  resumenIntegraciones() { return this.integraciones.resumen(); }

  async obtenerIntegracion(id) {
    const i = await this.integraciones.obtener(id);
    if (!i) throw noEncontrado("la integración");
    return i;
  }

  async #validarRelaciones(d) {
    const prov = await this.entidades.obtener(d.proveedor_id);
    if (!prov || prov.tipo !== "proveedor") throw new HttpError(400, "Revisa los datos", { proveedor_id: "Proveedor no válido" });
    if (d.almacen_id) {
      const alm = await this.entidades.obtener(d.almacen_id);
      if (!alm || alm.tipo !== "almacen") throw new HttpError(400, "Revisa los datos", { almacen_id: "Almacén no válido" });
    }
  }

  async crearIntegracion(d, usuarioId, ip) {
    await this.#validarRelaciones(d);
    const { id } = await this.integraciones.crear(d, usuarioId);
    await this.auditoria.registrar({ usuarioId, accion: "INTEGRACION_CREADA", entidad: "integraciones", entidadId: id, ip });
    return this.obtenerIntegracion(id);
  }

  async actualizarIntegracion(id, d, usuarioId, ip) {
    await this.#validarRelaciones(d);
    const antes = await this.obtenerIntegracion(id);
    await this.integraciones.actualizar(id, d);
    if (antes.estado !== d.estado) {
      await this.seguimientos.crear({ recurso: "integracion", recursoId: id, usuarioId, comentario: `Estado cambiado de "${antes.estado}" a "${d.estado}"`, estadoNuevo: d.estado });
    }
    await this.auditoria.registrar({ usuarioId, accion: "INTEGRACION_EDITADA", entidad: "integraciones", entidadId: id, ip });
    return this.obtenerIntegracion(id);
  }

  async marcarCheck(id, { campo, valor }, usuarioId, ip) {
    const r = await this.integraciones.marcar(id, campo, valor);
    if (!r) throw noEncontrado("la integración");
    await this.auditoria.registrar({ usuarioId, accion: "CHECKLIST", entidad: "integraciones", entidadId: id, ip, detalle: { campo, valor } });
    return r;
  }

  async eliminarIntegracion(id, usuarioId, ip) {
    if (!(await this.integraciones.eliminar(id))) throw noEncontrado("la integración");
    await this.seguimientos.eliminarDe("integracion", id);
    await this.auditoria.registrar({ usuarioId, accion: "INTEGRACION_ELIMINADA", entidad: "integraciones", entidadId: id, ip });
  }

  // ------------------------------------------------------------- Observaciones
  listarObservaciones(f) { return this.observaciones.listar(f); }

  async crearObservacion(d, usuarioId, ip) {
    const o = await this.observaciones.crear(d, usuarioId);
    await this.auditoria.registrar({ usuarioId, accion: "OBSERVACION_CREADA", entidad: "observaciones", entidadId: o.id, ip });
    return o;
  }

  async actualizarObservacion(id, d, usuarioId, ip) {
    const antes = await this.observaciones.obtener(id);
    if (!antes) throw noEncontrado("la observación");
    const o = await this.observaciones.actualizar(id, d);
    if (antes.estado !== d.estado) {
      await this.seguimientos.crear({ recurso: "observacion", recursoId: id, usuarioId, comentario: `Estado cambiado de "${antes.estado}" a "${d.estado}"`, estadoNuevo: d.estado });
    }
    await this.auditoria.registrar({ usuarioId, accion: "OBSERVACION_EDITADA", entidad: "observaciones", entidadId: id, ip });
    return o;
  }

  async eliminarObservacion(id, usuarioId, ip) {
    if (!(await this.observaciones.eliminar(id))) throw noEncontrado("la observación");
    await this.seguimientos.eliminarDe("observacion", id);
    await this.auditoria.registrar({ usuarioId, accion: "OBSERVACION_ELIMINADA", entidad: "observaciones", entidadId: id, ip });
  }

  // ------------------------------------------------------------- Seguimiento
  async #existe(recurso, id) {
    const dao = { integracion: this.integraciones, entidad: this.entidades, observacion: this.observaciones }[recurso];
    return Boolean(await dao.obtener(id));
  }

  async listarSeguimiento(recurso, id) {
    if (!(await this.#existe(recurso, id))) throw noEncontrado("el registro");
    return this.seguimientos.listar(recurso, id);
  }

  /** Agrega un comentario y, si se indica, cambia el estado del registro. */
  async comentar(recurso, id, { comentario, estado }, usuarioId, ip) {
    if (!(await this.#existe(recurso, id))) throw noEncontrado("el registro");
    let estadoNuevo = null;
    if (estado) {
      if (recurso === "integracion" && ESTADOS_INT.includes(estado)) estadoNuevo = (await this.integraciones.cambiarEstado(id, estado)).estado;
      else if (recurso === "observacion" && ESTADOS_OBS.includes(estado)) estadoNuevo = (await this.observaciones.cambiarEstado(id, estado)).estado;
      else throw new HttpError(400, "Revisa los datos", { estado: "Estado no válido para este registro" });
    }
    const s = await this.seguimientos.crear({ recurso, recursoId: id, usuarioId, comentario, estadoNuevo });
    await this.auditoria.registrar({ usuarioId, accion: "SEGUIMIENTO", entidad: recurso, entidadId: id, ip, detalle: estadoNuevo ? { estado: estadoNuevo } : null });
    return s;
  }

  actividadReciente() { return this.seguimientos.recientes(30); }
}

module.exports = NegocioService;
