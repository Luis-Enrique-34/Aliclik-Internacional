// =====================================================================
//  DAO de INDICADORES: lecturas agregadas (solo lectura) para los
//  medidores, KPI/SLA y pronósticos de cada módulo.
//  Una consulta por bloque, con FILTER (WHERE …) para leer cada tabla
//  una sola vez. Los umbrales llegan como parámetros (nunca concatenados).
// =====================================================================
const BaseDAO = require("./BaseDAO");
const { ZONA_HORARIA } = require("../config/env");

const HOY = `(now() AT TIME ZONE '${ZONA_HORARIA.replace(/'/g, "")}')::date`;
const n = (v) => (v == null ? null : Number(v));

class IndicadorDAO extends BaseDAO {
  // ------------------------------------------------------------- Pedidos
  /** Entregas, SLA y estancados de los últimos `dias` días (con los filtros del tablero). */
  async pedidos(filtrosSql, { dias = 30, slaDias = 5, estancadoDias = 7 } = {}) {
    const { where, params } = filtrosSql;
    const p = (v) => { params.push(v); return `$${params.length}`; };
    const desde = `${HOY} - ${p(dias - 1)}::int`;
    const cond = `p.dia_local >= ${desde}`;
    const fila = await this.uno(
      `SELECT count(*) FILTER (WHERE ${cond})::int AS pedidos,
              count(*) FILTER (WHERE ${cond} AND eg.grupo = 'entregado')::int AS entregados,
              count(*) FILTER (WHERE ${cond} AND eg.grupo IN ('devuelto','cancelado'))::int AS perdidos,
              count(*) FILTER (WHERE ${cond} AND eg.grupo = 'entregado' AND p.fecha_entrega IS NOT NULL)::int AS entregados_con_fecha,
              count(*) FILTER (WHERE ${cond} AND eg.grupo = 'entregado' AND p.fecha_entrega IS NOT NULL
                                 AND p.fecha_entrega - p.dia_local <= ${p(slaDias)}::int)::int AS entregados_en_sla,
              avg(p.fecha_entrega - p.dia_local) FILTER (WHERE ${cond} AND eg.grupo = 'entregado' AND p.fecha_entrega >= p.dia_local) AS dias_entrega,
              count(*) FILTER (WHERE eg.grupo IN ('pendiente','en_proceso','en_ruta')
                                 AND p.dia_local < ${HOY} - ${p(estancadoDias)}::int)::int AS estancados,
              count(*) FILTER (WHERE eg.grupo IN ('pendiente','en_proceso','en_ruta'))::int AS en_curso,
              COALESCE(sum(p.total) FILTER (WHERE ${cond}), 0) AS monto,
              (CASE WHEN min(p.moneda) FILTER (WHERE ${cond}) IS DISTINCT FROM max(p.moneda) FILTER (WHERE ${cond}) THEN NULL
                    ELSE min(p.moneda) FILTER (WHERE ${cond}) END) AS moneda
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        ${where}`,
      params
    );
    return { ...fila, dias_entrega: n(fila.dias_entrega), monto: n(fila.monto) };
  }

  /** Serie diaria de pedidos de los últimos `dias` días (sin huecos). */
  serieDiariaPedidos(filtrosSql, dias = 84) {
    const { where, params } = filtrosSql;
    params.push(dias - 1);
    const extra = `p.dia_local >= ${HOY} - $${params.length}::int`;
    return this.varios(
      `WITH d AS (SELECT generate_series(${HOY} - $${params.length}::int, ${HOY}, interval '1 day')::date AS dia),
            c AS (SELECT p.dia_local AS dia, count(*)::int AS valor,
                         count(*) FILTER (WHERE eg.grupo = 'entregado')::int AS entregados
                    FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
                   ${where ? `${where} AND ${extra}` : `WHERE ${extra}`}
                   GROUP BY 1)
       SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, COALESCE(c.valor, 0) AS valor, COALESCE(c.entregados, 0) AS entregados
         FROM d LEFT JOIN c USING (dia) ORDER BY d.dia`,
      params
    );
  }

  /** Pedidos por mes (últimos 12 meses) para el gráfico mensual con proyección. */
  mensualPedidos(filtrosSql, meses = 12) {
    const { where, params } = filtrosSql;
    params.push(meses - 1);
    const extra = `p.dia_local >= date_trunc('month', ${HOY}) - ($${params.length}::int * interval '1 month')`;
    return this.varios(
      `SELECT to_char(date_trunc('month', p.dia_local), 'YYYY-MM') AS mes, count(*)::int AS valor
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        ${where ? `${where} AND ${extra}` : `WHERE ${extra}`}
        GROUP BY 1 ORDER BY 1`,
      params
    );
  }

  // ------------------------------------------------------------- Cargas
  async cargas(dias = 30) {
    const fila = await this.uno(
      `SELECT count(*)::int AS cargas,
              COALESCE(sum(filas_total), 0)::int AS filas, COALESCE(sum(rechazadas), 0)::int AS rechazadas,
              COALESCE(sum(insertadas), 0)::int AS insertadas, COALESCE(sum(actualizadas), 0)::int AS actualizadas,
              count(*) FILTER (WHERE origen = 'sync')::int AS sync, count(*) FILTER (WHERE origen = 'csv')::int AS csv,
              count(DISTINCT (creado_en AT TIME ZONE $2)::date)
                FILTER (WHERE extract(isodow FROM (creado_en AT TIME ZONE $2)) < 6)::int AS dias_habiles_con_carga,
              avg(duracion_ms)::int AS duracion_ms,
              (SELECT extract(epoch FROM now() - max(creado_en)) / 3600 FROM cargas) AS horas_ultima
         FROM cargas WHERE creado_en >= now() - ($1::int * interval '1 day')`,
      [dias, ZONA_HORARIA]
    );
    const habiles = await this.uno(
      `SELECT count(*)::int AS n FROM generate_series(${HOY} - ($1::int - 1), ${HOY}, interval '1 day') d
        WHERE extract(isodow FROM d) < 6`,
      [dias]
    );
    return { ...fila, horas_ultima: n(fila.horas_ultima), dias_habiles: habiles.n };
  }

  serieCargas(dias = 30) {
    return this.varios(
      `WITH d AS (SELECT generate_series(${HOY} - ($1::int - 1), ${HOY}, interval '1 day')::date AS dia)
       SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, COALESCE(sum(c.filas_total), 0)::int AS valor,
              COALESCE(sum(c.rechazadas), 0)::int AS rechazadas, count(c.id)::int AS cargas
         FROM d LEFT JOIN cargas c ON (c.creado_en AT TIME ZONE $2)::date = d.dia
        GROUP BY d.dia ORDER BY d.dia`,
      [dias, ZONA_HORARIA]
    );
  }

  // ------------------------------------------------------------- Integraciones
  async integraciones({ slaDias = 30, sinSeguimientoDias = 7, pais = null } = {}) {
    const resumen = await this.uno(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE estado = 'integrado')::int AS integradas,
              count(*) FILTER (WHERE estado = 'en_proceso')::int AS en_proceso,
              count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
              count(*) FILTER (WHERE estado = 'pausado')::int AS pausadas,
              COALESCE(avg(avance), 0)::numeric(5,1) AS avance,
              count(*) FILTER (WHERE estado = 'integrado' AND integrada_en IS NOT NULL)::int AS integradas_con_fecha,
              count(*) FILTER (WHERE estado = 'integrado' AND integrada_en - creado_en <= ($1::int * interval '1 day'))::int AS integradas_en_sla,
              avg(extract(epoch FROM integrada_en - creado_en) / 86400) FILTER (WHERE estado = 'integrado') AS dias_integracion,
              count(*) FILTER (WHERE estado NOT IN ('integrado','pausado') AND creado_en < now() - ($1::int * interval '1 day'))::int AS fuera_sla,
              count(*) FILTER (WHERE estado NOT IN ('integrado','pausado') AND greatest(i.actualizado_en, s.ultimo) < now() - ($2::int * interval '1 day'))::int AS estancadas,
              count(*) FILTER (WHERE grupo_wsp)::int AS paso_grupo_wsp, count(*) FILTER (WHERE conf_sistemas)::int AS paso_conf_sistemas,
              count(*) FILTER (WHERE capacitacion)::int AS paso_capacitacion, count(*) FILTER (WHERE catalogo)::int AS paso_catalogo,
              count(*) FILTER (WHERE despacho)::int AS paso_despacho, count(*) FILTER (WHERE liquidaciones)::int AS paso_liquidaciones,
              count(*) FILTER (WHERE creado_en >= date_trunc('month', now()))::int AS nuevas_mes,
              count(*) FILTER (WHERE integrada_en >= date_trunc('month', now()))::int AS integradas_mes
         FROM integraciones i
         LEFT JOIN LATERAL (SELECT max(creado_en) AS ultimo FROM seguimientos s
                             WHERE s.recurso = 'integracion' AND s.recurso_id = i.id) s ON true
        WHERE ($3::text IS NULL OR i.pais = $3)`,
      [slaDias, sinSeguimientoDias, pais]
    );
    const porPais = await this.varios(
      `SELECT i.pais, pa.nombre, count(*)::int AS total, count(*) FILTER (WHERE estado = 'integrado')::int AS integradas,
              COALESCE(avg(avance), 0)::numeric(5,1) AS avance
         FROM integraciones i LEFT JOIN paises pa ON pa.codigo = i.pais
        WHERE ($1::text IS NULL OR i.pais = $1)
        GROUP BY 1, 2 ORDER BY total DESC`,
      [pais]
    );
    return { ...resumen, avance: n(resumen.avance), dias_integracion: n(resumen.dias_integracion), porPais: porPais.map((r) => ({ ...r, avance: n(r.avance) })) };
  }

  /** Integraciones completadas y creadas por semana (últimas `semanas`). */
  semanalIntegraciones(semanas = 12, pais = null) {
    return this.varios(
      `WITH s AS (SELECT generate_series(date_trunc('week', now()) - (($1::int - 1) * interval '1 week'), date_trunc('week', now()), interval '1 week') AS semana)
       SELECT to_char(s.semana, 'YYYY-MM-DD') AS semana,
              (SELECT count(*) FROM integraciones WHERE ($2::text IS NULL OR pais = $2) AND integrada_en >= s.semana AND integrada_en < s.semana + interval '1 week')::int AS valor,
              (SELECT count(*) FROM integraciones WHERE ($2::text IS NULL OR pais = $2) AND creado_en >= s.semana AND creado_en < s.semana + interval '1 week')::int AS creadas
         FROM s ORDER BY s.semana`,
      [semanas, pais]
    );
  }

  // ------------------------------------------------------------- Observaciones
  async observaciones({ sla = { alta: 2, media: 5, baja: 10 }, dias = 30, pais = null } = {}) {
    const slaExpr = `(CASE prioridad WHEN 'alta' THEN $1::int WHEN 'media' THEN $2::int ELSE $3::int END * interval '1 day')`;
    const fila = await this.uno(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE estado IN ('abierta','en_proceso'))::int AS abiertas,
              count(*) FILTER (WHERE estado IN ('abierta','en_proceso') AND prioridad = 'alta')::int AS abiertas_alta,
              count(*) FILTER (WHERE estado IN ('abierta','en_proceso') AND creado_en + ${slaExpr} < now())::int AS vencidas,
              count(*) FILTER (WHERE estado = 'resuelta' AND cerrada_en IS NOT NULL)::int AS resueltas,
              count(*) FILTER (WHERE estado = 'resuelta' AND cerrada_en - creado_en <= ${slaExpr})::int AS resueltas_en_sla,
              avg(extract(epoch FROM cerrada_en - creado_en) / 86400) FILTER (WHERE estado = 'resuelta') AS dias_resolucion,
              count(*) FILTER (WHERE creado_en >= now() - ($4::int * interval '1 day'))::int AS creadas_periodo,
              count(*) FILTER (WHERE cerrada_en >= now() - ($4::int * interval '1 day'))::int AS cerradas_periodo,
              count(*) FILTER (WHERE estado IN ('abierta','en_proceso') AND responsable_id IS NULL)::int AS sin_responsable,
              avg(extract(epoch FROM now() - creado_en) / 86400) FILTER (WHERE estado IN ('abierta','en_proceso')) AS edad_backlog
         FROM observaciones WHERE ($5::text IS NULL OR pais = $5)`,
      [sla.alta, sla.media, sla.baja, dias, pais]
    );
    const [porPrioridad, porModulo] = await Promise.all([
      this.varios(`SELECT prioridad AS clave, count(*)::int AS valor FROM observaciones
                    WHERE estado IN ('abierta','en_proceso') AND ($1::text IS NULL OR pais = $1) GROUP BY 1`, [pais]),
      this.varios(`SELECT COALESCE(NULLIF(modulo, ''), 'Sin módulo') AS clave, count(*)::int AS valor
                     FROM observaciones WHERE estado IN ('abierta','en_proceso') AND ($1::text IS NULL OR pais = $1)
                    GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [pais]),
    ]);
    return { ...fila, dias_resolucion: n(fila.dias_resolucion), edad_backlog: n(fila.edad_backlog), porPrioridad, porModulo };
  }

  /** Creadas, cerradas y backlog al cierre de cada semana. */
  semanalObservaciones(semanas = 12, pais = null) {
    return this.varios(
      `WITH s AS (SELECT generate_series(date_trunc('week', now()) - (($1::int - 1) * interval '1 week'), date_trunc('week', now()), interval '1 week') AS semana)
       SELECT to_char(s.semana, 'YYYY-MM-DD') AS semana,
              (SELECT count(*) FROM observaciones WHERE ($2::text IS NULL OR pais = $2) AND creado_en >= s.semana AND creado_en < s.semana + interval '1 week')::int AS creadas,
              (SELECT count(*) FROM observaciones WHERE ($2::text IS NULL OR pais = $2) AND cerrada_en >= s.semana AND cerrada_en < s.semana + interval '1 week')::int AS cerradas,
              (SELECT count(*) FROM observaciones WHERE ($2::text IS NULL OR pais = $2) AND creado_en < s.semana + interval '1 week'
                  AND (cerrada_en IS NULL OR cerrada_en >= s.semana + interval '1 week'))::int AS valor
         FROM s ORDER BY s.semana`,
      [semanas, pais]
    );
  }

  // ------------------------------------------------------------- Calendario (del usuario)
  async calendario(usuarioId) {
    const fila = await this.uno(
      `SELECT count(*) FILTER (WHERE tipo = 'reunion' AND inicio >= date_trunc('week', now()) AND inicio < date_trunc('week', now()) + interval '1 week')::int AS reuniones_semana,
              COALESCE(sum(extract(epoch FROM fin - inicio) / 3600) FILTER (WHERE tipo = 'reunion' AND NOT todo_el_dia
                    AND inicio >= date_trunc('week', now()) AND inicio < date_trunc('week', now()) + interval '1 week'), 0) AS horas_semana,
              count(*) FILTER (WHERE tipo = 'reunion' AND inicio >= now() AND inicio < now() + interval '7 days')::int AS proximas_7d,
              count(*) FILTER (WHERE tipo = 'tarea' AND COALESCE(estado_tarea, 'pendiente') <> 'hecha')::int AS tareas_abiertas,
              count(*) FILTER (WHERE tipo = 'tarea' AND COALESCE(estado_tarea, 'pendiente') <> 'hecha' AND fin < now())::int AS tareas_vencidas,
              count(*) FILTER (WHERE tipo = 'tarea' AND estado_tarea = 'hecha' AND hecha_en >= now() - interval '30 days')::int AS tareas_hechas_30d,
              count(*) FILTER (WHERE tipo = 'tarea' AND estado_tarea = 'hecha' AND hecha_en >= now() - interval '30 days' AND hecha_en <= fin + interval '1 day')::int AS tareas_a_tiempo,
              count(*) FILTER (WHERE inicio >= now() - interval '30 days')::int AS eventos_30d,
              count(*) FILTER (WHERE inicio >= now() - interval '30 days' AND google_event_id IS NOT NULL)::int AS sincronizados_30d,
              count(*) FILTER (WHERE inicio >= now() - interval '30 days' AND (integracion_id IS NOT NULL OR entidad_id IS NOT NULL))::int AS vinculados_30d
         FROM eventos WHERE usuario_id = $1 AND NOT eliminado`,
      [usuarioId]
    );
    return { ...fila, horas_semana: n(fila.horas_semana) };
  }

  semanalCalendario(usuarioId, semanas = 10) {
    return this.varios(
      `WITH s AS (SELECT generate_series(date_trunc('week', now()) - (($2::int - 1) * interval '1 week'), date_trunc('week', now()) + interval '1 week', interval '1 week') AS semana)
       SELECT to_char(s.semana, 'YYYY-MM-DD') AS semana,
              COALESCE((SELECT sum(extract(epoch FROM fin - inicio) / 3600) FROM eventos e
                         WHERE e.usuario_id = $1 AND NOT e.eliminado AND e.tipo = 'reunion' AND NOT e.todo_el_dia
                           AND e.inicio >= s.semana AND e.inicio < s.semana + interval '1 week'), 0)::numeric(6,1) AS valor,
              (SELECT count(*) FROM eventos e WHERE e.usuario_id = $1 AND NOT e.eliminado AND e.tipo = 'tarea'
                  AND e.fin >= s.semana AND e.fin < s.semana + interval '1 week')::int AS tareas
         FROM s ORDER BY s.semana`,
      [usuarioId, semanas]
    ).then((filas) => filas.map((f) => ({ ...f, valor: n(f.valor) })));
  }

  // ------------------------------------------------------------- Usuarios
  async usuarios({ passwordDias = 90 } = {}) {
    const fila = await this.uno(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE estado = 'activo')::int AS activos,
              count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
              count(*) FILTER (WHERE estado = 'suspendido')::int AS suspendidos,
              count(*) FILTER (WHERE bloqueado_hasta > now())::int AS bloqueados,
              count(*) FILTER (WHERE estado = 'activo' AND ultimo_login >= now() - interval '30 days')::int AS activos_30d,
              count(*) FILTER (WHERE estado = 'activo' AND ultimo_login >= now() - interval '7 days')::int AS activos_7d,
              count(*) FILTER (WHERE estado = 'activo' AND password_cambiada < now() - ($1::int * interval '1 day'))::int AS password_antigua,
              count(*) FILTER (WHERE estado = 'activo' AND EXISTS (SELECT 1 FROM google_cuentas g WHERE g.usuario_id = u.id))::int AS con_google,
              count(*) FILTER (WHERE rol = 'admin')::int AS admins, count(*) FILTER (WHERE rol = 'editor')::int AS editores,
              count(*) FILTER (WHERE rol = 'lector')::int AS lectores,
              count(*) FILTER (WHERE creado_en >= now() - interval '30 days')::int AS nuevos_30d
         FROM usuarios u`,
      [passwordDias]
    );
    return fila;
  }

  /** Inicios de sesión (correctos y fallidos) por día. */
  serieLogins(dias = 30) {
    return this.varios(
      `WITH d AS (SELECT generate_series(${HOY} - ($1::int - 1), ${HOY}, interval '1 day')::date AS dia)
       SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
              count(a.id) FILTER (WHERE a.accion = 'LOGIN')::int AS valor,
              count(a.id) FILTER (WHERE a.accion IN ('LOGIN_FALLIDO','CUENTA_BLOQUEADA'))::int AS fallidos,
              count(a.id)::int AS eventos
         FROM d LEFT JOIN auditoria a ON (a.creado_en AT TIME ZONE $2)::date = d.dia
        GROUP BY d.dia ORDER BY d.dia`,
      [dias, ZONA_HORARIA]
    );
  }

  // ------------------------------------------------------------- Auditoría
  async auditoria(dias = 7) {
    const fila = await this.uno(
      `SELECT count(*)::int AS eventos,
              count(*) FILTER (WHERE accion = 'LOGIN')::int AS logins,
              count(*) FILTER (WHERE accion IN ('LOGIN_FALLIDO','CUENTA_BLOQUEADA'))::int AS fallidos,
              count(*) FILTER (WHERE accion = 'CUENTA_BLOQUEADA')::int AS bloqueos,
              count(*) FILTER (WHERE accion IN ('CAMBIO_ACCESO','DESBLOQUEO'))::int AS cambios_acceso,
              count(*) FILTER (WHERE accion LIKE '%ELIMINAD%')::int AS eliminaciones,
              count(DISTINCT ip)::int AS ips, count(DISTINCT usuario_id)::int AS usuarios
         FROM auditoria WHERE creado_en >= now() - ($1::int * interval '1 day')`,
      [dias]
    );
    const [porAccion, porUsuario] = await Promise.all([
      this.varios(`SELECT accion AS clave, count(*)::int AS valor FROM auditoria
                    WHERE creado_en >= now() - ($1::int * interval '1 day') GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [dias * 4]),
      this.varios(`SELECT COALESCE(u.nombres || ' ' || u.apellidos, 'Sin usuario') AS clave, count(*)::int AS valor
                     FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
                    WHERE a.creado_en >= now() - ($1::int * interval '1 day') GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [dias * 4]),
    ]);
    return { ...fila, porAccion, porUsuario };
  }
}

module.exports = IndicadorDAO;
