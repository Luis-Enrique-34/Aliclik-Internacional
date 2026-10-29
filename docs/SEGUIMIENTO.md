# Módulo de seguimiento por actor

Menú **Seguimiento**: una pestaña por **Tiendas, Proveedores, Almacenes y Couriers**, y otra para **Acuerdos especiales**. Cada actor se crea solo cuando aparece en una carga de pedidos (con su ID de Aurora) o se registra a mano.

## Qué se ve en el listado

| Columna | Significado |
|---|---|
| **Salud** | Semáforo del volumen de pedidos (ver reglas abajo) y el motivo. |
| **Pedidos del mes** | Pedidos del mes en curso (hora de Lima) contra la **meta**, con una marca de la **proyección** al cierre del mes. |
| **30 días** | Pedidos de los últimos 30 días y su variación frente a los 30 anteriores. |
| **Efectividad / Dev.-canc.** | Porcentaje entregado y porcentaje devuelto o cancelado (últimos 30 días, desde 10 pedidos). |
| **Beneficios** | Acuerdos vigentes y cuántos pedidos faltan para el siguiente beneficio por escala. |

Arriba hay contadores por salud y por **trato especial** (sirven de filtro) y un panel de **alertas** priorizadas: primero las graves y, dentro de cada nivel, las de clientes con trato especial. El tablero muestra las 8 más importantes de todos los tipos.

## Reglas de salud

Se definen en `src/services/SeguimientoService.js` (objeto `REGLAS`); para cambiar una política basta con editar ese objeto.

| Salud | Cuándo |
|---|---|
| Inactiva | 7 días o más sin pedidos, habiendo tenido antes |
| En caída | Últimos 30 días ≤ −30 % frente a los 30 anteriores |
| Requiere atención | Entre −10 % y −30 % |
| En crecimiento | +20 % o más, o empezó a generar pedidos en el periodo |
| Estable | Entre −10 % y +20 % |
| Sin pedidos | Sin pedidos en los últimos 4 meses o sin vincular a Aurora |

**Alertas adicionales:**
- Devoluciones o cancelaciones de 25 % o más.
- Proyección del mes por debajo del 80 % de la meta (desde el día 5 del mes).
- Acuerdo por vencer en 15 días o menos.
- Acuerdo vencido que sigue marcado como activo.
- Faltan menos del 10 % de pedidos para desbloquear una escala.

## Trato especial

Desde la ficha, el botón **Plan y trato** define:
- **Segmento:** Estándar, Preferente, VIP o Estratégica. Cualquiera distinto de Estándar se marca como trato especial.
- **Meta de pedidos por mes.**
- **Responsable** del seguimiento.
- **Condiciones**: compromisos y notas del acuerdo comercial.

### Acuerdos y descuentos

| Campo | Uso |
|---|---|
| Tipo | Descuento %, descuento monto fijo, tarifa especial, envío sin costo, crédito, atención prioritaria u otro |
| Aplica a | Fulfillment, envío/courier, comisión Aliclik, productos, liquidaciones o general |
| Valor y moneda | 0–100 para porcentajes; monto en la moneda del país |
| **Umbral de pedidos** | Si se completa, el beneficio se **gana al llegar a N pedidos en el mes**. Varios acuerdos con distintos umbrales forman una **escala** (ej. 5 % desde 300, 8 % desde 600). |
| Vigencia | Desde / hasta. El estado se calcula solo: programado, vigente, por vencer, vencido. |
| Estado | Activo, pausado o finalizado. Es preferible **finalizar** antes que eliminar, para conservar el historial. |

La ficha muestra:
- La **escala de beneficios** del mes, con lo ganado y lo que falta.
- El progreso de cada acuerdo.
- Los beneficios que aplican hoy.

> La plataforma **registra y da seguimiento** a los acuerdos. Aplicar el descuento en la facturación o liquidación sigue ocurriendo en Aliclik, donde corresponda.

## Ficha 360

- Indicadores del mes y de 30 días.
- Barras de los **últimos 12 meses contra la meta**.
- Con quién opera en los últimos 90 días. Por ejemplo, para una tienda: sus proveedores y couriers; para un courier: sus almacenes y tiendas.
- Integraciones relacionadas.
- Reuniones y tareas vinculadas, de todo el equipo.
- Bitácora de comentarios.
- Accesos directos para agendar una reunión y ver los pedidos del mes.

## Optimización aplicada en esta versión

Pruebas con 150 000 pedidos en PostgreSQL local (equipo de 2 núcleos):

| Cambio | Efecto medido |
|---|---|
| Indicadores del periodo actual y anterior en **una sola lectura**, sin `COUNT(DISTINCT)` (los conteos de actores salen de los rankings) | 255 ms → 66 ms |
| Columna `dia_local` (día en hora de Lima calculado al guardar, indexado) en vez de convertir la zona horaria fila por fila | Serie diaria 125 ms → 49 ms |
| Serie diaria y composición por estado en una sola consulta | 2 consultas → 1 |
| Índices compuestos (actor + fecha) | Seguimiento y filtros por tienda, proveedor, almacén o courier sin recorrer toda la tabla |
| **Caché de 60 s** del tablero y del seguimiento, que se borra con cada carga, plan o acuerdo | Tablero repetido: 370 ms → 6 ms · Seguimiento: 216 ms → 3 ms |
| Alertas del tablero en una petición aparte | El tablero se pinta sin esperar el cálculo de alertas (≈0,5 s en frío) |
| Caché de sesión de 20 s (se invalida al cambiar rol, estado o contraseña) | Una consulta menos por cada petición a la API |
| La carga no reescribe los pedidos que no cambiaron | Menos escrituras en Supabase; el resumen informa "sin cambios" |
| Caché larga para fuentes e íconos | Menos descargas en cada visita |
| Se eliminó el listado anterior del directorio, que hacía una subconsulta por fila | Código más simple |

Se probó agrupar los rankings con `GROUPING SETS` en una sola consulta, pero resultó más lento que 5 consultas cortas en paralelo apoyadas en los índices, así que se mantuvo esta última opción.
