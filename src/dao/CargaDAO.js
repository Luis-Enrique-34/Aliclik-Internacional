// DAO del historial de cargas de datos.
const BaseDAO = require("./BaseDAO");

class CargaDAO extends BaseDAO {
  crear(q, d) {
    return q(
      `INSERT INTO cargas (id, usuario_id, origen, archivo, huella, filas_total, insertadas, actualizadas, rechazadas,
              errores, fecha_desde, fecha_hasta, duracion_ms, sin_cambios)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [d.id, d.usuarioId || null, d.origen, d.archivo || null, d.huella || null, d.filasTotal, d.insertadas, d.actualizadas,
       d.rechazadas, d.errores?.length ? JSON.stringify(d.errores) : null, d.fechaDesde || null, d.fechaHasta || null, d.duracionMs, d.sinCambios || 0]
    ).then((r) => r.rows[0]);
  }

  listar(limite = 50) {
    return this.varios(
      `SELECT c.*, u.nombres || ' ' || u.apellidos AS usuario
         FROM cargas c LEFT JOIN usuarios u ON u.id = c.usuario_id
        ORDER BY c.creado_en DESC LIMIT $1`,
      [limite]
    );
  }

  ultima() {
    return this.uno("SELECT creado_en, origen, filas_total FROM cargas ORDER BY creado_en DESC LIMIT 1");
  }

  porHuella(huella) {
    return this.uno("SELECT id, creado_en FROM cargas WHERE huella = $1 ORDER BY creado_en DESC LIMIT 1", [huella]);
  }
}

module.exports = CargaDAO;
