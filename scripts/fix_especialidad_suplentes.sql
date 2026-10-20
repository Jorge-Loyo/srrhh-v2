-- ============================================================================
-- Correccion de especialidad desalineada en cargos de SUPLENTES / GUARDIAS
-- (cod_registro '23'). Reapunta especialidad_puesto_id del cargo a la
-- especialidad que trajo el PADRON para ese rol, cuando difiere y existe en el
-- catalogo del mismo puesto.
--
-- CONTEXTO
-- --------
-- El cargo (cod_reg 23) guarda especialidad_puesto_id (FK al catalogo). En ~314
-- cargos vigentes 1:1 ese FK NO coincide con la especialidad del ultimo padron
-- del rol (lo que realmente vino del SIAL). Mismo patron que el caso Sargenti:
-- el cargo apunta a OTRA especialidad del mismo puesto.
--
-- 23 es 100% 1:1 (0 cargos compartidos, verificado), asi que corregir el cargo
-- afecta a un solo rol — no hay riesgo de pisar a otro ocupante. (Residencias 24
-- NO se corrige aca: tiene cargos compartidos y se resuelve via el desdoblado,
-- scripts/fix_desdoblado_cargos.sql, que asigna especialidad por rol.)
--
-- FUENTE DE VERDAD: columna `especialidad` del ultimo padron_historico del rol
-- (DISTINCT ON id_sial_rol ORDER BY fecha_asignada DESC). Se matchea contra
-- especialidades_puesto del MISMO puesto_cargo_id via norm_esp() (minuscula, sin
-- tilde, sin "(...)", sin bullet/guion, espacios colapsados, TRIM).
--
-- EXCEPCION BIOQUIMICA (decision de negocio, DOTANEITOR_DECISIONES.md): la
-- especialidad "Bioquimica Clinica" SI tiene subespecialidades reales que
-- compiten entre parentesis (Quimica Clinica, Microbiologia, etc.). norm_esp
-- colapsa el parentesis, lo que las unificaria incorrectamente. Por eso los
-- roles cuyo padron empieza con "bioquimica" se EXCLUYEN de esta correccion
-- (se revisan aparte). No se tocan.
--
-- REGLA DE ORO: si el padron no matchea NINGUNA especialidad del catalogo del
-- puesto, el cargo se deja INTACTO (no se vacia, no se inventa). Esos casos (8
-- en 23) son especialidades legitimas que faltan en el catalogo del puesto y se
-- resuelven agregandolas al catalogo, no vaciando.
--
-- SEGURIDAD: solo cargos cod_reg 23 vigentes con ocupacion activa (hasta IS NULL)
-- donde EXISTE match en catalogo del mismo puesto y es DISTINTO del actual.
-- Todo APLICAR va en BEGIN;...COMMIT; (ROLLBACK revierte entero).
-- ============================================================================


-- B.0 — Funcion de normalizacion CON trim() (critico, ver nota en
-- fix_desdoblado_cargos.sql). Idempotente.
CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(unaccent(coalesce(txt, ''))),
    '\([^)]*\)', ' ', 'g'), '•', ' ', 'g'), '-', ' ', 'g'), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;


-- CTE compartida: por cada cargo activo cod_reg 23, el texto del padron (ultimo
-- historico del rol) y la especialidad del catalogo a la que DEBERIA apuntar.
-- Se materializa como vista temporal en cada seccion (A y B la re-declaran).

-- ############################################################################
-- ## SECCION A — DRY-RUN (SOLO SELECT; NO MODIFICA NADA)                     ##
-- ############################################################################

WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
         ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
cand AS (
  SELECT c.id AS cargo_id, c.codigo, c.puesto_cargo_id,
         c.especialidad_puesto_id AS esp_actual_id,
         ea.nombre AS esp_actual_nombre,
         u.esp_padron,
         (SELECT ep.id FROM especialidades_puesto ep
           WHERE ep.puesto_cargo_id = c.puesto_cargo_id
             AND norm_esp(ep.nombre) = norm_esp(u.esp_padron)
           LIMIT 1) AS esp_correcta_id
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '23'
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  LEFT JOIN especialidades_puesto ea ON ea.id = c.especialidad_puesto_id
  -- EXCEPCION BIOQUIMICA: no tocar roles cuyo padron es bioquimica (subespecialidades).
  WHERE norm_esp(u.esp_padron) NOT LIKE 'bioquimica%'
)
-- A.1 — Resumen: cuantos se corrigen.
SELECT 'A CORREGIR' AS seccion, count(*) AS n
FROM cand
WHERE esp_correcta_id IS NOT NULL AND esp_correcta_id IS DISTINCT FROM esp_actual_id;

-- A.2 — Detalle de los cambios (muestra). Revisar antes de aplicar.
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
cand AS (
  SELECT c.id AS cargo_id, c.codigo, c.puesto_cargo_id,
         c.especialidad_puesto_id AS esp_actual_id,
         ea.nombre AS esp_actual_nombre, u.esp_padron,
         (SELECT ep.id FROM especialidades_puesto ep
           WHERE ep.puesto_cargo_id = c.puesto_cargo_id
             AND norm_esp(ep.nombre) = norm_esp(u.esp_padron) LIMIT 1) AS esp_correcta_id
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '23'
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  LEFT JOIN especialidades_puesto ea ON ea.id = c.especialidad_puesto_id
  WHERE norm_esp(u.esp_padron) NOT LIKE 'bioquimica%'
)
SELECT c.codigo, c.esp_padron AS padron,
       c.esp_actual_nombre AS actual_incorrecta,
       (SELECT nombre FROM especialidades_puesto WHERE id = c.esp_correcta_id) AS nueva_correcta
FROM cand c
WHERE c.esp_correcta_id IS NOT NULL AND c.esp_correcta_id IS DISTINCT FROM c.esp_actual_id
ORDER BY c.esp_padron
LIMIT 80;


-- ############################################################################
-- ## SECCION B — APLICAR (TRANSACCIONAL: BEGIN ... COMMIT)                   ##
-- ############################################################################

BEGIN;

WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
),
cand AS (
  SELECT c.id AS cargo_id, c.puesto_cargo_id, c.especialidad_puesto_id AS esp_actual_id,
         u.esp_padron,
         (SELECT ep.id FROM especialidades_puesto ep
           WHERE ep.puesto_cargo_id = c.puesto_cargo_id
             AND norm_esp(ep.nombre) = norm_esp(u.esp_padron) LIMIT 1) AS esp_correcta_id
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '23'
  JOIN ult u ON u.id_sial_rol = o.id_sial_rol
  WHERE norm_esp(u.esp_padron) NOT LIKE 'bioquimica%'
)
UPDATE cargos c
   SET especialidad_puesto_id = cand.esp_correcta_id,
       updated_at = now()
  FROM cand
 WHERE c.id = cand.cargo_id
   AND cand.esp_correcta_id IS NOT NULL
   AND cand.esp_correcta_id IS DISTINCT FROM cand.esp_actual_id;

-- Revisar el "UPDATE n" (esperado ~314). Si no cuadra -> ROLLBACK.
COMMIT;


-- ############################################################################
-- ## SECCION C — VERIFICACION (SOLO SELECT)                                  ##
-- ############################################################################

-- C.1 — Desalineados restantes en 23 (deberia bajar a ~8 = los sin-match reales
--       + los de bioquimica excluidos). NO deberia quedar ningun corregible.
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol) ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
)
SELECT count(*) FILTER (
         WHERE (SELECT ep.id FROM especialidades_puesto ep
                WHERE ep.puesto_cargo_id = c.puesto_cargo_id
                  AND norm_esp(ep.nombre) = norm_esp(u.esp_padron) LIMIT 1)
               IS DISTINCT FROM c.especialidad_puesto_id
           AND norm_esp(u.esp_padron) NOT LIKE 'bioquimica%'
       ) AS corregibles_restantes
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '23'
JOIN ult u ON u.id_sial_rol = o.id_sial_rol;
