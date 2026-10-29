-- =====================================================================
--  ALICLIK INTERNACIONAL · Esquema de base de datos (PostgreSQL / Supabase)
--  Se puede ejecutar varias veces: no borra datos (CREATE ... IF NOT EXISTS).
--    npm run db:init
--
--  Seguridad:
--   · RLS (Row Level Security) ACTIVADO en todas las tablas y SIN políticas:
--     la API pública de Supabase (anon / authenticated) no puede leer ni
--     escribir nada. Solo el backend, que se conecta con el usuario dueño
--     de las tablas, accede a los datos.
--   · Las contraseñas se guardan como hash Argon2id (nunca en texto plano).
--   · Los tokens de Google se guardan cifrados (AES-256-GCM) desde el backend.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------
--  1. USUARIOS, SESIONES Y AUDITORÍA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombres            VARCHAR(80)  NOT NULL,
    apellidos          VARCHAR(80)  NOT NULL,
    email              VARCHAR(255) NOT NULL,
    cargo              VARCHAR(80),
    password_hash      TEXT         NOT NULL,
    -- admin: gestiona usuarios y todo · editor: carga data y gestiona seguimiento · lector: solo consulta
    rol                VARCHAR(10)  NOT NULL DEFAULT 'lector' CHECK (rol IN ('admin', 'editor', 'lector')),
    -- toda cuenta nueva queda "pendiente" hasta que un administrador la aprueba
    estado             VARCHAR(12)  NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activo', 'suspendido')),
    intentos_fallidos  SMALLINT     NOT NULL DEFAULT 0,
    bloqueado_hasta    TIMESTAMPTZ,
    -- se incrementa al cambiar contraseña / rol / estado: invalida las sesiones abiertas
    version_sesion     INTEGER      NOT NULL DEFAULT 1,
    ultimo_login       TIMESTAMPTZ,
    password_cambiada  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (lower(email));

CREATE TABLE IF NOT EXISTS auditoria (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    accion      VARCHAR(40)  NOT NULL,
    entidad     VARCHAR(40),
    entidad_id  TEXT,
    ip          VARCHAR(45),
    detalle     JSONB,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria (creado_en DESC);

-- ---------------------------------------------------------------------
--  2. CATÁLOGOS: países y grupos de estado de pedido
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paises (
    codigo      CHAR(2) PRIMARY KEY,        -- ISO-2: GT, HN, AR...
    nombre      VARCHAR(60) NOT NULL,
    moneda      CHAR(3),
    zona_horaria VARCHAR(40),
    activo      BOOLEAN NOT NULL DEFAULT true
);

-- Clasifica cada estado de Aurora en un grupo del tablero.
-- Se llena solo al importar (por palabras clave) y se puede corregir a mano.
CREATE TABLE IF NOT EXISTS estado_grupos (
    estado_codigo  VARCHAR(60) PRIMARY KEY,
    estado_label   VARCHAR(120),
    grupo          VARCHAR(15) NOT NULL CHECK (grupo IN ('pendiente', 'en_proceso', 'en_ruta', 'entregado', 'devuelto', 'cancelado', 'otro')),
    manual         BOOLEAN NOT NULL DEFAULT false,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  3. ENTIDADES DEL ECOSISTEMA (tiendas, proveedores, almacenes, couriers)
--     aurora_id = id en la base Aurora (se sincroniza con cada carga)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entidades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('tienda', 'proveedor', 'almacen', 'courier')),
    aurora_id       BIGINT,
    nombre          VARCHAR(160) NOT NULL,
    pais            CHAR(2) REFERENCES paises(codigo),
    contacto        VARCHAR(120),
    telefono        VARCHAR(40),
    correo          VARCHAR(255),
    notas           TEXT,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entidades_aurora ON entidades (tipo, aurora_id) WHERE aurora_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_entidades_nombre ON entidades (tipo, lower(nombre)) WHERE aurora_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_entidades_tipo ON entidades (tipo, pais);

-- ---------------------------------------------------------------------
--  4. INTEGRACIONES (hoja "Proov Bodega" del Excel):
--     un proveedor operando desde un almacén en un país, con su checklist.
--     IMPORTANTE: NO se guarda la contraseña de Aliclik del proveedor.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integraciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pais            CHAR(2) NOT NULL REFERENCES paises(codigo),
    proveedor_id    UUID NOT NULL REFERENCES entidades(id) ON DELETE RESTRICT,
    almacen_id      UUID REFERENCES entidades(id) ON DELETE SET NULL,
    almacen_texto   VARCHAR(160),      -- cuando el almacén aún no está definido ("por definir")
    contacto        VARCHAR(120),
    telefono        VARCHAR(40),
    pendiente       TEXT,
    horario_corte   TEXT,
    usuario_alc     VARCHAR(255),      -- usuario de acceso a Aliclik (sin contraseña)
    logo_url        VARCHAR(500),
    comentario      TEXT,
    -- checklist de puesta en marcha
    grupo_wsp       BOOLEAN NOT NULL DEFAULT false,
    conf_sistemas   BOOLEAN NOT NULL DEFAULT false,
    capacitacion    BOOLEAN NOT NULL DEFAULT false,
    catalogo        BOOLEAN NOT NULL DEFAULT false,
    despacho        BOOLEAN NOT NULL DEFAULT false,
    liquidaciones   BOOLEAN NOT NULL DEFAULT false,
    avance          SMALLINT GENERATED ALWAYS AS (
                      ((grupo_wsp::int + conf_sistemas::int + capacitacion::int + catalogo::int + despacho::int + liquidaciones::int) * 100) / 6
                    ) STORED,
    estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'integrado', 'pausado')),
    responsable_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_integraciones_pais ON integraciones (pais, estado);

-- ---------------------------------------------------------------------
--  5. OBSERVACIONES (hoja "Observaciones"): hallazgos de la plataforma
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero          SERIAL,
    descripcion     TEXT NOT NULL,
    pais            CHAR(2) REFERENCES paises(codigo),
    modulo          VARCHAR(60),
    prioridad       VARCHAR(6) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
    estado          VARCHAR(12) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_proceso', 'resuelta', 'descartada')),
    nota            TEXT,
    responsable_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  6. SEGUIMIENTO: bitácora de comentarios y cambios de estado
--     sobre una integración, una entidad o una observación.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seguimientos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurso      VARCHAR(12) NOT NULL CHECK (recurso IN ('integracion', 'entidad', 'observacion')),
    recurso_id   UUID NOT NULL,
    usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    comentario   TEXT NOT NULL CHECK (char_length(comentario) BETWEEN 1 AND 2000),
    estado_nuevo VARCHAR(12),
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_seguimientos_recurso ON seguimientos (recurso, recurso_id, creado_en DESC);

-- ---------------------------------------------------------------------
--  6b. PLAN DE SEGUIMIENTO por entidad (tienda, proveedor, almacén, courier)
--      segmento: trato comercial · meta: pedidos esperados por mes
-- ---------------------------------------------------------------------
ALTER TABLE entidades ADD COLUMN IF NOT EXISTS segmento VARCHAR(12) NOT NULL DEFAULT 'estandar';
ALTER TABLE entidades ADD COLUMN IF NOT EXISTS meta_pedidos_mes INTEGER;
ALTER TABLE entidades ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE entidades ADD COLUMN IF NOT EXISTS condiciones TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_entidades_segmento') THEN
        ALTER TABLE entidades ADD CONSTRAINT ck_entidades_segmento CHECK (segmento IN ('estandar', 'preferente', 'vip', 'estrategica'));
        ALTER TABLE entidades ADD CONSTRAINT ck_entidades_meta CHECK (meta_pedidos_mes IS NULL OR meta_pedidos_mes BETWEEN 1 AND 10000000);
    END IF;
END $$;

-- Acuerdos comerciales / trato especial (descuentos exclusivos, tarifas, beneficios).
-- umbral_pedidos: el beneficio se gana al alcanzar N pedidos en el mes (escalas).
CREATE TABLE IF NOT EXISTS acuerdos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entidad_id      UUID NOT NULL REFERENCES entidades(id) ON DELETE CASCADE,
    tipo            VARCHAR(16) NOT NULL CHECK (tipo IN ('descuento_pct', 'descuento_monto', 'tarifa_especial', 'envio_gratis', 'credito', 'prioridad', 'otro')),
    titulo          VARCHAR(160) NOT NULL,
    descripcion     TEXT,
    aplica_a        VARCHAR(12) NOT NULL DEFAULT 'general' CHECK (aplica_a IN ('fulfillment', 'envio', 'comision', 'producto', 'liquidacion', 'general')),
    valor           NUMERIC(12,2) CHECK (valor IS NULL OR valor >= 0),
    moneda          CHAR(3),
    umbral_pedidos  INTEGER CHECK (umbral_pedidos IS NULL OR umbral_pedidos > 0),
    vigente_desde   DATE NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta   DATE,
    estado          VARCHAR(10) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pausado', 'finalizado')),
    creado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
    CHECK (tipo <> 'descuento_pct' OR valor <= 100)
);
CREATE INDEX IF NOT EXISTS ix_acuerdos_entidad ON acuerdos (entidad_id, estado);

-- ---------------------------------------------------------------------
--  7. PEDIDOS (una fila por pedido de Aurora; la carga hace UPSERT)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    order_id           BIGINT PRIMARY KEY,                 -- orders.id en Aurora
    order_number       VARCHAR(60),
    pais               CHAR(2) REFERENCES paises(codigo),
    fecha_pedido       TIMESTAMPTZ NOT NULL,
    fecha_actualizacion TIMESTAMPTZ,
    fecha_entrega      DATE,
    tienda_id          BIGINT,  tienda_nombre    VARCHAR(160),
    proveedor_id       BIGINT,  proveedor_nombre VARCHAR(160),
    almacen_id         BIGINT,  almacen_nombre   VARCHAR(160),
    courier_id         BIGINT,  courier_nombre   VARCHAR(160),
    estado_codigo      VARCHAR(60),
    estado_label       VARCHAR(120),
    estado_envio       VARCHAR(120),
    estado_entrega     VARCHAR(120),
    contraentrega      BOOLEAN,
    moneda             CHAR(3),
    total              NUMERIC(14,2) NOT NULL DEFAULT 0,
    unidades           INTEGER NOT NULL DEFAULT 0,
    n_proveedores      SMALLINT NOT NULL DEFAULT 1,
    carga_id           UUID,
    sincronizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Día del pedido en hora de Lima, calculado una vez al guardar: el tablero agrupa y filtra por
-- este campo en vez de convertir la zona horaria fila por fila (≈3 veces más rápido).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS dia_local DATE
    GENERATED ALWAYS AS ((fecha_pedido AT TIME ZONE 'America/Lima')::date) STORED;
CREATE INDEX IF NOT EXISTS ix_pedidos_fecha     ON pedidos (fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_dia       ON pedidos (dia_local, pais);
CREATE INDEX IF NOT EXISTS ix_pedidos_pais      ON pedidos (pais, fecha_pedido DESC);
-- Índices compuestos (actor + fecha): sirven al tablero, al seguimiento y a los filtros
DROP INDEX IF EXISTS ix_pedidos_tienda; DROP INDEX IF EXISTS ix_pedidos_proveedor;
DROP INDEX IF EXISTS ix_pedidos_almacen; DROP INDEX IF EXISTS ix_pedidos_courier;
CREATE INDEX IF NOT EXISTS ix_pedidos_tienda_f    ON pedidos (tienda_id, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_proveedor_f ON pedidos (proveedor_id, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_almacen_f   ON pedidos (almacen_id, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_courier_f   ON pedidos (courier_id, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_estado      ON pedidos (estado_codigo);

-- Registro de cada carga (CSV manual o sincronización automática)
CREATE TABLE IF NOT EXISTS cargas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    origen        VARCHAR(10) NOT NULL CHECK (origen IN ('csv', 'sync')),
    archivo       VARCHAR(200),
    huella        CHAR(64),               -- SHA-256 del archivo (detecta cargas repetidas)
    filas_total   INTEGER NOT NULL DEFAULT 0,
    insertadas    INTEGER NOT NULL DEFAULT 0,
    actualizadas  INTEGER NOT NULL DEFAULT 0,
    rechazadas    INTEGER NOT NULL DEFAULT 0,
    errores       JSONB,
    fecha_desde   TIMESTAMPTZ,
    fecha_hasta   TIMESTAMPTZ,
    duracion_ms   INTEGER,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cargas_fecha ON cargas (creado_en DESC);
ALTER TABLE cargas ADD COLUMN IF NOT EXISTS sin_cambios INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
--  8. CALENDARIO: reuniones y tareas (sincronizables con Google Calendar)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id         UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo               VARCHAR(8) NOT NULL DEFAULT 'reunion' CHECK (tipo IN ('reunion', 'tarea')),
    titulo             VARCHAR(200) NOT NULL,
    descripcion        TEXT,
    ubicacion          VARCHAR(300),
    inicio             TIMESTAMPTZ NOT NULL,
    fin                TIMESTAMPTZ NOT NULL,
    todo_el_dia        BOOLEAN NOT NULL DEFAULT false,
    estado_tarea       VARCHAR(10) CHECK (estado_tarea IN ('pendiente', 'en_curso', 'hecha')),
    prioridad          VARCHAR(6) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
    integracion_id     UUID REFERENCES integraciones(id) ON DELETE SET NULL,
    entidad_id         UUID REFERENCES entidades(id) ON DELETE SET NULL,
    asistentes         JSONB NOT NULL DEFAULT '[]'::jsonb,
    meet_link          VARCHAR(300),
    origen             VARCHAR(7) NOT NULL DEFAULT 'local' CHECK (origen IN ('local', 'google')),
    sincronizar        BOOLEAN NOT NULL DEFAULT true,
    google_event_id    VARCHAR(1024),
    google_etag        VARCHAR(100),
    google_actualizado TIMESTAMPTZ,
    pendiente_sync     BOOLEAN NOT NULL DEFAULT false,   -- cambio local aún no enviado a Google
    eliminado          BOOLEAN NOT NULL DEFAULT false,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fin >= inicio)
);
CREATE INDEX IF NOT EXISTS ix_eventos_usuario ON eventos (usuario_id, inicio);
CREATE UNIQUE INDEX IF NOT EXISTS ux_eventos_google ON eventos (usuario_id, google_event_id) WHERE google_event_id IS NOT NULL;

-- Conexión de cada usuario con su Google Calendar (tokens CIFRADOS)
CREATE TABLE IF NOT EXISTS google_cuentas (
    usuario_id          UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    google_email        VARCHAR(255),
    calendar_id         VARCHAR(255) NOT NULL DEFAULT 'primary',
    refresh_token_cif   TEXT NOT NULL,
    access_token_cif    TEXT,
    access_expira       TIMESTAMPTZ,
    sync_token          TEXT,
    canal_id            VARCHAR(64),
    canal_recurso_id    VARCHAR(255),
    canal_token_hash    CHAR(64),
    canal_expira        TIMESTAMPTZ,
    ultima_sync         TIMESTAMPTZ,
    ultimo_error        VARCHAR(300),
    conectado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_google_canal ON google_cuentas (canal_id);

-- ---------------------------------------------------------------------
--  9. Fecha de actualización automática
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_actualizado_en() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['usuarios', 'entidades', 'integraciones', 'observaciones', 'eventos', 'acuerdos'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_' || t || '_actualizado') THEN
            EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en()',
                           'tg_' || t || '_actualizado', t);
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
--  10. RLS en TODAS las tablas (sin políticas = acceso denegado a la API
--      pública de Supabase). Además se retiran permisos a anon/authenticated.
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    END IF;
END $$;

-- ---------------------------------------------------------------------
--  11. Datos base
-- ---------------------------------------------------------------------
INSERT INTO paises (codigo, nombre, moneda, zona_horaria) VALUES
    ('GT', 'Guatemala', 'GTQ', 'America/Guatemala'),
    ('HN', 'Honduras',  'HNL', 'America/Tegucigalpa'),
    ('AR', 'Argentina', 'ARS', 'America/Argentina/Buenos_Aires'),
    ('MX', 'México',    'MXN', 'America/Mexico_City'),
    ('CO', 'Colombia',  'COP', 'America/Bogota'),
    ('EC', 'Ecuador',   'USD', 'America/Guayaquil'),
    ('CL', 'Chile',     'CLP', 'America/Santiago'),
    ('PE', 'Perú',      'PEN', 'America/Lima')
ON CONFLICT (codigo) DO NOTHING;
