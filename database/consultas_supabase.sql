-- =====================================================================
--  ALICLIK INTERNACIONAL · Consultas útiles en Supabase (SQL Editor)
--  Solo lectura: no modifican datos.
-- =====================================================================

-- 1) ¿Desde qué fecha tengo pedidos cargados? (úsala en actualizar_pedidos_cargados.sql)
SELECT min(fecha_pedido)::date AS desde, max(fecha_pedido)::date AS hasta, count(*) AS pedidos
  FROM pedidos;

-- 2) Tiendas que ya operan en la plataforma (con pedidos cargados)
SELECT tienda_id,
       max(tienda_nombre)                                          AS tienda,
       string_agg(DISTINCT pais, ', ' ORDER BY pais)               AS paises,
       min(dia_local)                                              AS primer_pedido,
       max(dia_local)                                              AS ultimo_pedido,
       count(*)                                                    AS pedidos,
       count(*) FILTER (WHERE dia_local >= current_date - 30)      AS ult_30_dias,
       CASE WHEN max(dia_local) >= current_date - 30 THEN 'Activa' ELSE 'Sin pedidos 30 días' END AS situacion
  FROM pedidos
 WHERE tienda_id IS NOT NULL
 GROUP BY tienda_id
 ORDER BY ult_30_dias DESC, pedidos DESC;

-- 3) Últimas cargas: de qué fuente vinieron y qué cambió
SELECT creado_en AT TIME ZONE 'America/Lima' AS fecha, origen, archivo,
       filas_total, insertadas, actualizadas, sin_cambios, rechazadas
  FROM cargas
 ORDER BY creado_en DESC
 LIMIT 20;


-- 4) SOLO UNA VEZ, al cambiar el alcance (tiendas con country_id <> 1, pedidos desde 2026-10-01):
--    vacía los pedidos para recargarlos limpios con actualizar_pedidos_cargados.sql
--    (o npm run sync:aurora -- --desde 2026-10-01). No toca tiendas, integraciones,
--    acuerdos, metas ni bitácora. Si algo falla, ROLLBACK deja todo como estaba.
-- BEGIN;
--   DELETE FROM pedidos;
-- COMMIT;
