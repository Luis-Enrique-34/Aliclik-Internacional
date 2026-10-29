// DAO de auditoría: registro inalterable de acciones importantes.
const BaseDAO = require("./BaseDAO");

class AuditoriaDAO extends BaseDAO {
  registrar({ usuarioId = null, accion, entidad = null, entidadId = null, ip = null, detalle = null }) {
    return this.query(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, ip, detalle)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuarioId, accion, entidad, entidadId == null ? null : String(entidadId), ip, detalle]
    );
  }

  listar({ accion, usuarioId, limite = 200 } = {}) {
    return this.varios(
      `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.ip, a.detalle, a.creado_en,
              u.nombres || ' ' || u.apellidos AS usuario, u.email
         FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE ($1::text IS NULL OR a.accion = $1)
          AND ($2::uuid IS NULL OR a.usuario_id = $2)
        ORDER BY a.creado_en DESC LIMIT $3`,
      [accion || null, usuarioId || null, Math.min(limite, 1000)]
    );
  }

  acciones() {
    return this.varios("SELECT DISTINCT accion FROM auditoria ORDER BY 1");
  }
}

module.exports = AuditoriaDAO;
