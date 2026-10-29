// =====================================================================
//  PATRÓN DAO (Data Access Object) — clase base
//
//  Todos los DAO heredan de BaseDAO. Reciben la conexión por constructor
//  (inyección de dependencias): en producción es el pool de PostgreSQL;
//  en una prueba podría ser una base simulada. Los servicios nunca
//  escriben SQL: solo llaman a métodos de un DAO.
//
//  Regla de oro: SIEMPRE consultas parametrizadas ($1, $2...). Nunca se
//  concatena texto del usuario dentro del SQL → evita la inyección SQL.
// =====================================================================
const database = require("../config/database");

class BaseDAO {
  /** @param {{query: Function, tx: Function}} [db] conexión (por defecto, el pool de la app) */
  constructor(db = database) {
    this.db = db;
  }

  /** Ejecuta una consulta parametrizada y devuelve el resultado completo. */
  query(sql, params = []) {
    return this.db.query(sql, params);
  }

  /** Devuelve todas las filas. */
  async varios(sql, params = []) {
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  /** Devuelve la primera fila o null. */
  async uno(sql, params = []) {
    const { rows } = await this.db.query(sql, params);
    return rows[0] || null;
  }

  /** Ejecuta un UPDATE/DELETE y devuelve true si afectó al menos una fila. */
  async afecta(sql, params = []) {
    const { rowCount } = await this.db.query(sql, params);
    return rowCount > 0;
  }

  /** Transacción: todo o nada (BEGIN / COMMIT / ROLLBACK). */
  tx(fn, contexto) {
    return this.db.tx(fn, contexto);
  }
}

module.exports = BaseDAO;
