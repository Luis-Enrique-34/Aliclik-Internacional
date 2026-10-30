# Indicadores, SLA y pronósticos por módulo

Cada módulo tiene arriba un panel **«Indicadores de …»** con:

- **Medidores**: semicírculos de 0 a 100 %. La rayita negra marca la meta.
- **Tarjetas KPI**: tienen un semáforo según la meta.
  - Verde: cumple la meta.
  - Ámbar: está a menos del 15 % de la meta.
  - Rojo: está fuera de la meta.
  - Gris: el dato es solo informativo.
- **Hallazgos**: frases listas para leer en una reunión.
- **Pronóstico**: la línea continua es el dato real y la línea discontinua el pronóstico. La banda sombreada es el rango probable (80 %).
- **Desgloses**: rankings y embudos.

Botones del panel:
- **Presentar**: pantalla completa.
- **PDF**: imprime solo el panel.
- **Ocultar**: se recuerda en cada navegador.

Si pasas el mouse sobre un indicador, verás cómo se calcula.

> Las metas y los plazos de SLA están en **`src/config/metas.js`**. Si cambias un número ahí, la plataforma usa la nueva meta después de reiniciar el servidor (o de volver a publicar en Vercel).

## Qué mide cada módulo

| Módulo | Medidores (con meta) | Otros KPI | Pronóstico |
|---|---|---|---|
| **Tablero / Pedidos** | Efectividad de entrega (≥ 70 %) · Entregas en ≤ 5 días (≥ 85 %) · Devoluciones + cancelaciones (≤ 20 %) | Tiempo medio de entrega · En curso hace > 7 días · Antigüedad de los datos (≤ 24 h) · Ticket promedio | Próximos 14–21 días, cierre del mes y los 3 meses siguientes |
| **Seguimiento** (por tipo) | Actores sanos (≥ 70 %) · Cumplirían su meta (≥ 80 %) · Concentración en el top 5 (≤ 60 %) | Efectividad · En riesgo · Con pedidos · Trato especial · Proyección del mes vs. meta | Pedidos por mes + proyección |
| **Integraciones** | % integradas · Avance del checklist (≥ 80 %) · Integradas en ≤ 30 días (≥ 80 %) | Tiempo medio · Fuera de SLA · Sin movimiento > 7 días · Abiertas · **Fin estimado al ritmo actual** | Integraciones completadas por semana |
| **Observaciones** | Resueltas dentro del SLA (≥ 85 %) · Tasa de cierre 30 días (≥ 100 %) | Backlog (≤ 15) · Vencidas · Tiempo de resolución · Antigüedad · Sin responsable | Backlog semanal (4 semanas) |
| **Calendario** (personal) | Tareas a tiempo (≥ 90 %) · Horas de reunión en la semana (≤ 15 h) | % sincronizados con Google · Tareas vencidas · Reuniones · % vinculados | Horas de reunión por semana |
| **Usuarios** (admin) | Adopción en 30 días (≥ 80 %) · Google conectado (≥ 70 %) | Pendientes · Contraseñas > 90 días · Bloqueados · Activos · Nuevos | Inicios de sesión por día |
| **Auditoría** (admin) | Inicios de sesión correctos (≥ 90 %) | Bloqueos · Eventos · Cambios de acceso · Eliminaciones · Picos inusuales | Actividad por día |
| **Cargas de datos** | Días hábiles con carga (≥ 90 %) · Filas rechazadas (≤ 2 %) | Antigüedad de los datos · Cargas · Duración · Pedidos nuevos | — |

SLA de observaciones según prioridad: **alta, 2 días · media, 5 días · baja, 10 días**.

## Cómo se calculan los pronósticos (para explicarlo en una presentación)

1. **Tendencia**: una recta de mínimos cuadrados sobre las últimas 8 semanas. No se usan el día de hoy, que está incompleto, ni los días anteriores al primer dato.
2. **Estacionalidad semanal**: cada día de la semana tiene su propio factor. Por ejemplo, si los domingos suelen tener la mitad de pedidos, el pronóstico respeta ese patrón.
3. **Rango probable**: ± 1,28 desviaciones estándar de los errores históricos, lo que equivale a un 80 % de confianza.
4. **Cierre de mes**: lo que ya ocurrió más lo pronosticado para los días que faltan.
5. **Meses siguientes**: una recta sobre los meses cerrados. Si el primer mes está incompleto, se descarta.
6. **Historia corta** (menos de 14 días): se usa el promedio de los últimos 7 días y se avisa en la línea «Método».

Son pronósticos estadísticos simples y explicables. No reemplazan el criterio comercial: sirven para anticipar tendencias y detectar desvíos.

## Filtros y orden en todos los módulos

| Módulo | Filtros nuevos | Ordenar por |
|---|---|---|
| Tablero | (ranking) | Pedidos, entregados, efectividad, % devoluciones, en curso, último pedido, nombre |
| Pedidos | Pago (contraentrega / anticipado), antigüedad en curso (3, 7 o 15 días), rango de monto | Fecha, actualización, entrega, monto, unidades, estado, tienda, proveedor, almacén, courier, N° de pedido (asc./desc.) |
| Seguimiento | Meta (con / sin / no llegaría / cumpliría), responsable, mínimo de pedidos | Pedidos 30 d, variación, mes, avance de meta, proyección, efectividad, devoluciones, último pedido, salud, acuerdos, nombre |
| Acuerdos | Vigencia, tipo de beneficio | Vencimiento, inicio, valor, umbral, actor, beneficio |
| Integraciones | Paso pendiente, rango de avance, SLA (fuera de plazo / sin movimiento), responsable, con o sin pedidos | Avance, días abierta, pedidos, último seguimiento, proveedor, país, estado |
| Observaciones | Prioridad, módulo, responsable, SLA (vencidas / en plazo), búsqueda | Actualización, registro, prioridad, antigüedad, comentarios, estado, módulo, número |
| Calendario | Prioridad, estado de tarea, vínculo, origen (Google / plataforma) | Tareas: vencimiento, prioridad, título |
| Usuarios | Rol, estado (incluye bloqueados), actividad, búsqueda | Último ingreso, registro, nombre, rol, estado, antigüedad de la contraseña |
| Auditoría | Categoría, acción, usuario, rango de fechas, IP, texto en el detalle, cantidad | Más recientes / más antiguos |
| Cargas | Origen, solo con rechazos | Fecha, filas, nuevos, rechazos, duración |

## Datos nuevos en la base

Con `npm run db:init` (es seguro repetirlo) se agregan tres fechas de cierre:
- `observaciones.cerrada_en`
- `integraciones.integrada_en`
- `eventos.hecha_en`

Las llena un *trigger* automático. Los registros que ya estaban cerrados toman su última fecha de actualización.
