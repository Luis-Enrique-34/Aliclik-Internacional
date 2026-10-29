// =====================================================================
//  Inicializa la base de datos:  npm run db:init
//  Ejecuta database/schema.sql en la base de datos de DATABASE_URL
//  (Supabase o PostgreSQL local). Funciona en Windows, Mac y Linux.
//
//  En Supabase la base de datos ya existe (se llama "postgres"), así que
//  solo se crean las tablas. En un PostgreSQL local, si la base no existe,
//  se crea primero.
// =====================================================================
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { buildDbConfig } = require("../src/config/dbConfig");
const { explicarErrorDb } = require("../src/utils/dbErrors");

async function conectar(url) {
  const { info, ...config } = buildDbConfig(url);
  const client = new Client(config);
  await client.connect();
  return { client, info };
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url || /\[YOUR-PASSWORD\]|TU_CONTRASEÑA/i.test(url)) {
    console.error("❌ Configura DATABASE_URL en el archivo .env (con tu contraseña real, sin corchetes).");
    process.exit(1);
  }

  const { info } = buildDbConfig(url);
  console.log(`🔌 Conectando a ${info.host}:${info.port} (base "${info.database}", usuario "${info.user}")...`);

  let client;
  try {
    ({ client } = await conectar(url));
  } catch (err) {
    // Solo en local: si la base no existe, la creamos
    if (info.esLocal && err.code === "3D000") {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(info.database)) throw err;
      const adminUrl = new URL(url);
      adminUrl.pathname = "/postgres";
      const { client: admin } = await conectar(adminUrl.toString());
      await admin.query(`CREATE DATABASE "${info.database}"`);
      await admin.end();
      console.log(`✅ Base de datos local "${info.database}" creada`);
      ({ client } = await conectar(url));
    } else {
      console.error("❌ No se pudo conectar:", err.message);
      explicarErrorDb(err, info).forEach((l) => console.error("   " + l));
      process.exit(1);
    }
  }

  const { rows: v } = await client.query("SHOW server_version");
  console.log(`✅ Conectado (PostgreSQL ${v[0].server_version}${info.esSupabase ? " en Supabase" : ""})`);

  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await client.query(sql);

  const { rows } = await client.query(`
    SELECT c.relname AS tabla, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY 1`);
  await client.end();

  console.log("✅ Esquema aplicado. Tablas en 'public':");
  rows.forEach((r) => console.log(`   • ${r.tabla}  (RLS ${r.rls ? "activado 🔒" : "desactivado"})`));
  console.log("👉 Siguiente paso:  npm run db:seed  (datos del Excel)  y luego  npm run dev");
})().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
