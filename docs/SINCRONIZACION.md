# Cómo mantener el tablero actualizado con los pedidos de Aurora

> Aliclik Internacional usa **solo la base Aurora**. Procedimiento paso a paso: [ACTUALIZACION-DIARIA.md](ACTUALIZACION-DIARIA.md).

El tablero lee la tabla `pedidos` de Supabase. Esa tabla se llena desde Aurora (MySQL) con el query [`database/aurora/pedidos_internacional.sql`](../database/aurora/pedidos_internacional.sql), que devuelve **una fila por pedido** fuera de Perú con su tienda, proveedor principal, almacén, courier y estados.

Cada carga hace **UPSERT por `order_id`**: los pedidos nuevos se agregan, los existentes se actualizan (por ejemplo, de "Despachado" a "Entregado") y nunca se duplican. Por eso el query trae los **últimos 45 días** y no solo los de hoy: así los pedidos anteriores también actualizan su estado.

## Comparación de opciones

| | A. CSV manual | B. Sync directo (recomendada) | C. Sync programado en la nube |
|---|---|---|---|
| Esfuerzo diario | ~3 min (ejecutar, exportar, subir) | Ninguno mientras corre | Ninguno |
| Frescura | 1 vez al día | Cada 30 min (configurable) | Cada 15–30 min |
| Requiere | Acceso actual a Aurora | Usuario **solo lectura** + red hacia Aurora (VPN/bastión) | Lo de B + Lambda/EventBridge o servidor |
| Riesgo | Error humano al exportar | Bajo | Bajo |

**Recomendación:** empezar hoy con **A** y pasar a **B** cuando backend entregue el usuario de solo lectura (script listo en `database/aurora/indices_recomendados.sql`). Si la PC no puede quedar encendida, **C**.

## A. CSV manual (diario)

1. Abre DBeaver o MySQL Workbench con tu usuario de Aurora.
2. Abre `database/aurora/pedidos_internacional.sql` y ejecuta **todo el script** (las dos líneas `SET` y la consulta).
3. Exporta el resultado a **CSV** con **encabezados** y codificación **UTF-8**. En DBeaver: clic derecho sobre el resultado → *Export data* → CSV → *Header: top*, *Encoding: UTF-8*.
4. En la plataforma: **Cargas de datos** → arrastra el archivo.

Si lo abres y guardas con Excel antes de subirlo, también funciona: el lector acepta `;` o `,`, decimales con coma o punto y fechas `dd/mm/aaaa`.

## B. Sincronización directa (sin CSV)

1. Pide al equipo de backend un usuario de **solo lectura** con los `GRANT SELECT` de `database/aurora/indices_recomendados.sql`, conexión con **SSL**.
2. Agrega a `.env`:
   ```
   AURORA_HOST=xxxx.cluster-ro-xxxx.us-east-1.rds.amazonaws.com   # usa el endpoint de LECTURA (reader)
   AURORA_PORT=3306
   AURORA_USER=alc_internacional_ro
   AURORA_PASSWORD=********
   AURORA_DATABASE=nombre_del_esquema
   AURORA_SSL_CA=./certs/global-bundle.pem   # https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   ```
3. Prueba una vez: `npm run sync:aurora`
4. Déjalo corriendo: `npm run sync:aurora -- --cada 30`

Para que arranque solo con Windows: *Programador de tareas → Crear tarea básica → Al iniciar sesión → Iniciar un programa*: `cmd.exe` con argumentos `/c cd /d "C:\work\ALICLIK - INTERNACIONAL" && npm run sync:aurora`, y configúrala para repetirse cada 30 minutos.

Por seguridad el script: usa SSL verificado, abre la sesión en modo `READ ONLY`, no permite varias sentencias por llamada y solo hace `SELECT`.

## C. Programado en la nube

Ejecuta `scripts/sync-aurora.js` desde un servicio que tenga red hacia Aurora, con las mismas variables de entorno:

- **AWS Lambda + EventBridge** (cada 15–30 min), en la misma VPC que Aurora. Es lo más limpio porque Aurora no queda expuesto a Internet.
- Un servidor/VM interno con `cron`.

Vercel no suele tener acceso a la VPC de Aurora, por eso no se recomienda correr la sincronización allí.

## Refrescar los pedidos que ya están cargados

La carga diaria trae los últimos 45 días. Si necesitas actualizar el estado de **todos** los pedidos que ya están en la plataforma (por ejemplo, pedidos antiguos que se entregaron o devolvieron después):

1. En Supabase → SQL Editor: `SELECT min(fecha_pedido)::date FROM pedidos;` (ver `database/consultas_supabase.sql`).
2. Opción CSV: abre `database/aurora/actualizar_pedidos_cargados.sql`, pon esa fecha en `@desde`, ejecútalo, exporta a CSV y súbelo en *Cargas de datos*.
3. Opción directa: `npm run sync:aurora -- --desde 2026-01-01` (con la fecha del paso 1).

Los pedidos sin cambios no se reescriben; solo se actualizan los que cambiaron.

Para ver qué tiendas ya operan fuera de Perú: `database/aurora/tiendas_operando.sql` (en Aurora) o la consulta 2 de `database/consultas_supabase.sql` (lo que ya está en la plataforma).

## Supuestos del query para validar con backend

- **Proveedor:** la tienda dueña del producto (`products.store_id`). Si un pedido trae productos de varios proveedores, se toma el de mayor importe y se informa la cantidad en `n_proveedores`. Si en Aurora el proveedor se registra de otra forma (por ejemplo `order_details.store_id` o `supplier_products`), solo hay que cambiar el bloque `lineas`.
- **País:** el de destino del pedido; si está vacío, el de la tienda. Se excluye Perú.
- **Fechas:** se asume que Aurora guarda en UTC. Si guarda en hora de Lima, pon `AURORA_TIMEZONE=America/Lima`.
- **Estados:** se usan `order_statuses` (estado principal), `shipping_statuses` y la última `order_deliveries` activa. Cada estado nuevo se clasifica solo en un grupo del tablero (pendiente, en preparación, en ruta, entregado, devuelto, cancelado). Si alguno queda mal, corrígelo en **Cargas de datos → Estados de pedido**; la corrección manual no se vuelve a pisar.

El query se probó sobre una réplica de la estructura de Aurora en MySQL/MariaDB con 400 pedidos simulados (incluidos pedidos con varios proveedores, pedidos de Perú y pedidos deshabilitados).

## Otras alternativas evaluadas

| Alternativa | Por qué no ahora |
|---|---|
| Conectar el tablero directo a Aurora | Expondría Aurora a la app pública; con 12 000 pedidos diarios, las consultas del tablero cargarían la base transaccional. |
| Réplica con AWS DMS hacia Supabase | Robusta pero costosa de mantener para un tablero interno. |
| Webhook desde el backend de Aliclik en cada cambio de estado | Es lo más "en tiempo real", pero requiere desarrollo en el backend principal. Queda como evolución futura. |
