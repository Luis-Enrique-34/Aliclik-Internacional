// Pruebas unitarias (sin base de datos): CSV, normalización, estados, cifrado y validaciones.
process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5432/x";
process.env.JWT_SECRET ||= "a".repeat(20) + "b".repeat(20);
process.env.ENCRYPTION_KEY ||= "0".repeat(63) + "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parsearCsv, aCsv } = require("../../src/utils/csv");
const N = require("../../src/utils/normalizar");
const { clasificarEstado } = require("../../src/utils/estados");
const { cifrar, descifrar, igualesSeguro } = require("../../src/utils/cifrado");
const CargaService = require("../../src/services/CargaService");
const { registroSchema } = require("../../src/validators/auth.schemas");
const { eventoSchema, integracionSchema } = require("../../src/validators/negocio.schemas");
const DashboardService = require("../../src/services/DashboardService");

test("CSV: detecta separador ; y respeta comillas y saltos de línea", () => {
  const { columnas, filas } = parsearCsv('﻿Order ID;Tienda Nombre;Nota\r\n1;"Tienda; ""A""";"línea1\nlínea2"\r\n2;B;\r\n');
  assert.deepEqual(columnas, ["order_id", "tienda_nombre", "nota"]);
  assert.equal(filas[0].tienda_nombre, 'Tienda; "A"');
  assert.equal(filas[0].nota, "línea1\nlínea2");
  assert.equal(filas.length, 2);
});

test("CSV: rechaza comillas sin cerrar y archivos con demasiadas filas", () => {
  assert.throws(() => parsearCsv('a,b\n1,"x'), /comillas/);
  assert.throws(() => parsearCsv("a\n1\n2\n3", { maxFilas: 2 }), /máximo/);
});

test("CSV exportado: bloquea fórmulas (CSV injection)", () => {
  const out = aCsv([{ n: "=HYPERLINK(\"http://x\")" }, { n: "@SUM(A1)" }], [{ campo: "n", titulo: "N" }]);
  assert.match(out, /"'=HYPERLINK/);
  assert.match(out, /"'@SUM/);
});

test("Normalización: países, números y fechas", () => {
  assert.equal(N.pais("GTM"), "GT");
  assert.equal(N.pais("Perú"), "PE");
  assert.equal(N.pais("Marte"), null);
  assert.equal(N.decimal("1.234,50"), 1234.5);
  assert.equal(N.decimal("1,234.50"), 1234.5);
  assert.ok(Number.isNaN(N.entero("abc")));
  assert.equal(N.fechaHora("2026-10-29 10:00:00").toISOString(), "2026-10-29T10:00:00.000Z");
  assert.equal(N.fechaHora("2026-10-29 10:00:00", { zonaSinOffset: "America/Lima" }).toISOString(), "2026-10-29T15:00:00.000Z");
  assert.equal(N.fechaHora("29/10/2026 10:00").toISOString(), "2026-10-29T15:00:00.000Z");
  assert.equal(N.soloFecha("31/12/2026"), "2026-12-31");
});

test("Estados: clasificación automática por palabras clave", () => {
  assert.equal(clasificarEstado("PENDING", "Por preparar"), "pendiente");
  assert.equal(clasificarEstado("PREPARED", "Preparado"), "en_proceso");
  assert.equal(clasificarEstado("DISPATCHED", "Despachado"), "en_ruta");
  assert.equal(clasificarEstado("DELIVERED", "Entregado"), "entregado");
  assert.equal(clasificarEstado("NOT_DELIVERED", "No entregado"), "devuelto");
  assert.equal(clasificarEstado("CANCELED", "Anulado"), "cancelado");
  assert.equal(clasificarEstado("XYZ", "Raro"), "otro");
});

test("Carga: valida filas y explica el motivo del rechazo", () => {
  const { mapa, faltan } = CargaService.mapearColumnas(["order_id", "pais", "fecha_pedido", "total"]);
  assert.deepEqual(faltan, []);
  assert.ok(CargaService.normalizarFila({ order_id: "10", pais: "GT", fecha_pedido: "2026-10-01 10:00:00", total: "12.5" }, mapa).pedido);
  assert.match(CargaService.normalizarFila({ order_id: "x", pais: "GT", fecha_pedido: "2026-10-01" }, mapa).error, /order_id/);
  assert.match(CargaService.normalizarFila({ order_id: "1", pais: "ZZ", fecha_pedido: "2026-10-01" }, mapa).error, /país/);
  assert.match(CargaService.normalizarFila({ order_id: "1", pais: "GT", fecha_pedido: "ayer" }, mapa).error, /fecha/);
  assert.deepEqual(CargaService.mapearColumnas(["id"]).faltan, ["pais", "fecha_pedido"]);
});

test("Cifrado AES-256-GCM: ida y vuelta, y detecta alteraciones", () => {
  const k = Buffer.alloc(32, 7);
  const c = cifrar("token-secreto", k);
  assert.notEqual(c, "token-secreto");
  assert.equal(descifrar(c, k), "token-secreto");
  const alterado = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
  assert.throws(() => descifrar(alterado, k));
  assert.throws(() => descifrar(c, Buffer.alloc(32, 8)));
  assert.ok(igualesSeguro("abc", "abc"));
  assert.ok(!igualesSeguro("abc", "abd"));
});

test("Registro: política de contraseñas", () => {
  const base = { nombres: "Ana", apellidos: "Pérez", email: "ana@aliclik.app", confirmPassword: "", aceptaPoliticas: true };
  const prueba = (password) => registroSchema.safeParse({ ...base, password, confirmPassword: password }).success;
  assert.ok(prueba("Segura#2026x"));
  assert.ok(!prueba("corta1A!"));
  assert.ok(!prueba("sinsimbolo2026A"));
  assert.ok(!prueba("Aliclik#2026"));
  assert.ok(!prueba("Xana#Segura2026"), "no debe contener el correo");
});

test("Validación: eventos y enlaces seguros", () => {
  const ev = { tipo: "reunion", titulo: "Reunión", inicio: "2026-10-30T15:00:00Z", fin: "2026-10-30T14:00:00Z" };
  assert.ok(!eventoSchema.safeParse(ev).success, "fin antes de inicio");
  assert.ok(eventoSchema.safeParse({ ...ev, fin: "2026-10-30T16:00:00Z" }).success);
  const int = { pais: "GT", proveedor_id: "00000000-0000-4000-8000-000000000000" };
  assert.ok(!integracionSchema.safeParse({ ...int, logo_url: "javascript:alert(1)" }).success);
  assert.ok(!integracionSchema.safeParse({ ...int, logo_url: "http://inseguro.com/a.png" }).success);
  assert.ok(integracionSchema.safeParse({ ...int, logo_url: "https://cdn.com/a.png" }).success);
});

test("Tablero: rango por defecto y periodo anterior equivalente", () => {
  const r = DashboardService.rango({ desde: "2026-10-01", hasta: "2026-10-10" });
  assert.deepEqual(r.anterior, { desde: "2026-09-21", hasta: "2026-09-30" });
  const s = DashboardService.completarSerie([{ dia: "2026-10-02", pedidos: 3 }], "2026-10-01", "2026-10-03");
  assert.deepEqual(s.map((x) => x.pedidos), [0, 3, 0]);
});
