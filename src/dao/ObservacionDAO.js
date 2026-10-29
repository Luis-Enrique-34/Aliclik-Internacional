// DAO de observaciones de la plataforma (hallazgos por país/módulo).
const BaseDAO = require("./BaseDAO");

class ObservacionDAO extends BaseDAO {
  listar({ estado, pais }) {
    return this.varios(
      `SELECT o.*, pa.nombre AS pais_nombre, u.nombres || ' ' || u.apellidos AS responsable,
              (SELECT count(*) FROM seguimientos s WHERE s.recurso = 'observacion' AND s.recurso_id = o.id)::int AS comentarios
         FROM observaciones o
         LEFT JOIN paises pa ON pa.codigo = o.pais
         LEFT JOIN usuarios u ON u.id = o.responsable_id
        WHERE ($1::text IS NULL OR o.estado = $1) AND ($2::char(2) IS NULL OR o.pais = $2)
        ORDER BY (o.estado IN ('resuelta','descartada')), CASE o.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, o.numero`,
      [estado || null, pais || null]
    );
  }

  obtener(id) {
    return this.uno("SELECT * FROM observaciones WHERE id = $1", [id]);
  }

  crear(d, usuarioId) {
    return this.uno(
      `INSERT INTO observaciones (descripcion, pais, modulo, prioridad, estado, nota, responsable_id, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.descripcion, d.pais || null, d.modulo || null, d.prioridad || "media", d.estado || "abierta", d.nota || null, d.responsable_id || null, usuarioId]
    );
  }

  actualizar(id, d) {
    return this.uno(
      `UPDATE observaciones SET descripcion = $2, pais = $3, modulo = $4, prioridad = $5, estado = $6, nota = $7, responsable_id = $8
        WHERE id = $1 RETURNING *`,
      [id, d.descripcion, d.pais || null, d.modulo || null, d.prioridad || "media", d.estado || "abierta", d.nota || null, d.responsable_id || null]
    );
  }

  cambiarEstado(id, estado) {
    return this.uno("UPDATE observaciones SET estado = $2 WHERE id = $1 RETURNING id, estado", [id, estado]);
  }

  eliminar(id) {
    return this.afecta("DELETE FROM observaciones WHERE id = $1", [id]);
  }
}

module.exports = ObservacionDAO;
