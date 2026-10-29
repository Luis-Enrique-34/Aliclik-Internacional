# Configurar y mantener actualizada la plataforma (Aurora → Plataforma)

**Alcance de los datos**
- Origen: solo la base **Aurora** (MySQL 8).
- Tiendas: solo las registradas **fuera de Perú** (`stores.country_id <> 1`).
- Fecha: solo pedidos **creados desde el 2026-10-01 00:00:00**. Es hora de Aurora (UTC); si quieres medianoche de Lima, usa `2026-10-01 05:00:00`.

| Archivo | Dónde se ejecuta |
|---|---|
| `database/aurora/actualizar_pedidos_cargados.sql` | Aurora: carga completa desde `@inicio` |
| `database/aurora/pedidos_internacional.sql` | Aurora: carga diaria (últimos 45 días, nunca antes de `@inicio`) |
| `database/aurora/tiendas_operando.sql` | Aurora: control de tiendas (no se sube) |
| `database/consultas_supabase.sql` | Supabase → SQL Editor: control y limpieza |
| `scripts/sync-aurora.bat` | Windows: sincronización automática sin CSV |

---

## 1. Usuario de solo lectura en Aurora (lo crea el DBA/backend, una vez)

En `database/aurora/indices_recomendados.sql` está el script `CREATE USER … GRANT SELECT …` con las 11 tablas que usa la extracción:
- `orders`, `order_details`, `order_deliveries`, `products`
- `stores`, `countries`, `warehouses`, `couriers`
- `order_statuses`, `shipping_statuses`, `delivery_statuses`

Pide:
- **endpoint de lectura** del clúster (`…cluster-ro-….rds.amazonaws.com`)
- puerto (3306)
- nombre del esquema
- usuario y contraseña
- si se entra por **VPN** o por **túnel SSH** (bastión)

## 2. Conexión en DBeaver

1. *Base de datos → Nueva conexión → MySQL → Siguiente*.
2. Pestaña **Principal**: completa Host (el endpoint de lectura), Puerto `3306`, Base de datos (el esquema), Usuario y Contraseña.
3. Pestaña **SSL**:
   - Marca *Usar SSL*.
   - En *Certificado CA* elige `global-bundle.pem`. Descárgalo de `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` y guárdalo en `C:\work\ALICLIK - INTERNACIONAL\certs\`.
   - Marca *Verificar certificado del servidor*.
4. Pestaña **SSH**: solo si te dieron un bastión (host, usuario y llave).
5. *Probar conexión* → **Conectado** → *Finalizar*.
6. Opcional: en *Editar conexión → General* marca **Conexión de solo lectura**.

## 3. Primera carga limpia (desde 2026-10-01)

**3.1 Supabase → SQL Editor** (vacía los pedidos con el alcance anterior; no toca tiendas, integraciones, acuerdos, metas ni bitácora):
```sql
BEGIN;
  DELETE FROM pedidos;
COMMIT;
```

**3.2 Aurora (DBeaver)**
1. *Archivo → Abrir archivo* → `database\aurora\actualizar_pedidos_cargados.sql`.
2. Comprueba la línea `SET @inicio = '2026-10-01 00:00:00';`.
3. Elige la conexión de Aurora en la barra superior.
4. Ejecuta **el script completo** con **Alt+X**. No uses Ctrl+Enter, que ejecuta solo una sentencia.

**3.3 Exportar a CSV**
1. En la pestaña de resultados: clic derecho → *Exportar datos* → **CSV** → *Siguiente*.
2. *Extracción*: deja los valores por defecto.
3. *Formato*:
   - Delimitador `,`
   - Encabezado **arriba**
   - Comillas `"`
   - Valores NULL **vacíos**
4. *Salida*:
   - Codificación **UTF-8**
   - **Desmarca** "Insertar BOM"
   - Carpeta y nombre: por ejemplo `pedidos_aurora_2026-10-29.csv`
5. *Continuar*. Límite de la plataforma: 4 MB o 50 000 filas por archivo.

**3.4 Plataforma**
1. Entra a *Cargas de datos → Subir pedidos del día* y arrastra el CSV.
2. Revisa el resumen: nuevos, actualizados, sin cambios y rechazados.
3. En *Estados de pedido*, asigna el grupo a los estados que hayan quedado en "Otro".

**3.5 Control (Supabase)**: ejecuta las consultas 1 y 2 de `consultas_supabase.sql`. `desde` debe ser 2026-10-01 o posterior.

## 4. Sincronización automática (sin CSV)

**4.1 Requisitos en la PC**
- Node 20 o superior.
- `npm install` hecho en la carpeta del proyecto.
- Comprueba `npm ls mysql2`. Si no aparece, ejecuta `npm install mysql2`.
- Acceso de red a Aurora (VPN encendida, si aplica).

**4.2 `.env`** (agrega o completa estas líneas; nunca subas este archivo a GitHub):
```
AURORA_HOST=xxxx.cluster-ro-xxxx.us-east-1.rds.amazonaws.com
AURORA_PORT=3306
AURORA_USER=alc_internacional_ro
AURORA_PASSWORD=la_contraseña_del_usuario_de_lectura
AURORA_DATABASE=nombre_del_esquema
AURORA_SSL_CA=./certs/global-bundle.pem
AURORA_DIAS=45
AURORA_INICIO=2026-10-01 00:00:00
AURORA_TIMEZONE=UTC
```

**4.3 Prueba manual** (PowerShell en la carpeta del proyecto):
```powershell
npm run sync:aurora -- --desde 2026-10-01
```
Debe mostrar `✅ … Aurora · N pedidos · X nuevos · Y actualizados · Z sin cambios · 0 rechazados`.

**4.4 Programar las tareas.** Abre **Símbolo del sistema (cmd)**, no PowerShell, porque PowerShell altera las comillas:
```bat
schtasks /Create /SC MINUTE /MO 30 /TN "Aliclik Internacional - Sync Aurora" /TR "\"C:\work\ALICLIK - INTERNACIONAL\scripts\sync-aurora.bat\""

schtasks /Create /SC WEEKLY /D SUN /ST 06:00 /TN "Aliclik Internacional - Refresco semanal" /TR "\"C:\work\ALICLIK - INTERNACIONAL\scripts\sync-aurora.bat\" --desde 2026-10-01"
```
- Probar ya: `schtasks /Run /TN "Aliclik Internacional - Sync Aurora"`.
- Ver el estado: `schtasks /Query /TN "Aliclik Internacional - Sync Aurora" /V /FO LIST`.
- Resultado de cada ejecución: `logs\sync-aurora.log`.
- Borrar una tarea: `schtasks /Delete /TN "Aliclik Internacional - Sync Aurora" /F`.
- Para que corra aunque no hayas iniciado sesión: *Programador de tareas → la tarea → Propiedades → General →* "Ejecutar tanto si el usuario inició sesión como si no".

## 5. Control de tiendas

1. **Aurora**: ejecuta `tiendas_operando.sql` (Alt+X). Devuelve 2 pestañas:
   - Tiendas del extranjero con pedidos desde 2026-10-01
   - Todas las registradas fuera de Perú, operen o no
2. **Supabase**: ejecuta la consulta 2 de `consultas_supabase.sql`.
3. La pestaña 1 de Aurora y la consulta 2 de Supabase deben mostrar las mismas tiendas. Esta consulta no se sube a la plataforma.

## 6. Si algo no cuadra

| Síntoma | Qué hacer |
|---|---|
| `Faltan variables en .env` | Completa las líneas `AURORA_*` del paso 4.2 |
| `Falta la librería mysql2` | `npm install mysql2` |
| `ETIMEDOUT` / `ECONNREFUSED` | VPN apagada, endpoint o puerto incorrectos, o tu IP no está permitida en el Security Group de Aurora |
| `Access denied` | Usuario o contraseña incorrectos, o falta un `GRANT SELECT` |
| Error de certificado | Revisa la ruta de `AURORA_SSL_CA` |
| `país no reconocido` en los rechazos | El país destino no está en la tabla `paises` de la plataforma: hay que agregarlo |
| Muchos pedidos en "Otro" | Clasifica esos estados en *Cargas de datos → Estados de pedido* |
