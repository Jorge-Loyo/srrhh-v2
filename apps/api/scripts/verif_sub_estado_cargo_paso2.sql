-- MANUAL: lo corre Jorge en Neon. El workflow NO ejecuta NADA contra la DB.
--
-- Paso 2 — Decisión D: verificación del invariante de Cargo.sub_estado.
-- Debe dar 0 en las dos primeras filas (igual que el chequeo 3.3 del backfill
-- backfill_sub_estado_cargo.sql). La tercera fila cuenta ocupaciones MANUAL que
-- nunca se reconciliaron contra el padrón real (designaciones manuales cuya
-- persona todavía no apareció en el padrón). Correr periódicamente para detectar
-- deriva del sub_estado mientras el resto del import queda como follow-up.
SELECT 'concurso_ocupado' AS problema, COUNT(*) AS cantidad
  FROM cargos c
 WHERE c.deleted_at IS NULL
   AND c.sub_estado = 'concurso'
   AND EXISTS (
     SELECT 1 FROM ocupaciones oc WHERE oc.cargo_id = c.id AND oc.hasta IS NULL
   )
UNION ALL
SELECT 'ocupado_sin_ocupacion', COUNT(*)
  FROM cargos c
 WHERE c.deleted_at IS NULL
   AND c.sub_estado = 'ocupado'
   AND NOT EXISTS (
     SELECT 1 FROM ocupaciones oc WHERE oc.cargo_id = c.id AND oc.hasta IS NULL
   )
UNION ALL
-- Ocupaciones MANUAL vivas sin reconciliar: esperado > 0 mientras haya
-- designados manuales que el padrón todavía no trajo; cuando el padrón los
-- cierra, el enganche automático reemplaza el idSialRol 'MANUAL-%' por el real.
SELECT 'ocupacion_manual_viva', COUNT(*)
  FROM ocupaciones oc
 WHERE oc.hasta IS NULL
   AND oc.id_sial_rol LIKE 'MANUAL-%';
