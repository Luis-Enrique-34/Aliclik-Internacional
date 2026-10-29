// Pruebas unitarias de las reglas de seguimiento (sin base de datos).
process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5432/x";
process.env.JWT_SECRET ||= "a".repeat(20) + "b".repeat(20);
process.env.ENCRYPTION_KEY ||= "0".repeat(63) + "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../src/services/SeguimientoService");
const memo = require("../../src/utils/memo");
const { acuerdoSchema, planSchema } = require("../../src/validators/negocio.schemas");

const AHORA = new Date("2026-10-20T15:00:00Z"); // día 20 de un mes de 31 días
const base = { aurora_id: 1, mes_actual: 0, mes_anterior: 0, u30: 0, p30: 0, ent30: 0, perd30: 0, curso30: 0, ultimo_pedido: null, meta_pedidos_mes: null };
const ev = (m) => S.evaluar({ ...base, ...m }, { ahora: AHORA });
const haceDias = (d) => new Date(AHORA - d * 86400000).toISOString();

test("Salud: crecimiento, estabilidad, atención y caída según los últimos 30 días", () => {
  assert.equal(ev({ u30: 130, p30: 100, mes_actual: 90, ultimo_pedido: haceDias(0) }).salud, "creciendo");
  assert.equal(ev({ u30: 105, p30: 100, mes_actual: 70, ultimo_pedido: haceDias(0) }).salud, "estable");
  assert.equal(ev({ u30: 85, p30: 100, mes_actual: 60, ultimo_pedido: haceDias(1) }).salud, "atencion");
  assert.equal(ev({ u30: 60, p30: 100, mes_actual: 40, ultimo_pedido: haceDias(1) }).salud, "en_caida");
});

test("Salud: inactiva tras 7 días sin pedidos y sin datos si nunca tuvo", () => {
  const r = ev({ u30: 40, p30: 50, mes_actual: 10, ultimo_pedido: haceDias(9) });
  assert.equal(r.salud, "inactiva");
  assert.equal(r.alertas[0].nivel, "alta");
  assert.equal(ev({}).salud, "sin_datos");
  assert.equal(ev({ ultimo_pedido: haceDias(70) }).salud, "inactiva");
});

test("Meta: proyección del mes y alerta si va por debajo del 80 %", () => {
  const r = ev({ u30: 100, p30: 100, mes_actual: 200, meta_pedidos_mes: 500, ultimo_pedido: haceDias(0) });
  assert.equal(r.proyeccion, 310); // 200 / 20 días * 31
  assert.equal(r.avanceMeta, 0.4);
  assert.ok(r.alertas.some((a) => /Proyección/.test(a.texto)));
  assert.ok(!ev({ u30: 100, p30: 100, mes_actual: 400, meta_pedidos_mes: 500, ultimo_pedido: haceDias(0) }).alertas.some((a) => /Proyección/.test(a.texto)));
});

test("Devoluciones altas generan alerta solo con volumen suficiente", () => {
  assert.ok(ev({ u30: 40, p30: 40, perd30: 12, mes_actual: 30, ultimo_pedido: haceDias(0) }).alertas.some((a) => /devoluciones/.test(a.texto)));
  assert.equal(ev({ u30: 5, p30: 5, perd30: 4, mes_actual: 5, ultimo_pedido: haceDias(0) }).tasaPerdida, null);
});

test("Acuerdos: vigencia y umbral de pedidos", () => {
  const hoy = "2026-10-20";
  assert.equal(S.estadoAcuerdo({ estado: "activo", vigente_desde: "2026-10-01" }, 0, hoy).vigencia, "vigente");
  assert.equal(S.estadoAcuerdo({ estado: "activo", vigente_desde: "2026-10-01", vigente_hasta: "2026-10-30" }, 0, hoy).vigencia, "por_vencer");
  assert.equal(S.estadoAcuerdo({ estado: "activo", vigente_desde: "2026-09-01", vigente_hasta: "2026-10-10" }, 0, hoy).vigencia, "vencido");
  assert.equal(S.estadoAcuerdo({ estado: "activo", vigente_desde: "2026-11-01" }, 0, hoy).vigencia, "programado");
  assert.equal(S.estadoAcuerdo({ estado: "pausado", vigente_desde: "2026-10-01" }, 0, hoy).vigencia, "pausado");
  const u = S.estadoAcuerdo({ estado: "activo", vigente_desde: "2026-10-01", umbral_pedidos: 300 }, 240, hoy).umbral;
  assert.deepEqual(u, { cumplido: false, faltan: 60, avance: 0.8 });
});

test("Escalas: siguiente beneficio por desbloquear y aviso cuando falta poco", () => {
  const hoy = "2026-10-20";
  const acs = [
    { titulo: "5%", estado: "activo", vigente_desde: "2026-10-01", umbral_pedidos: 300 },
    { titulo: "8%", estado: "activo", vigente_desde: "2026-10-01", umbral_pedidos: 600 },
    { titulo: "pausado", estado: "pausado", vigente_desde: "2026-10-01", umbral_pedidos: 400 },
  ];
  assert.equal(S.siguienteEscala(acs, 350, hoy).titulo, "8%");
  assert.equal(S.siguienteEscala(acs, 700, hoy), null);
  assert.ok(S.alertasDeAcuerdos(acs, 280, hoy).some((a) => /A 20 pedidos de desbloquear "5%"/.test(a.texto)));
});

test("Validación de acuerdos y plan", () => {
  const ok = { entidad_id: "00000000-0000-4000-8000-000000000000", tipo: "descuento_pct", titulo: "Descuento VIP", valor: 10, vigente_desde: "2026-10-01" };
  assert.ok(acuerdoSchema.safeParse(ok).success);
  assert.ok(!acuerdoSchema.safeParse({ ...ok, valor: 150 }).success, "porcentaje > 100");
  assert.ok(!acuerdoSchema.safeParse({ ...ok, valor: -1 }).success);
  assert.ok(!acuerdoSchema.safeParse({ ...ok, vigente_hasta: "2026-09-01" }).success, "fin antes del inicio");
  assert.ok(!acuerdoSchema.safeParse({ ...ok, umbral_pedidos: 0 }).success);
  assert.ok(planSchema.safeParse({ segmento: "vip", meta_pedidos_mes: "" }).success);
  assert.ok(!planSchema.safeParse({ segmento: "super", meta_pedidos_mes: 10 }).success);
});

test("Caché: comparte resultados y se invalida", async () => {
  let llamadas = 0;
  const fn = async () => ++llamadas;
  assert.equal(await memo.recordar("x", fn), 1);
  assert.equal(await memo.recordar("x", fn), 1);
  memo.invalidar();
  assert.equal(await memo.recordar("x", fn), 2);
});
