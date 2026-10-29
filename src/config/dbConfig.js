// =====================================================================
//  Construye la configuración de conexión a PostgreSQL a partir de
//  DATABASE_URL. Funciona tanto con Supabase (nube) como con un
//  PostgreSQL local. Lo usan src/config/database.js, database/*.js y scripts/.
// =====================================================================
const fs = require("fs");
const path = require("path");

const HOSTS_LOCALES = ["localhost", "127.0.0.1", "::1"];

function buildDbConfig(databaseUrl, { max = 5 } = {}) {
  const url = new URL(databaseUrl);

  // Quitamos parámetros sslmode/sslrootcert de la URL: si se dejan, la
  // librería "pg" los prioriza sobre nuestra configuración y puede fallar
  // con "self-signed certificate in certificate chain".
  for (const p of ["sslmode", "sslrootcert", "sslcert", "sslkey", "pgbouncer"]) {
    url.searchParams.delete(p);
  }

  const esLocal = HOSTS_LOCALES.includes(url.hostname);
  let ssl = false;

  if (!esLocal) {
    // Supabase (y cualquier BD en la nube) EXIGE conexión cifrada (SSL/TLS).
    const caPath = process.env.DATABASE_SSL_CA;
    if (caPath) {
      // Opción más segura: verificar la identidad del servidor con el
      // certificado raíz que se descarga desde Supabase (Database Settings).
      ssl = {
        ca: fs.readFileSync(path.resolve(caPath), "utf8"),
        rejectUnauthorized: true,
      };
    } else {
      // Opción por defecto: la conexión VA CIFRADA, pero no se verifica el
      // certificado (Supabase usa su propia autoridad certificadora).
      ssl = { rejectUnauthorized: false };
    }
  }

  return {
    connectionString: url.toString(),
    ssl,
    max, // Supabase (plan gratis) limita las conexiones: 5 es suficiente
    idleTimeoutMillis: 30_000, // cerrar conexiones inactivas tras 30 s
    connectionTimeoutMillis: 15_000, // error si no conecta en 15 s
    info: {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      esLocal,
      esSupabase: /supabase\.(co|com)$/.test(url.hostname),
      sslVerificado: Boolean(ssl && ssl.rejectUnauthorized),
    },
  };
}

module.exports = { buildDbConfig };
