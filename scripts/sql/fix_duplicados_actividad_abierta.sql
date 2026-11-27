-- Diagnóstico: duplicados abiertos en dim_actividad_hechos
SELECT id_sial_rol, count(*) as filas
FROM dim_actividad_hechos
WHERE fecha_hasta IS NULL
GROUP BY id_sial_rol
HAVING count(*) > 1
ORDER BY filas DESC
LIMIT 20;

-- Fix: conservar solo la fila más reciente (mayor fecha_desde) por id_sial_rol
-- Las demás se cierran con fecha_hasta = fecha_desde de la fila que queda
WITH ranked AS (
  SELECT id,
         id_sial_rol,
         fecha_desde,
         ROW_NUMBER() OVER (PARTITION BY id_sial_rol ORDER BY fecha_desde DESC, id DESC) AS rn
  FROM dim_actividad_hechos
  WHERE fecha_hasta IS NULL
),
duplicados AS (
  SELECT r.id, r.id_sial_rol,
         (SELECT fecha_desde FROM ranked r2 WHERE r2.id_sial_rol = r.id_sial_rol AND r2.rn = 1) AS fecha_cierre
  FROM ranked r
  WHERE r.rn > 1
)
UPDATE dim_actividad_hechos dah
SET fecha_hasta = d.fecha_cierre
FROM duplicados d
WHERE dah.id = d.id;

-- Verificar que no quedan duplicados
SELECT count(*) AS duplicados_restantes
FROM (
  SELECT id_sial_rol
  FROM dim_actividad_hechos
  WHERE fecha_hasta IS NULL
  GROUP BY id_sial_rol
  HAVING count(*) > 1
) sub;
