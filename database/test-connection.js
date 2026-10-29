// Prueba la conexión con la base de datos:  npm run db:test
require("dotenv").config({ quiet: true });
const { Client } = require("pg");
const { buildDbConfig } = require("../src/config/dbConfig");
const { explicarErrorDb } = require("../src/utils/dbErrors");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("❌ Falta DATABASE_URL en .env");
    process.exit(1);
  }
  const { info, ...config } = buildDbConfig(process.env.DATABASE_URL);
  console.log(`🔌 Probando ${info.host}:${info.port} (usuario ${info.user})...`);
  const c = new Client(config);
  try {
    await c.connect();
    const { rows } = await c.query("SELECT version() AS v, now() AS ahora");
    console.log(`✅ Conexión correcta${info.esSupabase ? " con Supabase" : ""}`);
    console.log(`   ${rows[0].v.split(",")[0]} · hora del servidor ${rows[0].ahora.toISOString()}`);
    console.log(`   SSL: ${config.ssl ? (info.sslVerificado ? "cifrado y verificado 🔒" : "cifrado") : "sin SSL (local)"}`);
  } catch (err) {
    console.error("❌", err.message);
    explicarErrorDb(err, info).forEach((l) => console.error("   " + l));
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
