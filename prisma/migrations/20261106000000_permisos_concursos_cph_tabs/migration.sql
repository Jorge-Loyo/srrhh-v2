-- Permisos granulares POR PESTAÑA / ETAPA del módulo CONCURSOS CPH.
-- Extiende la convención de 20261104000000_permisos_por_pestana
-- (accion = 'tab:<slug>' dentro del módulo dueño): 9 permisos nuevos en
-- 'concursos-cph' = 4 pestañas de ConcursosCphPage + 5 etapas del wizard.
-- Administrables por ROL desde /configuracion/permisos, SIN que ningún rol
-- pierda accesos que hoy tiene. Ocultar es solo de UI (sin gating en backend).
--
-- Todo idempotente (ON CONFLICT DO NOTHING) y en una única transacción:
--   (a) insertar los 9 permisos
--   (b) grant condicional: todo rol con concursos-cph/{ver,crear,editar,
--       autorizar} recibe los 9 tab:* (hoy esos roles ven todas las etapas)
--   (c) admin (slug='admin') recibe los 9
--
-- ORDEN DE DESPLIEGUE (obligatorio):
--   1. Aplicar ESTA migración ANTES de desplegar apps/web (psql a mano, o
--      dejando que corra `prisma migrate deploy` en Render).
--   2. Recién después desplegar apps/web. Si el front sale antes, el bloqueo
--      persiste aun re-logueando (no existirían los permisos tab:*).
--   3. Avisar a TODOS los usuarios, admin incluido, que se re-logueen:
--      user.permisos solo se arma en el login.
--
-- MANUAL: NO ejecutar con `prisma migrate dev` contra Neon producción.
BEGIN;
-- ── (a) Insertar los 9 permisos de pestaña / etapa ──────────────────────────
INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'concursos-cph', 'tab:concursos',               'Ver la pestaña "Concursos" (listado)'),
  (gen_random_uuid(), 'concursos-cph', 'tab:jurados',                 'Ver la pestaña "Jurados"'),
  (gen_random_uuid(), 'concursos-cph', 'tab:ordenes-merito',          'Ver la pestaña "Órdenes de mérito"'),
  (gen_random_uuid(), 'concursos-cph', 'tab:jornadas-sorteo',         'Ver la pestaña "Jornada de sorteos"'),
  (gen_random_uuid(), 'concursos-cph', 'tab:baja-apertura',           'Ver la etapa 1 — Baja / Apertura del concurso'),
  (gen_random_uuid(), 'concursos-cph', 'tab:autorizacion-jurado',     'Ver la etapa 2 — Autorización / Jurado del concurso'),
  (gen_random_uuid(), 'concursos-cph', 'tab:inscripcion-examen-om',   'Ver la etapa 3 — Inscripción / Examen / Orden de mérito del concurso'),
  (gen_random_uuid(), 'concursos-cph', 'tab:ifacs-insal',             'Ver la etapa 4 — IFACS / INSAL del concurso'),
  (gen_random_uuid(), 'concursos-cph', 'tab:designacion',             'Ver la etapa 5 — Designación del concurso')
ON CONFLICT ("modulo", "accion") DO NOTHING;
-- ── (b) Grant condicional (preserva accesos): rol con algún permiso viejo ───
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT DISTINCT rp.role_id, p_nuevo.id
FROM "permisos" p_viejo
JOIN "role_permisos" rp ON rp.permiso_id = p_viejo.id
JOIN "permisos" p_nuevo ON p_nuevo.modulo = 'concursos-cph' AND p_nuevo.accion LIKE 'tab:%'
WHERE p_viejo.modulo = 'concursos-cph'
  AND p_viejo.accion IN ('ver', 'crear', 'editar', 'autorizar')
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;
-- ── (c) admin recibe los 9 (can() no tiene bypass: el catálogo viaja en login)
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r.slug = 'admin'
  AND p.modulo = 'concursos-cph'
  AND p.accion LIKE 'tab:%'
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;
COMMIT;
