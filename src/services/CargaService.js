// =====================================================================
//  SERVICIO de carga de pedidos.
//  Recibe filas (de un CSV o directamente de Aurora), las valida, las
//  normaliza y hace UPSERT por order_id: si el pedido ya existía se
//  actualiza su estado; si es nuevo se inserta. Así el tablero siempre
//  refleja el último estado de cada pedido y nunca se duplica.
//  Todo ocurre en UNA transacción: o entra la carga completa o nada.
// =====================================================================
const crypto = require("crypto");
const { parsearCsv } = require("../utils/csv");
const N = require("../utils/normalizar");
const { clasificarEstado } = require("../utils/estados");
const { HttpError } = require("../utils/HttpError");
const { CARGA_LIMITES } = require("../config/security");
const { AURORA_TZ } = require("../config/env");
const memo = require("../utils/memo");

// Nombre de columna esperado → alias aceptados (ya normalizados: minúsculas y "_")
const ALIAS = {
  order_id: ["order_id", "id", "id_pedido", "pedido_id", "orden_id"],
  order_number: ["order_number", "numero_pedido", "codigo", "codigo_pedido", "nro_pedido"],
  pais: ["pais", "pais_iso", "country", "country_code", "iso_code", "pais_codigo"],
  fecha_pedido: ["fecha_pedido", "created_at", "fecha_creacion", "fecha"],
  fecha_actualizacion: ["fecha_actualizacion", "updated_at"],
  fecha_entrega: ["fecha_entrega", "delivery_date", "schedule_date", "fecha_programada"],
  tienda_id: ["tienda_id", "store_id", "id_tienda"],
  tienda_nombre: ["tienda_nombre", "tienda", "store_name", "store"],
  proveedor_id: ["proveedor_id", "supplier_id", "supplier_store_id", "id_proveedor"],
  proveedor_nombre: ["proveedor_nombre", "proveedor", "supplier_name", "supplier"],
  almacen_id: ["almacen_id", "warehouse_id", "id_almacen"],
  almacen_nombre: ["almacen_nombre", "almacen", "warehouse_name", "warehouse"],
  courier_id: ["courier_id", "id_courier", "transportadora_id"],
  courier_nombre: ["courier_nombre", "courier", "courier_name", "transportadora"],
  estado_codigo: ["estado_codigo", "status_code", "codigo_estado", "estado_code"],
  estado_label: ["estado_label", "estado", "status", "status_label", "estado_pedido"],
  estado_envio: ["estado_envio", "shipping_status"],
  estado_entrega: ["estado_entrega", "delivery_status"],
  contraentrega: ["contraentrega", "is_cash_on_delivery", "cod"],
  moneda: ["moneda", "currency_code", "currency"],
  total: ["total", "monto", "importe", "total_pedido"],
  unidades: ["unidades", "cantidad", "items", "quantity", "cantidad_items"],
  n_proveedores: ["n_proveedores", "proveedores_en_pedido"],
};
const OBLIGATORIAS = ["order_id", "pais", "fecha_pedido"];
const LOTE = 1000;
const MAX_ERRORES = 50;

class CargaService {
  constructor({ db, pedidoDAO, entidadDAO, estadoGrupoDAO, cargaDAO, auditoriaDAO }) {
    this.db = db;
    this.pedidos = pedidoDAO;
    this.entidades = entidadDAO;
    this.estados = estadoGrupoDAO;
    this.cargas = cargaDAO;
    this.auditoria = auditoriaDAO;
  }

  /** Relaciona las columnas del archivo con los campos esperados. */
  static mapearColumnas(columnas) {
    const mapa = {};
    for (const [campo, alias] of Object.entries(ALIAS)) {
      const encontrada = alias.find((a) => columnas.includes(a));
      if (encontrada) mapa[campo] = encontrada;
    }
    const faltan = OBLIGATORIAS.filter((c) => !mapa[c]);
    return { mapa, faltan };
  }

  /**
   * Convierte una fila "cruda" en un pedido válido, o devuelve el motivo del rechazo.
   * @returns {{ pedido?: object, error?: string }}
   */
  static normalizarFila(cruda, mapa, opciones = {}) {
    const v = (campo) => (mapa[campo] ? cruda[mapa[campo]] : undefined);

    const orderId = N.entero(v("order_id"));
    if (!orderId || Number.isNaN(orderId)) return { error: "order_id vacío o no numérico" };
    const pais = N.pais(v("pais"));
    if (!pais) return { error: `país no reconocido ("${String(v("pais") ?? "").slice(0, 20)}")` };
    const fecha = N.fechaHora(v("fecha_pedido"), opciones);
    if (!fecha || Number.isNaN(fecha.getTime())) return { error: "fecha_pedido no válida" };
    const actualizado = N.fechaHora(v("fecha_actualizacion"), opciones);
    const entrega = N.soloFecha(v("fecha_entrega"));
    if (entrega === "invalida") return { error: "fecha_entrega no válida" };

    const ids = {};
    for (const d of ["tienda", "proveedor", "almacen", "courier"]) {
      const id = N.entero(v(`${d}_id`));
      if (Number.isNaN(id)) return { error: `${d}_id no numérico` };
      ids[d] = id;
    }
    const total = N.decimal(v("total"));
    if (Number.isNaN(total)) return { error: "total no numérico" };
    const unidades = N.entero(v("unidades"));
    if (Number.isNaN(unidades)) return { error: "unidades no numérico" };

    const label = N.textoCorto(v("estado_label"), 120);
    const codigo = N.textoCorto(v("estado_codigo"), 60) || (label ? label.toUpperCase().replace(/\s+/g, "_").slice(0, 60) : null);
    const moneda = N.textoCorto(v("moneda"), 3);

    return {
      pedido: {
        order_id: orderId,
        order_number: N.textoCorto(v("order_number"), 60),
        pais,
        fecha_pedido: fecha.toISOString(),
        fecha_actualizacion: actualizado && !Number.isNaN(actualizado.getTime()) ? actualizado.toISOString() : null,
        fecha_entrega: entrega,
        tienda_id: ids.tienda, tienda_nombre: N.textoCorto(v("tienda_nombre")),
        proveedor_id: ids.proveedor, proveedor_nombre: N.textoCorto(v("proveedor_nombre")),
        almacen_id: ids.almacen, almacen_nombre: N.textoCorto(v("almacen_nombre")),
        courier_id: ids.courier, courier_nombre: N.textoCorto(v("courier_nombre")),
        estado_codigo: codigo,
        estado_label: label || codigo,
        estado_envio: N.textoCorto(v("estado_envio"), 120),
        estado_entrega: N.textoCorto(v("estado_entrega"), 120),
        contraentrega: N.booleano(v("contraentrega")),
        moneda: moneda && /^[A-Za-z]{3}$/.test(moneda) ? moneda.toUpperCase() : null,
        total: total ?? 0,
        unidades: Math.max(0, unidades ?? 0),
        n_proveedores: Math.max(1, N.entero(v("n_proveedores")) || 1),
      },
    };
  }

  /** Carga desde el texto de un CSV subido por un usuario. */
  async importarCsv({ texto, archivo, usuarioId, ip, forzar = false }) {
    if (Buffer.byteLength(texto, "utf8") > CARGA_LIMITES.bytes) {
      throw new HttpError(413, `El archivo supera ${CARGA_LIMITES.bytes / 1024 / 1024} MB. Usa la sincronización automática o divide el rango de fechas.`);
    }
    const huella = crypto.createHash("sha256").update(texto).digest("hex");
    if (!forzar) {
      const previa = await this.cargas.porHuella(huella);
      if (previa) {
        throw new HttpError(409, "Este mismo archivo ya se cargó antes. Si quieres volver a procesarlo, marca \"Cargar de todos modos\".", { duplicado: previa.creado_en });
      }
    }
    let csv;
    try {
      csv = parsearCsv(texto, { maxFilas: CARGA_LIMITES.filas });
    } catch (err) {
      throw new HttpError(400, `No se pudo leer el CSV: ${err.message}`);
    }
    const { mapa, faltan } = CargaService.mapearColumnas(csv.columnas);
    if (faltan.length) {
      throw new HttpError(400, `Faltan columnas obligatorias: ${faltan.join(", ")}. Usa el query de database/aurora/pedidos_internacional.sql.`);
    }
    return this.procesar({ filas: csv.filas, mapa, origen: "csv", archivo, huella, usuarioId, ip });
  }

  /**
   * Procesa filas ya leídas (CSV o Aurora). Valida, clasifica estados y hace UPSERT en una transacción.
   */
  async procesar({ filas, mapa, origen, archivo = null, huella = null, usuarioId = null, ip = null, opciones = { zonaSinOffset: AURORA_TZ } }) {
    const inicio = Date.now();
    if (!filas.length) throw new HttpError(400, "El archivo no tiene filas de datos");

    const validos = new Map(); // order_id → pedido (si se repite, gana la última fila)
    const errores = [];
    let rechazadas = 0;
    filas.forEach((cruda, i) => {
      const { pedido, error } = CargaService.normalizarFila(cruda, mapa, opciones);
      if (error) {
        rechazadas++;
        if (errores.length < MAX_ERRORES) errores.push({ fila: i + 2, error });
      } else validos.set(pedido.order_id, pedido);
    });
    if (!validos.size) {
      throw new HttpError(400, "Ninguna fila es válida. Revisa el formato del archivo.", { detalle: errores.slice(0, 5).map((e) => `Fila ${e.fila}: ${e.error}`).join(" · ") });
    }

    const pedidos = [...validos.values()];
    const cargaId = crypto.randomUUID();
    pedidos.forEach((p) => { p.carga_id = cargaId; });

    // Estados nuevos con su grupo sugerido
    const estados = new Map();
    for (const p of pedidos) {
      if (p.estado_codigo && !estados.has(p.estado_codigo)) {
        estados.set(p.estado_codigo, { codigo: p.estado_codigo, label: p.estado_label, grupo: clasificarEstado(p.estado_codigo, p.estado_label) });
      }
    }
    // Entidades que aparecen en la carga (para el directorio y el seguimiento)
    const dims = { tienda: new Map(), proveedor: new Map(), almacen: new Map(), courier: new Map() };
    for (const p of pedidos) {
      for (const d of Object.keys(dims)) {
        const id = p[`${d}_id`];
        if (id != null) dims[d].set(id, { aurora_id: id, nombre: p[`${d}_nombre`], pais: d === "courier" || d === "almacen" || d === "tienda" ? p.pais : null });
      }
    }
    const fechas = pedidos.map((p) => p.fecha_pedido).sort();

    const resultado = await this.db.tx(async (q) => {
      await this.estados.registrarLote(q, [...estados.values()]);
      for (const [tipo, mapaDim] of Object.entries(dims)) await this.entidades.sincronizarLote(q, tipo, [...mapaDim.values()]);
      let insertadas = 0;
      let actualizadas = 0;
      let sinCambios = 0;
      for (let i = 0; i < pedidos.length; i += LOTE) {
        const r = await this.pedidos.upsertLote(q, pedidos.slice(i, i + LOTE));
        insertadas += r.insertadas;
        actualizadas += r.actualizadas;
        sinCambios += r.sinCambios;
      }
      return this.cargas.crear(q, {
        id: cargaId, usuarioId, origen, archivo, huella, filasTotal: filas.length, insertadas, actualizadas, sinCambios,
        rechazadas, errores, fechaDesde: fechas[0], fechaHasta: fechas[fechas.length - 1], duracionMs: Date.now() - inicio,
      });
    });

    memo.invalidar(); // el tablero y el seguimiento se recalculan con los datos nuevos
    await this.auditoria.registrar({
      usuarioId, accion: origen === "csv" ? "CARGA_CSV" : "SYNC_AURORA", entidad: "cargas", entidadId: cargaId, ip,
      detalle: { archivo, filas: filas.length, insertadas: resultado.insertadas, actualizadas: resultado.actualizadas, sin_cambios: resultado.sin_cambios, rechazadas },
    });
    return { ...resultado, errores };
  }

  listar() {
    return this.cargas.listar();
  }
}

CargaService.ALIAS = ALIAS;
module.exports = CargaService;
