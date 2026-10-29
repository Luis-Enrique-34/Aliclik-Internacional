// DAO de acuerdos comerciales / trato especial (descuentos exclusivos, tarifas, beneficios).
const BaseDAO = require("./BaseDAO");

const CAMPOS = ["tipo", "titulo", "descripcion", "aplica_a", "valor", "moneda", "umbral_pedidos", "vigente_desde", "vigente_hasta", "estado"];
const SELECT = `
  SELECT a.*, e.nombre AS entidad_nombre, e.tipo AS entidad_tipo, e.aurora_id AS entidad_aurora_id, e.pais AS entidad_pais,
         e.segmento AS entidad_segmento, u.nombres || ' ' || u.apellidos AS creado_por_nombre
    FROM acuerdos a
    JOIN entidades e ON e.id = a.entidad_id
    LEFT JOIN usuarios u ON u.id = a.creado_por`;

class AcuerdoDAO extends BaseDAO {
  deEntidad(entidadId) {
    return this.varios(`${SELECT} WHERE a.entidad_id = $1 ORDER BY a.estado, a.umbral_pedidos NULLS FIRST, a.creado_en DESC`, [entidadId]);
  }

  /** Acuerdos activos de varias entidades a la vez (para el listado de seguimiento). */
  activosDe(entidadIds) {
    if (!entidadIds.length) return Promise.resolve([]);
    return this.varios(
      `SELECT a.id, a.entidad_id, a.tipo, a.titulo, a.valor, a.moneda, a.umbral_pedidos, a.vigente_desde, a.vigente_hasta, a.estado
         FROM acuerdos a WHERE a.entidad_id = ANY($1::uuid[]) AND a.estado = 'activo'`,
      [entidadIds]
    );
  }

  listar({ estado, tipoEntidad, q }) {
    return this.varios(
      `${SELECT}
        WHERE ($1::text IS NULL OR a.estado = $1)
          AND ($2::text IS NULL OR e.tipo = $2)
          AND ($3::text IS NULL OR e.nombre ILIKE '%' || $3 || '%' OR a.titulo ILIKE '%' || $3 || '%')
        ORDER BY (a.estado = 'activo') DESC, a.vigente_hasta NULLS LAST, e.nombre
        LIMIT 1000`,
      [estado || null, tipoEntidad || null, q || null]
    );
  }

  obtener(id) {
    return this.uno(`${SELECT} WHERE a.id = $1`, [id]);
  }

  crear(d, usuarioId) {
    return this.uno(
      `INSERT INTO acuerdos (entidad_id, ${CAMPOS.join(", ")}, creado_por)
       VALUES ($1, ${CAMPOS.map((_, i) => `$${i + 2}`).join(", ")}, $${CAMPOS.length + 2}) RETURNING id`,
      [d.entidad_id, ...CAMPOS.map((c) => d[c] ?? null), usuarioId]
    );
  }

  actualizar(id, d) {
    return this.uno(
      `UPDATE acuerdos SET ${CAMPOS.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING id`,
      [id, ...CAMPOS.map((c) => d[c] ?? null)]
    );
  }

  eliminar(id) {
    return this.uno("DELETE FROM acuerdos WHERE id = $1 RETURNING entidad_id", [id]);
  }
}

AcuerdoDAO.CAMPOS = CAMPOS;
module.exports = AcuerdoDAO;
