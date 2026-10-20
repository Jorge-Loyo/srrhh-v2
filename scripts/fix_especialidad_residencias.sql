-- ============================================================================
-- Corrección de especialidad mal asignada en cargos de RESIDENCIAS (cód. 24).
--
-- CONTEXTO: el pipeline del padrón dejó en muchos cargos un especialidad_puesto_id
-- que NO corresponde a la especialidad que trajo el padrón (desalineamiento:
-- el cargo apunta a OTRA especialidad del mismo puesto). Ej: el padrón dice
-- "psiquiatria" pero el cargo quedó apuntando a "urologia".
--
-- FUENTE DE VERDAD: la columna `especialidad` del último padron_historico del
-- rol (lo que realmente vino del SIAL). La corrección reapunta el cargo a la
-- especialidad del MISMO puesto cuyo nombre NORMALIZADO coincide con el texto
-- del padrón normalizado.
--
-- NORMALIZACIÓN (acordada con el usuario): minúscula, sin tildes (unaccent),
-- sin el "• " inicial, sin "(...)" y su contenido, sin guiones "-", espacios
-- colapsados y trim. Se aplica IGUAL a ambos lados (padrón y catálogo) SOLO
-- para comparar — NO se modifican los nombres del catálogo, solo se corrige
-- el FK especialidad_puesto_id del cargo.
--
-- SEGURIDAD: solo toca cargos cód. 24 vigentes con ocupación activa donde EXISTE
-- una especialidad del mismo puesto que matchea el padrón y es DISTINTA de la
-- actual. Si no hay match, el cargo se deja intacto (queda para revisión aparte).
-- ============================================================================

-- Función de normalización para el match (idempotente, se puede recrear).
CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 lower(unaccent(coalesce(txt, ''))),
                 '\([^)]*\)', ' ', 'g'      -- quita "(...)" y su contenido
               ),
               '•', ' ', 'g'                 -- quita el bullet
             ),
             '-', ' ', 'g'                   -- quita guiones
           ),
           '\s+', ' ', 'g'                   -- colapsa espacios
         ) ;
$$ LANGUAGE sql IMMUTABLE;

-- CTE base: por cada cargo activo cód 24, el texto del padrón (último histórico
-- del rol) y la especialidad del catálogo a la que DEBERÍA apuntar.
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
         ph.cargo_id,
         ph.especialidad AS esp_padron_raw
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
cargos_24 AS (
  SELECT c.id AS cargo_id, c.codigo, c.puesto_cargo_id,
         c.especialidad_puesto_id AS esp_actual_id,
         u.esp_padron_raw
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '24'
  JOIN ult u ON u.cargo_id = c.id
),
-- Match: especialidad del MISMO puesto cuyo nombre normalizado = padrón normalizado.
match_esp AS (
  SELECT x.cargo_id, x.codigo, x.esp_padron_raw,
         x.esp_actual_id,
         ea.nombre AS esp_actual_nombre,
         ep.id     AS esp_correcta_id,
         ep.nombre AS esp_correcta_nombre
  FROM cargos_24 x
  LEFT JOIN especialidades_puesto ea ON ea.id = x.esp_actual_id
  JOIN especialidades_puesto ep
    ON ep.puesto_cargo_id = x.puesto_cargo_id
   AND norm_esp(ep.nombre) = norm_esp(x.esp_padron_raw)
)
-- DRY-RUN: solo los que CAMBIARÍAN (match encontrado y distinto del actual).
SELECT
  esp_padron_raw            AS padron,
  esp_actual_nombre         AS actual_incorrecta,
  esp_correcta_nombre       AS nueva_correcta,
  count(*)                  AS n
FROM match_esp
WHERE esp_correcta_id IS DISTINCT FROM esp_actual_id
GROUP BY 1,2,3
ORDER BY n DESC
LIMIT 60;
