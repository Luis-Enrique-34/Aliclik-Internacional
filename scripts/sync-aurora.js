// =====================================================================
//  SINCRONIZACIÓN AUTOMÁTICA Aurora → Plataforma (sin CSV)
//
//    npm run sync:aurora                 una vez
//    npm run sync:aurora -- --cada 30    cada 30 minutos (deja la ventana abierta)
//
//  Ejecuta database/aurora/pedidos_internacional.sql contra Aurora con un
//  usuario de SOLO LECTURA y hace el mismo UPSERT que la carga de CSV.
//  Requiere en .env: AURORA_HOST, AURORA_USER, AURORA_PASSWORD, AURORA_DATABASE
//  (opcionales: AURORA_PORT, AURORA_SSL_CA, AURORA_DIAS).
//  Puede programarse con el Programador de tareas de Windows o un cron.
// =====================================================================
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");

const faltan = ["AURORA_HOST", "AURORA_USER", "AURORA_PASSWORD", "AURORA_DATABASE"].filter((k) => !process.env[k]);
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
const DIAS = Math.min(Math.max(Number(process.env.AURORA_DIAS) || 45, 1), 365);

function ssl() {
  if (process.env.AURORA_SSL_CA) {
    return { ca: fs.readFileSync(path.resolve(process.env.AURORA_SSL_CA), "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true }; // Aurora usa certificados de AWS: se verifican con las CA del sistema
}

async function ejecutar() {
  const inicio = Date.now();
  const conn = await mysql.createConnection({
    host: process.env.AURORA_HOST,
    port: Number(process.env.AURORA_PORT) || 3306,
    user: process.env.AURORA_USER,
    password: process.env.AURORA_PASSWORD,
    database: process.env.AURORA_DATABASE,
    ssl: process.env.AURORA_SSL === "false" ? undefined : ssl(),
    connectTimeout: 20000,
    charset: "utf8mb4",
    dateStrings: true,        // las fechas llegan como texto, igual que en el CSV
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false, // nunca varias sentencias en una llamada
  });
  try {
    await conn.query("SET SESSION TRANSACTION READ ONLY");
    await conn.query("SET @dias = ?", [DIAS]);
    await conn.query("SET @desde = DATE_SUB(UTC_TIMESTAMP(), INTERVAL @dias DAY)");
    const [filas] = await conn.query({ sql: CONSULTA, timeout: 120000 });
    const texto = filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v == null ? "" : String(v)])));
    const { mapa, faltan: cols } = CargaService.mapearColumnas(Object.keys(texto[0] || {}));
    if (cols.length && texto.length) throw new Error(`La consulta no devolvió las columnas: ${cols.join(", ")}`);
    if (!texto.length) {
      console.log(`ℹ️  ${new Date().toLocaleString("es-PE")} · Aurora no devolvió pedidos en los últimos ${DIAS} días`);
      return;
    }
    const r = await cargaService.procesar({ filas: texto, mapa, origen: "sync", archivo: `aurora (${DIAS} días)` });
    console.log(`✅ ${new Date().toLocaleString("es-PE")} · ${texto.length} pedidos · ${r.insertadas} nuevos · ${r.actualizadas} actualizados · ${r.sin_cambios} sin cambios · ${r.rechazadas} rechazados · ${Date.now() - inicio} ms`);
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
