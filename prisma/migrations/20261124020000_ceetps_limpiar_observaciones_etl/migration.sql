-- Concursos CEETPS: borra de `observaciones` las trazas de la carga masiva
-- ("[ETL] puesto_designado=... | _warnings=..."). No aportan nada y se mostraban
-- en pantalla. Se quita SOLO la línea que empieza con "[ETL]"; lo que escribió una
-- persona se conserva. Datos solamente (sin cambios de estructura). Idempotente.
--
-- MANUAL: no ejecutar con `prisma migrate deploy` (ver DEPLOY_PRODUCCION.md §7).
--   psql "$NEON_DIRECT" -f prisma/migrations/20261124020000_ceetps_limpiar_observaciones_etl/migration.sql
--   DATABASE_URL="$NEON_DIRECT" npx prisma migrate resolve --applied 20261124020000_ceetps_limpiar_observaciones_etl --schema=./prisma/schema.prisma

UPDATE concursos_ceetps
SET observaciones = NULLIF(
      btrim(
        regexp_replace(observaciones, '(^|' || chr(10) || ')[[]ETL[]][^' || chr(10) || ']*', '', 'g'),
        ' ' || chr(9) || chr(13) || chr(10)
      ),
      ''
    )
WHERE observaciones LIKE '%[ETL]%';
