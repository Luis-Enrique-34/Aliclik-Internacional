// =====================================================================
//  SERVICIO de INDICADORES por módulo: medidores, KPI con meta/SLA,
//  hallazgos en texto y pronósticos sobre la historia.
//
//  Cada módulo devuelve la misma forma (el frontend la dibuja igual):
//   { modulo, titulo, periodo, kpis[], pronostico?, desgloses[], hallazgos[] }
//   kpi = { id, titulo, valor, formato, meta?, tipo?, estado, ayuda, detalle?, medidor? }
//  Las metas viven en src/config/metas.js (una política = un número).
// =====================================================================
const METAS = require("../config/metas");
const memo = require("../utils/memo");
const P = require("../utils/pronostico");
const { fechaEnZona } = require("../utils/fechas");
const { HttpError } = require("../utils/HttpError");

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** Construye un KPI y calcula su estado frente a la meta. */
function kpi(id, titulo, valor, { formato = "num", meta = null, ayuda = "", detalle = "", medidor = false, estado } = {}) {
  const e = estado || (meta ? P.estadoMeta(valor, meta, METAS.tolerancia) : "neutro");
  return { id, titulo, valor: valor == null ? null : valor, formato, meta: meta ? meta.meta : null, tipo: meta ? meta.tipo : null, estado: e, ayuda, detalle, medidor };
}

/** Quita los ceros iniciales (antes del primer dato) para no sesgar la tendencia. */
function recortarInicio(serie) {
  const i = serie.findIndex((p) => Number(p.valor) > 0);
  return i <= 0 ? serie : serie.slice(i);
}

/** Quita los ceros iniciales de una serie de números (antes de que existieran datos). */
const sinCerosIniciales = (xs) => { const i = xs.findIndex((v) => Number(v) > 0); return i <= 0 ? xs : xs.slice(i); };

/** Meses cerrados útiles para proyectar: descarta el primero si es parcial (empezó a mitad de mes). */
function mesesUtiles(valores) {
  if (valores.length < 3) return valores;
  const orden = [...valores].sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)];
  return valores[0] < mediana * 0.5 ? valores.slice(1) : valores;
}

/** Días que faltan para terminar el mes (en la zona de la app). */
function restanteMes(hoy = fechaEnZona(new Date())) {
  const [a, m, d] = hoy.split("-").map(Number);
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { hoy, dia: d, diasMes, restantes: diasMes - d, mes: hoy.slice(0, 7) };
}

const MODULOS = ["pedidos", "seguimiento", "integraciones", "observaciones", "calendario", "usuarios", "auditoria", "cargas"];
const SOLO_ADMIN = ["usuarios", "auditoria"];

class IndicadorService {
  constructor({ indicadorDAO, pedidoDAO, seguimientoService }) {
    this.dao = indicadorDAO;
    this.pedidosDAO = pedidoDAO;
    this.segService = seguimientoService;
  }

  /** Punto de entrada: valida el módulo y el rol, y usa la caché de 60 s. */
  async obtener(modulo, filtros = {}, usuario) {
    if (!MODULOS.includes(modulo)) throw new HttpError(404, "Módulo de indicadores no encontrado");
    if (SOLO_ADMIN.includes(modulo) && usuario.rol !== "admin") throw new HttpError(403, "No tienes permiso para ver estos indicadores");
    // El calendario es personal: su caché va por usuario
    const clave = `ind:${modulo}:${modulo === "calendario" ? usuario.id : ""}:${JSON.stringify(filtros)}`;
    // Pedidos y seguimiento solo cambian con una carga (que limpia la caché); el resto se edita a mano: caché corta
    const ttl = modulo === "pedidos" || modulo === "seguimiento" ? memo.TTL_MS : 15_000;
    return memo.recordar(clave, () => this[modulo](filtros, usuario), ttl);
  }

  // =================================================================== PEDIDOS (tablero)
  async pedidos(f) {
    const M = METAS.pedidos;
    const base = { pais: f.pais, tienda_id: f.tienda_id, proveedor_id: f.proveedor_id, almacen_id: f.almacen_id, courier_id: f.courier_id };
    const w = () => this.pedidosDAO.filtros(base); // cada consulta necesita su propio arreglo de parámetros
    const [d, serie, mensual, cargas] = await Promise.all([
      this.dao.pedidos(w(), { dias: 30, slaDias: M.slaEntregaDias, estancadoDias: M.pedidosEstancadosDias }),
      this.dao.serieDiariaPedidos(w(), 84),
      this.dao.mensualPedidos(w(), 12),
      this.dao.cargas(30),
    ]);
    const cerrados = d.entregados + d.perdidos;
    const efectividad = pct(d.entregados, cerrados);
    const perdida = pct(d.perdidos, cerrados);
    const sla = pct(d.entregados_en_sla, d.entregados_con_fecha);

    const kpis = [
      kpi("efectividad", "Efectividad de entrega", efectividad, { formato: "pct", meta: M.efectividadEntrega, medidor: true,
        ayuda: "Entregados ÷ pedidos ya cerrados (entregados + devueltos + cancelados), últimos 30 días.", detalle: `${d.entregados} de ${cerrados} cerrados` }),
      kpi("sla_entrega", `Entregas en ≤ ${M.slaEntregaDias} días (SLA)`, sla, { formato: "pct", meta: M.cumplimientoSlaEntrega, medidor: true,
        ayuda: `Entregados cuya fecha de entrega fue a ${M.slaEntregaDias} días o menos de la fecha del pedido.`, detalle: `${d.entregados_en_sla} de ${d.entregados_con_fecha} con fecha de entrega` }),
      kpi("devolucion", "Devoluciones y cancelaciones", perdida, { formato: "pct", meta: M.tasaDevolucion, medidor: true,
        ayuda: "Devueltos + cancelados ÷ pedidos cerrados, últimos 30 días.", detalle: `${d.perdidos} pedidos` }),
      kpi("dias_entrega", "Tiempo medio de entrega", r1(d.dias_entrega), { formato: "dias",
        meta: { meta: M.slaEntregaDias, tipo: "max" }, ayuda: "Promedio de días entre el pedido y su entrega." }),
      kpi("estancados", `En curso hace más de ${M.pedidosEstancadosDias} días`, d.estancados, {
        estado: d.estancados === 0 ? "ok" : d.estancados <= Math.max(5, d.en_curso * 0.1) ? "warn" : "danger",
        ayuda: "Pedidos pendientes, en preparación o en ruta con más de N días: posibles atascos.", detalle: `de ${d.en_curso} en curso` }),
      kpi("frescura", "Antigüedad de los datos", r1(cargas.horas_ultima), { formato: "horas", meta: M.frescuraHoras,
        ayuda: "Horas desde la última carga o sincronización con Aurora." }),
      kpi("ticket", "Ticket promedio (30 días)", d.moneda && d.pedidos ? Math.round((d.monto / d.pedidos) * 100) / 100 : null, {
        formato: "moneda", detalle: d.moneda || (d.pedidos ? "varias monedas: filtra por país" : ""), ayuda: "Monto total ÷ pedidos." }),
    ];

    // ---- Pronóstico: próximos 14 días y cierre de mes
    // Hoy aún no termina: se pronostica (no se usa como dato real, bajaría la tendencia)
    const rm = restanteMes();
    const historia = recortarInicio(serie.filter((s) => s.dia < rm.hoy).map((s) => ({ dia: s.dia, valor: s.valor })));
    const horizonte = Math.max(14, rm.restantes);
    const pr = P.pronosticoDiario(historia, horizonte);
    const acumMes = serie.filter((s) => s.dia.startsWith(rm.mes) && s.dia < rm.hoy).reduce((t, s) => t + s.valor, 0);
    const restantes = pr.dias.map((dia, i) => ({ dia, i })).filter((x) => x.dia.startsWith(rm.mes)); // incluye hoy
    const cierre = P.cierreDeMes(acumMes, restantes.map((x) => pr.pred[x.i]), restantes.map((x) => pr.bajo[x.i]), restantes.map((x) => pr.alto[x.i]));
    const mesAnt = mensual.find((m) => m.mes === prevMes(rm.mes));
    const completos = mensual.filter((m) => m.mes !== rm.mes).map((m) => m.valor);
    const prox = P.pronosticoPeriodos(mesesUtiles([...completos, cierre.valor]), 3);
    const prom7 = P.media(historia.slice(-7).map((h) => h.valor));

    const hallazgos = [];
    if (mesAnt?.valor) {
      const v = Math.round(((cierre.valor - mesAnt.valor) / mesAnt.valor) * 100);
      hallazgos.push({ nivel: v >= 0 ? "ok" : v <= -10 ? "danger" : "warn", texto: `El mes cerraría en ~${cierre.valor} pedidos (${v >= 0 ? "+" : ""}${v}% vs. el mes anterior: ${mesAnt.valor}).` });
    } else if (cierre.valor) {
      hallazgos.push({ nivel: "info", texto: `El mes cerraría en ~${cierre.valor} pedidos (rango ${cierre.bajo}–${cierre.alto}).` });
    }
    if (pr.tendenciaDiaria) hallazgos.push({ nivel: pr.tendenciaDiaria > 0 ? "ok" : "warn", texto: `Tendencia: ${pr.tendenciaDiaria > 0 ? "+" : ""}${pr.tendenciaDiaria} pedidos por día cada día (8 semanas).` });
    if (d.estancados) hallazgos.push({ nivel: "warn", texto: `${d.estancados} pedidos llevan más de ${M.pedidosEstancadosDias} días sin cerrarse.` });
    if (efectividad != null && efectividad < M.efectividadEntrega.meta) hallazgos.push({ nivel: "danger", texto: `Efectividad ${efectividad}% por debajo de la meta (${M.efectividadEntrega.meta}%).` });
    const picos = P.anomalias(historia.map((h) => h.valor)).slice(-3);
    for (const p of picos) hallazgos.push({ nivel: "info", texto: `Pico inusual el ${historia[p.i].dia}: ${p.v} pedidos.` });

    return {
      modulo: "pedidos", titulo: "Indicadores de pedidos", periodo: "Últimos 30 días",
      kpis,
      pronostico: {
        titulo: "Pedidos por día y pronóstico", unidad: "pedidos",
        historia: historia.slice(-42).map((h) => ({ x: h.dia, valor: h.valor })),
        futuro: pr.dias.slice(0, 21).map((dia, i) => ({ x: dia, valor: pr.pred[i], bajo: pr.bajo[i], alto: pr.alto[i] })),
        metodo: pr.metodo,
        resumen: [
          { etiqueta: "Promedio últimos 7 días", valor: r1(prom7), formato: "num" },
          { etiqueta: "Próximos 7 días (estimado)", valor: Math.round(pr.pred.slice(0, 7).reduce((a, b) => a + b, 0)), formato: "num" },
          { etiqueta: `Cierre de ${nombreMes(rm.mes)}`, valor: cierre.valor, formato: "num", detalle: `rango ${cierre.bajo}–${cierre.alto}` },
          ...prox.map((v, i) => ({ etiqueta: `${nombreMes(sumarMes(rm.mes, i + 1))} (proyección)`, valor: Math.round(v), formato: "num" })),
        ],
      },
      desgloses: [{ titulo: "Pedidos por mes", tipo: "barras", items: mensual.map((m) => ({ clave: nombreMes(m.mes, true), valor: m.valor })) }],
      hallazgos,
    };
  }

  // =================================================================== SEGUIMIENTO
  async seguimiento(f) {
    const tipo = ["tienda", "proveedor", "almacen", "courier"].includes(f.tipo) ? f.tipo : "tienda";
    const M = METAS.seguimiento;
    const [{ filas }, mensual] = await Promise.all([
      this.segService.listar(tipo, { pais: f.pais }),
      this.dao.mensualPedidos(this.pedidosDAO.filtros({ pais: f.pais }), 12),
    ]);
    const conPedidos = filas.filter((x) => x.salud !== "sin_datos");
    const sanos = conPedidos.filter((x) => x.salud === "creciendo" || x.salud === "estable").length;
    const riesgo = conPedidos.filter((x) => ["atencion", "en_caida", "inactiva"].includes(x.salud));
    const conMeta = filas.filter((x) => x.meta_pedidos_mes);
    const cumplen = conMeta.filter((x) => x.proyeccion >= x.meta_pedidos_mes).length;
    const u30 = filas.reduce((t, x) => t + (x.u30 || 0), 0);
    const ent30 = filas.reduce((t, x) => t + (x.ent30 || 0), 0);
    const top5 = [...filas].sort((a, b) => (b.u30 || 0) - (a.u30 || 0)).slice(0, 5);
    const conc = pct(top5.reduce((t, x) => t + (x.u30 || 0), 0), u30);
    const proyMes = filas.reduce((t, x) => t + (x.proyeccion || 0), 0);
    const metaMes = conMeta.reduce((t, x) => t + x.meta_pedidos_mes, 0);
    const especial = filas.filter((x) => x.trato_especial).length;
    const nombre = { tienda: "tiendas", proveedor: "proveedores", almacen: "almacenes", courier: "couriers" }[tipo];

    const kpis = [
      kpi("sanos", `${cap(nombre)} sanas (crecen o estables)`, pct(sanos, conPedidos.length), { formato: "pct", meta: M.actoresSanos, medidor: true,
        ayuda: "En crecimiento o estables ÷ las que tienen pedidos.", detalle: `${sanos} de ${conPedidos.length}` }),
      kpi("metas", "Cumplirían su meta del mes", pct(cumplen, conMeta.length), { formato: "pct", meta: M.cumplimientoMetas, medidor: true,
        ayuda: "Con meta mensual definida y proyección del mes ≥ meta.", detalle: conMeta.length ? `${cumplen} de ${conMeta.length} con meta` : "Define metas en la ficha de cada actor" }),
      kpi("concentracion", "Concentración en el top 5", conc, { formato: "pct", meta: M.concentracionTop5, medidor: true,
        ayuda: "% de los pedidos (30 días) que generan los 5 actores más grandes. Alto = dependencia.", detalle: top5.map((x) => x.nombre).slice(0, 3).join(", ") }),
      kpi("efectividad", "Efectividad de entrega", pct(ent30, u30), { formato: "pct", meta: METAS.pedidos.efectividadEntrega,
        ayuda: "Entregados ÷ pedidos de los últimos 30 días de este grupo." }),
      kpi("riesgo", "En riesgo", riesgo.length, { estado: riesgo.length === 0 ? "ok" : riesgo.length <= 3 ? "warn" : "danger",
        ayuda: "Requieren atención, en caída o inactivas.", detalle: riesgo.slice(0, 3).map((x) => x.nombre).join(", ") }),
      kpi("activas", `${cap(nombre)} con pedidos`, conPedidos.length, { detalle: `de ${filas.length} registradas`, ayuda: "Con al menos un pedido en los últimos 4 meses." }),
      kpi("especial", "Con trato especial", especial, { ayuda: "Segmento distinto a estándar o con acuerdos vigentes." }),
      kpi("proyeccion", "Proyección del mes", proyMes, { detalle: metaMes ? `meta ${metaMes}` : "", ayuda: "Suma de lo que proyecta cada actor al ritmo actual.",
        estado: metaMes ? P.estadoMeta(proyMes, { meta: metaMes, tipo: "min" }, METAS.tolerancia) : "neutro" }),
    ];

    const completos = mensual.filter((m) => m.mes !== restanteMes().mes);
    const prox = P.pronosticoPeriodos(mesesUtiles([...completos.map((m) => m.valor), proyMesTotal(filas)]), 3);
    const mesActual = restanteMes().mes;
    const hallazgos = [
      ...riesgo.sort((a, b) => (b.p30 || 0) - (a.p30 || 0)).slice(0, 4).map((x) => ({ nivel: x.salud === "atencion" ? "warn" : "danger", texto: `${x.nombre}: ${x.motivo}.` })),
      ...filas.filter((x) => x.salud === "creciendo").sort((a, b) => (b.u30 || 0) - (a.u30 || 0)).slice(0, 2).map((x) => ({ nivel: "ok", texto: `${x.nombre}: ${x.motivo}.` })),
    ];
    if (conc != null && conc > M.concentracionTop5.meta) hallazgos.push({ nivel: "warn", texto: `El ${conc}% de los pedidos depende de 5 ${nombre}.` });

    return {
      modulo: "seguimiento", titulo: `Indicadores de ${nombre}`, periodo: "Últimos 30 días y mes en curso",
      kpis,
      pronostico: {
        titulo: "Pedidos por mes y proyección", unidad: "pedidos", periodo: "mes",
        historia: completos.map((m) => ({ x: m.mes, valor: m.valor })),
        futuro: [{ x: mesActual, valor: proyMes || null }, ...prox.slice(0, 2).map((v, i) => ({ x: sumarMes(mesActual, i + 1), valor: Math.round(v) }))].filter((p) => p.valor != null),
        metodo: "mes en curso: ritmo actual de cada actor · meses siguientes: tendencia lineal de los meses cerrados",
        resumen: [
          { etiqueta: `Proyección ${nombreMes(mesActual)}`, valor: proyMes, formato: "num" },
          ...prox.slice(0, 2).map((v, i) => ({ etiqueta: `${nombreMes(sumarMes(mesActual, i + 1))} (proyección)`, valor: Math.round(v), formato: "num" })),
        ],
      },
      desgloses: [
        { titulo: "Por salud", tipo: "barras", items: Object.entries(contar(filas, "salud")).map(([clave, valor]) => ({ clave: SALUD_TXT[clave] || clave, valor })) },
        { titulo: "Top 5 por pedidos (30 días)", tipo: "barras", items: top5.map((x) => ({ clave: x.nombre, valor: x.u30 || 0 })) },
      ],
      hallazgos,
    };
  }

  // =================================================================== INTEGRACIONES
  async integraciones(f) {
    const M = METAS.integraciones;
    const [d, semanal] = await Promise.all([
      this.dao.integraciones({ slaDias: M.slaDias, sinSeguimientoDias: M.sinSeguimientoDias, pais: f.pais || null }),
      this.dao.semanalIntegraciones(12, f.pais || null),
    ]);
    const abiertas = d.total - d.integradas - d.pausadas;
    const pasado = semanal.slice(0, -1); // la semana actual está incompleta
    const ritmo = P.media(pasado.slice(-8).map((s) => s.valor));
    const semanasFin = ritmo > 0 ? Math.ceil(abiertas / ritmo) : null;
    const fechaFin = semanasFin != null ? P.sumarDias(fechaEnZona(new Date()), semanasFin * 7) : null;
    const prox = P.pronosticoPeriodos(sinCerosIniciales(pasado.map((s) => s.valor)), 4);

    const kpis = [
      kpi("integradas", "Integradas", pct(d.integradas, d.total), { formato: "pct", medidor: true, estado: "neutro", ayuda: "Integraciones completadas ÷ total.", detalle: `${d.integradas} de ${d.total}` }),
      kpi("avance", "Avance promedio del checklist", d.avance, { formato: "pct", meta: M.avanceGlobal, medidor: true, ayuda: "Promedio del % de pasos completados." }),
      kpi("sla", `Integradas en ≤ ${M.slaDias} días (SLA)`, pct(d.integradas_en_sla, d.integradas_con_fecha), { formato: "pct", meta: M.cumplimientoSla, medidor: true,
        ayuda: `Integraciones completadas en ${M.slaDias} días o menos desde que se crearon.`, detalle: `${d.integradas_en_sla} de ${d.integradas_con_fecha}` }),
      kpi("dias", "Tiempo medio de integración", r1(d.dias_integracion), { formato: "dias", meta: { meta: M.slaDias, tipo: "max" }, ayuda: "Días promedio entre creación e integración." }),
      kpi("fuera_sla", "Abiertas fuera de SLA", d.fuera_sla, { estado: d.fuera_sla ? "danger" : "ok", ayuda: `Sin integrar con más de ${M.slaDias} días de antigüedad.` }),
      kpi("estancadas", `Sin movimiento > ${M.sinSeguimientoDias} días`, d.estancadas, { estado: d.estancadas ? "warn" : "ok", ayuda: "Abiertas sin cambios ni comentarios en la bitácora." }),
      kpi("abiertas", "Abiertas", abiertas, { detalle: `${d.en_proceso} en proceso · ${d.pendientes} pendientes · ${d.pausadas} pausadas` }),
      kpi("fin", "Fin estimado al ritmo actual", fechaFin, { formato: "fecha", detalle: ritmo ? `${r1(ritmo)} integraciones/semana` : "sin ritmo aún (ninguna integrada en 8 semanas)",
        ayuda: "Abiertas ÷ integraciones completadas por semana (promedio de 8 semanas)." }),
    ];
    const pasos = [["grupo_wsp", "Grupo WhatsApp"], ["conf_sistemas", "Configuración sistemas"], ["capacitacion", "Capacitación"], ["catalogo", "Catálogo"], ["despacho", "Despacho"], ["liquidaciones", "Liquidaciones"]];
    const hallazgos = [];
    const cuello = pasos.map(([k, t]) => ({ t, v: d[`paso_${k}`] })).sort((a, b) => a.v - b.v)[0];
    if (d.total && cuello) hallazgos.push({ nivel: "info", texto: `Paso menos completado: ${cuello.t} (${cuello.v} de ${d.total}). Es el cuello de botella.` });
    if (d.fuera_sla) hallazgos.push({ nivel: "danger", texto: `${d.fuera_sla} integraciones superaron el SLA de ${M.slaDias} días.` });
    if (d.estancadas) hallazgos.push({ nivel: "warn", texto: `${d.estancadas} integraciones abiertas no tienen movimiento hace más de ${M.sinSeguimientoDias} días.` });
    if (fechaFin) hallazgos.push({ nivel: "info", texto: `Al ritmo actual, las ${abiertas} abiertas terminarían cerca del ${fechaFin}.` });

    return {
      modulo: "integraciones", titulo: "Indicadores de integraciones", periodo: "Acumulado",
      kpis,
      pronostico: {
        titulo: "Integraciones completadas por semana", unidad: "integraciones", periodo: "semana",
        historia: pasado.map((s) => ({ x: s.semana, valor: s.valor })),
        futuro: prox.map((v, i) => ({ x: P.sumarDias(semanal.at(-1).semana, i * 7), valor: r1(v) })),
        metodo: "tendencia lineal de las semanas cerradas",
        resumen: [
          { etiqueta: "Ritmo (8 semanas)", valor: r1(ritmo), formato: "num", detalle: "por semana" },
          { etiqueta: "Próximas 4 semanas", valor: Math.round(prox.reduce((a, b) => a + b, 0)), formato: "num" },
          { etiqueta: "Nuevas este mes", valor: d.nuevas_mes, formato: "num" },
          { etiqueta: "Integradas este mes", valor: d.integradas_mes, formato: "num" },
        ],
      },
      desgloses: [
        { titulo: "Embudo del checklist", tipo: "barras", total: d.total, items: pasos.map(([k, t]) => ({ clave: t, valor: d[`paso_${k}`] })) },
        { titulo: "Avance por país", tipo: "barras", unidad: "%", items: d.porPais.map((p) => ({ clave: p.nombre || p.pais, valor: p.avance, detalle: `${p.integradas}/${p.total}` })) },
      ],
      hallazgos,
    };
  }

  // =================================================================== OBSERVACIONES
  async observaciones(f) {
    const M = METAS.observaciones;
    const [d, semanal] = await Promise.all([
      this.dao.observaciones({ sla: M.slaDias, dias: 30, pais: f.pais || null }),
      this.dao.semanalObservaciones(12, f.pais || null),
    ]);
    const pasado = semanal.slice(0, -1);
    const prox = P.pronosticoPeriodos(sinCerosIniciales(semanal.map((s) => s.valor)), 4);
    const flujo = P.media(pasado.slice(-4).map((s) => s.creadas - s.cerradas));
    const kpis = [
      kpi("sla", "Resueltas dentro del SLA", pct(d.resueltas_en_sla, d.resueltas), { formato: "pct", meta: M.cumplimientoSla, medidor: true,
        ayuda: `SLA por prioridad: alta ${M.slaDias.alta} d · media ${M.slaDias.media} d · baja ${M.slaDias.baja} d.`, detalle: `${d.resueltas_en_sla} de ${d.resueltas}` }),
      kpi("tasa", "Tasa de cierre (30 días)", pct(d.cerradas_periodo, d.creadas_periodo), { formato: "pct", meta: { meta: 100, tipo: "min" }, medidor: true,
        ayuda: "Cerradas ÷ creadas en los últimos 30 días. Bajo 100 % el backlog crece.", detalle: `${d.cerradas_periodo} cerradas · ${d.creadas_periodo} creadas` }),
      kpi("backlog", "Abiertas (backlog)", d.abiertas, { meta: M.backlogMax, detalle: `${d.abiertas_alta} de prioridad alta`, ayuda: "Abiertas + en proceso." }),
      kpi("vencidas", "Vencidas (fuera de SLA)", d.vencidas, { estado: d.vencidas ? "danger" : "ok", ayuda: "Abiertas que ya superaron su plazo según prioridad." }),
      kpi("dias", "Tiempo medio de resolución", r1(d.dias_resolucion), { formato: "dias", meta: { meta: M.slaDias.media, tipo: "max" } }),
      kpi("edad", "Antigüedad media del backlog", r1(d.edad_backlog), { formato: "dias" }),
      kpi("sin_resp", "Sin responsable", d.sin_responsable, { estado: d.sin_responsable ? "warn" : "ok" }),
    ];
    const hallazgos = [];
    if (d.vencidas) hallazgos.push({ nivel: "danger", texto: `${d.vencidas} observaciones abiertas están fuera de SLA.` });
    if (flujo > 0) hallazgos.push({ nivel: "warn", texto: `El backlog crece ~${r1(flujo)} por semana (se abren más de las que se cierran).` });
    else if (flujo < 0) hallazgos.push({ nivel: "ok", texto: `El backlog baja ~${r1(-flujo)} por semana.` });
    if (d.porModulo[0]) hallazgos.push({ nivel: "info", texto: `Módulo con más pendientes: ${d.porModulo[0].clave} (${d.porModulo[0].valor}).` });

    return {
      modulo: "observaciones", titulo: "Indicadores de observaciones", periodo: "Acumulado · últimos 30 días",
      kpis,
      pronostico: {
        titulo: "Backlog al cierre de cada semana y pronóstico", unidad: "abiertas", periodo: "semana",
        historia: semanal.map((s) => ({ x: s.semana, valor: s.valor })),
        futuro: prox.map((v, i) => ({ x: P.sumarDias(semanal.at(-1).semana, (i + 1) * 7), valor: r1(v) })),
        metodo: "tendencia lineal del backlog semanal",
        resumen: [
          { etiqueta: "Flujo neto semanal", valor: r1(flujo), formato: "num", detalle: "creadas − cerradas (4 semanas)" },
          { etiqueta: "Backlog en 4 semanas", valor: Math.round(prox.at(-1) || 0), formato: "num" },
        ],
      },
      desgloses: [
        { titulo: "Abiertas por prioridad", tipo: "barras", items: ["alta", "media", "baja"].map((k) => ({ clave: cap(k), valor: d.porPrioridad.find((x) => x.clave === k)?.valor || 0 })) },
        { titulo: "Abiertas por módulo", tipo: "barras", items: d.porModulo },
      ],
      hallazgos,
    };
  }

  // =================================================================== CALENDARIO (personal)
  async calendario(f, usuario) {
    const M = METAS.calendario;
    const [d, semanal] = await Promise.all([this.dao.calendario(usuario.id), this.dao.semanalCalendario(usuario.id, 10)]);
    const cerradas = semanal.slice(0, -2); // la semana actual y la próxima aún pueden cambiar
    const prox = P.pronosticoPeriodos(sinCerosIniciales(cerradas.map((s) => s.valor)), 2);
    const kpis = [
      kpi("a_tiempo", "Tareas hechas a tiempo", pct(d.tareas_a_tiempo, d.tareas_hechas_30d), { formato: "pct", meta: M.tareasATiempo, medidor: true,
        ayuda: "Tareas completadas antes de su fecha límite (30 días).", detalle: `${d.tareas_a_tiempo} de ${d.tareas_hechas_30d}` }),
      kpi("horas", "Horas de reunión esta semana", r1(d.horas_semana), { formato: "horas", meta: M.horasReunionSemana, medidor: true,
        ayuda: "Más horas de reunión = menos tiempo de ejecución." }),
      kpi("sincronizados", "Sincronizados con Google", pct(d.sincronizados_30d, d.eventos_30d), { formato: "pct", ayuda: "Eventos de los últimos 30 días enlazados con Google Calendar." }),
      kpi("vencidas", "Tareas vencidas", d.tareas_vencidas, { estado: d.tareas_vencidas ? "danger" : "ok" }),
      kpi("abiertas", "Tareas abiertas", d.tareas_abiertas),
      kpi("reuniones", "Reuniones esta semana", d.reuniones_semana, { detalle: `${d.proximas_7d} en los próximos 7 días` }),
      kpi("vinculados", "Vinculados a un actor o integración", pct(d.vinculados_30d, d.eventos_30d), { formato: "pct", ayuda: "Reuniones y tareas con integración o actor asignado (trazabilidad)." }),
    ];
    const hallazgos = [];
    if (d.tareas_vencidas) hallazgos.push({ nivel: "danger", texto: `Tienes ${d.tareas_vencidas} tareas vencidas.` });
    if (d.horas_semana > M.horasReunionSemana.meta) hallazgos.push({ nivel: "warn", texto: `Esta semana suma ${r1(d.horas_semana)} h de reuniones (meta ≤ ${M.horasReunionSemana.meta} h).` });
    return {
      modulo: "calendario", titulo: "Mis indicadores de agenda", periodo: "Semana actual · últimos 30 días",
      kpis,
      pronostico: {
        titulo: "Horas de reunión por semana", unidad: "horas", periodo: "semana",
        historia: semanal.slice(0, -1).map((s) => ({ x: s.semana, valor: s.valor })),
        futuro: [{ x: semanal.at(-1).semana, valor: semanal.at(-1).valor }, ...prox.slice(1).map((v, i) => ({ x: P.sumarDias(semanal.at(-1).semana, (i + 1) * 7), valor: r1(v) }))],
        metodo: "próxima semana: lo ya agendado · siguientes: tendencia de semanas cerradas",
        resumen: [{ etiqueta: "Agendado próxima semana", valor: semanal.at(-1).valor, formato: "horas" }],
      },
      desgloses: [{ titulo: "Tareas con vencimiento por semana", tipo: "barras", items: semanal.map((s) => ({ clave: s.semana.slice(5), valor: s.tareas })) }],
      hallazgos,
    };
  }

  // =================================================================== USUARIOS (admin)
  async usuarios() {
    const M = METAS.usuarios;
    const [d, serie] = await Promise.all([this.dao.usuarios({ passwordDias: M.passwordDias }), this.dao.serieLogins(30)]);
    const pr = P.pronosticoDiario(recortarInicio(serie.slice(0, -1)), 7);
    const kpis = [
      kpi("adopcion", "Adopción (entraron en 30 días)", pct(d.activos_30d, d.activos), { formato: "pct", meta: M.adopcion, medidor: true,
        ayuda: "Usuarios activos que iniciaron sesión en los últimos 30 días.", detalle: `${d.activos_30d} de ${d.activos}` }),
      kpi("google", "Con Google Calendar conectado", pct(d.con_google, d.activos), { formato: "pct", meta: M.googleConectado, medidor: true, detalle: `${d.con_google} de ${d.activos}` }),
      kpi("pendientes", "Pendientes de aprobación", d.pendientes, { estado: d.pendientes ? "warn" : "ok" }),
      kpi("password", `Contraseña con más de ${M.passwordDias} días`, d.password_antigua, { estado: d.password_antigua ? "warn" : "ok" }),
      kpi("bloqueados", "Bloqueados ahora", d.bloqueados, { estado: d.bloqueados ? "danger" : "ok" }),
      kpi("activos7", "Activos esta semana", d.activos_7d, { detalle: `${d.activos} activos · ${d.suspendidos} suspendidos` }),
      kpi("nuevos", "Nuevos (30 días)", d.nuevos_30d),
    ];
    const hallazgos = [];
    if (d.pendientes) hallazgos.push({ nivel: "warn", texto: `${d.pendientes} usuarios esperan aprobación.` });
    if (d.password_antigua) hallazgos.push({ nivel: "warn", texto: `${d.password_antigua} usuarios no cambian su contraseña hace más de ${M.passwordDias} días.` });
    return {
      modulo: "usuarios", titulo: "Indicadores de usuarios", periodo: "Actual · últimos 30 días",
      kpis,
      pronostico: {
        titulo: "Inicios de sesión por día y pronóstico", unidad: "inicios",
        historia: serie.slice(0, -1).map((s) => ({ x: s.dia, valor: s.valor })),
        futuro: pr.dias.map((dia, i) => ({ x: dia, valor: pr.pred[i], bajo: pr.bajo[i], alto: pr.alto[i] })),
        metodo: pr.metodo,
        resumen: [{ etiqueta: "Próximos 7 días (estimado)", valor: Math.round(pr.pred.reduce((a, b) => a + b, 0)), formato: "num" }],
      },
      desgloses: [{ titulo: "Usuarios por rol", tipo: "barras", items: [{ clave: "Administradores", valor: d.admins }, { clave: "Editores", valor: d.editores }, { clave: "Lectores", valor: d.lectores }] }],
      hallazgos,
    };
  }

  // =================================================================== AUDITORÍA (admin)
  async auditoria() {
    const M = METAS.auditoria;
    const [d, serie] = await Promise.all([this.dao.auditoria(7), this.dao.serieLogins(30)]);
    const intentos = d.logins + d.fallidos;
    const fallidos = serie.map((s) => s.fallidos);
    const picos = P.anomalias(fallidos, 2).filter((p) => p.v >= 3);
    const pr = P.pronosticoDiario(recortarInicio(serie.slice(0, -1).map((s) => ({ dia: s.dia, valor: s.eventos }))), 7);
    const kpis = [
      kpi("login_ok", "Inicios de sesión correctos", pct(d.logins, intentos), { formato: "pct", meta: M.loginExitoso, medidor: true,
        ayuda: "Correctos ÷ intentos (últimos 7 días). Bajo = posibles ataques o contraseñas olvidadas.", detalle: `${d.fallidos} fallidos de ${intentos}` }),
      kpi("bloqueos", "Cuentas bloqueadas (7 días)", d.bloqueos, { estado: d.bloqueos ? "warn" : "ok" }),
      kpi("eventos", "Eventos registrados (7 días)", d.eventos, { detalle: `${d.usuarios} usuarios · ${d.ips} IP distintas` }),
      kpi("acceso", "Cambios de acceso (7 días)", d.cambios_acceso, { ayuda: "Cambios de rol/estado y desbloqueos hechos por administradores." }),
      kpi("eliminaciones", "Eliminaciones (7 días)", d.eliminaciones, { estado: d.eliminaciones > 5 ? "warn" : "neutro" }),
    ];
    const hallazgos = picos.map((p) => ({ nivel: "danger", texto: `Pico de ${p.v} inicios fallidos el ${serie[p.i].dia} (revisar IP en el detalle).` }));
    if (!hallazgos.length) hallazgos.push({ nivel: "ok", texto: "Sin picos inusuales de inicios fallidos en 30 días." });
    return {
      modulo: "auditoria", titulo: "Indicadores de seguridad y actividad", periodo: "Últimos 7 días · tendencia de 30",
      kpis,
      pronostico: {
        titulo: "Actividad registrada por día", unidad: "eventos",
        historia: serie.slice(0, -1).map((s) => ({ x: s.dia, valor: s.eventos })),
        futuro: pr.dias.map((dia, i) => ({ x: dia, valor: pr.pred[i], bajo: pr.bajo[i], alto: pr.alto[i] })),
        metodo: pr.metodo, resumen: [],
      },
      desgloses: [
        { titulo: "Acciones más frecuentes (28 días)", tipo: "barras", items: d.porAccion },
        { titulo: "Usuarios más activos (28 días)", tipo: "barras", items: d.porUsuario },
      ],
      hallazgos,
    };
  }

  // =================================================================== CARGAS
  async cargas() {
    const M = METAS.cargas;
    const [d, serie] = await Promise.all([this.dao.cargas(30), this.dao.serieCargas(30)]);
    const kpis = [
      kpi("dias", "Días hábiles con carga", pct(d.dias_habiles_con_carga, d.dias_habiles), { formato: "pct", meta: M.diasConCarga, medidor: true,
        detalle: `${d.dias_habiles_con_carga} de ${d.dias_habiles} (30 días)`, ayuda: "Constancia de la actualización diaria." }),
      kpi("rechazo", "Filas rechazadas", pct(d.rechazadas, d.filas), { formato: "pct", meta: M.tasaRechazo, medidor: true, detalle: `${d.rechazadas} de ${d.filas}` }),
      kpi("frescura", "Antigüedad de los datos", r1(d.horas_ultima), { formato: "horas", meta: METAS.pedidos.frescuraHoras }),
      kpi("cargas", "Cargas (30 días)", d.cargas, { detalle: `${d.sync} automáticas · ${d.csv} CSV` }),
      kpi("duracion", "Duración media", d.duracion_ms != null ? r1(d.duracion_ms / 1000) : null, { formato: "seg" }),
      kpi("nuevos", "Pedidos nuevos (30 días)", d.insertadas, { detalle: `${d.actualizadas} actualizados` }),
    ];
    const hallazgos = [];
    if (d.horas_ultima == null) hallazgos.push({ nivel: "warn", texto: "Aún no hay cargas registradas." });
    else if (d.horas_ultima > METAS.pedidos.frescuraHoras.meta) hallazgos.push({ nivel: "danger", texto: `La última carga fue hace ${Math.round(d.horas_ultima)} h: el tablero puede estar desactualizado.` });
    return {
      modulo: "cargas", titulo: "Indicadores de carga de datos", periodo: "Últimos 30 días",
      kpis,
      pronostico: { titulo: "Filas procesadas por día", unidad: "filas", historia: serie.map((s) => ({ x: s.dia, valor: s.valor })), futuro: [], metodo: "", resumen: [] },
      desgloses: [],
      hallazgos,
    };
  }
}

const SALUD_TXT = { creciendo: "En crecimiento", estable: "Estable", atencion: "Requiere atención", en_caida: "En caída", inactiva: "Inactiva", sin_datos: "Sin pedidos" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function nombreMes(ym, corto = false) { const [a, m] = ym.split("-").map(Number); return corto ? `${MESES[m - 1]} ${String(a).slice(2)}` : `${MESES_L[m - 1]} ${a}`; }
function sumarMes(ym, k) { const [a, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + k, 1)); return d.toISOString().slice(0, 7); }
function prevMes(ym) { return sumarMes(ym, -1); }
function contar(xs, campo) { const o = {}; for (const x of xs) o[x[campo]] = (o[x[campo]] || 0) + 1; return o; }
function proyMesTotal(filas) { return filas.reduce((t, x) => t + (x.proyeccion || 0), 0); }
function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

Object.assign(IndicadorService, { MODULOS, kpi, recortarInicio, pct });
module.exports = IndicadorService;
