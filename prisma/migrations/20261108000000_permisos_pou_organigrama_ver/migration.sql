-- Permisos de VISIBILIDAD para POU y Organigrama (vistas del sidebar).
-- Hoy /pou y /organigrama son acceso ABIERTO a cualquier usuario autenticado
-- (sin RequirePermiso ni gate en el sidebar). Esta migración crea los dos
-- permisos gobernantes nuevos para que la visibilidad de esas vistas pase a ser
-- asignable por ROL desde /configuracion/permisos.
--
--   organigrama/ver  -> gobierna la vista /organigrama (grupo Visualización).
--   pou/ver          -> gobierna la vista /pou (grupo Visualización).
--
-- NO tocan el "Árbol de Organigrama" (configuracion/tab:arbol-organigrama) ni
-- la "Carga POU" (configuracion/tab:carga-pou): esas pestañas viven bajo
-- Importación y conservan su permiso actual.
--
-- BACKFILL (decisión de Jorge): como POU y Organigrama hoy son acceso abierto a
-- TODO usuario logueado, para no quitarle el acceso a nadie en el deploy se
-- otorga AMBOS permisos a TODOS los roles activos (los 11 no-admin + grant
-- explícito a admin). Jorge recorta después desde el panel. El backfill es
-- "a todos los roles" (INSERT ... SELECT sobre la tabla roles), NO condicional
-- por un permiso gobernante.
--
-- Todo idempotente (ON CONFLICT DO NOTHING) y en una única transacción:
--   (a) insertar los 2 permisos
--   (b) backfill: otorgar ambos a TODOS los roles
--   (c) grant explícito a admin (defensa en profundidad / consistencia con seed)
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario (Jorge) corre este .sql a mano en el deploy.
-- RECORDATORIO: tras aplicarla, TODOS los usuarios deben RE-LOGUEARSE para que
-- `user.permisos` (calculado en el login) incluya los permisos nuevos.

BEGIN;

-- ── (a) Insertar los 2 permisos de visibilidad ─────────────────────────────
INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'pou',         'ver', 'Ver POU'),
  (gen_random_uuid(), 'organigrama', 'ver', 'Ver Organigrama')
ON CONFLICT ("modulo", "accion") DO NOTHING;

-- ── (b) Backfill: otorgar AMBOS permisos a TODOS los roles ─────────────────
-- Producto cartesiano roles × {pou/ver, organigrama/ver}. Puramente aditivo y
-- data-driven: no depende de qué roles existan ni de permisos gobernantes.
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permisos" p
  ON (p.modulo = 'pou'         AND p.accion = 'ver')
  OR (p.modulo = 'organigrama' AND p.accion = 'ver')
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

-- ── (c) Grant explícito a admin (consistencia con el seed existente) ────────
-- admin (esSistema, slug='admin') ya pasa por bypass en requirePermiso/can(),
-- así que funcionalmente ve todo sin estas filas; se agregan por consistencia
-- y para que la grilla muestre ambos checks marcados. Redundante con (b) pero
-- idempotente.
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r.slug = 'admin'
  AND ((p.modulo = 'pou' AND p.accion = 'ver') OR (p.modulo = 'organigrama' AND p.accion = 'ver'))
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

COMMIT;
