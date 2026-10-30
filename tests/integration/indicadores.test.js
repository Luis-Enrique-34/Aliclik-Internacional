// Integración de indicadores, filtros y orden (requiere RUN_INTEGRATION=1, base de PRUEBA).
const test = require("node:test");
const assert = require("node:assert/strict");

const ACTIVO = process.env.RUN_INTEGRATION === "1";
const t = ACTIVO ? test : test.skip;
const PASS = "Prueba#2026ind";
const sufijo = Date.now();
let base, server, db, admin, lector;

async function pedir(ruta, { method = "GET", body, cookie } = {}) {
  const r = await fetch(base + ruta, { method, headers: { ...(body && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
async function usuario(email, rol) {
  const argon2 = require("argon2");
  await db.query("INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol, estado) VALUES ('Ind', 'Test', $1, $2, $3, 'activo')", [email, await argon2.hash(PASS), rol]);
  return (await pedir("/api/auth/login", { method: "POST", body: { email, password: PASS } })).cookie;
}

test.before(async () => {
  if (!ACTIVO) return;
  db = require("../../src/config/database");
  server = require("../../src/app").listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await usuario(`indadm.${sufijo}@prueba.local`, "admin");
  lector = await usuario(`indlec.${sufijo}@prueba.local`, "lector");
});

test.after(async () => {
  if (!ACTIVO) return;
  await db.query("DELETE FROM observaciones WHERE descripcion LIKE 'IND-TEST%'");
  await db.query("DELETE FROM usuarios WHERE email LIKE 'ind%@prueba.local'");
  server.close();
  await db.pool.end();
});

t("Cada módulo devuelve KPI con estado, hallazgos y pronóstico", async () => {
  for (const m of ["pedidos", "seguimiento", "integraciones", "observaciones", "calendario", "cargas"]) {
    const r = await pedir(`/api/indicadores/${m}`, { cookie: lector });
    assert.equal(r.status, 200, m);
    assert.ok(Array.isArray(r.data.kpis) && r.data.kpis.length >= 3, `${m}: kpis`);
    for (const k of r.data.kpis) assert.ok(["ok", "warn", "danger", "neutro"].includes(k.estado), `${m}.${k.id}`);
    assert.ok(Array.isArray(r.data.hallazgos));
  }
});

t("Usuarios y auditoría: solo administradores; módulo inexistente o filtro inválido → 400", async () => {
  assert.equal((await pedir("/api/indicadores/usuarios", { cookie: lector })).status, 403);
  assert.equal((await pedir("/api/indicadores/auditoria", { cookie: lector })).status, 403);
  assert.equal((await pedir("/api/indicadores/usuarios", { cookie: admin })).status, 200);
  assert.equal((await pedir("/api/indicadores/secreto", { cookie: admin })).status, 400);
  assert.equal((await pedir("/api/indicadores/pedidos?pais=XYZ", { cookie: admin })).status, 400);
  assert.equal((await pedir("/api/indicadores/pedidos")).status, 401);
});

t("Observaciones: el SLA usa la fecha de cierre que llena el trigger", async () => {
  const c = await pedir("/api/observaciones", { method: "POST", cookie: admin, body: { descripcion: "IND-TEST resolver rápido", prioridad: "alta" } });
  assert.equal(c.status, 201);
  const id = c.data.observacion.id;
  const r = await pedir(`/api/observaciones/${id}`, { method: "PUT", cookie: admin, body: { descripcion: "IND-TEST resolver rápido", prioridad: "alta", estado: "resuelta" } });
  assert.equal(r.status, 200);
  const fila = (await db.query("SELECT cerrada_en FROM observaciones WHERE id = $1", [id])).rows[0];
  assert.ok(fila.cerrada_en, "cerrada_en se llenó");
});

t("Pedidos: orden y filtros nuevos validados (lista blanca)", async () => {
  const ok = await pedir("/api/pedidos?orden=tienda&dir=asc&contraentrega=si&estancados=7&monto_min=0", { cookie: lector });
  assert.equal(ok.status, 200);
  assert.equal((await pedir("/api/pedidos?orden=p.total;DROP", { cookie: lector })).status, 400);
  assert.equal((await pedir("/api/pedidos?dir=sideways", { cookie: lector })).status, 400);
});

t("Auditoría: filtros por categoría, fechas e IP", async () => {
  const r = await pedir(`/api/admin/auditoria?grupo=seguridad&desde=2026-01-01&orden=asc&limite=50`, { cookie: admin });
  assert.equal(r.status, 200);
  assert.ok(r.data.registros.every((a) => ["LOGIN", "LOGIN_FALLIDO", "CUENTA_BLOQUEADA", "REGISTRO", "REGISTRO_DUPLICADO", "CAMBIO_PASSWORD"].includes(a.accion)));
  assert.equal((await pedir("/api/admin/auditoria?ip=<script>", { cookie: admin })).status, 400);
  assert.equal((await pedir("/api/admin/auditoria", { cookie: lector })).status, 403);
});
