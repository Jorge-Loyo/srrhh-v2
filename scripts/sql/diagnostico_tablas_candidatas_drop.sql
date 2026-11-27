-- ============================================================
-- Diagnóstico de tablas candidatas a DROP
-- Ejecutar contra Neon_BD (solo lectura).
-- ============================================================

-- ── 1. Tamaño y filas de TODAS las tablas del schema público ─
SELECT
  relname                                          AS tabla,
  n_live_tup                                       AS filas_aprox,
  pg_size_pretty(pg_total_relation_size(oid))      AS tamanio_total,
  pg_size_pretty(pg_relation_size(oid))            AS tamanio_datos,
  pg_size_pretty(pg_indexes_size(oid))             AS tamanio_indices
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = pg_stat_user_tables.relname
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(oid) DESC;

-- ── 2. Tablas tmp_bk_* (backups de scripts puntuales) ────────
-- Todas tienen @@ignore en Prisma — no las lee ningún flujo vivo.
SELECT
  relname AS tabla,
  n_live_tup AS filas
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname LIKE 'tmp_bk_%'
ORDER BY relname;

-- ── 3. Tablas tmp_* que no son tmp_bk_ ───────────────────────
SELECT
  relname AS tabla,
  n_live_tup AS filas
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname LIKE 'tmp_%'
  AND relname NOT LIKE 'tmp_bk_%'
ORDER BY relname;

-- ── 4. Tablas de backup/staging explícitas ───────────────────
SELECT
  relname AS tabla,
  n_live_tup AS filas,
  pg_size_pretty(pg_total_relation_size(pg_class.oid)) AS tamanio
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = pg_stat_user_tables.relname
WHERE schemaname = 'public'
  AND relname IN (
    'organigramas_backup_pre_arbol',
    'backfill_vv_audit',
    'bajas_id_map',
    'desdoblado_mapeo_cargos'
  )
ORDER BY relname;

-- ── 5. Tablas msgc_* (staging del sync MSGC) ─────────────────
-- Alimentadas por scripts de la Fase 1. No las lee ningún endpoint vivo
-- salvo msgc_hechos_cargo_persona (pendiente re-resolver FKs, Fase 6.5).
SELECT
  relname AS tabla,
  n_live_tup AS filas,
  pg_size_pretty(pg_total_relation_size(pg_class.oid)) AS tamanio
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = pg_stat_user_tables.relname
WHERE schemaname = 'public'
  AND relname LIKE 'msgc_%'
ORDER BY relname;

-- ── 6. Tablas dim_* con filas sospechosamente bajas ──────────
-- dim_cargos, dim_tipos_cargos, dim_especialidades: creadas en Fase 4
-- pero no consumidas por ningún endpoint activo todavía.
SELECT
  relname AS tabla,
  n_live_tup AS filas,
  pg_size_pretty(pg_total_relation_size(pg_class.oid)) AS tamanio
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = pg_stat_user_tables.relname
WHERE schemaname = 'public'
  AND relname LIKE 'dim_%'
ORDER BY relname;

-- ── 7. Verificar que tmp_bk_* no tienen FKs entrantes ────────
-- Si alguna tiene FK desde otra tabla, no se puede dropear sin más.
SELECT
  tc.table_name   AS tabla_origen,
  ccu.table_name  AS referencia_a
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (tc.table_name LIKE 'tmp_%' OR ccu.table_name LIKE 'tmp_%'
    OR tc.table_name IN ('organigramas_backup_pre_arbol','backfill_vv_audit','bajas_id_map','desdoblado_mapeo_cargos')
    OR ccu.table_name IN ('organigramas_backup_pre_arbol','backfill_vv_audit','bajas_id_map','desdoblado_mapeo_cargos')
    OR tc.table_name LIKE 'msgc_%' OR ccu.table_name LIKE 'msgc_%'
  );
