-- ============================================================================
-- Fix (B) parte 2: nullificar id_sial de TODO cargo 24/07 vigente cuyo id_sial
-- NO coincida con el id_sial del rol de su ocupante activo (incluye los 40
-- cargos de sucesion que no estan en desdoblado_mapeo_cargos).
--
-- Los 152 desdoblados del mapeo ya se nullificaron (fix anterior). Este cubre
-- el resto: cargos originales del padron con sucesion de ocupante (el id_sial
-- del cargo es de un ocupante anterior, ya no sirve para identificar al rol
-- vigente). Como el modelo 24/07 es 1:1 por rol, la identidad vive en la
-- ocupacion (id_sial_rol), no en el id_sial del cargo. Nullificar cierra el
-- riesgo de que el pipeline meta un rol nuevo ahi por coincidencia de id_sial.
--
-- SEGURIDAD: solo toca cargos con EXACTAMENTE una ocupacion activa (1:1), para
-- no tocar nada que no sea un cargo-rol vigente. Transaccional.
-- ============================================================================

-- A — DRY-RUN: cuantos quedan por nullificar (esperado ~40).
SELECT cr.codigo AS reg, count(*) AS a_nullificar
FROM cargos c
JOIN codigos_registro cr ON cr.id=c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o ON o.cargo_id=c.id AND o.hasta IS NULL
WHERE c.id_sial IS NOT NULL
  AND c.id_sial <> split_part(o.id_sial_rol,'-',1)||'-'||split_part(o.id_sial_rol,'-',2)
GROUP BY cr.codigo ORDER BY cr.codigo;

-- B — APLICAR. Subconsulta: cargos 24/07 con 1 ocup activa cuyo id_sial no
-- coincide con el id_sial del rol ocupante.
BEGIN;
UPDATE cargos c
   SET id_sial = NULL, updated_at = now()
 WHERE c.id IN (
   SELECT o.cargo_id
   FROM ocupaciones o
   JOIN cargos c2 ON c2.id = o.cargo_id
   JOIN codigos_registro cr ON cr.id = c2.codigo_registro_id AND cr.codigo IN ('24','07')
   WHERE o.hasta IS NULL
     AND c2.id_sial IS NOT NULL
     AND c2.id_sial <> split_part(o.id_sial_rol,'-',1)||'-'||split_part(o.id_sial_rol,'-',2)
   GROUP BY o.cargo_id
   HAVING count(*) = 1   -- solo cargos 1:1 (una ocupacion activa)
 );
COMMIT;

-- C — VERIFICACION: 0 cargos 24/07 con id_sial desajustado (total).
SELECT cr.codigo AS reg, count(*) AS desajustados_restantes
FROM cargos c
JOIN codigos_registro cr ON cr.id=c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o ON o.cargo_id=c.id AND o.hasta IS NULL
WHERE c.id_sial IS NOT NULL
  AND c.id_sial <> split_part(o.id_sial_rol,'-',1)||'-'||split_part(o.id_sial_rol,'-',2)
GROUP BY cr.codigo;

-- C.2 — invariante de cargos compartidos (debe seguir en 0).
SELECT cr.codigo, count(*)
FROM (SELECT o.cargo_id, c.codigo_registro_id, count(*) n
      FROM ocupaciones o JOIN cargos c ON c.id=o.cargo_id
      WHERE o.hasta IS NULL AND lower(unaccent(o.situacion_revista))='activo'
      GROUP BY 1,2 HAVING count(*)>1) t
JOIN codigos_registro cr ON cr.id=t.codigo_registro_id AND cr.codigo IN ('24','07')
GROUP BY 1;
