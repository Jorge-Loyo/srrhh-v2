-- Limpieza de tablas obsoletas confirmadas.
-- Todas tienen @@ignore en Prisma o son backups de scripts puntuales
-- sin consumidores en el código.

-- tmp_bk_* — backups de scripts de corrección puntual
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

-- tmp_esp_* y tmp_oct — snapshots de especialidades y volcado de octubre
DROP TABLE IF EXISTS tmp_esp_cruce;
DROP TABLE IF EXISTS tmp_esp_snapshot;
DROP TABLE IF EXISTS tmp_oct;

-- Backups de migraciones puntuales
DROP TABLE IF EXISTS organigramas_backup_pre_arbol;
DROP TABLE IF EXISTS backfill_vv_audit;
DROP TABLE IF EXISTS bajas_id_map;
DROP TABLE IF EXISTS desdoblado_mapeo_cargos;
