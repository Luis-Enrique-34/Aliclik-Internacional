// =====================================================================
//  PUNTO DE ENTRADA local: verifica la base de datos, levanta el servidor
//  y sincroniza el calendario de Google cada N minutos.
//  (En Vercel no se usa este archivo: ver api/index.js y vercel.json)
// =====================================================================
const { PORT, SYNC_INTERVAL_MIN, GOOGLE, APP_URL } = require("./config/env");
const app = require("./app");
const db = require("./config/database");
const logger = require("./utils/logger");
const { explicarErrorDb } = require("./utils/dbErrors");
const { calendarioService } = require("./services");

(async () => {
  try {
    await db.query("SELECT 1");
    logger.info(`✅ Conectado a ${db.info.esSupabase ? "Supabase" : "PostgreSQL"} (${db.info.host})`);
    const { rows } = await db.query("SELECT to_regclass('public.pedidos') AS t, (SELECT count(*) FROM pg_tables WHERE schemaname='public')::int AS n");
    if (!rows[0].t) logger.warn("⚠️  Faltan tablas. Ejecuta: npm run db:init");
  } catch (err) {
    logger.error(`❌ No se pudo conectar a la base de datos: ${err.message}`);
    explicarErrorDb(err, db.info).forEach((l) => console.error("   " + l));
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Aliclik Internacional en ${APP_URL}`);
    logger.info(GOOGLE.habilitado
      ? `📅 Google Calendar habilitado · sincronización cada ${SYNC_INTERVAL_MIN} min${GOOGLE.webhookUrl ? " + avisos en tiempo real" : ""}`
      : "📅 Google Calendar deshabilitado (faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env)");
  });

  const intervalo = GOOGLE.habilitado
    ? setInterval(() => calendarioService.sincronizarTodos().catch((e) => logger.warn("Sync programada falló", { error: e.message })), SYNC_INTERVAL_MIN * 60000)
    : null;

  const cerrar = (senal) => {
    logger.info(`Recibido ${senal}, cerrando...`);
    if (intervalo) clearInterval(intervalo);
    server.close(() => db.pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
})();
