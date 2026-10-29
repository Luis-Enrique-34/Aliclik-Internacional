-- =====================================================================
--  ALICLIK INTERNACIONAL · TIENDAS QUE YA OPERAN FUERA DE PERÚ (Aurora MySQL 8)
--
--  Ejecútalo en DBeaver / MySQL Workbench con el usuario de SOLO LECTURA.
--  Devuelve DOS resultados (DBeaver los muestra en dos pestañas):
--   1) Tiendas que YA operan: registradas fuera de Perú (stores.country_id <> 1)
--      y con pedidos; una fila por tienda y país destino (inicio, último
--      pedido, volumen, últimos 30 días, entregados y situación).
--   2) Tiendas REGISTRADAS en un país distinto a Perú, operen o no
--      (sirve para ver quién se registró y todavía no vende).
--  No se sube a la plataforma: es un CONTROL. Compáralo con
--  Seguimiento → Tiendas o con la consulta 2 de database/consultas_supabase.sql.
--  @desde = misma fecha de inicio de la extracción (2026-10-01).
-- =====================================================================

SET @desde  = '2026-10-01 00:00:00';      -- misma fecha de inicio que la extracción
SET @hace30 = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY);

-- 1) Tiendas del extranjero que ya operan (con pedidos)
SELECT
    s.id                                                    AS tienda_id,
    s.name                                                  AS tienda_nombre,
    c.iso_code                                              AS pais,
    DATE_FORMAT(MIN(o.created_at), '%Y-%m-%d')              AS primer_pedido,
    DATE_FORMAT(MAX(o.created_at), '%Y-%m-%d')              AS ultimo_pedido,
    COUNT(*)                                                AS pedidos_total,
    SUM(o.created_at >= @hace30)                            AS pedidos_ult_30_dias,
    SUM(UPPER(CONCAT_WS(' ', os.code, os.label, ss.code, ss.label)) REGEXP 'DELIVERED|ENTREGAD') AS entregados,
    CASE WHEN MAX(o.created_at) >= @hace30 THEN 'Operando' ELSE 'Sin pedidos 30 días' END AS situacion
  FROM orders o
  JOIN stores s                  ON s.id  = o.store_id
  JOIN countries c               ON c.id  = COALESCE(o.destination_country_id, s.country_id)
  LEFT JOIN order_statuses os    ON os.id = o.status_id
  LEFT JOIN shipping_statuses ss ON ss.id = o.shipping_status_id
 WHERE o.created_at >= @desde
   AND COALESCE(o.is_disabled_order, 0) = 0
   AND s.country_id <> 1                  -- tiendas del extranjero (1 = Perú)
 GROUP BY s.id, s.name, c.iso_code
 ORDER BY situacion, pedidos_ult_30_dias DESC, pedidos_total DESC;

-- 2) Tiendas registradas fuera de Perú (operen o no todavía)
SELECT
    s.id                                                    AS tienda_id,
    s.name                                                  AS tienda_nombre,
    c.iso_code                                              AS pais_registro,
    IF(COALESCE(s.is_active, 1) = 1, 'Sí', 'No')            AS activa,
    IF(COALESCE(s.is_supplier, 0) = 1, 'Sí', 'No')          AS es_proveedor,
    COALESCE(p.pedidos_total, 0)                            AS pedidos_total,
    COALESCE(p.pedidos_ult_30_dias, 0)                      AS pedidos_ult_30_dias,
    DATE_FORMAT(p.ultimo_pedido, '%Y-%m-%d')                AS ultimo_pedido,
    CASE WHEN p.ultimo_pedido >= @hace30 THEN 'Operando'
         WHEN p.ultimo_pedido IS NOT NULL THEN 'Sin pedidos 30 días'
         ELSE 'Registrada, sin pedidos' END                 AS situacion
  FROM stores s
  JOIN countries c ON c.id = s.country_id
  LEFT JOIN (SELECT o.store_id,
                    COUNT(*)                      AS pedidos_total,
                    SUM(o.created_at >= @hace30)  AS pedidos_ult_30_dias,
                    MAX(o.created_at)             AS ultimo_pedido
               FROM orders o
              WHERE o.created_at >= @desde
                AND COALESCE(o.is_disabled_order, 0) = 0
              GROUP BY o.store_id) p ON p.store_id = s.id
 WHERE s.country_id <> 1
 ORDER BY situacion, pedidos_ult_30_dias DESC, tienda_nombre;
