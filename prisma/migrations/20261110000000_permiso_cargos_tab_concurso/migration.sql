-- Permiso nuevo para la pestaña "Concurso" de /cargos (bandeja mixta de inicio
-- CPH + CEETPS). Paso 1 del flujo de concursos: la pantalla que gestiona el
-- INICIO de todos los concursos, antes de que se autoricen y "viajen" a
-- /concursos/cph o /concursos/ceetps.
--
-- Convención idéntica a 20261104000000_permisos_por_pestana:
--   accion = 'tab:<slug>' dentro del modulo DUEÑO del layout (cargos).
-- El permiso es DATA-DRIVEN: aparece solo en el panel /configuracion/permisos
-- (modulo 'cargos', sección "Gestión de Cargos") para que Jorge lo asigne por
-- rol. Por eso NO se hardcodea a ningún rol salvo admin (defensa en profundidad).
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). Jorge corre este .sql a mano en el deploy.

BEGIN;

-- ── (a) Insertar el permiso de pestaña ──────────────────────────────────────
INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'cargos', 'tab:concurso', 'Pestaña: Concurso (bandeja de inicio)')
ON CONFLICT ("modulo", "accion") DO NOTHING;

-- ── (b) Grant SOLO a admin (defensa en profundidad) ─────────────────────────
-- admin (esSistema, slug='admin') ya pasa por el bypass de requirePermiso/can(),
-- así que funcionalmente ve la pestaña sin esta fila; se agrega por consistencia
-- con el seed existente y para que la grilla muestre el check marcado. Los demás
-- roles NO se tocan: Jorge ajusta la asignación desde /configuracion/permisos.
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permisos" p ON p.modulo = 'cargos' AND p.accion = 'tab:concurso'
WHERE r.slug = 'admin'
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

COMMIT;
