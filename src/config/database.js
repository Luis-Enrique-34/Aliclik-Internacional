// =====================================================================
//  CONEXIÓN A POSTGRESQL (Supabase) — librería: pg
//  Expone solo query() y tx(): los DAO dependen de esta abstracción.
// =====================================================================
const { Pool, types } = require("pg");
const { DATABASE_URL, DB_POOL_MAX, IS_SERVERLESS } = require("./env");
const { buildDbConfig } = require("./dbConfig");
const logger = require("../utils/logger");

// DATE como texto "AAAA-MM-DD" (sin desfase de zona horaria) y NUMERIC como número
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // BIGINT (ids de Aurora < 2^53)

const { info, ...config } = buildDbConfig(DATABASE_URL, { max: IS_SERVERLESS ? 2 : DB_POOL_MAX });
const pool = new Pool({ ...config, statement_timeout: 30_000 });

pool.on("error", (err) => logger.warn("Error en una conexión del pool", { error: err.message }));

// IMPORTANTE: siempre consultas parametrizadas ($1, $2...) → evita inyección SQL
const query = (text, params) => pool.query(text, params);

/** Varias consultas en UNA transacción (todo o nada). */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn((text, params) => client.query(text, params));
    await client.query("COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, tx, pool, info };
