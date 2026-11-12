-- Permiso nuevo para la pestaña "Nuevos cargos" de /cargos (Paso A del flujo de
-- concursos). Es una VISTA de solo lectura de los cargos creados por alta
-- (idSial LIKE 'MANUAL-%') que están VIGENTE/VACANTE o VIGENTE/CONCURSO,
-- ordenados por expediente de creación. La acción "Caratular" es un paso
-- posterior (Paso C); por ahora va como placeholder deshabilitado.
--
-- Convención idéntica a 20261110000000_permiso_cargos_tab_concurso:
--   accion = 'tab:<slug>' dentro del modulo DUEÑO del layout (cargos).
-- El permiso es DATA-DRIVEN: aparece en el panel /configuracion/permisos
-- (modulo 'cargos', sección "Gestión de Cargos") para que Jorge lo asigne por
-- rol. Por eso NO se hardcodea a ningún rol salvo admin (defensa en profundidad).
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). Jorge corre este .sql a mano en el deploy.

BEGIN;

-- ── (a) Insertar el permiso de pestaña ──────────────────────────────────────
INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'cargos', 'tab:nuevos-cargos', 'Pestaña: Nuevos cargos (cargos de alta por concursar)')
ON CONFLICT ("modulo", "accion") DO NOTHING;

-- ── (b) Grant SOLO a admin (defensa en profundidad) ─────────────────────────
-- admin (esSistema, slug='admin') ya pasa por el bypass de requirePermiso/can(),
-- así que funcionalmente ve la pestaña sin esta fila; se agrega por consistencia
-- con el seed existente y para que la grilla muestre el check marcado. Los demás
-- roles NO se tocan: Jorge ajusta la asignación desde /configuracion/permisos.
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permisos" p ON p.modulo = 'cargos' AND p.accion = 'tab:nuevos-cargos'
WHERE r.slug = 'admin'
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

COMMIT;
