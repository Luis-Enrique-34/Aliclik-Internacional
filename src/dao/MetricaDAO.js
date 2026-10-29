// =====================================================================
//  DAO de métricas de seguimiento por actor (tienda, proveedor, almacén,
//  courier). Cada consulta lee la tabla de pedidos UNA vez y agrupa con
//  FILTER, apoyándose en los índices (actor, fecha_pedido).
// =====================================================================
const BaseDAO = require("./BaseDAO");
const { ZONA_HORARIA } = require("../config/env");

// Lista blanca: el nombre de columna nunca viene del usuario
const COL = { tienda: "tienda_id", proveedor: "proveedor_id", almacen: "almacen_id", courier: "courier_id" };
const NOMBRE = { tienda: "tienda_nombre", proveedor: "proveedor_nombre", almacen: "almacen_nombre", courier: "courier_nombre" };

/** CTE con los límites de mes en hora local ($tz = último parámetro agregado). */
const LIMITES = (tz) => `
  lim AS (SELECT date_trunc('month', now() AT TIME ZONE ${tz}) AS mes_local),
  b AS (SELECT (mes_local AT TIME ZONE ${tz}) AS mes_ini,
               ((mes_local - interval '1 month') AT TIME ZONE ${tz}) AS ant_ini FROM lim)`;

const METRICAS = (col) => `
  SELECT p.${col} AS aid,
         count(*) FILTER (WHERE p.fecha_pedido >= b.mes_ini)::int AS mes_actual,
         count(*) FILTER (WHERE p.fecha_pedido >= b.ant_ini AND p.fecha_pedido < b.mes_ini)::int AS mes_anterior,
         count(*) FILTER (WHERE p.fecha_pedido >= now() - interval '30 days')::int AS u30,
         count(*) FILTER (WHERE p.fecha_pedido >= now() - interval '60 days' AND p.fecha_pedido < now() - interval '30 days')::int AS p30,
         count(*) FILTER (WHERE p.fecha_pedido >= now() - interval '30 days' AND eg.grupo = 'entregado')::int AS ent30,
         count(*) FILTER (WHERE p.fecha_pedido >= now() - interval '30 days' AND eg.grupo IN ('devuelto','cancelado'))::int AS perd30,
         count(*) FILTER (WHERE p.fecha_pedido >= now() - interval '30 days' AND eg.grupo IN ('pendiente','en_proceso','en_ruta'))::int AS curso30,
         COALESCE(sum(p.total) FILTER (WHERE p.fecha_pedido >= b.mes_ini), 0) AS monto_mes,
         max(p.fecha_pedido) AS ultimo_pedido
    FROM pedidos p CROSS JOIN b
    LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
   WHERE p.${col} IS NOT NULL AND p.fecha_pedido >= now() - interval '120 days'`;

class MetricaDAO extends BaseDAO {
  /**
   * Entidades de un tipo con su plan de seguimiento y métricas de pedidos.
   * @param {{tipo:string, pais?:string, q?:string, segmento?:string, id?:string}} f
   */
  entidadesConMetricas({ tipo, pais, q, segmento, id }) {
    const col = COL[tipo];
    if (!col) throw new Error("Tipo no permitido");
    return this.varios(
      `WITH ${LIMITES("$5")},
       m AS (${METRICAS(col)} GROUP BY 1)
       SELECT e.id, e.tipo, e.aurora_id, e.nombre, e.pais, e.contacto, e.telefono, e.correo, e.notas, e.activo,
              e.segmento, e.meta_pedidos_mes, e.responsable_id, e.condiciones, e.actualizado_en,
              pa.nombre AS pais_nombre, pa.moneda AS pais_moneda,
              u.nombres || ' ' || u.apellidos AS responsable,
              COALESCE(m.mes_actual, 0) AS mes_actual, COALESCE(m.mes_anterior, 0) AS mes_anterior,
              COALESCE(m.u30, 0) AS u30, COALESCE(m.p30, 0) AS p30, COALESCE(m.ent30, 0) AS ent30,
              COALESCE(m.perd30, 0) AS perd30, COALESCE(m.curso30, 0) AS curso30, COALESCE(m.monto_mes, 0) AS monto_mes,
              m.ultimo_pedido,
              s.comentario AS ultimo_seguimiento, s.creado_en AS ultimo_seguimiento_en
         FROM entidades e
         LEFT JOIN m ON m.aid = e.aurora_id
         LEFT JOIN paises pa ON pa.codigo = e.pais
         LEFT JOIN usuarios u ON u.id = e.responsable_id
         LEFT JOIN LATERAL (SELECT comentario, creado_en FROM seguimientos
                             WHERE recurso = 'entidad' AND recurso_id = e.id ORDER BY creado_en DESC LIMIT 1) s ON true
        WHERE e.tipo = $1
          AND ($2::char(2) IS NULL OR e.pais = $2)
          AND ($3::text IS NULL OR e.nombre ILIKE '%' || $3 || '%' OR e.aurora_id::text = $3)
          AND ($4::text IS NULL OR e.segmento = $4)
          AND ($6::uuid IS NULL OR e.id = $6)
        ORDER BY COALESCE(m.u30, 0) DESC, e.nombre
        LIMIT 1000`,
      [tipo, pais || null, q || null, segmento || null, ZONA_HORARIA, id || null]
    );
  }

  /** Pedidos por mes (últimos N meses, hora local) de un actor. */
  mensual(tipo, auroraId, meses = 12) {
    const col = COL[tipo];
    return this.varios(
      `WITH meses AS (
         SELECT generate_series(date_trunc('month', now() AT TIME ZONE $2) - make_interval(months => $3 - 1),
                                date_trunc('month', now() AT TIME ZONE $2), interval '1 month') AS mes
       ),
       datos AS (
         SELECT date_trunc('month', p.fecha_pedido AT TIME ZONE $2) AS mes,
                count(*)::int AS pedidos,
                count(*) FILTER (WHERE eg.grupo = 'entregado')::int AS entregados,
                count(*) FILTER (WHERE eg.grupo IN ('devuelto','cancelado'))::int AS perdidos
           FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
          WHERE p.${col} = $1
            AND p.fecha_pedido >= (date_trunc('month', now() AT TIME ZONE $2) - make_interval(months => $3 - 1)) AT TIME ZONE $2
          GROUP BY 1
       )
       SELECT to_char(meses.mes, 'YYYY-MM') AS mes, COALESCE(d.pedidos, 0) AS pedidos,
              COALESCE(d.entregados, 0) AS entregados, COALESCE(d.perdidos, 0) AS perdidos
         FROM meses LEFT JOIN datos d ON d.mes = meses.mes ORDER BY meses.mes`,
      [auroraId, ZONA_HORARIA, meses]
    );
  }

  /** Principales contrapartes en los últimos 90 días (ej. de una tienda: sus proveedores). */
  contrapartes(tipo, auroraId, otro, limite = 5) {
    if (!COL[tipo] || !COL[otro]) throw new Error("Tipo no permitido");
    return this.varios(
      `SELECT p.${COL[otro]} AS id, max(p.${NOMBRE[otro]}) AS nombre, count(*)::int AS pedidos,
              count(*) FILTER (WHERE eg.grupo = 'entregado')::int AS entregados
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        WHERE p.${COL[tipo]} = $1 AND p.${COL[otro]} IS NOT NULL AND p.fecha_pedido >= now() - interval '90 days'
        GROUP BY 1 ORDER BY 3 DESC LIMIT $2`,
      [auroraId, limite]
    );
  }
}

MetricaDAO.COL = COL;
module.exports = MetricaDAO;
