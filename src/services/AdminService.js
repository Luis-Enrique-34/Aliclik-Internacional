// =====================================================================
//  SERVICIO de administración de usuarios y auditoría.
// =====================================================================
const { HttpError, noEncontrado } = require("../utils/HttpError");
const cacheSesion = require("../utils/cacheSesion");

class AdminService {
  constructor({ usuarioDAO, auditoriaDAO }) {
    this.usuarios = usuarioDAO;
    this.auditoria = auditoriaDAO;
  }

  listarUsuarios() {
    return this.usuarios.listar();
  }

  async actualizarAcceso(adminId, id, { rol, estado }, ip) {
    if (adminId === id) throw new HttpError(400, "No puedes cambiar tu propio rol o estado");
    const actual = await this.usuarios.buscarPorId(id);
    if (!actual) throw noEncontrado("el usuario");
    const dejaDeSerAdmin = actual.rol === "admin" && ((rol && rol !== "admin") || (estado && estado !== "activo"));
    if (dejaDeSerAdmin && (await this.usuarios.contarAdminsActivos(id)) === 0) {
      throw new HttpError(409, "Debe quedar al menos un administrador activo");
    }
    const u = await this.usuarios.actualizarAcceso(id, { rol, estado });
    cacheSesion.invalidar(id); // la revocación aplica de inmediato
    await this.auditoria.registrar({
      usuarioId: adminId, accion: "CAMBIO_ACCESO", entidad: "usuarios", entidadId: id, ip,
      detalle: { antes: { rol: actual.rol, estado: actual.estado }, despues: { rol: u.rol, estado: u.estado } },
    });
    return u;
  }

  async desbloquear(adminId, id, ip) {
    if (!(await this.usuarios.desbloquear(id))) throw noEncontrado("el usuario");
    await this.auditoria.registrar({ usuarioId: adminId, accion: "DESBLOQUEO", entidad: "usuarios", entidadId: id, ip });
  }

  auditoriaListar(filtros) {
    return this.auditoria.listar(filtros);
  }
}

module.exports = AdminService;
