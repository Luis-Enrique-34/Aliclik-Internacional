// DAO de la bitácora de seguimiento (comentarios y cambios de estado).
const BaseDAO = require("./BaseDAO");

class SeguimientoDAO extends BaseDAO {
  listar(recurso, recursoId) {
    return this.varios(
      `SELECT s.id, s.comentario, s.estado_nuevo, s.creado_en, s.usuario_id,
              u.nombres || ' ' || u.apellidos AS usuario
         FROM seguimientos s LEFT JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.recurso = $1 AND s.recurso_id = $2
        ORDER BY s.creado_en DESC LIMIT 300`,
      [recurso, recursoId]
    );
  }

  crear({ recurso, recursoId, usuarioId, comentario, estadoNuevo }) {
    return this.uno(
      `INSERT INTO seguimientos (recurso, recurso_id, usuario_id, comentario, estado_nuevo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [recurso, recursoId, usuarioId, comentario, estadoNuevo || null]
    );
  }

  /** Últimos comentarios de todo el equipo (para el inicio). */
  recientes(limite = 12) {
    return this.varios(
      `SELECT s.id, s.recurso, s.recurso_id, s.comentario, s.estado_nuevo, s.creado_en,
              u.nombres || ' ' || u.apellidos AS usuario,
              COALESCE(pr.nombre, e.nombre, '#' || o.numero || ' ' || left(o.descripcion, 60)) AS objetivo
         FROM seguimientos s
         LEFT JOIN usuarios u ON u.id = s.usuario_id
         LEFT JOIN integraciones i ON s.recurso = 'integracion' AND i.id = s.recurso_id
         LEFT JOIN entidades pr ON pr.id = i.proveedor_id
         LEFT JOIN entidades e ON s.recurso = 'entidad' AND e.id = s.recurso_id
         LEFT JOIN observaciones o ON s.recurso = 'observacion' AND o.id = s.recurso_id
        ORDER BY s.creado_en DESC LIMIT $1`,
      [limite]
    );
  }

  eliminarDe(recurso, recursoId) {
    return this.query("DELETE FROM seguimientos WHERE recurso = $1 AND recurso_id = $2", [recurso, recursoId]);
  }
}

module.exports = SeguimientoDAO;
