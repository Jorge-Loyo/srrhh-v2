-- RBAC dinámico: reemplaza el enum fijo "RolUsuario" + requireRole hardcodeado por
-- roles/permisos en tabla, editables por el admin desde /configuracion/permisos.
-- Todo lo que se referencia acá se crea en esta misma migración (sin IDs de otro entorno).

-- ── Tablas ──────────────────────────────────────────────────────────────────
CREATE TABLE "roles" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "slug"        VARCHAR(40)  NOT NULL,
  "nombre"      VARCHAR(100) NOT NULL,
  "descripcion" VARCHAR(255),
  "es_sistema"  BOOLEAN      NOT NULL DEFAULT false,
  "activo"      BOOLEAN      NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_slug_key" UNIQUE ("slug")
);

CREATE TABLE "permisos" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "modulo"      VARCHAR(40) NOT NULL,
  "accion"      VARCHAR(40) NOT NULL,
  "descripcion" VARCHAR(255),
  CONSTRAINT "permisos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "permisos_modulo_accion_key" UNIQUE ("modulo", "accion")
);

CREATE TABLE "role_permisos" (
  "role_id"    UUID NOT NULL,
  "permiso_id" UUID NOT NULL,
  CONSTRAINT "role_permisos_pkey" PRIMARY KEY ("role_id", "permiso_id"),
  CONSTRAINT "role_permisos_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permisos_permiso_id_fkey"
    FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── Seed: los 6 roles de sistema (protegidos de borrado; "admin" además protegido
-- de edición en el service layer — ver roles.service.ts) ────────────────────────
INSERT INTO "roles" ("slug", "nombre", "es_sistema") VALUES
  ('admin',              'Administrador',      true),
  ('editor',             'Editor',              true),
  ('viewer',             'Solo lectura',        true),
  ('director',           'Director',            true),
  ('concursales_cph',    'Concursales CPH',     true),
  ('concursales_ceetps', 'Concursales CEETPS',  true);

-- ── Seed: catálogo completo de permisos (Doc/Planificacion/Concursos-CPH.md:146-168
-- + los módulos nuevos que ya existen en código: bajas-sial, configuracion granular) ──
INSERT INTO "permisos" ("modulo", "accion", "descripcion") VALUES
  ('padron',            'ver',                  'Ver snapshots y diffs del padrón semanal'),
  ('padron',            'subir',                'Subir un nuevo padrón semanal'),
  ('padron',            'aprobar_padron',       'Aprobar o rechazar un snapshot de padrón'),
  ('padron',            'eliminar_snap',        'Eliminar un snapshot de padrón'),
  ('personas',          'ver',                  'Ver el listado y detalle de personas'),
  ('cargos',            'ver',                  'Ver el listado y detalle de cargos'),
  ('cargos',            'crear',                'Dar de alta un cargo manualmente'),
  ('bajas',             'ver',                  'Ver bajas'),
  ('bajas',             'crear',                'Crear o editar una baja'),
  ('bajas-sial',        'subir',                'Subir el padrón de bajas SIAL'),
  ('bajas-sial',        'aprobar',              'Aprobar o rechazar el diff de bajas SIAL'),
  ('concursos-cph',     'ver',                  'Ver concursos CPH'),
  ('concursos-cph',     'crear',                'Crear un concurso CPH'),
  ('concursos-cph',     'editar',               'Editar / avanzar de fase un concurso CPH'),
  ('concursos-cph',     'autorizar',            'Autorizar un concurso CPH (director)'),
  ('concursos-ceetps',  'ver',                  'Ver concursos CEETPS'),
  ('concursos-ceetps',  'crear',                'Crear un concurso CEETPS'),
  ('concursos-ceetps',  'editar',               'Editar / avanzar de fase un concurso CEETPS'),
  ('kpis',               'ver',                 'Ver el tablero de KPIs'),
  ('configuracion',      'ver',                 'Ver la sección de Configuración'),
  ('configuracion',      'gestionar_usuarios',  'Crear, activar y desactivar usuarios'),
  ('configuracion',      'gestionar_permisos',  'Crear roles y editar sus permisos'),
  ('notificaciones',     'ver',                 'Ver notificaciones propias'),
  ('autorizaciones',     'crear',                'Generar una autorización (automático del sistema)'),
  ('autorizaciones',     'resolver',             'Aprobar o rechazar una autorización (director)');

-- ── Seed: role_permisos — reproduce la matriz documentada + lo ya vigente hoy en
-- código vía requireRole (cero regresión de acceso el día 1) ────────────────────
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM (VALUES
  ('admin', 'padron', 'ver'), ('admin', 'padron', 'subir'), ('admin', 'padron', 'aprobar_padron'), ('admin', 'padron', 'eliminar_snap'),
  ('admin', 'personas', 'ver'),
  ('admin', 'cargos', 'ver'), ('admin', 'cargos', 'crear'),
  ('admin', 'bajas', 'ver'), ('admin', 'bajas', 'crear'),
  ('admin', 'bajas-sial', 'subir'), ('admin', 'bajas-sial', 'aprobar'),
  ('admin', 'concursos-cph', 'ver'), ('admin', 'concursos-cph', 'crear'), ('admin', 'concursos-cph', 'editar'), ('admin', 'concursos-cph', 'autorizar'),
  ('admin', 'concursos-ceetps', 'ver'), ('admin', 'concursos-ceetps', 'crear'), ('admin', 'concursos-ceetps', 'editar'),
  ('admin', 'kpis', 'ver'),
  ('admin', 'configuracion', 'ver'), ('admin', 'configuracion', 'gestionar_usuarios'), ('admin', 'configuracion', 'gestionar_permisos'),
  ('admin', 'notificaciones', 'ver'),
  ('admin', 'autorizaciones', 'crear'), ('admin', 'autorizaciones', 'resolver'),

  ('editor', 'padron', 'ver'), ('editor', 'padron', 'subir'), ('editor', 'padron', 'aprobar_padron'),
  ('editor', 'personas', 'ver'),
  ('editor', 'cargos', 'ver'), ('editor', 'cargos', 'crear'),
  ('editor', 'bajas', 'ver'), ('editor', 'bajas', 'crear'),
  ('editor', 'bajas-sial', 'subir'), ('editor', 'bajas-sial', 'aprobar'),
  ('editor', 'concursos-cph', 'ver'), ('editor', 'concursos-cph', 'crear'), ('editor', 'concursos-cph', 'editar'),
  ('editor', 'concursos-ceetps', 'ver'), ('editor', 'concursos-ceetps', 'crear'), ('editor', 'concursos-ceetps', 'editar'),
  ('editor', 'kpis', 'ver'),
  ('editor', 'notificaciones', 'ver'),
  ('editor', 'autorizaciones', 'crear'),

  ('viewer', 'padron', 'ver'),
  ('viewer', 'personas', 'ver'),
  ('viewer', 'cargos', 'ver'),
  ('viewer', 'bajas', 'ver'),
  ('viewer', 'concursos-cph', 'ver'),
  ('viewer', 'concursos-ceetps', 'ver'),
  ('viewer', 'kpis', 'ver'),
  ('viewer', 'notificaciones', 'ver'),

  ('director', 'padron', 'ver'),
  ('director', 'personas', 'ver'),
  ('director', 'cargos', 'ver'),
  ('director', 'bajas', 'ver'),
  ('director', 'concursos-cph', 'ver'), ('director', 'concursos-cph', 'autorizar'),
  ('director', 'concursos-ceetps', 'ver'),
  ('director', 'kpis', 'ver'),
  ('director', 'notificaciones', 'ver'),
  ('director', 'autorizaciones', 'resolver'),

  ('concursales_cph', 'padron', 'ver'),
  ('concursales_cph', 'personas', 'ver'),
  ('concursales_cph', 'cargos', 'ver'),
  ('concursales_cph', 'bajas', 'ver'), ('concursales_cph', 'bajas', 'crear'),
  ('concursales_cph', 'concursos-cph', 'ver'), ('concursales_cph', 'concursos-cph', 'crear'), ('concursales_cph', 'concursos-cph', 'editar'),
  ('concursales_cph', 'kpis', 'ver'),
  ('concursales_cph', 'notificaciones', 'ver'),
  ('concursales_cph', 'autorizaciones', 'crear'),

  ('concursales_ceetps', 'padron', 'ver'),
  ('concursales_ceetps', 'personas', 'ver'),
  ('concursales_ceetps', 'cargos', 'ver'),
  ('concursales_ceetps', 'bajas', 'ver'), ('concursales_ceetps', 'bajas', 'crear'),
  ('concursales_ceetps', 'concursos-ceetps', 'ver'), ('concursales_ceetps', 'concursos-ceetps', 'crear'), ('concursales_ceetps', 'concursos-ceetps', 'editar'),
  ('concursales_ceetps', 'kpis', 'ver'),
  ('concursales_ceetps', 'notificaciones', 'ver'),
  ('concursales_ceetps', 'autorizaciones', 'crear')
) AS seed(role_slug, modulo, accion)
JOIN "roles" r ON r.slug = seed.role_slug
JOIN "permisos" p ON p.modulo = seed.modulo AND p.accion = seed.accion;

-- ── Migrar usuarios.rol (enum) → usuarios.role_id (FK) ──────────────────────────
ALTER TABLE "usuarios" ADD COLUMN "role_id" UUID;

UPDATE "usuarios" u
SET "role_id" = r.id
FROM "roles" r
WHERE r.slug = u."rol"::text;

ALTER TABLE "usuarios" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON UPDATE CASCADE;
CREATE INDEX "usuarios_role_id_idx" ON "usuarios"("role_id");

ALTER TABLE "usuarios" DROP COLUMN "rol";
DROP TYPE "RolUsuario";
