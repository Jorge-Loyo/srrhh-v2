-- ============================================================================
-- Trae a LOCAL los 5 roles nuevos de Neon + sus permisos + la jerarquia de roles
-- de Neon. Todo por claves naturales (slug de rol, modulo:accion de permiso) —
-- los UUID de permisos ya coinciden por nombre; los roles nuevos se crean con
-- UUID local propio.
--
-- Roles nuevos (slug EXACTO con su hash, como en Neon):
--   sgrasv_5ac494e (SGRASV), supervision_de_concursos_4ff21d6 (Supervision de
--   Concursos), dgocdcps_cd75a0c (GOCDCPS), goceetteps_f5e556a (GOCEETTEPS),
--   jurado_cph_5d42d64 (Jurado-CPH, sin permisos).
--
-- Permisos por rol: copiados tal cual Neon (verificado que todos existen en local).
--
-- Jerarquia: se REEMPLAZA la de local (vieja/incompatible) por la de Neon (9 rel).
--
-- Idempotente (ON CONFLICT DO NOTHING / slug unico). Transaccional.
-- ============================================================================

BEGIN;

-- 1) Crear los 5 roles (si no existen). slug es UNIQUE.
INSERT INTO roles (id, slug, nombre, descripcion, es_sistema, activo, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'sgrasv_5ac494e',                   'SGRASV',                   NULL, false, true, now(), now()),
  (gen_random_uuid(), 'supervision_de_concursos_4ff21d6', 'Supervision de Concursos', NULL, false, true, now(), now()),
  (gen_random_uuid(), 'dgocdcps_cd75a0c',                 'GOCDCPS',                  NULL, false, true, now(), now()),
  (gen_random_uuid(), 'goceetteps_f5e556a',               'GOCEETTEPS',               NULL, false, true, now(), now()),
  (gen_random_uuid(), 'jurado_cph_5d42d64',               'Jurado-CPH',               NULL, false, true, now(), now())
ON CONFLICT (slug) DO NOTHING;

-- 2) Asignar permisos por rol (resueltos por slug de rol + modulo:accion de permiso).
--    Tabla temporal con los pares (slug_rol, modulo, accion) y se joinea a ids.
CREATE TEMP TABLE _rp (slug text, modulo text, accion text);
INSERT INTO _rp (slug, modulo, accion) VALUES
  -- SGRASV (22)
  ('sgrasv_5ac494e','autorizaciones','crear'),
  ('sgrasv_5ac494e','autorizaciones','resolver_sgrasv'),
  ('sgrasv_5ac494e','bajas','crear'),
  ('sgrasv_5ac494e','bajas','ver'),
  ('sgrasv_5ac494e','bajas-sial','aprobar'),
  ('sgrasv_5ac494e','bajas-sial','ver'),
  ('sgrasv_5ac494e','cargos','crear'),
  ('sgrasv_5ac494e','cargos','ver'),
  ('sgrasv_5ac494e','concursos-ceetps','crear'),
  ('sgrasv_5ac494e','concursos-ceetps','editar'),
  ('sgrasv_5ac494e','concursos-ceetps','ver'),
  ('sgrasv_5ac494e','concursos-cph','crear'),
  ('sgrasv_5ac494e','concursos-cph','editar'),
  ('sgrasv_5ac494e','concursos-cph','ver'),
  ('sgrasv_5ac494e','dotacion','ver'),
  ('sgrasv_5ac494e','inicio','ver'),
  ('sgrasv_5ac494e','kpis','ver'),
  ('sgrasv_5ac494e','notificaciones','ver'),
  ('sgrasv_5ac494e','padron','ver'),
  ('sgrasv_5ac494e','personas','ver'),
  ('sgrasv_5ac494e','retenciones','crear'),
  ('sgrasv_5ac494e','retenciones','ver'),
  -- Supervision de Concursos (17)
  ('supervision_de_concursos_4ff21d6','bajas','crear'),
  ('supervision_de_concursos_4ff21d6','bajas','ver'),
  ('supervision_de_concursos_4ff21d6','bajas-sial','ver'),
  ('supervision_de_concursos_4ff21d6','cargos','ver'),
  ('supervision_de_concursos_4ff21d6','concursos-ceetps','crear'),
  ('supervision_de_concursos_4ff21d6','concursos-ceetps','editar'),
  ('supervision_de_concursos_4ff21d6','concursos-ceetps','ver'),
  ('supervision_de_concursos_4ff21d6','concursos-cph','crear'),
  ('supervision_de_concursos_4ff21d6','concursos-cph','editar'),
  ('supervision_de_concursos_4ff21d6','concursos-cph','ver'),
  ('supervision_de_concursos_4ff21d6','dotacion','ver'),
  ('supervision_de_concursos_4ff21d6','inicio','ver'),
  ('supervision_de_concursos_4ff21d6','kpis','ver'),
  ('supervision_de_concursos_4ff21d6','notificaciones','ver'),
  ('supervision_de_concursos_4ff21d6','padron','ver'),
  ('supervision_de_concursos_4ff21d6','personas','ver'),
  ('supervision_de_concursos_4ff21d6','retenciones','crear'),
  ('supervision_de_concursos_4ff21d6','retenciones','ver'),
  -- GOCDCPS (4)
  ('dgocdcps_cd75a0c','autorizaciones','crear'),
  ('dgocdcps_cd75a0c','autorizaciones','resolver'),
  ('dgocdcps_cd75a0c','autorizaciones','resolver_sgrasv'),
  ('dgocdcps_cd75a0c','bajas','ver'),
  -- GOCEETTEPS (2)
  ('goceetteps_f5e556a','bajas','ver'),
  ('goceetteps_f5e556a','cargos','ver');
  -- Jurado-CPH: 0 permisos (no se inserta nada).

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM _rp
JOIN roles r    ON r.slug = _rp.slug
JOIN permisos p ON p.modulo = _rp.modulo AND p.accion = _rp.accion
ON CONFLICT (role_id, permiso_id) DO NOTHING;

DROP TABLE _rp;

-- 3) Jerarquia: reemplazar la de local por la de Neon (9 relaciones).
DELETE FROM role_jerarquias;
INSERT INTO role_jerarquias (rol_hijo_slug, rol_padre_slug) VALUES
  ('director','admin'),
  ('editor','admin'),
  ('sgrasv_5ac494e','director'),
  ('dgocdcps_cd75a0c','director'),
  ('goceetteps_f5e556a','director'),
  ('supervision_de_concursos_4ff21d6','sgrasv_5ac494e'),
  ('concursales_cph','dgocdcps_cd75a0c'),
  ('jurado_cph_5d42d64','dgocdcps_cd75a0c'),
  ('concursales_ceetps','goceetteps_f5e556a');

COMMIT;

-- ── VERIFICACION ──
-- Roles (deben estar los 11).
SELECT slug, nombre FROM roles ORDER BY slug;
-- Permisos por rol nuevo (conteos esperados: sgrasv 22, supervision 17, gocdcps 4, goceetteps 2, jurado 0).
SELECT r.slug, count(rp.permiso_id) AS n_permisos
FROM roles r LEFT JOIN role_permisos rp ON rp.role_id = r.id
WHERE r.slug IN ('sgrasv_5ac494e','supervision_de_concursos_4ff21d6','dgocdcps_cd75a0c','goceetteps_f5e556a','jurado_cph_5d42d64')
GROUP BY r.slug ORDER BY r.slug;
-- Jerarquia (9 relaciones).
SELECT rol_hijo_slug, rol_padre_slug FROM role_jerarquias ORDER BY rol_hijo_slug;
