-- Permisos granulares POR PESTAÑA del módulo INCIDENCIAS.
-- Extiende la convención de 20261104000000_permisos_por_pestana y
-- 20261106000000_permisos_concursos_cph_tabs (accion = 'tab:<slug>' dentro del
-- módulo dueño): 3 permisos nuevos en 'incidencias' = las pestañas "Todo",
-- "SIAL sin cargo" y "Baja sin concurso". Administrables por ROL desde
-- /configuracion/permisos, SIN que ningún rol pierda accesos que hoy tiene.
-- Ocultar es solo de UI (los endpoints se protegen con incidencias/ver).
--
-- Todo idempotente (ON CONFLICT DO NOTHING) y en una única transacción:
--   (a) insertar los 3 permisos
--   (b) grant condicional: todo rol con incidencias/ver (o gestionar) recibe
--       los 3 tab:* (hoy esos roles ven toda la página)
--   (c) admin (slug='admin') recibe los 3
--
-- ORDEN DE DESPLIEGUE (obligatorio):
--   1. Aplicar ESTA migración ANTES de desplegar apps/web (psql a mano:
--      psql "$NEON_DIRECT" -f prisma/migrations/20261107000000_permisos_incidencias_tabs/migration.sql
--      y luego: DATABASE_URL="$NEON_DIRECT" pnpm --filter @srrhh/api exec prisma migrate resolve --applied 20261107000000_permisos_incidencias_tabs).
--   2. Recién después desplegar apps/web. Si el front sale antes, el bloqueo
--      persiste aun re-logueando (no existirían los permisos tab:*).
--   3. Avisar a TODOS los usuarios, admin incluido, que se re-logueen:
--      user.permisos solo se arma en el login y can() no tiene bypass de admin.
--
-- MANUAL: NO ejecutar con `prisma migrate dev` contra Neon producción.
BEGIN;
-- ── (a) Insertar los 3 permisos de pestaña ──────────────────────────────────
INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'incidencias', 'tab:todo',              'Ver la pestaña "Todo" (todas las incidencias)'),
  (gen_random_uuid(), 'incidencias', 'tab:sial-sin-cargo',    'Ver la pestaña "SIAL sin cargo"'),
  (gen_random_uuid(), 'incidencias', 'tab:baja-sin-concurso', 'Ver la pestaña "Baja sin concurso"')
ON CONFLICT ("modulo", "accion") DO NOTHING;
-- ── (b) Grant condicional (preserva accesos): rol con ver o gestionar ───────
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT DISTINCT rp.role_id, p_nuevo.id
FROM "permisos" p_viejo
JOIN "role_permisos" rp ON rp.permiso_id = p_viejo.id
JOIN "permisos" p_nuevo ON p_nuevo.modulo = 'incidencias' AND p_nuevo.accion LIKE 'tab:%'
WHERE p_viejo.modulo = 'incidencias'
  AND p_viejo.accion IN ('ver', 'gestionar')
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;
-- ── (c) admin recibe los 3 (can() no tiene bypass: el catálogo viaja en login)
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r.slug = 'admin'
  AND p.modulo = 'incidencias'
  AND p.accion LIKE 'tab:%'
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;
COMMIT;
