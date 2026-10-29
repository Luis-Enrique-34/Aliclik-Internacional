// =====================================================================
//  SERVICIO de seguimiento por actor (tiendas, proveedores, almacenes y
//  couriers): salud del volumen de pedidos, metas mensuales, trato especial
//  (segmento y acuerdos con descuentos/beneficios por escalas) y alertas.
//  Las reglas de evaluación son funciones puras (fáciles de probar).
// =====================================================================
const { HttpError, noEncontrado } = require("../utils/HttpError");
const { fechaEnZona } = require("../utils/fechas");
const memo = require("../utils/memo");

// Umbrales de evaluación (cambiar una política = cambiar este objeto)
const REGLAS = Object.freeze({
  diasInactividad: 7,       // sin pedidos en N días (habiendo tenido antes) → inactiva
  caidaFuerte: -0.3,        // últimos 30 días vs 30 anteriores
  caidaLeve: -0.1,
  crecimiento: 0.2,
  devolucionAlta: 0.25,     // devueltos+cancelados / pedidos (30 días)
  minimoParaTasas: 10,      // no se evalúan tasas con menos de N pedidos
  metaRiesgo: 0.8,          // proyección del mes < 80 % de la meta
  diasPorVencer: 15,
  cercaDeEscala: 0.1,       // a menos del 10 % del umbral → "cerca de desbloquear"
});

const SALUD = {
  creciendo: { orden: 4, texto: "En crecimiento" },
  estable: { orden: 3, texto: "Estable" },
  atencion: { orden: 2, texto: "Requiere atención" },
  en_caida: { orden: 1, texto: "En caída" },
  inactiva: { orden: 0, texto: "Inactiva" },
  sin_datos: { orden: 5, texto: "Sin pedidos" },
};

const OTROS = {
  tienda: ["proveedor", "courier"],
  proveedor: ["tienda", "almacen"],
  almacen: ["proveedor", "courier"],
  courier: ["almacen", "tienda"],
};

/** Día del mes y días del mes en la zona horaria de la app. */
function calendarioHoy(ahora = new Date()) {
  const hoy = fechaEnZona(ahora);
  const [a, m, d] = hoy.split("-").map(Number);
  return { hoy, dia: d, diasMes: new Date(Date.UTC(a, m, 0)).getUTCDate() };
}

/**
 * Evalúa la salud de un actor a partir de sus métricas.
 * @returns {{ salud: string, motivo: string, variacion: number|null, proyeccion: number, avanceMeta: number|null,
 *             tasaEntrega: number|null, tasaPerdida: number|null, diasSinPedidos: number|null, alertas: object[] }}
 */
function evaluar(m, { ahora = new Date() } = {}) {
  const { dia, diasMes } = calendarioHoy(ahora);
  const diasSinPedidos = m.ultimo_pedido ? Math.floor((ahora - new Date(m.ultimo_pedido)) / 86400000) : null;
  const variacion = m.p30 > 0 ? (m.u30 - m.p30) / m.p30 : null;
  const proyeccion = Math.round((m.mes_actual / dia) * diasMes);
  const avanceMeta = m.meta_pedidos_mes ? m.mes_actual / m.meta_pedidos_mes : null;
  const tasaEntrega = m.u30 >= REGLAS.minimoParaTasas ? m.ent30 / m.u30 : null;
  const tasaPerdida = m.u30 >= REGLAS.minimoParaTasas ? m.perd30 / m.u30 : null;
  const alertas = [];

  let salud;
  let motivo;
  if (!m.u30 && !m.p30 && !m.mes_actual) {
    salud = diasSinPedidos != null ? "inactiva" : "sin_datos";
    motivo = diasSinPedidos != null ? `Sin pedidos hace ${diasSinPedidos} días` : m.aurora_id ? "Sin pedidos en los últimos 4 meses" : "Sin vincular a Aurora";
  } else if (diasSinPedidos != null && diasSinPedidos >= REGLAS.diasInactividad) {
    salud = "inactiva";
    motivo = `Sin pedidos hace ${diasSinPedidos} días`;
  } else if (variacion != null && variacion <= REGLAS.caidaFuerte) {
    salud = "en_caida";
    motivo = `Pedidos ${Math.round(variacion * 100)}% vs. los 30 días anteriores`;
  } else if (variacion != null && variacion <= REGLAS.caidaLeve) {
    salud = "atencion";
    motivo = `Pedidos ${Math.round(variacion * 100)}% vs. los 30 días anteriores`;
  } else if (variacion == null && m.p30 === 0 && m.u30 > 0) {
    salud = "creciendo";
    motivo = "Empezó a generar pedidos este mes";
  } else if (variacion != null && variacion >= REGLAS.crecimiento) {
    salud = "creciendo";
    motivo = `Pedidos +${Math.round(variacion * 100)}% vs. los 30 días anteriores`;
  } else {
    salud = "estable";
    motivo = variacion != null ? `Variación ${variacion >= 0 ? "+" : ""}${Math.round(variacion * 100)}%` : "Volumen estable";
  }

  if (salud === "inactiva" && diasSinPedidos != null) alertas.push({ nivel: "alta", texto: `Sin pedidos hace ${diasSinPedidos} días` });
  if (salud === "en_caida") alertas.push({ nivel: "alta", texto: motivo });
  if (salud === "atencion") alertas.push({ nivel: "media", texto: motivo });
  if (tasaPerdida != null && tasaPerdida >= REGLAS.devolucionAlta) {
    alertas.push({ nivel: "media", texto: `${Math.round(tasaPerdida * 100)}% de devoluciones o cancelaciones (30 días)` });
  }
  if (m.meta_pedidos_mes && dia >= 5 && proyeccion < m.meta_pedidos_mes * REGLAS.metaRiesgo) {
    alertas.push({ nivel: "media", texto: `Proyección del mes ${proyeccion} de ${m.meta_pedidos_mes} pedidos de meta` });
  }
  return { salud, motivo, variacion, proyeccion, avanceMeta, tasaEntrega, tasaPerdida, diasSinPedidos, alertas };
}

/**
 * Estado de un acuerdo según su vigencia y su umbral de pedidos del mes.
 * @returns {{ vigencia: string, umbral: null | { cumplido: boolean, faltan: number, avance: number } }}
 */
function estadoAcuerdo(a, pedidosMes, hoy = fechaEnZona(new Date())) {
  const desde = String(a.vigente_desde || "").slice(0, 10);
  const hasta = a.vigente_hasta ? String(a.vigente_hasta).slice(0, 10) : null;
  let vigencia;
  if (a.estado === "pausado" || a.estado === "finalizado") vigencia = a.estado;
  else if (desde && desde > hoy) vigencia = "programado";
  else if (hasta && hasta < hoy) vigencia = "vencido";
  else if (hasta && (Date.parse(hasta) - Date.parse(hoy)) / 86400000 <= REGLAS.diasPorVencer) vigencia = "por_vencer";
  else vigencia = "vigente";
  const umbral = a.umbral_pedidos
    ? { cumplido: pedidosMes >= a.umbral_pedidos, faltan: Math.max(0, a.umbral_pedidos - pedidosMes), avance: Math.min(1, pedidosMes / a.umbral_pedidos) }
    : null;
  return { vigencia, umbral };
}

/** Próximo beneficio por escala aún no alcanzado este mes (el de menor umbral). */
function siguienteEscala(acuerdos, pedidosMes, hoy) {
  return acuerdos
    .filter((a) => a.umbral_pedidos && a.umbral_pedidos > pedidosMes)
    .filter((a) => ["vigente", "por_vencer"].includes(estadoAcuerdo(a, pedidosMes, hoy).vigencia))
    .sort((x, y) => x.umbral_pedidos - y.umbral_pedidos)[0] || null;
}

function alertasDeAcuerdos(acuerdos, pedidosMes, hoy) {
  const alertas = [];
  for (const a of acuerdos) {
    const { vigencia, umbral } = estadoAcuerdo(a, pedidosMes, hoy);
    if (vigencia === "por_vencer") alertas.push({ nivel: "media", texto: `Acuerdo "${a.titulo}" vence el ${String(a.vigente_hasta).slice(0, 10)}` });
    if (vigencia === "vencido" && a.estado === "activo") alertas.push({ nivel: "media", texto: `Acuerdo "${a.titulo}" está vencido y sigue marcado como activo` });
    if (umbral && !umbral.cumplido && ["vigente", "por_vencer"].includes(vigencia) && umbral.faltan <= Math.ceil(a.umbral_pedidos * REGLAS.cercaDeEscala)) {
      alertas.push({ nivel: "info", texto: `A ${umbral.faltan} pedidos de desbloquear "${a.titulo}"` });
    }
  }
  return alertas;
}

const PESO = { alta: 0, media: 1, info: 2 };

class SeguimientoService {
  constructor({ metricaDAO, entidadDAO, acuerdoDAO, integracionDAO, eventoDAO, auditoriaDAO }) {
    this.metricas = metricaDAO;
    this.entidades = entidadDAO;
    this.acuerdos = acuerdoDAO;
    this.integraciones = integracionDAO;
    this.eventos = eventoDAO;
    this.auditoria = auditoriaDAO;
  }

  /** Enriquecer filas con su evaluación, acuerdos y alertas. */
  async #enriquecer(filas) {
    const hoy = fechaEnZona(new Date());
    const acuerdos = await this.acuerdos.activosDe(filas.map((f) => f.id));
    const porEntidad = new Map();
    for (const a of acuerdos) porEntidad.set(a.entidad_id, [...(porEntidad.get(a.entidad_id) || []), a]);
    return filas.map((f) => {
      const ev = evaluar(f);
      const propios = porEntidad.get(f.id) || [];
      const vigentes = propios.filter((a) => ["vigente", "por_vencer"].includes(estadoAcuerdo(a, f.mes_actual, hoy).vigencia));
      const escala = siguienteEscala(propios, f.mes_actual, hoy);
      const alertas = [...ev.alertas, ...alertasDeAcuerdos(propios, f.mes_actual, hoy)].sort((x, y) => PESO[x.nivel] - PESO[y.nivel]);
      return {
        ...f, ...ev, alertas,
        acuerdos_vigentes: vigentes.length,
        beneficios_ganados: vigentes.filter((a) => !a.umbral_pedidos || f.mes_actual >= a.umbral_pedidos).map((a) => a.titulo),
        siguiente_escala: escala ? { titulo: escala.titulo, umbral: escala.umbral_pedidos, faltan: escala.umbral_pedidos - f.mes_actual } : null,
        trato_especial: f.segmento !== "estandar" || vigentes.length > 0,
      };
    });
  }

  /** Listado de un tipo con resumen por salud y alertas priorizadas. */
  async listar(tipo, { pais, q, segmento, salud, especial } = {}) {
    // Se recalcula solo si cambiaron los datos (carga, plan o acuerdo) o pasó 1 minuto
    const base = await memo.recordar(`seguimiento:${tipo}:${pais || ""}:${q || ""}:${segmento || ""}`,
      async () => this.#enriquecer(await this.metricas.entidadesConMetricas({ tipo, pais, q, segmento })));
    let filas = base;
    const resumen = { total: filas.length, especial: 0, porSalud: Object.fromEntries(Object.keys(SALUD).map((k) => [k, 0])), pedidosMes: 0, metaMes: 0 };
    for (const f of filas) {
      resumen.porSalud[f.salud]++;
      if (f.trato_especial) resumen.especial++;
      resumen.pedidosMes += f.mes_actual;
      resumen.metaMes += f.meta_pedidos_mes || 0;
    }
    const alertas = filas
      .flatMap((f) => f.alertas.map((a) => ({ ...a, entidad_id: f.id, nombre: f.nombre, tipo: f.tipo, especial: f.trato_especial })))
      .sort((x, y) => PESO[x.nivel] - PESO[y.nivel] || Number(y.especial) - Number(x.especial))
      .slice(0, 40);
    if (salud) filas = filas.filter((f) => f.salud === salud);
    if (especial) filas = filas.filter((f) => f.trato_especial);
    return { filas, resumen, alertas, reglas: REGLAS };
  }

  /** Alertas de todos los tipos (tablero), priorizando a los de trato especial. */
  async alertasGenerales(limite = 6) {
    const listas = await Promise.all(Object.keys(OTROS).map((t) => this.listar(t)));
    return listas.flatMap((l) => l.alertas).filter((a) => a.nivel !== "info")
      .sort((x, y) => PESO[x.nivel] - PESO[y.nivel] || Number(y.especial) - Number(x.especial)).slice(0, limite);
  }

  /** Ficha 360 de un actor. */
  async ficha(id) {
    const base = await this.entidades.obtener(id);
    if (!base) throw noEncontrado("el registro");
    const [fila] = await this.metricas.entidadesConMetricas({ tipo: base.tipo, id });
    const [e] = await this.#enriquecer([fila]);
    const hoy = fechaEnZona(new Date());
    const [acuerdos, mensual, contrapartes, integraciones, eventos] = await Promise.all([
      this.acuerdos.deEntidad(id),
      e.aurora_id ? this.metricas.mensual(e.tipo, e.aurora_id, 12) : [],
      e.aurora_id ? Promise.all(OTROS[e.tipo].map((o) => this.metricas.contrapartes(e.tipo, e.aurora_id, o).then((filas) => ({ tipo: o, filas })))) : [],
      e.tipo === "proveedor" || e.tipo === "almacen" ? this.integraciones.deEntidad(id) : [],
      this.eventos.vinculados(id),
    ]);
    return {
      entidad: e,
      acuerdos: acuerdos.map((a) => ({ ...a, ...estadoAcuerdo(a, e.mes_actual, hoy) })),
      mensual, contrapartes, integraciones, eventos, reglas: REGLAS,
    };
  }

  async actualizarPlan(id, datos, usuarioId, ip) {
    const r = await this.entidades.actualizarPlan(id, datos);
    if (!r) throw noEncontrado("el registro");
    memo.invalidar();
    await this.auditoria.registrar({ usuarioId, accion: "PLAN_SEGUIMIENTO", entidad: "entidades", entidadId: id, ip, detalle: { segmento: r.segmento, meta: r.meta_pedidos_mes } });
    return r;
  }

  // ------------------------------------------------------------- Acuerdos
  listarAcuerdos(f) {
    const hoy = fechaEnZona(new Date());
    return this.acuerdos.listar(f).then((filas) => filas.map((a) => ({ ...a, ...estadoAcuerdo(a, 0, hoy), umbral: null })));
  }

  async crearAcuerdo(d, usuarioId, ip) {
    if (!(await this.entidades.obtener(d.entidad_id))) throw new HttpError(400, "Revisa los datos", { entidad_id: "Registro no válido" });
    const { id } = await this.acuerdos.crear(d, usuarioId);
    memo.invalidar();
    await this.auditoria.registrar({ usuarioId, accion: "ACUERDO_CREADO", entidad: "acuerdos", entidadId: id, ip, detalle: { entidad: d.entidad_id, tipo: d.tipo, valor: d.valor } });
    return this.acuerdos.obtener(id);
  }

  async actualizarAcuerdo(id, d, usuarioId, ip) {
    const antes = await this.acuerdos.obtener(id);
    if (!antes) throw noEncontrado("el acuerdo");
    await this.acuerdos.actualizar(id, { ...d, entidad_id: antes.entidad_id });
    memo.invalidar();
    await this.auditoria.registrar({
      usuarioId, accion: "ACUERDO_EDITADO", entidad: "acuerdos", entidadId: id, ip,
      detalle: { antes: { valor: antes.valor, estado: antes.estado, umbral: antes.umbral_pedidos }, despues: { valor: d.valor, estado: d.estado, umbral: d.umbral_pedidos } },
    });
    return this.acuerdos.obtener(id);
  }

  async eliminarAcuerdo(id, usuarioId, ip) {
    const r = await this.acuerdos.eliminar(id);
    if (!r) throw noEncontrado("el acuerdo");
    memo.invalidar();
    await this.auditoria.registrar({ usuarioId, accion: "ACUERDO_ELIMINADO", entidad: "acuerdos", entidadId: id, ip });
  }
}

Object.assign(SeguimientoService, { evaluar, estadoAcuerdo, siguienteEscala, alertasDeAcuerdos, calendarioHoy, REGLAS, SALUD });
module.exports = SeguimientoService;
