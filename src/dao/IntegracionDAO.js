// DAO de integraciones (proveedor + almacén + país con checklist de puesta en marcha).
const BaseDAO = require("./BaseDAO");

const CHECKS = ["grupo_wsp", "conf_sistemas", "capacitacion", "catalogo", "despacho", "liquidaciones"];

const SELECT = `
  SELECT i.*, pa.nombre AS pais_nombre,
         pr.nombre AS proveedor_nombre, pr.aurora_id AS proveedor_aurora_id,
         COALESCE(al.nombre, i.almacen_texto) AS almacen_nombre, al.aurora_id AS almacen_aurora_id,
         u.nombres || ' ' || u.apellidos AS responsable,
         (SELECT count(*) FROM pedidos p WHERE pr.aurora_id IS NOT NULL AND p.proveedor_id = pr.aurora_id
             AND p.pais = i.pais AND p.fecha_pedido >= now() - interval '30 days')::int AS pedidos_30d,
         s.comentario AS ultimo_seguimiento, s.creado_en AS ultimo_seguimiento_en
    FROM integraciones i
    JOIN entidades pr ON pr.id = i.proveedor_id
    LEFT JOIN entidades al ON al.id = i.almacen_id
    LEFT JOIN paises pa ON pa.codigo = i.pais
    LEFT JOIN usuarios u ON u.id = i.responsable_id
    LEFT JOIN LATERAL (SELECT comentario, creado_en FROM seguimientos
                        WHERE recurso = 'integracion' AND recurso_id = i.id
                        ORDER BY creado_en DESC LIMIT 1) s ON true`;

class IntegracionDAO extends BaseDAO {
  listar({ pais, estado, q }) {
    return this.varios(
      `${SELECT}
        WHERE ($1::char(2) IS NULL OR i.pais = $1)
          AND ($2::text IS NULL OR i.estado = $2)
          AND ($3::text IS NULL OR pr.nombre ILIKE '%' || $3 || '%' OR COALESCE(al.nombre, i.almacen_texto) ILIKE '%' || $3 || '%'
               OR i.contacto ILIKE '%' || $3 || '%')
        ORDER BY i.pais, pr.nombre`,
      [pais || null, estado || null, q || null]
    );
  }

  obtener(id) {
    return this.uno(`${SELECT} WHERE i.id = $1`, [id]);
  }

  /** Integraciones donde participa una entidad (como proveedor o como almacén). */
  deEntidad(entidadId) {
    return this.varios(`${SELECT} WHERE i.proveedor_id = $1 OR i.almacen_id = $1 ORDER BY i.pais`, [entidadId]);
  }

  resumen() {
    return this.varios(
      `SELECT i.pais, pa.nombre AS pais_nombre, count(*)::int AS total,
              count(*) FILTER (WHERE i.estado = 'integrado')::int AS integrados,
              count(*) FILTER (WHERE i.estado = 'en_proceso')::int AS en_proceso,
              count(*) FILTER (WHERE i.estado = 'pendiente')::int AS pendientes,
              round(avg(i.avance))::int AS avance_promedio
         FROM integraciones i JOIN paises pa ON pa.codigo = i.pais
        GROUP BY i.pais, pa.nombre ORDER BY total DESC`
    );
  }

  crear(d, usuarioId) {
    return this.uno(
      `INSERT INTO integraciones (pais, proveedor_id, almacen_id, almacen_texto, contacto, telefono, pendiente,
              horario_corte, usuario_alc, logo_url, comentario, ${CHECKS.join(", ")}, estado, responsable_id, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [d.pais, d.proveedor_id, d.almacen_id || null, d.almacen_texto || null, d.contacto || null, d.telefono || null,
       d.pendiente || null, d.horario_corte || null, d.usuario_alc || null, d.logo_url || null, d.comentario || null,
       ...CHECKS.map((c) => Boolean(d[c])), d.estado || "pendiente", d.responsable_id || null, usuarioId]
    );
  }

  actualizar(id, d) {
    return this.uno(
      `UPDATE integraciones SET pais = $2, proveedor_id = $3, almacen_id = $4, almacen_texto = $5, contacto = $6,
              telefono = $7, pendiente = $8, horario_corte = $9, usuario_alc = $10, logo_url = $11, comentario = $12,
              grupo_wsp = $13, conf_sistemas = $14, capacitacion = $15, catalogo = $16, despacho = $17,
              liquidaciones = $18, estado = $19, responsable_id = $20
        WHERE id = $1 RETURNING id, estado`,
      [id, d.pais, d.proveedor_id, d.almacen_id || null, d.almacen_texto || null, d.contacto || null, d.telefono || null,
       d.pendiente || null, d.horario_corte || null, d.usuario_alc || null, d.logo_url || null, d.comentario || null,
       ...CHECKS.map((c) => Boolean(d[c])), d.estado || "pendiente", d.responsable_id || null]
    );
  }

  /** Marca/desmarca un punto del checklist. `campo` viene de la lista blanca CHECKS. */
  marcar(id, campo, valor) {
    if (!CHECKS.includes(campo)) throw new Error("Campo no permitido");
    return this.uno(`UPDATE integraciones SET ${campo} = $2 WHERE id = $1 RETURNING id, avance`, [id, valor]);
  }

  cambiarEstado(id, estado) {
    return this.uno("UPDATE integraciones SET estado = $2 WHERE id = $1 RETURNING id, estado", [id, estado]);
  }

  eliminar(id) {
    return this.afecta("DELETE FROM integraciones WHERE id = $1", [id]);
  }
}

IntegracionDAO.CHECKS = CHECKS;
module.exports = IntegracionDAO;
