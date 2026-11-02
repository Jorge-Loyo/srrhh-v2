-- Permisos del módulo "gestion-puestos" (FASE 1): la ventana de acciones sobre
-- los id_sial NUEVOS pendientes tras aprobar un padrón. Dos acciones:
--   ver       -> GET /api/v1/gestion-puestos/pendientes (consulta)
--   gestionar -> el resto de las rutas (crear-cargo / vincular-concurso /
--                crear-concurso / transferencia / sin-codigo / buscar concursos)
-- Se otorgan ambas a los roles admin y editor (el rol admin ya pasa siempre por
-- código, pero se dejan explícitas por consistencia con el resto del seed).
--
-- Todo idempotente (ON CONFLICT DO NOTHING) para poder re-correrlo sin error.
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario (Jorge) corre este .sql a mano en Neon.

INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'gestion-puestos', 'ver',       'Ver la cola de id_sial nuevos pendientes de gestión'),
  (gen_random_uuid(), 'gestion-puestos', 'gestionar', 'Gestionar un id_sial nuevo (crear cargo, vincular/crear concurso, transferencia, sin código)')
ON CONFLICT ("modulo", "accion") DO NOTHING;

INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM (VALUES
  ('admin',  'gestion-puestos', 'ver'),
  ('admin',  'gestion-puestos', 'gestionar'),
  ('editor', 'gestion-puestos', 'ver'),
  ('editor', 'gestion-puestos', 'gestionar')
) AS seed(role_slug, modulo, accion)
JOIN "roles" r ON r.slug = seed.role_slug
JOIN "permisos" p ON p.modulo = seed.modulo AND p.accion = seed.accion
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;
