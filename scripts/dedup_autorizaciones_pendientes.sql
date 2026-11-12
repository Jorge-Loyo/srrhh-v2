-- Dedup de autorizaciones PENDIENTES duplicadas por concurso CPH (Fix 4).
-- El codigo ya no crea una segunda autorizacion pendiente para el mismo
-- (referencia_id, tipo) — ver existeAutorizacionPendiente /
-- patchConcursoCphService en apps/api/src/modules/concursos-cph/concursos-cph.service.ts.
-- Este script es SOLO para limpiar las filas duplicadas que ya existian antes
-- del fix. NO ejecutar contra Neon (produccion) de forma automatica.

-- 1) Grupos con mas de una autorizacion pendiente para el mismo concurso/tipo.
SELECT referencia_id, tipo, count(*) AS pendientes
FROM autorizaciones
WHERE estado = 'pendiente'
GROUP BY referencia_id, tipo
HAVING count(*) > 1
ORDER BY pendientes DESC, referencia_id;

-- 2) DELETE (COMENTADO) que conserva la pendiente mas antigua por created_at de
--    cada grupo y borra las demas. Revisar el SELECT de arriba antes de correr.
-- DELETE FROM autorizaciones a
-- USING (
--   SELECT id,
--          row_number() OVER (
--            PARTITION BY referencia_id, tipo
--            ORDER BY created_at ASC
--          ) AS rn
--   FROM autorizaciones
--   WHERE estado = 'pendiente'
-- ) dup
-- WHERE a.id = dup.id AND dup.rn > 1;
