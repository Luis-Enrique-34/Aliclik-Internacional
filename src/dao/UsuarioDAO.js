// DAO de usuarios: único lugar con SQL sobre la tabla "usuarios".
const BaseDAO = require("./BaseDAO");

const PUBLICO = `id, nombres, apellidos, email, cargo, rol, estado, version_sesion,
                 ultimo_login, bloqueado_hasta, intentos_fallidos, creado_en`;

class UsuarioDAO extends BaseDAO {
  crear({ nombres, apellidos, email, cargo, passwordHash, rol = "lector", estado = "pendiente" }) {
    return this.uno(
      `INSERT INTO usuarios (nombres, apellidos, email, cargo, password_hash, rol, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PUBLICO}`,
      [nombres, apellidos, email, cargo || null, passwordHash, rol, estado]
    );
  }

  buscarParaLogin(email) {
    return this.uno(`SELECT ${PUBLICO}, password_hash FROM usuarios WHERE lower(email) = lower($1)`, [email]);
  }

  buscarPorId(id) {
    return this.uno(`SELECT ${PUBLICO} FROM usuarios WHERE id = $1`, [id]);
  }

  hashDe(id) {
    return this.uno("SELECT password_hash FROM usuarios WHERE id = $1", [id]);
  }

  registrarFallo(id, intentos, bloquear, minutos) {
    return this.afecta(
      `UPDATE usuarios SET intentos_fallidos = $2,
              bloqueado_hasta = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE bloqueado_hasta END
        WHERE id = $1`,
      [id, bloquear ? 0 : intentos, bloquear, minutos]
    );
  }

  registrarLoginExitoso(id) {
    return this.afecta(
      "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = now() WHERE id = $1",
      [id]
    );
  }

  /** Cambia el hash y (si se pide) invalida todas las sesiones abiertas. */
  actualizarHash(id, hash, { revocar = false } = {}) {
    return this.uno(
      `UPDATE usuarios SET password_hash = $2, password_cambiada = now(),
              version_sesion = version_sesion + CASE WHEN $3 THEN 1 ELSE 0 END
        WHERE id = $1 RETURNING version_sesion`,
      [id, hash, revocar]
    );
  }

  actualizarPerfil(id, { nombres, apellidos, cargo }) {
    return this.uno(
      `UPDATE usuarios SET nombres = $2, apellidos = $3, cargo = $4 WHERE id = $1 RETURNING ${PUBLICO}`,
      [id, nombres, apellidos, cargo || null]
    );
  }

  listar() {
    return this.varios(`SELECT ${PUBLICO} FROM usuarios ORDER BY (estado = 'pendiente') DESC, creado_en DESC`);
  }

  /** Cambio de rol/estado por un admin: también revoca las sesiones del usuario. */
  actualizarAcceso(id, { rol, estado }) {
    return this.uno(
      `UPDATE usuarios SET rol = COALESCE($2, rol), estado = COALESCE($3, estado),
              version_sesion = version_sesion + 1
        WHERE id = $1 RETURNING ${PUBLICO}`,
      [id, rol || null, estado || null]
    );
  }

  desbloquear(id) {
    return this.afecta("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1", [id]);
  }

  async contarAdminsActivos(excluirId = null) {
    const r = await this.uno(
      "SELECT count(*)::int AS n FROM usuarios WHERE rol = 'admin' AND estado = 'activo' AND id IS DISTINCT FROM $1",
      [excluirId]
    );
    return r.n;
  }

  async contar() {
    return (await this.uno("SELECT count(*)::int AS n FROM usuarios")).n;
  }

  correosActivos() {
    return this.varios("SELECT id, nombres, apellidos, email FROM usuarios WHERE estado = 'activo' ORDER BY nombres");
  }
}

module.exports = UsuarioDAO;
