-- ============================================================================
-- Fix (B): nullificar id_sial de los cargos DESDOBLADOS de 24/07 cuyo id_sial
-- quedo "desajustado" (no coincide con el id_sial del rol de su ocupante).
--
-- CAUSA: el desdoblado dejo en algunos cargos un id_sial residual que no
-- corresponde a su titular. El fix del pipeline, al no hallar un rol nuevo por
-- id_sial_rol, cae a buscar por id_sial del cargo y lo mete ahi -> regenera
-- cargo compartido (caso Pose/Guirao del padron 18-10).
--
-- SOLUCION: un cargo desdoblado 1:1 NO debe tener id_sial (se identifica por su
-- ocupante via id_sial_rol). Poniendo id_sial = NULL, el pipeline nunca mas lo
-- matchea por id_sial -> siempre crea alta 1:1 para roles nuevos. Cierra el
-- agujero a nivel dato (la defensa en codigo del pipeline es un refinamiento
-- aparte).
--
-- ALCANCE: SOLO cargos que estan en desdoblado_mapeo_cargos (desdoblados
-- confirmados) y cuyo id_sial difiere del id_sial del rol ocupante. Los cargos
-- desajustados que NO estan en el mapeo (40 casos) se dejan para revision aparte.
-- Transaccional.
-- ============================================================================

-- A — DRY-RUN: cuantos se van a nullificar por registro.
SELECT cr.codigo AS reg, count(*) AS a_nullificar
FROM cargos c
JOIN codigos_registro cr ON cr.id=c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o ON o.cargo_id=c.id AND o.hasta IS NULL
JOIN desdoblado_mapeo_cargos m ON m.codigo_cargo = c.codigo
WHERE c.id_sial IS NOT NULL
  AND c.id_sial <> split_part(o.id_sial_rol,'-',1)||'-'||split_part(o.id_sial_rol,'-',2)
GROUP BY cr.codigo ORDER BY cr.codigo;

-- B — APLICAR.
BEGIN;
UPDATE cargos c
   SET id_sial = NULL, updated_at = now()
  FROM ocupaciones o, desdoblado_mapeo_cargos m
 WHERE o.cargo_id = c.id AND o.hasta IS NULL
   AND m.codigo_cargo = c.codigo
   AND c.id_sial IS NOT NULL
   AND c.id_sial <> split_part(o.id_sial_rol,'-',1)||'-'||split_part(o.id_sial_rol,'-',2)
   AND c.codigo_registro_id IN (SELECT id FROM codigos_registro WHERE codigo IN ('24','07'));
COMMIT;

-- C — VERIFICACION: cuantos desajustados EN MAPEO quedan (esperado 0).
SELECT cr.codigo AS reg, count(*) AS desajustados_en_mapeo_restantes
FROM cargos c
JOIN codigos_registro cr ON cr.id=c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o ON o.cargo_id=c.id AND o.hasta IS NULL
JOIN desdoblado_mapeo_cargos m ON m.codigo_cargo = c.codigo
WHERE c.id_sial IS NOT NULL
  AND c.id_sial <> split_part(o.id_sial_rol,'-',1)||'-'||split_part(o.id_sial_rol,'-',2)
GROUP BY cr.codigo;
