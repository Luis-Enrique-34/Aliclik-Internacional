// DAO de la clasificación de estados de Aurora en grupos del tablero.
const BaseDAO = require("./BaseDAO");

class EstadoGrupoDAO extends BaseDAO {
  listar() {
    return this.varios(
      `SELECT eg.*, COALESCE(c.pedidos, 0)::int AS pedidos
         FROM estado_grupos eg
         LEFT JOIN (SELECT estado_codigo, count(*) AS pedidos FROM pedidos GROUP BY 1) c USING (estado_codigo)
        ORDER BY pedidos DESC, eg.estado_codigo`
    );
  }

  /** Registra estados nuevos con su grupo sugerido; NO pisa los corregidos a mano. */
  registrarLote(q, lista) {
    if (!lista.length) return Promise.resolve();
    return q(
      `INSERT INTO estado_grupos (estado_codigo, estado_label, grupo)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
       ON CONFLICT (estado_codigo) DO UPDATE
          SET estado_label = EXCLUDED.estado_label,
              grupo = CASE WHEN estado_grupos.manual THEN estado_grupos.grupo ELSE EXCLUDED.grupo END,
              actualizado_en = now()`,
      [lista.map((x) => x.codigo), lista.map((x) => x.label), lista.map((x) => x.grupo)]
    );
  }

  actualizar(codigo, grupo) {
    return this.uno(
      "UPDATE estado_grupos SET grupo = $2, manual = true, actualizado_en = now() WHERE estado_codigo = $1 RETURNING *",
      [codigo, grupo]
    );
  }
}

module.exports = EstadoGrupoDAO;
