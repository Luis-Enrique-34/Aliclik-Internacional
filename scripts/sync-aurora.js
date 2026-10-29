// =====================================================================
//  SINCRONIZACIÓN AUTOMÁTICA Aurora → Plataforma (sin CSV)
//
//    npm run sync:aurora                 una vez
//    npm run sync:aurora -- --cada 30    cada 30 minutos (deja la ventana abierta)
//    npm run sync:aurora -- --desde 2026-01-01   re-sincroniza TODO desde esa fecha
//                                                 (actualiza estados de pedidos ya cargados)
//
//  Ejecuta database/aurora/pedidos_internacional.sql contra Aurora con un
//  usuario de SOLO LECTURA y hace el mismo UPSERT que la carga de CSV.
//  Requiere en .env: AURORA_HOST, AURORA_USER, AURORA_PASSWORD, AURORA_DATABASE
//  (opcionales: AURORA_PORT, AURORA_SSL, AURORA_SSL_CA, AURORA_DIAS, AURORA_INICIO).
//  Solo trae pedidos de tiendas registradas fuera de Perú (stores.country_id <> 1)
//  creados desde AURORA_INICIO (por defecto 2026-10-01 00:00:00).
//  Puede programarse con el Programador de tareas de Windows o un cron.
// =====================================================================
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");

const env = (k) => process.env[`AURORA_${k}`];

const faltan = ["HOST", "USER", "PASSWORD", "DATABASE"].filter((k) => !env(k)).map((k) => `AURORA_${k}`);
if (faltan.length) {
  console.error(`❌ Faltan variables en .env: ${faltan.join(", ")}. Ver docs/SINCRONIZACION.md`);
  process.exit(1);
}

let mysql;
try {
  mysql = require("mysql2/promise");
} catch {
  console.error("❌ Falta la librería mysql2. Ejecuta: npm install mysql2");
  process.exit(1);
}

const { cargaService } = require("../src/services");
const CargaService = require("../src/services/CargaService");
const db = require("../src/config/database");

const SQL = fs.readFileSync(path.join(__dirname, "..", "database", "aurora", "pedidos_internacional.sql"), "utf8");
const CONSULTA = SQL.split("-- ====== CONSULTA ======")[1];

// --desde AAAA-MM-DD: ventana fija (para refrescar todos los pedidos ya cargados)
const iDesde = process.argv.indexOf("--desde");
const DESDE = iDesde > -1 ? String(process.argv[iDesde + 1] || "") : "";
if (DESDE && (!/^\d{4}-\d{2}-\d{2}$/.test(DESDE) || Number.isNaN(Date.parse(DESDE)))) {
  console.error("❌ --desde debe tener el formato AAAA-MM-DD, por ejemplo: --desde 2026-01-01");
  process.exit(1);
}
const DIAS = Math.min(Math.max(Number(env("DIAS")) || 45, 1), 365);
// AURORA_INICIO: nunca se traen pedidos creados antes de esta fecha (hora de Aurora, UTC)
const INICIO = String(env("INICIO") || "2026-10-01 00:00:00").trim();
if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(INICIO) || Number.isNaN(Date.parse(INICIO.replace(" ", "T")))) {
  console.error("❌ AURORA_INICIO debe tener el formato AAAA-MM-DD o AAAA-MM-DD HH:MM:SS, por ejemplo: 2026-10-01 00:00:00");
  process.exit(1);
}
const VENTANA = DESDE ? `desde ${DESDE}` : `${DIAS} días`;

function ssl() {
  if (env("SSL_CA")) {
    return { ca: fs.readFileSync(path.resolve(env("SSL_CA")), "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true }; // Aurora usa certificados de AWS: se verifican con las CA del sistema
}

async function ejecutar() {
  const inicio = Date.now();
  const conn = await mysql.createConnection({
    host: env("HOST"),
    port: Number(env("PORT")) || 3306,
    user: env("USER"),
    password: env("PASSWORD"),
    database: env("DATABASE"),
    ssl: env("SSL") === "false" ? undefined : ssl(),
    connectTimeout: 20000,
    charset: "utf8mb4",
    dateStrings: true,        // las fechas llegan como texto, igual que en el CSV
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false, // nunca varias sentencias en una llamada
  });
  try {
    await conn.query("SET SESSION TRANSACTION READ ONLY");
    await conn.query("SET @inicio = CAST(? AS DATETIME)", [INICIO.length === 10 ? `${INICIO} 00:00:00` : INICIO]);
    if (DESDE) {
      await conn.query("SET @desde = GREATEST(CAST(? AS DATETIME), @inicio)", [`${DESDE} 00:00:00`]);
    } else {
      await conn.query("SET @dias = ?", [DIAS]);
      await conn.query("SET @desde = GREATEST(DATE_SUB(UTC_TIMESTAMP(), INTERVAL @dias DAY), @inicio)");
    }
    const [filas] = await conn.query({ sql: CONSULTA, timeout: 120000 });
    const texto = filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v == null ? "" : String(v)])));
    const { mapa, faltan: cols } = CargaService.mapearColumnas(Object.keys(texto[0] || {}));
    if (cols.length && texto.length) throw new Error(`La consulta no devolvió las columnas: ${cols.join(", ")}`);
    if (!texto.length) {
      console.log(`ℹ️  ${new Date().toLocaleString("es-PE")} · Aurora no devolvió pedidos (${VENTANA})`);
      return;
    }
    const r = await cargaService.procesar({ filas: texto, mapa, origen: "sync", archivo: `aurora (${VENTANA})` });
    console.log(`✅ ${new Date().toLocaleString("es-PE")} · Aurora · ${texto.length} pedidos · ${r.insertadas} nuevos · ${r.actualizadas} actualizados · ${r.sin_cambios} sin cambios · ${r.rechazadas} rechazados · ${Date.now() - inicio} ms`);
    if (r.errores?.length) console.log("   Primeros rechazos:", r.errores.slice(0, 5).map((e) => `fila ${e.fila}: ${e.error}`).join(" | "));
  } finally {
    await conn.end().catch(() => {});
  }
}

(async () => {
  const i = process.argv.indexOf("--cada");
  const minutos = i > -1 ? Math.max(5, Number(process.argv[i + 1]) || 30) : 0;
  const vuelta = () => ejecutar().catch((e) => console.error(`❌ ${new Date().toLocaleString("es-PE")} · ${e.message}`));
  await vuelta();
  if (!minutos) return db.pool.end();
  console.log(`⏱️  Siguiente sincronización cada ${minutos} min. Ctrl+C para detener.`);
  setInterval(vuelta, minutos * 60000);
})();
