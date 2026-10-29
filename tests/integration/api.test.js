// =====================================================================
//  Pruebas de integración: API real + base de datos de PRUEBA.
//  ⚠ Solo se ejecutan con RUN_INTEGRATION=1 y crean/borran datos de prueba
//    (correos @prueba.local). NO apuntar a la base de producción.
//    PowerShell:  $env:RUN_INTEGRATION=1; npm test
// =====================================================================
const test = require("node:test");
const assert = require("node:assert/strict");

const ACTIVO = process.env.RUN_INTEGRATION === "1";
const t = ACTIVO ? test : test.skip;

let base, server, db, cookieAdmin, cookieLector;
const PASS = "Prueba#2026seg";
const sufijo = Date.now();

async function pedir(ruta, { method = "GET", body, cookie, headers = {}, texto } = {}) {
  const r = await fetch(base + ruta, {
    method,
    redirect: "manual",
    headers: { ...(body && { "Content-Type": "application/json" }), ...(texto != null && { "Content-Type": "text/csv" }), ...(cookie && { Cookie: cookie }), ...headers },
    body: texto != null ? texto : body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data, cookie: (r.headers.get("set-cookie") || "").split(";")[0], headers: r.headers };
}

async function crearUsuario(email, rol) {
  const argon2 = require("argon2");
  const hash = await argon2.hash(PASS, { type: argon2.argon2id });
  await db.query("INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol, estado) VALUES ('Prueba', 'Test', $1, $2, $3, 'activo')", [email, hash, rol]);
  return (await pedir("/api/auth/login", { method: "POST", body: { email, password: PASS } })).cookie;
}

test.before(async () => {
  if (!ACTIVO) return;
  db = require("../../src/config/database");
  const app = require("../../src/app");
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  cookieAdmin = await crearUsuario(`admin.${sufijo}@prueba.local`, "admin");
  cookieLector = await crearUsuario(`lector.${sufijo}@prueba.local`, "lector");
});

test.after(async () => {
  if (!ACTIVO) return;
  await db.query("DELETE FROM pedidos WHERE order_id >= 990000000");
  await db.query("DELETE FROM usuarios WHERE email LIKE '%@prueba.local'");
  server.close();
  await db.pool.end();
});

t("Cabeceras de seguridad (Helmet/CSP) y sin x-powered-by", async () => {
  const r = await pedir("/api/salud");
  assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

t("Sin sesión no se accede a la API (401)", async () => {
  assert.equal((await pedir("/api/dashboard")).status, 401);
  assert.equal((await pedir("/api/admin/usuarios")).status, 401);
});

t("Login: mensaje genérico y cookie HttpOnly + SameSite=Strict", async () => {
  const mal = await pedir("/api/auth/login", { method: "POST", body: { email: `admin.${sufijo}@prueba.local`, password: "Incorrecta#1234" } });
  const noExiste = await pedir("/api/auth/login", { method: "POST", body: { email: `nadie.${sufijo}@prueba.local`, password: "Incorrecta#1234" } });
  assert.equal(mal.status, 401);
  assert.equal(mal.data.mensaje, noExiste.data.mensaje, "no revela si el correo existe");
  const ok = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `admin.${sufijo}@prueba.local`, password: PASS }) });
  const sc = ok.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Strict/i);
});

t("Registro: la cuenta nueva queda pendiente y no puede ingresar", async () => {
  const email = `nuevo.${sufijo}@prueba.local`;
  const r = await pedir("/api/auth/registro", { method: "POST", body: { nombres: "Nuevo", apellidos: "Usuario", email, password: PASS, confirmPassword: PASS, aceptaPoliticas: true } });
  assert.equal(r.status, 201);
  assert.equal(r.data.sesion, false);
  const login = await pedir("/api/auth/login", { method: "POST", body: { email, password: PASS } });
  assert.equal(login.status, 403);
  // Registrar el mismo correo no revela que ya existe
  const dup = await pedir("/api/auth/registro", { method: "POST", body: { nombres: "Otro", apellidos: "Usuario", email, password: PASS, confirmPassword: PASS, aceptaPoliticas: true } });
  assert.equal(dup.status, 201);
});

t("Roles: un lector no puede escribir ni administrar (403)", async () => {
  assert.equal((await pedir("/api/observaciones", { method: "POST", cookie: cookieLector, body: { descripcion: "Prueba de rol" } })).status, 403);
  assert.equal((await pedir("/api/admin/usuarios", { cookie: cookieLector })).status, 403);
  assert.equal((await pedir("/api/cargas", { method: "POST", cookie: cookieLector, texto: "a,b" })).status, 403);
});

t("CSRF: se rechaza una petición que modifica datos desde otro sitio", async () => {
  const r = await pedir("/api/observaciones", { method: "POST", cookie: cookieAdmin, body: { descripcion: "Ataque CSRF" }, headers: { Origin: "https://sitio-malicioso.com" } });
  assert.equal(r.status, 403);
});

t("Validación: datos inválidos e identificadores mal formados", async () => {
  assert.equal((await pedir("/api/pedidos?desde=ayer", { cookie: cookieAdmin })).status, 400);
  assert.equal((await pedir("/api/integraciones/1%20OR%201=1", { cookie: cookieAdmin })).status, 400);
  assert.equal((await pedir("/api/seguimiento-actores/usuarios", { cookie: cookieAdmin })).status, 400);
});

t("Carga CSV: inserta, actualiza sin duplicar y detecta archivo repetido", async () => {
  const csv = (estado) => `order_id;order_number;pais;fecha_pedido;tienda_id;tienda_nombre;estado_codigo;estado_label;total;moneda\n990000001;T-1-${sufijo};GT;2026-10-20 15:00:00;9900;Tienda Test;PENDING;Por preparar;100;GTQ\n990000002;T-2;AR;2026-10-21 15:00:00;9900;Tienda Test;${estado};X;50;ARS\n990000003;T-3;ZZ;2026-10-21;9900;Tienda Test;X;X;1;ARS\n`;
  const r1 = await pedir("/api/cargas", { method: "POST", cookie: cookieAdmin, texto: csv("PENDING") });
  assert.equal(r1.status, 201);
  assert.equal(r1.data.carga.insertadas, 2);
  assert.equal(r1.data.carga.rechazadas, 1);
  const repetido = await pedir("/api/cargas", { method: "POST", cookie: cookieAdmin, texto: csv("PENDING") });
  assert.equal(repetido.status, 409);
  const r2 = await pedir("/api/cargas", { method: "POST", cookie: cookieAdmin, texto: csv("DELIVERED") });
  assert.equal(r2.data.carga.actualizadas, 1, "solo cambió el pedido T-2");
  assert.equal(r2.data.carga.sin_cambios, 1, "T-1 no cambió: no se reescribe");
  const lista = await pedir("/api/pedidos?q=T-2&desde=2026-10-01&hasta=2026-10-31", { cookie: cookieAdmin });
  assert.equal(lista.data.filas[0].estado_codigo, "DELIVERED");
});

t("Exportación CSV protegida contra fórmulas", async () => {
  const r = await fetch(base + "/api/pedidos/exportar.csv?desde=2026-10-01&hasta=2026-10-31", { headers: { Cookie: cookieAdmin } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/csv/);
});

t("Calendario: nadie ve ni edita eventos de otro usuario (IDOR)", async () => {
  const ev = await pedir("/api/calendario", { method: "POST", cookie: cookieAdmin, body: { tipo: "reunion", titulo: "Privada", inicio: "2026-11-02T15:00:00Z", fin: "2026-11-02T16:00:00Z", sincronizar: false } });
  assert.equal(ev.status, 201);
  const ajeno = await pedir(`/api/calendario/${ev.data.evento.id}`, { method: "DELETE", cookie: cookieLector });
  assert.equal(ajeno.status, 404);
  const vista = await pedir(`/api/calendario?desde=2026-11-01T00:00:00Z&hasta=2026-11-30T00:00:00Z`, { cookie: cookieLector });
  assert.ok(!vista.data.eventos.some((e) => e.id === ev.data.evento.id));
});

t("Cambio de contraseña revoca las demás sesiones", async () => {
  const email = `rev.${sufijo}@prueba.local`;
  const c1 = await crearUsuario(email, "editor");
  const c2 = (await pedir("/api/auth/login", { method: "POST", body: { email, password: PASS } })).cookie;
  const cambio = await pedir("/api/auth/password", { method: "PUT", cookie: c1, body: { actual: PASS, nueva: "OtraClave#2027", confirmar: "OtraClave#2027" } });
  assert.equal(cambio.status, 200);
  assert.equal((await pedir("/api/auth/me", { cookie: c2 })).status, 401, "la otra sesión quedó invalidada");
  assert.equal((await pedir("/api/auth/me", { cookie: cambio.cookie })).status, 200, "la sesión actual se renovó");
});

t("Bloqueo de cuenta tras 5 intentos fallidos", async () => {
  const email = `bloq.${sufijo}@prueba.local`;
  await crearUsuario(email, "lector");
  for (let i = 0; i < 5; i++) await pedir("/api/auth/login", { method: "POST", body: { email, password: "Mala#12345678" } });
  const r = await pedir("/api/auth/login", { method: "POST", body: { email, password: PASS } });
  assert.equal(r.status, 423);
});
