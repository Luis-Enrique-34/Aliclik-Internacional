// =====================================================================
//  SERVICIO del tablero: indicadores, comparación con el periodo
//  anterior, tendencia diaria y rankings por actor del ecosistema.
// =====================================================================
const memo = require("../utils/memo");

const DIA = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString().slice(0, 10);

function hoyLima() {
  return iso(new Date(Date.now() - 5 * 60 * 60 * 1000)); // Lima = UTC-5
}

class DashboardService {
  constructor({ pedidoDAO, cargaDAO, integracionDAO, seguimientoDAO, eventoDAO }) {
    this.pedidos = pedidoDAO;
    this.cargas = cargaDAO;
    this.integraciones = integracionDAO;
    this.seguimientos = seguimientoDAO;
    this.eventos = eventoDAO;
  }

  /** Completa el rango (por defecto, últimos 30 días) y calcula el periodo anterior equivalente. */
  static rango(f) {
    const hasta = f.hasta || hoyLima();
    const desde = f.desde || iso(new Date(Date.parse(hasta) - 29 * DIA));
    const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA) + 1;
    const antHasta = iso(new Date(Date.parse(desde) - DIA));
    const antDesde = iso(new Date(Date.parse(antHasta) - (dias - 1) * DIA));
    return { desde, hasta, dias, anterior: { desde: antDesde, hasta: antHasta } };
  }

  /** Tablero completo: 3 lecturas de pedidos (antes 9) + datos de gestión en paralelo. */
  async resumen(filtros, usuarioId) {
    const r = DashboardService.rango(filtros);
    const f = { ...filtros, desde: r.desde, hasta: r.hasta };
    // Lo que es igual para todos los usuarios se guarda en caché (se invalida con cada carga)
    const comun = memo.recordar(`tablero:${JSON.stringify(f)}`, async () => {
      const [comparados, diaGrupo, rankings] = await Promise.all([
        this.pedidos.kpisComparados({ ...filtros, desde: r.anterior.desde, hasta: r.hasta }, r.desde),
        this.pedidos.porDiaYGrupo(f),
        this.pedidos.rankings(f),
      ]);
      const { serie, grupos } = DashboardService.desdeDiaYGrupo(diaGrupo, r.desde, r.hasta);
      const { totales, ...listas } = rankings;
      const kpis = { ...comparados.actual, tiendas: totales.tiendas || 0, proveedores: totales.proveedores || 0, almacenes: totales.almacenes || 0, couriers: totales.couriers || 0 };
      return { kpis, kpisAnt: comparados.anterior, serie, grupos, rankings: listas };
    });
    const [base, ultimaCarga, integraciones, actividad, agenda] = await Promise.all([
      comun,
      this.cargas.ultima(),
      this.integraciones.resumen(),
      this.seguimientos.recientes(8),
      this.eventos.proximos(usuarioId, 5),
    ]);
    // Las alertas de seguimiento se piden aparte (/api/seguimiento-actores/alertas) para no demorar el tablero
    return { rango: r, ...base, ultimaCarga, integraciones, actividad, agenda };
  }

  /** Arma la serie diaria y la composición por estado a partir de (día, grupo, pedidos). */
  static desdeDiaYGrupo(filas, desde, hasta) {
    const porDia = new Map();
    const porGrupo = new Map();
    for (const { dia, grupo, pedidos } of filas) {
      const d = porDia.get(dia) || { dia, pedidos: 0, entregados: 0, perdidos: 0 };
      d.pedidos += pedidos;
      if (grupo === "entregado") d.entregados += pedidos;
      if (grupo === "devuelto" || grupo === "cancelado") d.perdidos += pedidos;
      porDia.set(dia, d);
      porGrupo.set(grupo, (porGrupo.get(grupo) || 0) + pedidos);
    }
    return {
      serie: completarSerie([...porDia.values()], desde, hasta),
      grupos: [...porGrupo].map(([grupo, pedidos]) => ({ grupo, pedidos })).sort((a, b) => b.pedidos - a.pedidos),
    };
  }

  ranking(dimension, filtros) {
    const r = DashboardService.rango(filtros);
    return this.pedidos.ranking(dimension, { ...filtros, desde: r.desde, hasta: r.hasta }, 100);
  }
}

/** Agrega los días sin pedidos (con 0) para que el gráfico no salte fechas. */
function completarSerie(serie, desde, hasta) {
  const porDia = new Map(serie.map((s) => [s.dia, s]));
  const out = [];
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += DIA) {
    const dia = iso(new Date(t));
    out.push(porDia.get(dia) || { dia, pedidos: 0, entregados: 0, perdidos: 0 });
  }
  return out;
}

DashboardService.completarSerie = completarSerie;
module.exports = DashboardService;
