// Pruebas unitarias de pronósticos e indicadores (funciones puras, sin base de datos).
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../src/utils/pronostico");
const IndicadorService = require("../../src/services/IndicadorService");
const METAS = require("../../src/config/metas");

const serie = (valores, inicio = "2026-08-03") => valores.map((valor, i) => ({ dia: P.sumarDias(inicio, i), valor }));

test("regresión lineal recupera pendiente e intercepto", () => {
  const { a, b } = P.regresion([2, 4, 6, 8, 10]);
  assert.equal(Math.round(a * 100) / 100, 2);
  assert.equal(Math.round(b * 100) / 100, 2);
});

test("pronóstico diario: con historia corta usa el promedio de 7 días", () => {
  const r = P.pronosticoDiario(serie([10, 10, 10, 10, 10, 10, 10]), 5);
  assert.equal(r.dias.length, 5);
  assert.deepEqual(r.pred, [10, 10, 10, 10, 10]);
  assert.match(r.metodo, /promedio/);
});

test("pronóstico diario: tendencia creciente y estacionalidad semanal", () => {
  // 8 semanas: crece 1 por día y los domingos valen la mitad
  const vals = Array.from({ length: 56 }, (_, i) => {
    const base = 100 + i;
    return new Date(Date.parse(P.sumarDias("2026-08-03", i) + "T12:00:00Z")).getUTCDay() === 0 ? base / 2 : base;
  });
  const r = P.pronosticoDiario(serie(vals), 14);
  assert.ok(r.tendenciaDiaria > 0.5, "detecta el crecimiento");
  const domingo = r.dias.findIndex((d) => new Date(d + "T12:00:00Z").getUTCDay() === 0);
  const lunes = r.dias.findIndex((d) => new Date(d + "T12:00:00Z").getUTCDay() === 1);
  assert.ok(r.pred[domingo] < r.pred[lunes] * 0.7, "el domingo se pronostica más bajo");
  r.pred.forEach((v, i) => assert.ok(r.bajo[i] <= v && v <= r.alto[i], "banda contiene al pronóstico"));
});

test("cierre de mes suma lo ocurrido y lo pronosticado", () => {
  assert.deepEqual(P.cierreDeMes(100, [10, 10], [5, 5], [15, 15]), { valor: 120, bajo: 110, alto: 130 });
});

test("estado frente a la meta: mínimo, máximo y tolerancia", () => {
  assert.equal(P.estadoMeta(80, { meta: 70, tipo: "min" }), "ok");
  assert.equal(P.estadoMeta(65, { meta: 70, tipo: "min" }), "warn");
  assert.equal(P.estadoMeta(40, { meta: 70, tipo: "min" }), "danger");
  assert.equal(P.estadoMeta(10, { meta: 20, tipo: "max" }), "ok");
  assert.equal(P.estadoMeta(22, { meta: 20, tipo: "max" }), "warn");
  assert.equal(P.estadoMeta(null, { meta: 20, tipo: "max" }), "neutro");
});

test("anomalías: detecta un pico", () => {
  const picos = P.anomalias([5, 6, 5, 4, 6, 5, 40, 5, 6]);
  assert.equal(picos.length, 1);
  assert.equal(picos[0].i, 6);
});

test("kpi() calcula estado con la meta configurada y recortarInicio quita ceros iniciales", () => {
  const k = IndicadorService.kpi("x", "Efectividad", 50, { formato: "pct", meta: METAS.pedidos.efectividadEntrega });
  assert.equal(k.estado, "danger");
  assert.equal(k.meta, METAS.pedidos.efectividadEntrega.meta);
  assert.deepEqual(IndicadorService.recortarInicio([{ valor: 0 }, { valor: 0 }, { valor: 3 }, { valor: 0 }]), [{ valor: 3 }, { valor: 0 }]);
  assert.equal(IndicadorService.pct(1, 3), 33.3);
  assert.equal(IndicadorService.pct(1, 0), null);
});
