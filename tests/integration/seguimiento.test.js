// Integración del módulo de seguimiento y acuerdos (requiere RUN_INTEGRATION=1, base de PRUEBA).
const test = require("node:test");
const assert = require("node:assert/strict");

const ACTIVO = process.env.RUN_INTEGRATION === "1";
const t = ACTIVO ? test : test.skip;
const PASS = "Prueba#2026seg";
const sufijo = Date.now();
let base, server, db, admin, lector, tiendaId;

async function pedir(ruta, { method = "GET", body, cookie, texto } = {}) {
  const r = await fetch(base + ruta, {
    method,
    headers: { ...(body && { "Content-Type": "application/json" }), ...(texto != null && { "Content-Type": "text/csv" }), ...(cookie && { Cookie: cookie }) },
    body: texto != null ? texto : body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
async function usuario(email, rol) {
  const argon2 = require("argon2");
  await db.query("INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol, estado) VALUES ('Seg', 'Test', $1, $2, $3, 'activo')", [email, await argon2.hash(PASS), rol]);
  return (await pedir("/api/auth/login", { method: "POST", body: { email, password: PASS } })).cookie;
}

test.before(async () => {
  if (!ACTIVO) return;
  db = require("../../src/config/database");
  server = require("../../src/app").listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await usuario(`segadm.${sufijo}@prueba.local`, "admin");
  lector = await usuario(`seglec.${sufijo}@prueba.local`, "lector");
  // 30 pedidos de una tienda de prueba este mes
  const filas = Array.from({ length: 30 }, (_, i) => `${991000000 + i};S-${sufijo}-${i};GT;${new Date(Date.now() - i * 3600e3).toISOString()};991;Tienda Seguimiento ${sufijo};DELIVERED;Entregado;100;GTQ`);
  const r = await pedir("/api/cargas", { method: "POST", cookie: admin, texto: `order_id;order_number;pais;fecha_pedido;tienda_id;tienda_nombre;estado_codigo;estado_label;total;moneda\n${filas.join("\n")}\n` });
  assert.equal(r.status, 201);
  tiendaId = (await db.query("SELECT id FROM entidades WHERE tipo = 'tienda' AND aurora_id = 991")).rows[0].id;
});

test.after(async () => {
  if (!ACTIVO) return;
  await db.query("DELETE FROM pedidos WHERE order_id >= 991000000 AND order_id < 992000000");
  await db.query("DELETE FROM entidades WHERE tipo = 'tienda' AND aurora_id = 991");
  await db.query("DELETE FROM usuarios WHERE email LIKE 'seg%@prueba.local'");
  server.close();
  await db.pool.end();
});

t("Listado: métricas del mes, salud y resumen", async () => {
  const r = await pedir(`/api/seguimiento-actores/tienda?q=991`, { cookie: lector });
  assert.equal(r.status, 200);
  const f = r.data.filas.find((x) => x.id === tiendaId);
  assert.ok(f.mes_actual >= 1 && f.u30 === 30);
  assert.equal(f.salud, "creciendo");
  assert.ok(r.data.resumen.total >= 1);
});

t("Plan y acuerdos: solo editores; escalas reflejadas en la ficha", async () => {
  assert.equal((await pedir(`/api/seguimiento-actores/ficha/${tiendaId}/plan`, { method: "PUT", cookie: lector, body: { segmento: "vip" } })).status, 403);
  const plan = await pedir(`/api/seguimiento-actores/ficha/${tiendaId}/plan`, { method: "PUT", cookie: admin, body: { segmento: "vip", meta_pedidos_mes: 100, condiciones: "Cliente estratégico" } });
  assert.equal(plan.status, 200);
  const nuevo = (b) => pedir("/api/acuerdos", { method: "POST", cookie: admin, body: { entidad_id: tiendaId, vigente_desde: "2026-01-01", ...b } });
  assert.equal((await nuevo({ tipo: "descuento_pct", titulo: "Inválido", valor: 101 })).status, 400);
  assert.equal((await pedir("/api/acuerdos", { method: "POST", cookie: lector, body: { entidad_id: tiendaId, tipo: "otro", titulo: "No", vigente_desde: "2026-01-01" } })).status, 403);
  assert.equal((await nuevo({ tipo: "descuento_pct", titulo: "5% desde 10", valor: 5, umbral_pedidos: 10 })).status, 201);
  const a2 = await nuevo({ tipo: "descuento_pct", titulo: "8% desde 1000", valor: 8, umbral_pedidos: 1000 });
  assert.equal(a2.status, 201);
  const ficha = await pedir(`/api/seguimiento-actores/ficha/${tiendaId}`, { cookie: lector });
  assert.equal(ficha.status, 200);
  assert.equal(ficha.data.entidad.segmento, "vip");
  assert.equal(ficha.data.entidad.trato_especial, true);
  assert.equal(ficha.data.entidad.siguiente_escala.titulo, "8% desde 1000");
  assert.ok(ficha.data.entidad.beneficios_ganados.includes("5% desde 10"));
  assert.equal(ficha.data.mensual.length, 12);
  // Editar: no se puede mover el acuerdo a otra entidad
  const ed = await pedir(`/api/acuerdos/${a2.data.acuerdo.id}`, { method: "PUT", cookie: admin, body: { entidad_id: "00000000-0000-4000-8000-000000000000", tipo: "descuento_pct", titulo: "8% desde 1000", valor: 8, umbral_pedidos: 1000, vigente_desde: "2026-01-01", estado: "pausado" } });
  assert.equal(ed.data.acuerdo.entidad_id, tiendaId);
  assert.equal((await pedir(`/api/acuerdos/${a2.data.acuerdo.id}`, { method: "DELETE", cookie: lector })).status, 403);
});

t("Una carga nueva invalida la caché del seguimiento", async () => {
  const antes = (await pedir(`/api/seguimiento-actores/tienda?q=991`, { cookie: admin })).data.filas[0].u30;
  await pedir("/api/cargas", { method: "POST", cookie: admin, texto: `order_id;pais;fecha_pedido;tienda_id;tienda_nombre;estado_codigo\n991000500;GT;${new Date().toISOString()};991;Tienda Seguimiento ${sufijo};DELIVERED\n` });
  const despues = (await pedir(`/api/seguimiento-actores/tienda?q=991`, { cookie: admin })).data.filas[0].u30;
  assert.equal(despues, antes + 1);
});
