// DAO de entidades del ecosistema: tiendas, proveedores, almacenes y couriers.
const BaseDAO = require("./BaseDAO");

class EntidadDAO extends BaseDAO {
  actualizarPlan(id, { segmento, meta_pedidos_mes, responsable_id, condiciones }) {
    return this.uno(
      `UPDATE entidades SET segmento = $2, meta_pedidos_mes = $3, responsable_id = $4, condiciones = $5
        WHERE id = $1 RETURNING id, segmento, meta_pedidos_mes`,
      [id, segmento, meta_pedidos_mes ?? null, responsable_id || null, condiciones || null]
    );
  }

  obtener(id) {
    return this.uno(
      `SELECT e.*, pa.nombre AS pais_nombre FROM entidades e LEFT JOIN paises pa ON pa.codigo = e.pais WHERE e.id = $1`,
      [id]
    );
  }

  opciones(tipo) {
    return this.varios(
      "SELECT id, aurora_id, nombre, pais FROM entidades WHERE tipo = $1 AND activo ORDER BY nombre LIMIT 2000",
      [tipo]
    );
  }

  crear(d) {
    return this.uno(
      `INSERT INTO entidades (tipo, aurora_id, nombre, pais, contacto, telefono, correo, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [d.tipo, d.aurora_id ?? null, d.nombre, d.pais || null, d.contacto || null, d.telefono || null, d.correo || null, d.notas || null]
    );
  }

  actualizar(id, d) {
    return this.uno(
      `UPDATE entidades SET aurora_id = $2, nombre = $3, pais = $4, contacto = $5, telefono = $6,
              correo = $7, notas = $8, activo = $9
        WHERE id = $1 RETURNING *`,
      [id, d.aurora_id ?? null, d.nombre, d.pais || null, d.contacto || null, d.telefono || null, d.correo || null, d.notas || null, d.activo ?? true]
    );
  }

  /** Busca por id de Aurora o, si no tiene, por nombre. */
  buscar(q, tipo, { auroraId, nombre }) {
    return q(
      `SELECT id FROM entidades WHERE tipo = $1 AND (($2::bigint IS NOT NULL AND aurora_id = $2)
              OR ($2::bigint IS NULL AND aurora_id IS NULL AND lower(nombre) = lower($3))) LIMIT 1`,
      [tipo, auroraId ?? null, nombre]
    ).then((r) => r.rows[0] || null);
  }

  /**
   * Registra/actualiza en bloque las entidades que aparecen en una carga.
   * El nombre y país vienen de Aurora (fuente de verdad); contacto y notas no se tocan.
   */
  async sincronizarLote(q, tipo, lista) {
    if (!lista.length) return 0;
    const ids = lista.map((x) => x.aurora_id);
    const nombres = lista.map((x) => x.nombre || `${tipo} ${x.aurora_id}`);
    const paises = lista.map((x) => x.pais || null);
    // 1) Vincula entidades creadas a mano (sin id de Aurora) que tengan el mismo nombre
    await q(
      `UPDATE entidades e SET aurora_id = t.id
         FROM unnest($2::bigint[], $3::text[]) AS t(id, nombre)
        WHERE e.tipo = $1 AND e.aurora_id IS NULL AND lower(e.nombre) = lower(t.nombre)
          AND NOT EXISTS (SELECT 1 FROM entidades x WHERE x.tipo = $1 AND x.aurora_id = t.id)`,
      [tipo, ids, nombres]
    );
    // 2) Inserta las nuevas y actualiza el nombre de las existentes
    const { rowCount } = await q(
      `INSERT INTO entidades (tipo, aurora_id, nombre, pais)
       SELECT $1, t.id, t.nombre, t.pais FROM unnest($2::bigint[], $3::text[], $4::text[]) AS t(id, nombre, pais)
       ON CONFLICT (tipo, aurora_id) WHERE aurora_id IS NOT NULL
       DO UPDATE SET nombre = EXCLUDED.nombre, pais = COALESCE(entidades.pais, EXCLUDED.pais)
       WHERE entidades.nombre IS DISTINCT FROM EXCLUDED.nombre OR entidades.pais IS NULL`,
      [tipo, ids, nombres, paises]
    );
    return rowCount;
  }
}

module.exports = EntidadDAO;
