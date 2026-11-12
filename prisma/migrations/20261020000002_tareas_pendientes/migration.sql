-- Feature Tareas pendientes: crea la tabla tareas_pendientes, que dirige una
-- tarea a un usuario concreto (usuario_destinatario_id), a diferencia de las
-- notificaciones que apuntan a un rol. referencia_tipo/referencia_id siguen el
-- mismo patrón polimórfico que autorizaciones.
--
-- Las FKs a usuarios: destinatario con ON DELETE RESTRICT (una tarea no puede
-- quedar huérfana de su destinatario), creada_por_id con ON DELETE SET NULL
-- (el autor es solo trazabilidad opcional).
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario corre este .sql en Neon.
CREATE TABLE tareas_pendientes (
    id                      UUID         NOT NULL DEFAULT gen_random_uuid(),
    tipo                    VARCHAR(50)  NOT NULL,
    estado                  VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
    usuario_destinatario_id UUID         NOT NULL,
    referencia_tipo         VARCHAR(50)  NOT NULL,
    referencia_id           UUID         NOT NULL,
    mensaje                 TEXT,
    creada_por_id           UUID,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resuelta_at             TIMESTAMPTZ,
    PRIMARY KEY (id)
);

-- FKs a usuarios. Nombres `tareas_pendientes_<campo>_fkey` para replicar la
-- convención que genera Prisma y evitar drift con el schema declarativo.
ALTER TABLE tareas_pendientes
    ADD CONSTRAINT tareas_pendientes_usuario_destinatario_id_fkey
    FOREIGN KEY (usuario_destinatario_id) REFERENCES usuarios (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE tareas_pendientes
    ADD CONSTRAINT tareas_pendientes_creada_por_id_fkey
    FOREIGN KEY (creada_por_id) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Índices. Nombres `<tabla>_<campos>_idx` para replicar la convención de Prisma
-- para `@@index` y evitar drift con el schema declarativo.
CREATE INDEX tareas_pendientes_usuario_destinatario_id_estado_idx ON tareas_pendientes (usuario_destinatario_id, estado);
CREATE INDEX tareas_pendientes_referencia_tipo_referencia_id_idx ON tareas_pendientes (referencia_tipo, referencia_id);
CREATE INDEX tareas_pendientes_estado_idx ON tareas_pendientes (estado);
