-- =============================================================================
-- FASE 1 — Limpieza DDL
-- Branch: Neon_BD (ep-rough-pond-aeuzuxh9)
-- Decisiones: C1, C2, C3, C4, D3, D4 + auditoría columnas vacías
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DROP TABLAS HUÉRFANAS
-- ---------------------------------------------------------------------------

-- C4: histórico de roles vive en ocupaciones
DROP TABLE IF EXISTS roles_persona CASCADE;

-- D4: se reimplementa mejor cuando corresponda
DROP TABLE IF EXISTS refresh_tokens CASCADE;

-- D3: se reimplementa mejor cuando corresponda
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Ref* huérfanas: pipeline v2 no las usa
DROP TABLE IF EXISTS ref_agrupadores CASCADE;
DROP TABLE IF EXISTS ref_unificadores_puesto CASCADE;
DROP TABLE IF EXISTS ref_especialidades_cuil CASCADE;
DROP TABLE IF EXISTS ref_correcciones_especialidad CASCADE;
DROP TABLE IF EXISTS ref_especialidad_por_puesto CASCADE;

-- ---------------------------------------------------------------------------
-- 2. DROP VISTAS LEGACY (dependen de columnas que se van a eliminar)
-- ---------------------------------------------------------------------------

-- Vista del Dotaneitor legacy — usa agrupador y unificador_puesto.
-- Se elimina junto con las columnas. El Procesador_Meta4 la reemplaza.
DROP VIEW IF EXISTS v_pou_triangulacion;

-- ---------------------------------------------------------------------------
-- 3. DROP COLUMNAS — tabla cargos (continuación)
-- ---------------------------------------------------------------------------

-- C1: pipeline v2 no escribe estas columnas
ALTER TABLE cargos DROP COLUMN IF EXISTS agrupador;
ALTER TABLE cargos DROP COLUMN IF EXISTS unificador_puesto;

-- Auditoría: 0 filas con datos
ALTER TABLE cargos DROP COLUMN IF EXISTS puesto_codigo_sial;
ALTER TABLE cargos DROP COLUMN IF EXISTS cod_agrupamiento;
ALTER TABLE cargos DROP COLUMN IF EXISTS agrupamiento;

-- ---------------------------------------------------------------------------
-- 3. DROP COLUMNAS — tabla ocupaciones
-- ---------------------------------------------------------------------------

-- C2: reemplazada por situacion_revista
ALTER TABLE ocupaciones DROP COLUMN IF EXISTS estado_persona;

-- Auditoría: 0 filas con datos (array vacío en todos los registros)
ALTER TABLE ocupaciones DROP COLUMN IF EXISTS dias_guardia;

-- ---------------------------------------------------------------------------
-- 4. DROP COLUMNAS — tabla padron_historico
-- ---------------------------------------------------------------------------

-- C2: misma decisión que ocupaciones
ALTER TABLE padron_historico DROP COLUMN IF EXISTS estado_persona;

-- C1: pipeline v2 no escribe estas columnas
ALTER TABLE padron_historico DROP COLUMN IF EXISTS agrupador;
ALTER TABLE padron_historico DROP COLUMN IF EXISTS unificador_puesto;

-- ---------------------------------------------------------------------------
-- 5. DROP COLUMNAS — tabla personas
-- ---------------------------------------------------------------------------

-- C3: no se usan en ningún endpoint ni reporte activo
ALTER TABLE personas DROP COLUMN IF EXISTS apellido;
ALTER TABLE personas DROP COLUMN IF EXISTS nombre;

-- ---------------------------------------------------------------------------
-- 6. AGREGAR COLUMNA — cargo_ejecucion_id (A3)
-- ---------------------------------------------------------------------------

-- Vínculo jefatura → cargo base de ejecución. Nullable: la mayoría de los
-- cargos no son jefaturas. FK se agrega después de la columna para poder
-- hacer el backfill primero si hace falta.
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS cargo_ejecucion_id UUID;

ALTER TABLE cargos
  ADD CONSTRAINT fk_cargo_ejecucion
  FOREIGN KEY (cargo_ejecucion_id) REFERENCES cargos(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS cargos_cargo_ejecucion_id_idx ON cargos(cargo_ejecucion_id);

COMMIT;
