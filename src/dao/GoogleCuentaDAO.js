// DAO de la conexión con Google Calendar (los tokens llegan YA cifrados).
const BaseDAO = require("./BaseDAO");

class GoogleCuentaDAO extends BaseDAO {
  obtener(usuarioId) {
    return this.uno("SELECT * FROM google_cuentas WHERE usuario_id = $1", [usuarioId]);
  }

  guardar(usuarioId, d) {
    return this.uno(
      `INSERT INTO google_cuentas (usuario_id, google_email, refresh_token_cif, access_token_cif, access_expira)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (usuario_id) DO UPDATE SET google_email = EXCLUDED.google_email,
              refresh_token_cif = EXCLUDED.refresh_token_cif, access_token_cif = EXCLUDED.access_token_cif,
              access_expira = EXCLUDED.access_expira, sync_token = NULL, ultimo_error = NULL, conectado_en = now()
       RETURNING usuario_id`,
      [usuarioId, d.googleEmail || null, d.refreshCif, d.accessCif || null, d.accessExpira || null]
    );
  }

  /** Actualiza solo los campos indicados (lista blanca). */
  actualizar(usuarioId, campos) {
    const permitidos = ["access_token_cif", "access_expira", "sync_token", "canal_id", "canal_recurso_id",
      "canal_token_hash", "canal_expira", "ultima_sync", "ultimo_error"];
    const claves = Object.keys(campos).filter((k) => permitidos.includes(k));
    if (!claves.length) return Promise.resolve(false);
    const set = claves.map((k, i) => `${k} = $${i + 2}`).join(", ");
    return this.afecta(`UPDATE google_cuentas SET ${set} WHERE usuario_id = $1`, [usuarioId, ...claves.map((k) => campos[k])]);
  }

  porCanal(canalId) {
    return this.uno("SELECT * FROM google_cuentas WHERE canal_id = $1", [canalId]);
  }

  todas() {
    return this.varios(
      `SELECT g.* FROM google_cuentas g JOIN usuarios u ON u.id = g.usuario_id WHERE u.estado = 'activo'`
    );
  }

  eliminar(usuarioId) {
    return this.afecta("DELETE FROM google_cuentas WHERE usuario_id = $1", [usuarioId]);
  }
}

module.exports = GoogleCuentaDAO;
