// =====================================================================
//  Carga inicial desde el Excel "Aliclik Internacional.xlsx":
//    npm run db:seed
//  Lee database/privado/datos-excel.json (NO se sube a Git: contiene
//  contactos y teléfonos). Crea proveedores, almacenes, integraciones con
//  su checklist y las observaciones. Se puede ejecutar varias veces: no
//  duplica (busca por nombre). La contraseña de Aliclik de cada proveedor
//  (columna PASS ALC) NO se importa.
// =====================================================================
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { buildDbConfig } = require("../src/config/dbConfig");

const ARCHIVO = process.argv[2] || path.join(__dirname, "privado", "datos-excel.json");

async function entidad(c, tipo, nombre, auroraId, pais) {
  const r = await c.query(
    `SELECT id, aurora_id FROM entidades WHERE tipo = $1 AND (lower(nombre) = lower($2) OR ($3::bigint IS NOT NULL AND aurora_id = $3)) LIMIT 1`,
    [tipo, nombre, auroraId]
  );
  if (r.rows[0]) {
    if (auroraId && !r.rows[0].aurora_id) await c.query("UPDATE entidades SET aurora_id = $2 WHERE id = $1", [r.rows[0].id, auroraId]);
    return r.rows[0].id;
  }
  const n = await c.query("INSERT INTO entidades (tipo, nombre, aurora_id, pais) VALUES ($1, $2, $3, $4) RETURNING id", [tipo, nombre, auroraId, pais]);
  return n.rows[0].id;
}

(async () => {
  if (!fs.existsSync(ARCHIVO)) {
    console.error(`❌ No existe ${ARCHIVO}. Copia allí el archivo datos-excel.json que se generó desde el Excel.`);
    process.exit(1);
  }
  const datos = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
  const { info, ...config } = buildDbConfig(process.env.DATABASE_URL);
  const c = new Client(config);
  await c.connect();
  console.log(`🔌 Conectado a ${info.host}`);
  await c.query("BEGIN");
  try {
    let nuevas = 0;
    for (const i of datos.integraciones) {
      const proveedorId = await entidad(c, "proveedor", i.proveedor, i.proveedor_aurora_id, i.pais);
      const definido = i.almacen && !/por definir/i.test(i.almacen);
      const almacenId = definido ? await entidad(c, "almacen", i.almacen, null, i.pais) : null;
      const existe = await c.query("SELECT 1 FROM integraciones WHERE pais = $1 AND proveedor_id = $2 AND almacen_id IS NOT DISTINCT FROM $3", [i.pais, proveedorId, almacenId]);
      if (existe.rowCount) continue;
      const checks = ["grupo_wsp", "conf_sistemas", "capacitacion", "catalogo", "despacho", "liquidaciones"];
      const hechos = checks.filter((k) => i[k]).length;
      const estado = hechos === checks.length ? "integrado" : hechos > 0 ? "en_proceso" : "pendiente";
      await c.query(
        `INSERT INTO integraciones (pais, proveedor_id, almacen_id, almacen_texto, contacto, telefono, pendiente, horario_corte,
                usuario_alc, logo_url, comentario, ${checks.join(", ")}, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [i.pais, proveedorId, almacenId, definido ? null : i.almacen, i.contacto, i.telefono, i.pendiente, i.horario_corte,
         i.usuario_alc, i.logo_url && /^https:\/\//.test(i.logo_url) ? i.logo_url : null, i.comentario, ...checks.map((k) => Boolean(i[k])), estado]
      );
      nuevas++;
    }
    let obs = 0;
    for (const o of datos.observaciones || []) {
      const existe = await c.query("SELECT 1 FROM observaciones WHERE descripcion = $1", [o.descripcion]);
      if (existe.rowCount) continue;
      await c.query("INSERT INTO observaciones (descripcion, estado, nota, modulo) VALUES ($1, $2, $3, $4)", [o.descripcion, o.estado, o.nota, "Plataforma internacional"]);
      obs++;
    }
    await c.query("COMMIT");
    console.log(`✅ Integraciones nuevas: ${nuevas} · Observaciones nuevas: ${obs}`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
