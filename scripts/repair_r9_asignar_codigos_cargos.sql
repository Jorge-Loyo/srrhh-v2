-- Asignar códigos correlativos a los 28 cargos sin código
-- Máximos actuales: SG-3904, CPH-P-10941, EG-4711, TEC-3882, ENF(85)-11155, ENF(87)-11534
-- cod_reg 07 y 24 no se gestionan -> no se les asigna código

BEGIN;

WITH numerados AS (
  SELECT
    c.id,
    c.id_sial,
    cr.codigo as cod_reg,
    ROW_NUMBER() OVER (PARTITION BY cr.codigo ORDER BY c.id_sial) as rn
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  WHERE c.id_sial IN (
    '001028610-1','001028737-2','001058973-2','001059671-1','001087820-1',
    '001118586-3','001163242-4','001267606-4','001447717-1','001453901-2',
    '001474410-1','001520617-6','001557121-1','001605215-1','001605817-11',
    '001610058-5','001624387-5','001625210-2','001633151-1','001714276-3',
    '001733725-5','001754783-1','001757361-2','001760324-1','001798660-2',
    '001805036-1','001806111-2','001822629-1'
  )
  AND cr.codigo IN ('23','37','83','85','87')
),
codigos AS (
  SELECT
    id, id_sial, cod_reg,
    CASE cod_reg
      WHEN '23' THEN 'SG-'    || LPAD((3904 + rn)::text, 5, '0')
      WHEN '37' THEN 'CPH-P-' || LPAD((10941 + rn)::text, 5, '0')
      WHEN '83' THEN 'EG-'    || LPAD((4711 + rn)::text, 5, '0')
      WHEN '85' THEN 'TEC-'   || LPAD((3882 + rn)::text, 4, '0')
      WHEN '87' THEN 'ENF-'   || LPAD((11534 + rn)::text, 5, '0')
    END as nuevo_codigo
  FROM numerados
)
UPDATE cargos c
SET codigo = cd.nuevo_codigo, updated_at = NOW()
FROM codigos cd
WHERE c.id = cd.id;

-- Verificar
SELECT c.codigo, c.id_sial, c.literal_puesto, cr.codigo as cod_reg
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE c.id_sial IN (
  '001028610-1','001028737-2','001058973-2','001059671-1','001087820-1',
  '001118586-3','001163242-4','001267606-4','001447717-1','001453901-2',
  '001474410-1','001557121-1','001605215-1','001605817-11','001610058-5',
  '001624387-5','001625210-2','001633151-1','001714276-3','001733725-5',
  '001754783-1','001757361-2','001760324-1','001798660-2','001805036-1'
)
ORDER BY cr.codigo, c.codigo;

COMMIT;
