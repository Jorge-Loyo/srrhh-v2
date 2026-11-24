-- ============================================================
-- Limpieza de tablas obsoletas — Neon_BD
-- EJECUTAR DESPUÉS de correr diagnostico_tablas_candidatas_drop.sql
-- y confirmar que las filas/tamaños son los esperados.
--
-- Orden: primero las que no tienen FKs entrantes, luego las que sí.
-- Cada bloque tiene su propio ROLLBACK implícito si se ejecuta en
-- una transacción. Ejecutar bloque por bloque, no todo junto.
-- ============================================================

-- ── BLOQUE 1: tmp_bk_* ───────────────────────────────────────
-- 20 tablas de backup de scripts puntuales. Todas con @@ignore en
-- Prisma. Sin FKs entrantes (son snapshots de ids, no tablas vivas).
-- Rollback: no hay — son backups, si se necesitan están en los
-- dumps de backups/migracion_neon_2026-11/.

BEGIN;
DROP TABLE IF EXISTS tmp_bk_consistencia_grupos;
DROP TABLE IF EXISTS tmp_bk_dni_extranjeros;
DROP TABLE IF EXISTS tmp_bk_fantasmas_jcat;
DROP TABLE IF EXISTS tmp_bk_farma_generico;
DROP TABLE IF EXISTS tmp_bk_fix_audino;
DROP TABLE IF EXISTS tmp_bk_fix_lombardo;
DROP TABLE IF EXISTS tmp_bk_fix_puesto_cph;
DROP TABLE IF EXISTS tmp_bk_fusion_obstetrica;
DROP TABLE IF EXISTS tmp_bk_grupo_farmacia;
DROP TABLE IF EXISTS tmp_bk_grupo_fono;
DROP TABLE IF EXISTS tmp_bk_grupo_kinesio;
DROP TABLE IF EXISTS tmp_bk_grupos_guardia;
DROP TABLE IF EXISTS tmp_bk_grupos_jefediv;
DROP TABLE IF EXISTS tmp_bk_grupos_jefedpto;
DROP TABLE IF EXISTS tmp_bk_grupos_jefeunidad;
DROP TABLE IF EXISTS tmp_bk_grupos_medplanta;
DROP TABLE IF EXISTS tmp_bk_grupos_micro_bacterio;
DROP TABLE IF EXISTS tmp_bk_guardia_pof;
DROP TABLE IF EXISTS tmp_bk_hist_farma;
DROP TABLE IF EXISTS tmp_bk_medrano;
DROP TABLE IF EXISTS tmp_bk_odonto_grupo;
DROP TABLE IF EXISTS tmp_bk_psico_grupo;
COMMIT;

-- ── BLOQUE 2: tmp_esp_* y tmp_oct ────────────────────────────
-- Snapshots de especialidades y un volcado de octubre. @@ignore en
-- Prisma. Sin consumidores en el código.

BEGIN;
DROP TABLE IF EXISTS tmp_esp_cruce;
DROP TABLE IF EXISTS tmp_esp_snapshot;
DROP TABLE IF EXISTS tmp_oct;
COMMIT;

-- ── BLOQUE 3: organigramas_backup_pre_arbol ──────────────────
-- Backup del organigrama antes de una carga de árbol. Sin PK (@@ignore).
-- Verificar primero: SELECT count(*) FROM organigramas_backup_pre_arbol;
-- Si tiene filas, confirmar con Jorge antes de dropear.

BEGIN;
DROP TABLE IF EXISTS organigramas_backup_pre_arbol;
COMMIT;

-- ── BLOQUE 4: backfill_vv_audit ──────────────────────────────
-- Tabla de auditoría de un backfill puntual de validacion_vacante.
-- Sin consumidores en el código.
-- Verificar: SELECT count(*) FROM backfill_vv_audit;

BEGIN;
DROP TABLE IF EXISTS backfill_vv_audit;
COMMIT;

-- ── BLOQUE 5: bajas_id_map ───────────────────────────────────
-- Mapa de ids usado durante la migración de bajas. Sin consumidores.
-- Verificar: SELECT count(*) FROM bajas_id_map;

BEGIN;
DROP TABLE IF EXISTS bajas_id_map;
COMMIT;

-- ── BLOQUE 6: desdoblado_mapeo_cargos ────────────────────────
-- Mapa de cargos desdoblados de una migración puntual.
-- Verificar: SELECT count(*) FROM desdoblado_mapeo_cargos;

BEGIN;
DROP TABLE IF EXISTS desdoblado_mapeo_cargos;
COMMIT;

-- ── BLOQUE 7: msgc_* ─────────────────────────────────────────
-- Tablas de staging del sync MSGC Fase 1. No las lee ningún endpoint
-- activo. msgc_hechos_cargo_persona tiene FKs a msgc_cargos y
-- msgc_personas — hay que dropear en orden.
-- ATENCIÓN: confirmar con Jorge antes. Contienen el mapeo cargo↔persona
-- del corte 2026-11-01 que puede ser útil para la Fase 7.
-- Si se quiere conservar: hacer dump primero con pg_dump -t 'msgc_*'.

-- BEGIN;
-- DROP TABLE IF EXISTS msgc_hechos_cargo_persona;
-- DROP TABLE IF EXISTS msgc_cargos;
-- DROP TABLE IF EXISTS msgc_personas;
-- DROP TABLE IF EXISTS msgc_puestos;
-- COMMIT;

-- ── BLOQUE 8: dim_cargos, dim_tipos_cargos, dim_especialidades ─
-- Creadas en Fase 4 pero no consumidas por ningún endpoint activo.
-- dim_cargos tiene FKs desde msgc_cargos (si se dropea msgc_cargos
-- primero, esta FK desaparece). Verificar consumidores antes.
-- ATENCIÓN: dim_cargos puede ser útil para la Fase 7 (vínculo cargo↔puesto).
-- Dejar comentado hasta decidir.

-- BEGIN;
-- DROP TABLE IF EXISTS dim_especialidades;
-- DROP TABLE IF EXISTS dim_tipos_cargos;
-- DROP TABLE IF EXISTS dim_cargos;
-- COMMIT;
