-- =====================================================================
--  ALICLIK INTERNACIONAL · Extracción de pedidos desde AURORA (MySQL 8)
--
--  Devuelve UNA FILA POR PEDIDO de las tiendas registradas fuera de Perú
--  (stores.country_id <> 1) creados desde @inicio, con su tienda, proveedor
--  principal, almacén, courier y estados. Las columnas tienen
--  exactamente los nombres que espera la plataforma (Cargas → Subir CSV).
--
--  CÓMO USARLO (manual, una vez al día):
--   1. Ajusta @dias si quieres otra ventana (por defecto, los últimos 45 días:
--      así también se actualizan los estados de pedidos anteriores).
--   2. Ejecuta TODO el script en DBeaver / MySQL Workbench con un usuario
--      de SOLO LECTURA.
--   3. Exporta el resultado a CSV (UTF-8, con encabezados) y súbelo en
--      la plataforma: menú "Cargas de datos".
--
--  AUTOMÁTICO: scripts/sync-aurora.js ejecuta esta misma consulta y
--  actualiza la plataforma sin pasar por el CSV (ver docs/SINCRONIZACION.md).
--
--  Supuestos a validar con el equipo de backend (marcados con ⚠):
--   ⚠ El proveedor de cada línea es la tienda dueña del producto (products.store_id).
--     Si el pedido tiene productos de varios proveedores, se toma el de mayor
--     importe y se informa cuántos hay en n_proveedores.
--   ⚠ Las fechas de Aurora están en UTC (valor por defecto de RDS). Si no,
--     define AURORA_TIMEZONE=America/Lima en el .env de la plataforma.
--   ⚠ El país del pedido es el de destino; si viene vacío, el de la tienda.
-- =====================================================================

SET @dias   = 45;                          -- ventana móvil (se refrescan estados recientes)
SET @inicio = '2026-10-01 00:00:00';       -- nunca trae pedidos anteriores a esta fecha
SET @desde  = GREATEST(DATE_SUB(UTC_TIMESTAMP(), INTERVAL @dias DAY), CAST(@inicio AS DATETIME));

-- ====== CONSULTA ======
WITH pedidos_ventana AS (                    -- pedidos de tiendas registradas fuera de Perú
    SELECT o.id
      FROM orders o
      JOIN stores st ON st.id = o.store_id
     WHERE o.created_at >= @inicio                              -- solo pedidos creados desde @inicio
       AND (o.created_at >= @desde OR o.updated_at >= @desde)     -- ...y nuevos o con cambios en la ventana
       AND COALESCE(o.is_disabled_order, 0) = 0
       AND st.country_id <> 1                   -- countries.id = 1 es Perú
),
lineas AS (                                  -- importe y unidades por pedido y proveedor
    SELECT od.order_id,
           p.store_id                                                      AS proveedor_id,
           SUM(od.total)                                                   AS total_proveedor,
           SUM(SUM(od.quantity)) OVER (PARTITION BY od.order_id)           AS unidades,
           COUNT(*)              OVER (PARTITION BY od.order_id)           AS n_proveedores,
           ROW_NUMBER() OVER (PARTITION BY od.order_id
                              ORDER BY SUM(od.total) DESC, p.store_id)     AS orden
      FROM order_details od
      JOIN pedidos_ventana pv ON pv.id = od.order_id
      LEFT JOIN products p    ON p.id = od.product_id
     GROUP BY od.order_id, p.store_id
),
ultima_entrega AS (                          -- última gestión de entrega activa del pedido
    SELECT d.order_id, d.schedule_date, d.actual_delivery_date, ds.label AS estado_entrega
      FROM order_deliveries d
      JOIN (SELECT od2.order_id, MAX(od2.id) AS id
              FROM order_deliveries od2
              JOIN pedidos_ventana pv ON pv.id = od2.order_id
             WHERE COALESCE(od2.is_active, 1) = 1
             GROUP BY od2.order_id) u ON u.id = d.id
      LEFT JOIN delivery_statuses ds ON ds.id = d.delivery_status_id
)
SELECT
    o.id                                                         AS order_id,
    o.order_number                                               AS order_number,
    c.iso_code                                                   AS pais,
    DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s')               AS fecha_pedido,
    DATE_FORMAT(o.updated_at, '%Y-%m-%d %H:%i:%s')               AS fecha_actualizacion,
    DATE_FORMAT(COALESCE(ue.actual_delivery_date, ue.schedule_date), '%Y-%m-%d') AS fecha_entrega,
    s.id                                                         AS tienda_id,
    s.name                                                       AS tienda_nombre,
    l.proveedor_id                                               AS proveedor_id,
    sp.name                                                      AS proveedor_nombre,
    w.id                                                         AS almacen_id,
    w.name                                                       AS almacen_nombre,
    cu.id                                                        AS courier_id,
    cu.name                                                      AS courier_nombre,
    os.code                                                      AS estado_codigo,
    os.label                                                     AS estado_label,
    ss.label                                                     AS estado_envio,
    ue.estado_entrega                                            AS estado_entrega,
    o.is_cash_on_delivery                                        AS contraentrega,
    COALESCE(o.currency_code, s.currency_code, c.currency_code)  AS moneda,
    ROUND(o.total, 2)                                            AS total,
    COALESCE(l.unidades, 0)                                      AS unidades,
    COALESCE(l.n_proveedores, 1)                                 AS n_proveedores
  FROM orders o
  JOIN pedidos_ventana pv          ON pv.id = o.id
  JOIN stores s                    ON s.id  = o.store_id
  LEFT JOIN countries c            ON c.id  = COALESCE(o.destination_country_id, s.country_id)
  LEFT JOIN lineas l               ON l.order_id = o.id AND l.orden = 1
  LEFT JOIN stores sp              ON sp.id = l.proveedor_id
  LEFT JOIN warehouses w           ON w.id  = o.warehouse_id
  LEFT JOIN couriers cu            ON cu.id = o.courier_id
  LEFT JOIN order_statuses os      ON os.id = o.status_id
  LEFT JOIN shipping_statuses ss   ON ss.id = o.shipping_status_id
  LEFT JOIN ultima_entrega ue      ON ue.order_id = o.id
 WHERE s.country_id <> 1                          -- solo tiendas del extranjero (1 = Perú)
 ORDER BY o.created_at DESC;
