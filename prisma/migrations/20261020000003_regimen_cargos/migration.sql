-- Feature Régimen persistido (FEAT-002): crea la tabla catálogo `regimenes`
-- (clasificación de grupos de cargos, reutilizable en filtros/reportes/export)
-- y la columna FK `cargos.regimen_id`. La columna legacy `cargos.regimen`
-- (VARCHAR(50), snapshot de texto del padrón) NO se toca.
--
-- La FK usa ON DELETE SET NULL (borrar un régimen no debe borrar cargos) y
-- ON UPDATE CASCADE. Nombres de constraint/índice estilo Prisma
-- (`cargos_regimen_id_fkey`, `cargos_regimen_id_idx`, `regimenes_nombre_key`)
-- para no divergir del schema declarativo.
--
-- Los 12 INSERT van con ON CONFLICT (nombre) DO NOTHING → idempotentes.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario corre este .sql en Neon.
CREATE TABLE regimenes (
    id         UUID         NOT NULL DEFAULT gen_random_uuid(),
    nombre     VARCHAR(100) NOT NULL,
    orden      INTEGER      NOT NULL,
    activo     BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- Unique index sobre nombre. Nombre `regimenes_nombre_key` para replicar la
-- convención que genera Prisma para `@unique` y evitar drift.
CREATE UNIQUE INDEX regimenes_nombre_key ON regimenes (nombre);

-- Seed de los 12 regímenes (orden 1..12). ON CONFLICT DO NOTHING = idempotente.
INSERT INTO regimenes (nombre, orden) VALUES
    ('Nueva Carrera Profesional Hospitalaria', 1),
    ('Nueva Carrera de Enfermería', 2),
    ('Carrera Técnica', 3),
    ('Carrera Administrativa', 4),
    ('Carrera Administrativa anexo II', 5),
    ('Cuerpo de Especialistas Profesionales', 6),
    ('Carrera Gerencial', 7),
    ('Autoridades Superiores', 8),
    ('Planta Gerencial', 9),
    ('Planta Transitoria Módulo Operativo', 10),
    ('Docentes', 11),
    ('Residentes', 12)
ON CONFLICT (nombre) DO NOTHING;

-- Columna FK en cargos + constraint. Nombre `cargos_regimen_id_fkey` para
-- replicar la convención de Prisma para `@relation` y evitar drift.
ALTER TABLE cargos ADD COLUMN regimen_id UUID;

ALTER TABLE cargos
    ADD CONSTRAINT cargos_regimen_id_fkey
    FOREIGN KEY (regimen_id) REFERENCES regimenes (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice. Nombre `cargos_regimen_id_idx` para replicar la convención de Prisma
-- para `@@index` y evitar drift con el schema declarativo.
CREATE INDEX cargos_regimen_id_idx ON cargos (regimen_id);
