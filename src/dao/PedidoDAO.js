// =====================================================================
//  DAO de pedidos: carga (UPSERT) y consultas del tablero.
//  Todas las consultas reciben los filtros como parámetros ($1, $2…);
//  los nombres de columna nunca vienen del usuario (lista blanca).
// =====================================================================
const BaseDAO = require("./BaseDAO");
const { ZONA_HORARIA } = require("../config/env");

// Dimensiones permitidas para agrupar (lista blanca → sin inyección SQL)
const DIMENSIONES = {
  tienda: { id: "p.tienda_id", nombre: "p.tienda_nombre" },
  proveedor: { id: "p.proveedor_id", nombre: "p.proveedor_nombre" },
  almacen: { id: "p.almacen_id", nombre: "p.almacen_nombre" },
  courier: { id: "p.courier_id", nombre: "p.courier_nombre" },
  pais: { id: "p.pais", nombre: "pa.nombre" },
};

// Orden permitido (lista blanca): campo → expresión. La dirección se agrega aparte (ASC/DESC fijos).
const ORDENES = {
  fecha: "p.fecha_pedido",
  total: "p.total",
  estado: "p.estado_label",
  tienda: "p.tienda_nombre",
  proveedor: "p.proveedor_nombre",
  courier: "p.courier_nombre",
  almacen: "p.almacen_nombre",
  entrega: "p.fecha_entrega",
  actualizacion: "p.fecha_actualizacion",
  unidades: "p.unidades",
  numero: "p.order_number",
};

const COLUMNAS = [
  "order_id", "order_number", "pais", "fecha_pedido", "fecha_actualizacion", "fecha_entrega",
  "tienda_id", "tienda_nombre", "proveedor_id", "proveedor_nombre", "almacen_id", "almacen_nombre",
  "courier_id", "courier_nombre", "estado_codigo", "estado_label", "estado_envio", "estado_entrega",
  "contraentrega", "moneda", "total", "unidades", "n_proveedores", "carga_id",
];

class PedidoDAO extends BaseDAO {
  /**
   * Construye el WHERE común a partir de los filtros validados.
   * @returns {{ where: string, params: any[] }}
   */
  filtros(f = {}) {
    const cond = [];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };

    // dia_local = día del pedido en hora de Lima (columna calculada e indexada)
    if (f.desde) cond.push(`p.dia_local >= ${p(f.desde)}::date`);
    if (f.hasta) cond.push(`p.dia_local <= ${p(f.hasta)}::date`);
    if (f.pais) cond.push(`p.pais = ${p(f.pais)}`);
    for (const d of ["tienda", "proveedor", "almacen", "courier"]) {
      if (f[`${d}_id`] != null) cond.push(`${DIMENSIONES[d].id} = ${p(f[`${d}_id`])}`);
    }
    if (f.grupo) cond.push(`COALESCE(eg.grupo, 'otro') = ${p(f.grupo)}`);
    if (f.estado) cond.push(`p.estado_codigo = ${p(f.estado)}`);
    if (f.contraentrega === "si") cond.push("p.contraentrega IS TRUE");
    if (f.contraentrega === "no") cond.push("p.contraentrega IS NOT TRUE");
    if (f.monto_min != null) cond.push(`p.total >= ${p(f.monto_min)}`);
    if (f.monto_max != null) cond.push(`p.total <= ${p(f.monto_max)}`);
    if (f.moneda) cond.push(`p.moneda = ${p(f.moneda)}`);
    // En curso (pendiente / en preparación / en ruta) con más de N días desde el pedido
    if (f.estancados) cond.push(`COALESCE(eg.grupo, 'otro') IN ('pendiente','en_proceso','en_ruta') AND p.dia_local < (now() AT TIME ZONE '${ZONA_HORARIA.replace(/'/g, "")}')::date - ${p(f.estancados)}::int`);
    if (f.q) {
      const like = p(`%${f.q}%`);
      cond.push(`(p.order_number ILIKE ${like} OR p.tienda_nombre ILIKE ${like} OR p.proveedor_nombre ILIKE ${like}
                  OR p.almacen_nombre ILIKE ${like} OR p.courier_nombre ILIKE ${like})`);
    }
    return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", params };
  }

  /**
   * Indicadores del periodo actual Y del anterior en UNA sola lectura de la tabla.
   * `f` cubre ambos periodos (desde = inicio del anterior); `corte` = inicio del actual.
   */
  async kpisComparados(f, corte) {
    const { where, params } = this.filtros(f);
    params.push(corte);
    const actual = `p.dia_local >= $${params.length}::date`;
    const campos = ["pedidos", "monto", "unidades", "entregados", "en_preparacion", "en_ruta", "devueltos", "cancelados",
      "sin_clasificar", "monedas"];
    const expr = (cond) => [
      `count(*) FILTER (WHERE ${cond})`, `COALESCE(sum(p.total) FILTER (WHERE ${cond}), 0)`, `COALESCE(sum(p.unidades) FILTER (WHERE ${cond}), 0)`,
      `count(*) FILTER (WHERE ${cond} AND eg.grupo = 'entregado')`, `count(*) FILTER (WHERE ${cond} AND eg.grupo IN ('pendiente','en_proceso'))`,
      `count(*) FILTER (WHERE ${cond} AND eg.grupo = 'en_ruta')`, `count(*) FILTER (WHERE ${cond} AND eg.grupo = 'devuelto')`,
      `count(*) FILTER (WHERE ${cond} AND eg.grupo = 'cancelado')`, `count(*) FILTER (WHERE ${cond} AND (eg.grupo IS NULL OR eg.grupo = 'otro'))`,
      // "varias monedas" sin COUNT(DISTINCT) (que obliga a ordenar): basta comparar mínimo y máximo
      `(CASE WHEN min(p.moneda) FILTER (WHERE ${cond}) IS DISTINCT FROM max(p.moneda) FILTER (WHERE ${cond}) THEN 2 ELSE 1 END)`,
    ];
    const columnas = [
      ...expr(actual).map((e, i) => `${e} AS a_${campos[i]}`),
      ...expr(`NOT (${actual})`).map((e, i) => `${e} AS b_${campos[i]}`),
    ];
    const fila = await this.uno(
      `SELECT ${columnas.join(",\n              ")}
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        ${where}`,
      params
    );
    const armar = (pre) => Object.fromEntries(campos.map((c) => [c, Number(fila[`${pre}_${c}`]) || 0]));
    return { actual: armar("a"), anterior: armar("b") };
  }

  /** Pedidos por día y grupo de estado (una sola lectura → serie diaria y composición). */
  porDiaYGrupo(f) {
    const { where, params } = this.filtros(f);
    return this.varios(
      `SELECT to_char(p.dia_local, 'YYYY-MM-DD') AS dia,
              COALESCE(eg.grupo, 'otro') AS grupo, count(*)::int AS pedidos
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        ${where}
        GROUP BY 1, 2 ORDER BY 1`,
      params
    );
  }

  /**
   * Rankings de todas las dimensiones: 5 consultas cortas en paralelo (cada una usa
   * su índice actor+fecha). Se probó GROUPING SETS en una sola consulta y fue más lento.
   * Además devuelve cuántos actores distintos hubo (sin COUNT DISTINCT).
   */
  async rankings(f, limite = 10) {
    const dims = { tiendas: "tienda", proveedores: "proveedor", almacenes: "almacen", couriers: "courier", paises: "pais" };
    const res = { totales: {} };
    await Promise.all(Object.entries(dims).map(async ([clave, dim]) => {
      const filas = await this.ranking(dim, f, dim === "pais" ? 20 : limite);
      res[clave] = filas.map(({ total_dim, ...r }) => r);
      res.totales[clave] = Number(filas[0]?.total_dim) || 0;
    }));
    return res;
  }

  /** Ranking completo de una dimensión (pantalla "ver todos"). */
  ranking(dimension, f, limite = 10) {
    const d = DIMENSIONES[dimension];
    if (!d) throw new Error("Dimensión no permitida");
    const { where, params } = this.filtros(f);
    params.push(limite);
    return this.varios(
      `SELECT ${d.id} AS id, COALESCE(max(${d.nombre}), '(sin asignar)') AS nombre,
              count(*)::int AS pedidos,
              count(*) FILTER (WHERE eg.grupo = 'entregado')::int AS entregados,
              count(*) FILTER (WHERE eg.grupo IN ('devuelto','cancelado'))::int AS perdidos,
              count(*) FILTER (WHERE eg.grupo IN ('pendiente','en_proceso','en_ruta'))::int AS en_curso,
              COALESCE(sum(p.total), 0) AS monto, max(p.fecha_pedido) AS ultimo_pedido,
              count(*) OVER () AS total_dim
         FROM pedidos p
         LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
         LEFT JOIN paises pa ON pa.codigo = p.pais
        ${where}
        GROUP BY ${d.id} ORDER BY pedidos DESC LIMIT $${params.length}`,
      params
    );
  }

  /** Listado paginado. */
  async listar(f, { pagina = 1, porPagina = 50, orden = "fecha", dir = "desc" } = {}) {
    const { where, params } = this.filtros(f);
    const total = await this.uno(
      `SELECT count(*)::int AS n FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo ${where}`,
      params
    );
    params.push(porPagina, (pagina - 1) * porPagina);
    const filas = await this.varios(
      `SELECT p.*, COALESCE(eg.grupo, 'otro') AS grupo
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        ${where}
        ORDER BY ${ORDENES[orden] || ORDENES.fecha} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, p.order_id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { total: total.n, filas };
  }

  exportar(f, limite = 50000) {
    const { where, params } = this.filtros(f);
    params.push(limite);
    return this.varios(
      `SELECT p.*, COALESCE(eg.grupo, 'otro') AS grupo
         FROM pedidos p LEFT JOIN estado_grupos eg ON eg.estado_codigo = p.estado_codigo
        ${where} ORDER BY p.fecha_pedido DESC LIMIT $${params.length}`,
      params
    );
  }

  /** Estados distintos presentes (para filtros). */
  estados() {
    return this.varios(
      `SELECT p.estado_codigo, max(p.estado_label) AS estado_label, count(*)::int AS pedidos
         FROM pedidos p WHERE p.estado_codigo IS NOT NULL GROUP BY 1 ORDER BY 3 DESC`
    );
  }

  /**
   * UPSERT de un lote de pedidos dentro de una transacción `q`.
   * Devuelve cuántos se insertaron y cuántos se actualizaron.
   */
  async upsertLote(q, filas) {
    if (!filas.length) return { insertadas: 0, actualizadas: 0, sinCambios: 0 };
    const valores = [];
    const params = [];
    for (const f of filas) {
      const marcas = COLUMNAS.map((c) => { params.push(f[c] ?? null); return `$${params.length}`; });
      valores.push(`(${marcas.join(",")})`);
    }
    const set = COLUMNAS.filter((c) => c !== "order_id").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    // Solo se reescriben los pedidos que cambiaron (menos escritura, menos espacio en Supabase)
    const comparables = COLUMNAS.filter((c) => c !== "order_id" && c !== "carga_id");
    const { rows } = await q(
      `INSERT INTO pedidos (${COLUMNAS.join(",")}) VALUES ${valores.join(",")}
       ON CONFLICT (order_id) DO UPDATE SET ${set}, sincronizado_en = now()
       WHERE (${comparables.map((c) => `pedidos.${c}`).join(",")}) IS DISTINCT FROM (${comparables.map((c) => `EXCLUDED.${c}`).join(",")})
       RETURNING (xmax = 0) AS insertado`,
      params
    );
    const insertadas = rows.filter((r) => r.insertado).length;
    return { insertadas, actualizadas: rows.length - insertadas, sinCambios: filas.length - rows.length };
  }
}

PedidoDAO.DIMENSIONES = Object.keys(DIMENSIONES);
PedidoDAO.COLUMNAS = COLUMNAS;
module.exports = PedidoDAO;
