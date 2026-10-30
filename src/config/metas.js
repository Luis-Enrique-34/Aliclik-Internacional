// =====================================================================
//  METAS, SLA Y UMBRALES DE LOS INDICADORES
//  Cambiar un objetivo = cambiar este archivo (y reiniciar / redesplegar).
//  "min": el valor debe ser >= meta · "max": el valor debe ser <= meta.
//  El color del indicador: verde si cumple, ámbar si está dentro de la
//  tolerancia (15 % de la meta), rojo si la supera.
// =====================================================================
module.exports = Object.freeze({
  tolerancia: 0.15,

  pedidos: {
    efectividadEntrega: { meta: 70, tipo: "min" },   // % entregados sobre pedidos cerrados (30 días)
    tasaDevolucion: { meta: 20, tipo: "max" },       // % devueltos + cancelados sobre cerrados (30 días)
    slaEntregaDias: 5,                               // un pedido debe entregarse en ≤ 5 días
    cumplimientoSlaEntrega: { meta: 85, tipo: "min" }, // % de entregados dentro del SLA
    pedidosEstancadosDias: 7,                        // en curso con más de N días = estancado
    frescuraHoras: { meta: 24, tipo: "max" },        // horas desde la última carga de datos
  },

  integraciones: {
    slaDias: 30,                                     // de "creada" a "integrada"
    cumplimientoSla: { meta: 80, tipo: "min" },      // % integradas dentro del SLA
    avanceGlobal: { meta: 80, tipo: "min" },         // % promedio del checklist
    sinSeguimientoDias: 7,                           // abierta sin movimiento N días = estancada
  },

  observaciones: {
    slaDias: { alta: 2, media: 5, baja: 10 },        // días para resolver según prioridad
    cumplimientoSla: { meta: 85, tipo: "min" },
    backlogMax: { meta: 15, tipo: "max" },           // observaciones abiertas aceptables
  },

  calendario: {
    tareasATiempo: { meta: 90, tipo: "min" },        // % de tareas hechas antes de su fecha límite
    horasReunionSemana: { meta: 15, tipo: "max" },   // horas de reunión por semana por persona
  },

  usuarios: {
    adopcion: { meta: 80, tipo: "min" },             // % de usuarios activos que entraron en 30 días
    passwordDias: 90,                                // contraseña con más de N días = antigua
    googleConectado: { meta: 70, tipo: "min" },
  },

  auditoria: {
    loginExitoso: { meta: 90, tipo: "min" },         // % de inicios de sesión correctos (7 días)
  },

  cargas: {
    tasaRechazo: { meta: 2, tipo: "max" },           // % de filas rechazadas (30 días)
    diasConCarga: { meta: 90, tipo: "min" },         // % de días hábiles con al menos una carga (30 días)
  },

  seguimiento: {
    actoresSanos: { meta: 70, tipo: "min" },         // % en crecimiento o estables (con pedidos)
    cumplimientoMetas: { meta: 80, tipo: "min" },    // % de actores con meta que proyectan cumplirla
    concentracionTop5: { meta: 60, tipo: "max" },    // % de pedidos que concentran las 5 primeras tiendas
  },
});
