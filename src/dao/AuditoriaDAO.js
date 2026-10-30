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

  /** Listado con filtros. `grupo` = categoría de acciones (seguridad, accesos, cambios, cargas). */
  listar({ accion, usuarioId, grupo, desde, hasta, ip, q, orden = "desc", limite = 200 } = {}) {
    const GRUPOS = {
      seguridad: ["LOGIN", "LOGIN_FALLIDO", "CUENTA_BLOQUEADA", "REGISTRO", "REGISTRO_DUPLICADO", "CAMBIO_PASSWORD"],
      accesos: ["CAMBIO_ACCESO", "DESBLOQUEO", "GOOGLE_CONECTADO", "GOOGLE_DESCONECTADO"],
      cargas: ["CARGA_CSV", "SYNC_AURORA"],
    };
    const lista = grupo === "cambios" ? null : GRUPOS[grupo] || null;
    return this.varios(
      `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.ip, a.detalle, a.creado_en,
              u.nombres || ' ' || u.apellidos AS usuario, u.email
         FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE ($1::text IS NULL OR a.accion = $1)
          AND ($2::uuid IS NULL OR a.usuario_id = $2)
          AND ($4::text[] IS NULL OR a.accion = ANY($4))
          AND ($5::boolean IS NOT TRUE OR a.accion ~ '(CREAD|EDITAD|ELIMINAD|CHECKLIST|PLAN_|SEGUIMIENTO|EVENTO_)')
          AND ($6::date IS NULL OR a.creado_en >= ($6::date::timestamp AT TIME ZONE 'America/Lima'))
          AND ($7::date IS NULL OR a.creado_en < (($7::date + 1)::timestamp AT TIME ZONE 'America/Lima'))
          AND ($8::text IS NULL OR a.ip = $8)
          AND ($9::text IS NULL OR a.detalle::text ILIKE '%' || $9 || '%' OR a.entidad ILIKE '%' || $9 || '%' OR u.email ILIKE '%' || $9 || '%')
        ORDER BY a.creado_en ${orden === "asc" ? "ASC" : "DESC"} LIMIT $3`,
      [accion || null, usuarioId || null, Math.min(limite, 1000), lista, grupo === "cambios", desde || null, hasta || null, ip || null, q || null]
    );
  }

  acciones() {
    return this.varios("SELECT DISTINCT accion FROM auditoria ORDER BY 1");
  }
}

module.exports = AuditoriaDAO;
