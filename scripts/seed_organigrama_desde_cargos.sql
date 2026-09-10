-- Seed organigrama desde cargos con jerarquía inferida.
-- Re-ejecutable.

DELETE FROM organigramas;

-- Paso 1: un nodo por codigo_repa con la descripcion más frecuente
CREATE TEMP TABLE tmp_nodos_uniq AS
SELECT DISTINCT ON (c.codigo_repa)
  c.codigo_repa,
  UPPER(h.universo_totalizador) AS universo,
  h.sigla,
  c.descripcion_repa AS desc_rep
FROM cargos c
JOIN hospitales h ON h.id = c.hospital_id
WHERE c.codigo_repa IS NOT NULL
  AND UPPER(h.universo_totalizador) IN ('NIVEL CENTRAL', 'APS', 'SAME')
  AND c.deleted_at IS NULL
  AND c.descripcion_repa IS NOT NULL
GROUP BY c.codigo_repa, UPPER(h.universo_totalizador), h.sigla, c.descripcion_repa
ORDER BY c.codigo_repa, COUNT(c.id) DESC;

-- Paso 2: nivel y tipo desde prefijo de descripcion
ALTER TABLE tmp_nodos_uniq ADD COLUMN lvl INT;
ALTER TABLE tmp_nodos_uniq ADD COLUMN tipo VARCHAR(50);
ALTER TABLE tmp_nodos_uniq ADD COLUMN padre VARCHAR(20);

UPDATE tmp_nodos_uniq SET
  lvl = CASE
    WHEN desc_rep ILIKE 'MINISTERIO%'                        THEN 1
    WHEN desc_rep ILIKE 'SS %'                               THEN 2
    WHEN desc_rep ILIKE 'DG %' OR desc_rep ILIKE 'UPE %'
      OR desc_rep ILIKE 'UNIDAD %'                           THEN 3
    WHEN desc_rep ILIKE 'GO %' OR desc_rep ILIKE 'DEPT %'
      OR desc_rep ILIKE 'CESAC%' OR desc_rep ILIKE 'AREA %' THEN 4
    WHEN desc_rep ILIKE 'SGO %' OR desc_rep ILIKE 'DIV %'   THEN 5
    WHEN desc_rep ILIKE 'SECC%'                              THEN 6
    ELSE 4
  END,
  tipo = CASE
    WHEN desc_rep ILIKE 'MINISTERIO%'  THEN 'Ministerio'
    WHEN desc_rep ILIKE 'SS %'         THEN 'SSEC/DIREJE'
    WHEN desc_rep ILIKE 'DG %'         THEN 'DG'
    WHEN desc_rep ILIKE 'UPE %'        THEN 'DG'
    WHEN desc_rep ILIKE 'UNIDAD %'     THEN 'DG'
    WHEN desc_rep ILIKE 'GO %'         THEN 'GO'
    WHEN desc_rep ILIKE 'DEPT %'       THEN 'DEPT'
    WHEN desc_rep ILIKE 'CESAC%'       THEN 'DEPT'
    WHEN desc_rep ILIKE 'SGO %'        THEN 'SGO'
    WHEN desc_rep ILIKE 'DIV %'        THEN 'DIV'
    WHEN desc_rep ILIKE 'SECC%'        THEN 'SECCION'
    ELSE 'DEPT'
  END;

-- Paso 3: padre = nodo del mismo universo con lvl menor y codigo_repa
-- que sea el prefijo más largo posible del nodo actual
UPDATE tmp_nodos_uniq n SET padre = (
  SELECT p.codigo_repa
  FROM tmp_nodos_uniq p
  WHERE p.universo = n.universo
    AND p.codigo_repa < n.codigo_repa
    AND p.lvl < n.lvl
    AND (
      LEFT(p.codigo_repa, 5) = LEFT(n.codigo_repa, 5)
      OR LEFT(p.codigo_repa, 4) = LEFT(n.codigo_repa, 4)
      OR LEFT(p.codigo_repa, 3) = LEFT(n.codigo_repa, 3)
    )
  ORDER BY
    CASE
      WHEN LEFT(p.codigo_repa, 5) = LEFT(n.codigo_repa, 5) THEN 0
      WHEN LEFT(p.codigo_repa, 4) = LEFT(n.codigo_repa, 4) THEN 1
      ELSE 2
    END,
    p.codigo_repa DESC
  LIMIT 1
);

-- Paso 3b: nodos que siguen sin padre y no son el Ministerio raiz
-- los colgamos del nodo de menor lvl del mismo universo (la raiz real)
UPDATE tmp_nodos_uniq n SET padre = (
  SELECT p.codigo_repa
  FROM tmp_nodos_uniq p
  WHERE p.universo = n.universo
    AND p.lvl = 1
  ORDER BY p.codigo_repa
  LIMIT 1
)
WHERE n.padre IS NULL AND n.lvl > 1;

-- Paso 3c: APS y SAME — huerfanos que siguen sin padre los colgamos
-- del nodo SS/DG raiz conocido de cada universo
UPDATE tmp_nodos_uniq SET padre = '40011000'
WHERE universo = 'APS' AND padre IS NULL AND codigo_repa != '40011000';

UPDATE tmp_nodos_uniq SET padre = '40200000'
WHERE universo = 'SAME' AND padre IS NULL AND codigo_repa != '40200000';

-- Paso 4: insertar
INSERT INTO organigramas (
  id, lvl, tipo, codigo_reparticion, universo_totalizador,
  regimen_empleo, desc_rep, sigla, padre, path, path_nombres
)
SELECT
  gen_random_uuid(),
  lvl,
  tipo,
  codigo_repa,
  universo,
  NULL,
  desc_rep,
  sigla,
  padre,
  codigo_repa,
  COALESCE(desc_rep, codigo_repa)
FROM tmp_nodos_uniq
ON CONFLICT (codigo_reparticion) DO NOTHING;

DROP TABLE tmp_nodos_uniq;

-- Resumen
SELECT universo_totalizador, COUNT(*) AS nodos,
       COUNT(padre) AS con_padre,
       COUNT(*) - COUNT(padre) AS raices
FROM organigramas
WHERE UPPER(universo_totalizador) IN ('NIVEL CENTRAL', 'APS', 'SAME')
GROUP BY universo_totalizador
ORDER BY universo_totalizador;
