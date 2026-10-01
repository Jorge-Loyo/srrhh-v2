-- 0_seed — datos semilla "duros" consolidados (ref_* del Dotaneitor + hospitales).
-- Limpieza de raíz S21: solo INSERT que aplican limpio contra el baseline.
-- escalafones/codigos_registro/etiquetas viven en prisma/seed.ts (Prisma Client).
-- Idempotente donde el INSERT trae ON CONFLICT.

-- Los INSERT históricos de roles/permisos no traían id/updated_at (las
-- migraciones viejas los defaulteaban en la BD; el baseline Prisma no). Se
-- setean defaults temporales, se corren los INSERT y se quitan al final.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Búsqueda sin tildes (unaccent) y por similitud (pg_trgm / similarity()) — las
-- usan varios $queryRaw (cargos, personas, concursos-cph, padron, kpis). Sin
-- estas extensiones esas queries fallan con "function unaccent/similarity does
-- not exist" (ej. filtros de la pantalla Evolución por carrera/especialidad).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE "roles"    ALTER COLUMN "id" SET DEFAULT gen_random_uuid(), ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "permisos" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- ── de 20260901120000_rbac_dinamico ──
INSERT INTO "roles" ("slug", "nombre", "es_sistema") VALUES
  ('admin',              'Administrador',      true),
  ('editor',             'Editor',              true),
  ('viewer',             'Solo lectura',        true),
  ('director',           'Director',            true),
  ('concursales_cph',    'Concursales CPH',     true),
  ('concursales_ceetps', 'Concursales CEETPS',  true);

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

-- ── de 20260902000004_rbac_permisos_roles ──
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'editor'
  AND NOT (p.modulo = 'configuracion' AND p.accion IN ('gestionar_usuarios', 'gestionar_permisos'))
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'director'
  AND (
    p.accion = 'ver'
    OR (p.modulo = 'concursos-cph'   AND p.accion = 'autorizar')
    OR (p.modulo = 'autorizaciones'  AND p.accion = 'resolver')
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'concursales_cph'
  AND (
    p.accion = 'ver'
    OR (p.modulo = 'concursos-cph'  AND p.accion IN ('crear', 'editar'))
    OR (p.modulo = 'bajas'          AND p.accion = 'crear')
    OR (p.modulo = 'autorizaciones' AND p.accion = 'crear')
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'concursales_ceetps'
  AND (
    p.accion = 'ver'
    OR (p.modulo = 'concursos-ceetps' AND p.accion IN ('crear', 'editar'))
    OR (p.modulo = 'bajas'            AND p.accion = 'crear')
    OR (p.modulo = 'autorizaciones'   AND p.accion = 'crear')
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'viewer' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- ── de 20260902090000_bajas_sial_ver ──
INSERT INTO "permisos" ("modulo", "accion", "descripcion") VALUES
  ('bajas-sial', 'ver', 'Ver el padrón de bajas SIAL y sus snapshots')
  ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r, "permisos" p
WHERE r.slug IN ('admin', 'editor', 'viewer', 'director', 'concursales_cph', 'concursales_ceetps')
  AND p.modulo = 'bajas-sial' AND p.accion = 'ver'
  ON CONFLICT DO NOTHING;

-- ── de 20260908000000_hospitales_enriquecer ──
INSERT INTO hospitales (id, sigla, nombre, universo_totalizador, tipo, monovalencia, activo, created_at, updated_at) VALUES
  (gen_random_uuid(), 'DGABS',     'DGABS',     'Nivel Central', 'SS Administración de Salud',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCAPM',    'DGCAPM',    'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCOECSSP', 'DGCOECSSP', 'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCTF',     'DGCTF',     'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCTFS',    'DGCTFS',    'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCVPM',    'DGCVPM',    'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGPAPM',    'DGPAPM',    'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGPLO',     'DGPLO',     'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGPSB',     'DGPSB',     'Bienestar',     'SECR Bienestar',               NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'IREP',      'IREP',      'Hospitales',    'Hospitales Monovalentes',      'Rehabilitación', true, NOW(), NOW()),
  (gen_random_uuid(), 'SECBI',     'SECBI',     'Bienestar',     'SECR Bienestar',               NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'SSPPM',     'SSPPM',     'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'UPERICPSM', 'UPERICPSM', 'Nivel Central', 'SS Atención Hospitalaria',    NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'UPESCA',    'UPESCA',    'Nivel Central', 'SS Atención Primaria',         NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'UPECСJ',    'UPECСJ',    'Nivel Central', 'Unidad de Ministro',           NULL,             true, NOW(), NOW())
ON CONFLICT (sigla) DO NOTHING;

-- ── de 20260910000000_seed_ref_dotaneitor ──
INSERT INTO ref_abreviaturas_tecnicas (id, sigla, activo) VALUES
  (gen_random_uuid(), 'SECC', true),
  (gen_random_uuid(), 'UNID', true),
  (gen_random_uuid(), 'DIV', true),
  (gen_random_uuid(), 'DEPT', true),
  (gen_random_uuid(), 'GO', true),
  (gen_random_uuid(), 'SGO', true),
  (gen_random_uuid(), 'SS', true),
  (gen_random_uuid(), 'SGA', true),
  (gen_random_uuid(), 'CESAC', true),
  (gen_random_uuid(), 'CESACS', true),
  (gen_random_uuid(), 'SUP', true),
  (gen_random_uuid(), 'SDHOS', true),
  (gen_random_uuid(), 'CEETPS', true),
  (gen_random_uuid(), 'NCE', true),
  (gen_random_uuid(), 'SAME', true),
  (gen_random_uuid(), 'UCO', true),
  (gen_random_uuid(), 'CODEI', true),
  (gen_random_uuid(), 'CYMAT', true),
  (gen_random_uuid(), 'EDUC', true),
  (gen_random_uuid(), 'HOSP', true),
  (gen_random_uuid(), 'INST', true),
  (gen_random_uuid(), 'MAT', true),
  (gen_random_uuid(), 'COMP', true),
  (gen_random_uuid(), 'HTAL', true),
  (gen_random_uuid(), 'CTRO', true),
  (gen_random_uuid(), 'MANT', true),
  (gen_random_uuid(), 'EPID', true),
  (gen_random_uuid(), 'ASIST', true),
  (gen_random_uuid(), 'RESID', true),
  (gen_random_uuid(), 'GUAR', true),
  (gen_random_uuid(), 'TEC', true),
  (gen_random_uuid(), 'PEDIAT', true),
  (gen_random_uuid(), 'UPE', true),
  (gen_random_uuid(), 'CPH', true),
  (gen_random_uuid(), 'UTI', true),
  (gen_random_uuid(), 'ACV', true),
  (gen_random_uuid(), 'USOVNI', true),
  (gen_random_uuid(), 'SARIP', true),
  (gen_random_uuid(), 'CADEA', true),
  (gen_random_uuid(), 'SADOFE', true),
  (gen_random_uuid(), 'IT', true),
  (gen_random_uuid(), 'PG', true),
  (gen_random_uuid(), 'DG', true),
  (gen_random_uuid(), 'TM', true),
  (gen_random_uuid(), 'TT', true),
  (gen_random_uuid(), 'TN', true),
  (gen_random_uuid(), 'MS', true),
  (gen_random_uuid(), 'CEMAR', true),
  (gen_random_uuid(), 'RR', true),
  (gen_random_uuid(), 'HH', true),
  (gen_random_uuid(), 'SECR', true),
  (gen_random_uuid(), 'APS', true),
  (gen_random_uuid(), 'I', true),
  (gen_random_uuid(), 'II', true),
  (gen_random_uuid(), 'III', true),
  (gen_random_uuid(), 'IV', true),
  (gen_random_uuid(), 'V', true),
  (gen_random_uuid(), 'VI', true),
  (gen_random_uuid(), 'VII', true),
  (gen_random_uuid(), 'VIII', true),
  (gen_random_uuid(), 'IX', true),
  (gen_random_uuid(), 'X', true),
  (gen_random_uuid(), 'XI', true),
  (gen_random_uuid(), 'XII', true),
  (gen_random_uuid(), 'XIII', true),
  (gen_random_uuid(), 'XIV', true),
  (gen_random_uuid(), 'XV', true),
  (gen_random_uuid(), 'HGNRG', true),
  (gen_random_uuid(), 'HGACA', true),
  (gen_random_uuid(), 'HGADS', true),
  (gen_random_uuid(), 'HGAJAF', true),
  (gen_random_uuid(), 'HGARM', true),
  (gen_random_uuid(), 'HGACD', true),
  (gen_random_uuid(), 'HGAPP', true),
  (gen_random_uuid(), 'HGAIP', true),
  (gen_random_uuid(), 'HGAP', true),
  (gen_random_uuid(), 'HBR', true),
  (gen_random_uuid(), 'HGATA', true),
  (gen_random_uuid(), 'HGNPE', true),
  (gen_random_uuid(), 'HGAT', true),
  (gen_random_uuid(), 'HGAVS', true),
  (gen_random_uuid(), 'HGAZ', true),
  (gen_random_uuid(), 'GCABA', true),
  (gen_random_uuid(), 'MSGC', true),
  (gen_random_uuid(), 'SIAL', true),
  (gen_random_uuid(), 'SIGEHOS', true)
ON CONFLICT (sigla) DO NOTHING;

INSERT INTO ref_abreviaturas_titulo (id, titulo, activo) VALUES
  (gen_random_uuid(), 'DRA', true),
  (gen_random_uuid(), 'PROF', true),
  (gen_random_uuid(), 'MED', true),
  (gen_random_uuid(), 'DIR', true),
  (gen_random_uuid(), 'LIC', true)
ON CONFLICT (titulo) DO NOTHING;

INSERT INTO ref_conectores_minuscula (id, conector, activo) VALUES
  (gen_random_uuid(), 'de', true),
  (gen_random_uuid(), 'del', true),
  (gen_random_uuid(), 'la', true),
  (gen_random_uuid(), 'las', true),
  (gen_random_uuid(), 'los', true),
  (gen_random_uuid(), 'el', true),
  (gen_random_uuid(), 'y', true),
  (gen_random_uuid(), 'e', true),
  (gen_random_uuid(), 'en', true),
  (gen_random_uuid(), 'por', true),
  (gen_random_uuid(), 'para', true),
  (gen_random_uuid(), 'con', true),
  (gen_random_uuid(), 'sin', true),
  (gen_random_uuid(), 'a', true),
  (gen_random_uuid(), 'al', true),
  (gen_random_uuid(), 'o', true)
ON CONFLICT (conector) DO NOTHING;

INSERT INTO ref_sufijos_ordinales (id, sufijo, activo) VALUES
  (gen_random_uuid(), 'er', true),
  (gen_random_uuid(), 'ero', true),
  (gen_random_uuid(), 'do', true),
  (gen_random_uuid(), 'da', true),
  (gen_random_uuid(), 'ro', true),
  (gen_random_uuid(), 'ra', true),
  (gen_random_uuid(), 'to', true),
  (gen_random_uuid(), 'ta', true),
  (gen_random_uuid(), 'vo', true),
  (gen_random_uuid(), 'va', true),
  (gen_random_uuid(), 'mo', true),
  (gen_random_uuid(), 'ma', true),
  (gen_random_uuid(), 'no', true),
  (gen_random_uuid(), 'na', true)
ON CONFLICT (sufijo) DO NOTHING;

INSERT INTO ref_correcciones_especialidad (id, original, correccion, activo) VALUES
  (gen_random_uuid(), 'CIRUGIA TORAXICA', 'Cirugía Torácica', true),
  (gen_random_uuid(), 'PSIQUATRIA', 'Psiquiatría', true),
  (gen_random_uuid(), 'PSIQUIATRA', 'Psiquiatría', true),
  (gen_random_uuid(), 'TRABAJO SOCIAL Y SERVICIO SOCIAL', 'Trabajo Social', true)
ON CONFLICT (original) DO NOTHING;

INSERT INTO ref_correcciones_lit_puesto (id, cod_reg, original, correccion, activo) VALUES
  (gen_random_uuid(), NULL, 'FARMACIA', 'Técnico en Farmacia', true),
  (gen_random_uuid(), NULL, 'LABORATORIO', 'Técnico en Laboratorio', true),
  (gen_random_uuid(), NULL, 'LABORATORIO DE PATOLOGIA', 'Técnico en Laboratorio de Patología', true),
  (gen_random_uuid(), NULL, 'ESTERILIZACION', 'Técnico en Esterilización', true),
  (gen_random_uuid(), NULL, 'NECROPSIA', 'Técnico en Necropsia', true),
  (gen_random_uuid(), NULL, 'PRACTICAS CARDIOLOGICAS', 'Técnico en Prácticas Cardiológicas', true),
  (gen_random_uuid(), NULL, 'ASISTENCIA DENTAL', 'Técnico en Asistencia Dental', true),
  (gen_random_uuid(), NULL, 'HEMOTERAPIA', 'Técnico en Hemoterapia', true),
  (gen_random_uuid(), NULL, 'RADIOLOGIA', 'Técnico en Radiología', true),
  (gen_random_uuid(), NULL, 'NUTRICIONISTA DIETISTA DE PLANTA', 'Nutricionista de Planta', true),
  (gen_random_uuid(), NULL, 'NUTRICIONISTA DIETISTA DE GUARDIA', 'Nutricionista de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. EN NUTRICION DE GUARDIA', 'Lic. en Nutrición de Guardia', true),
  (gen_random_uuid(), NULL, 'KINESIOLOGO FISIATRA DE GUARDIA', 'Kinesiologo de Guardia', true),
  (gen_random_uuid(), NULL, 'KINESIOLOGO FISIATRA DE PLANTA', 'Kinesiologo de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. KINESIOLOGIA DE GUARDIA', 'Lic. en Kinesiología de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. KINESIOLOGIA DE PLANTA', 'Lic. en Kinesiología de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. BIOQUIMICO DE GUARDIA', 'Lic. en Bioquímica de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. BIOQUIMICO DE PLANTA', 'Lic. en Bioquímica de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN PSICOLOGIA DE GUARDIA', 'Lic. en Psicología de Guardia', true),
  (gen_random_uuid(), NULL, 'LIC. EN PSICOPEDAGOGIA DE GUARDIA', 'Lic. en Psicopedagogía de Guardia', true),
  (gen_random_uuid(), NULL, 'LICENCIADO EN PSICOLOGIA / PSICOLOGO', 'Lic. en Psicología de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN SERVICIO SOCIAL SALUD DE PLANTA', 'Lic. en Servicio Social de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN CIENCIAS EDUC. DE PLANTA', 'Lic. en Ciencias de la Educ. de Planta', true),
  (gen_random_uuid(), NULL, 'LIC. EN COMUNICACION SOCIAL O EN CS.DE LA COMUNICACION', 'Lic. en Comunicación Social', true),
  (gen_random_uuid(), NULL, 'LICENCIADO EN COMUNICACION SOCIAL', 'Lic. en Comunicación Social', true),
  (gen_random_uuid(), NULL, 'OPERADOR CONVIVENCIAL EN NINÑEZ Y/O ADOLESCENCIA', 'Operador Convivencial en Niñez y/o Adolescencia', true),
  (gen_random_uuid(), NULL, 'ANALISTA DE CONTROL DE GESTION OPERATIVOADMINISTRATIVA', 'Analista de Control de Gestión Operativo Administrativa', true),
  (gen_random_uuid(), '23', 'MEDICO', 'Suplente de Guardia', true),
  (gen_random_uuid(), '37', 'MEDICO VETERINARIO', 'Medico Veterinario de Planta', true),
  (gen_random_uuid(), '37', 'LICENCIADO EN KINESIOLOGIA', 'Lic. en Kinesiología de Planta', true),
  (gen_random_uuid(), '23', 'LICENCIADO EN KINESIOLOGIA', 'Lic. en Kinesiología de Guardia', true),
  (gen_random_uuid(), '37', 'LIC. EN KINESIOLOGIA', 'Lic. en Kinesiología de Planta', true),
  (gen_random_uuid(), '23', 'LIC. EN KINESIOLOGIA', 'Lic. en Kinesiología de Guardia', true),
  (gen_random_uuid(), '37', 'LIC. EN TERAPIA OCUPACIONAL', 'Lic. en Terapia Ocupacional de Planta', true)
ON CONFLICT (cod_reg, original) DO NOTHING;

INSERT INTO ref_especialidad_por_puesto (id, agrupador, especialidad, pureza_pct, activo) VALUES
  (gen_random_uuid(), 'Asistente Social de Guardia', 'Trabajo Social', 100, true),
  (gen_random_uuid(), 'Asistente Social de Planta', 'Trabajo Social', 90, true),
  (gen_random_uuid(), 'Bioquímico de Guardia', 'Bioquímica Clínica sin Especialidad', 85, true),
  (gen_random_uuid(), 'Bioquímico de Planta', 'Bioquímica Clínica (Química Clínica)', 55, true),
  (gen_random_uuid(), 'Experto en Física Radiante de Planta', 'Radioterapia (Física Radiante)', NULL, true),
  (gen_random_uuid(), 'Farmacéutico de Guardia', 'Farmacia Hospitalaria', 99, true),
  (gen_random_uuid(), 'Farmacéutico de Planta', 'Farmacia Hospitalaria', 97, true),
  (gen_random_uuid(), 'Fonoaudiólogo de Guardia', 'Fonoaudiología', NULL, true),
  (gen_random_uuid(), 'Fonoaudiólogo de Planta', 'Fonoaudiología', 100, true),
  (gen_random_uuid(), 'Kinesiólogo de Guardia', 'Kinesiología', 98, true),
  (gen_random_uuid(), 'Kinesiólogo de Planta', 'Kinesiología', 99, true),
  (gen_random_uuid(), 'Lic. en Kinesiología de Guardia', 'Kinesiología', 100, true),
  (gen_random_uuid(), 'Lic. en Nutrición de Guardia', 'Lic. en Nutrición', 100, true),
  (gen_random_uuid(), 'Lic. en Psicología de Guardia', 'Psicología Clínica', 100, true),
  (gen_random_uuid(), 'Lic. en Psicopedagogía de Guardia', 'Psicopedagogía', NULL, true),
  (gen_random_uuid(), 'Licenciado en Obstetricia - Obstétrica', 'Obstetricia', NULL, true),
  (gen_random_uuid(), 'Musicoterapeuta de Planta', 'Musicoterapia', 100, true),
  (gen_random_uuid(), 'Médico Veterinario de Planta', 'Veterinaria', 91, true),
  (gen_random_uuid(), 'Médico de Planta', 'Sin Especialidad', NULL, true),
  (gen_random_uuid(), 'Nutricionista de Guardia', 'Lic. en Nutrición', 100, true),
  (gen_random_uuid(), 'Nutricionista de Planta', 'Lic. en Nutrición', 92, true),
  (gen_random_uuid(), 'Obstétrica de Guardia', 'Obstétrica', 95, true),
  (gen_random_uuid(), 'Obstétrica de Planta', 'Obstétrica', 93, true),
  (gen_random_uuid(), 'Especialista en la Guardia Médico', 'Clínica Médica (Medicina Interna)', NULL, true),
  (gen_random_uuid(), 'Odontólogo de Guardia', 'Odontología General', 91, true),
  (gen_random_uuid(), 'Odontólogo de Planta', 'Odontología General', 62, true),
  (gen_random_uuid(), 'Profesional Guardia Médico', 'Sin Especialidad', NULL, true),
  (gen_random_uuid(), 'Psicopedagogo de Guardia', 'Psicopedagogía', NULL, true),
  (gen_random_uuid(), 'Psicopedagogo de Planta', 'Psicopedagogía', 99, true),
  (gen_random_uuid(), 'Psicólogo de Guardia', 'Psicología Clínica', 86, true),
  (gen_random_uuid(), 'Psicólogo de Planta', 'Psicología Clínica', 93, true),
  (gen_random_uuid(), 'Terapeuta Ocupacional de Planta', 'Terapia Ocupacional', 100, true),
  (gen_random_uuid(), 'Terapista Ocupacional de Guardia', 'Terapia Ocupacional', NULL, true),
  (gen_random_uuid(), 'Terapista Ocupacional de Planta', 'Terapia Ocupacional', 97, true),
  (gen_random_uuid(), 'Trabajador Social de Guardia', 'Trabajo Social', 97, true),
  (gen_random_uuid(), 'Trabajador Social de Planta', 'Trabajo Social', 86, true),
  (gen_random_uuid(), 'Técnico en Laboratorio de Análisis Clínicos', 'Laboratorio (Análisis Clínicos)', NULL, true)
ON CONFLICT (agrupador) DO NOTHING;

-- ── de 20260911000000_s13_autorizaciones ──
INSERT INTO "permisos" ("modulo", "accion", "descripcion")
VALUES ('autorizaciones', 'resolver_sgrasv', 'Aprobar o rechazar una autorización (sgrasv)')
ON CONFLICT ("modulo", "accion") DO NOTHING;

INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r, "permisos" p
WHERE r.slug = 'sgrasv' AND p.modulo = 'autorizaciones' AND p.accion = 'resolver_sgrasv'
ON CONFLICT DO NOTHING;

-- ── de 20260911000001_s13_solicitudes_alta ──
INSERT INTO "permisos" ("modulo", "accion", "descripcion") VALUES
  ('solicitudes-alta', 'ver',    'Ver solicitudes de alta de cargo'),
  ('solicitudes-alta', 'crear',  'Crear una solicitud de alta de cargo')
ON CONFLICT ("modulo", "accion") DO NOTHING;

INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM (VALUES
  ('admin',           'solicitudes-alta', 'ver'),
  ('admin',           'solicitudes-alta', 'crear'),
  ('editor',          'solicitudes-alta', 'ver'),
  ('editor',          'solicitudes-alta', 'crear'),
  ('director',        'solicitudes-alta', 'ver'),
  ('concursales_cph', 'solicitudes-alta', 'ver'),
  ('concursales_cph', 'solicitudes-alta', 'crear'),
  ('viewer',          'solicitudes-alta', 'ver')
) AS seed(role_slug, modulo, accion)
JOIN "roles" r ON r.slug = seed.role_slug
JOIN "permisos" p ON p.modulo = seed.modulo AND p.accion = seed.accion
ON CONFLICT DO NOTHING;

-- ── de 20260911000002_s13_role_jerarquia ──
INSERT INTO "role_jerarquias" ("rol_hijo_slug", "rol_padre_slug") VALUES
  ('director',           'admin'),
  ('editor',             'director'),
  ('concursales_cph',    'editor'),
  ('concursales_ceetps', 'editor')
ON CONFLICT DO NOTHING;

INSERT INTO "role_jerarquias" ("rol_hijo_slug", "rol_padre_slug")
SELECT 'sgrasv', 'director'
WHERE EXISTS (SELECT 1 FROM "roles" WHERE slug = 'sgrasv')
ON CONFLICT DO NOTHING;

-- ── de 20260923000000_permisos_dotacion_pou_referencias_auditoria ──
INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES
  (gen_random_uuid(), 'dotacion',      'ver',                   'Ver dotación real'),
  (gen_random_uuid(), 'configuracion', 'gestionar_pou',         'Cargar Excel POU'),
  (gen_random_uuid(), 'configuracion', 'gestionar_organigrama', 'Cargar Árbol de Organigrama'),
  (gen_random_uuid(), 'configuracion', 'gestionar_referencias', 'Gestionar referencias Dotaneitor'),
  (gen_random_uuid(), 'configuracion', 'ver_auditoria',         'Ver log de auditoría'),
  (gen_random_uuid(), 'configuracion', 'purgar_auditoria',      'Purgar registros de auditoría')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.slug = 'admin'
  AND p.modulo IN ('dotacion', 'configuracion')
  AND p.accion IN ('ver', 'gestionar_pou', 'gestionar_organigrama', 'gestionar_referencias', 'ver_auditoria')
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug = 'editor'
  AND (
    (p.modulo = 'dotacion'      AND p.accion = 'ver')
    OR (p.modulo = 'configuracion' AND p.accion = 'ver_auditoria')
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug IN ('viewer', 'director', 'concursales_cph', 'concursales_ceetps', 'sgrasv')
  AND p.modulo = 'dotacion' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- ── de 20260925000000_permiso_inicio_ver ──
INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES (gen_random_uuid(), 'inicio', 'ver', 'Ver la pantalla de Inicio')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug IN ('admin', 'concursales_ceetps', 'concursales_cph', 'director', 'editor', 'viewer')
  AND p.modulo = 'inicio' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- ── de 20260928010000_s18_permisos_retenciones ──
INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES
  (gen_random_uuid(), 'retenciones', 'crear', 'Registrar retención y generar cargo R/TTR'),
  (gen_random_uuid(), 'retenciones', 'ver',   'Ver cadena de retención de un cargo')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.slug = 'admin' AND p.modulo = 'retenciones'
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'editor' AND p.modulo = 'retenciones' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.slug = 'sgrasv' AND p.modulo = 'retenciones' AND p.accion IN ('crear', 'ver')
ON CONFLICT DO NOTHING;


-- Quitar defaults temporales (dejar el schema igual que el baseline Prisma).
ALTER TABLE "roles"    ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "permisos" ALTER COLUMN "id" DROP DEFAULT;
