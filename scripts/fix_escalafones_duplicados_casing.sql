-- ============================================================================
-- FUSION de escalafones duplicados por casing (hallado 2026-10-21 revisando
-- el panel por hospital de Dotacion: una carrera aparecia partida en dos
-- filas distintas del catalogo, con conteos reales en ambas).
--
-- DIAGNOSTICO (BD local, verificado):
--   3 pares de escalafones duplicados por casing: cada par tiene SU PROPIA
--   copia de puestos_cargo tambien duplicada. La fila "sobreviviente" de cada
--   par NO es siempre la de casing correcto: es la que ya tiene el
--   codigo_registro real enganchado (la entidad que el resto del sistema usa
--   para identificar la carrera), sea cual sea su casing actual:
--
--   1) "Autoridades Superiores" (0 cargos, 0 codigos_registro, codigo=25)
--      vs   "autoridades superiores" (42 cargos, codigo_registro(25)
--           enganchado, codigo='autoridades -3739fd3' basura)
--      -> SOBREVIVE la minuscula (tiene los 42 cargos reales Y el
--         codigo_registro=25) - se renombra a casing correcto + codigo=25.
--         La de casing correcto no tiene nada enganchado -> se borra.
--
--   2) "Carrera Gerencial" (201 cargos, 0 codigos_registro, codigo=60)
--      vs   "carrera gerencial" (1 cargo, codigo_registro(60) enganchado,
--           codigo='carrera gere-59f1081' basura)
--      -> SOBREVIVE la minuscula (tiene el codigo_registro=60 real) - se le
--         REASIGNAN los 201 cargos de la de casing correcto (fusion
--         puesto-a-puesto por nombre: mismos 3 puestos en ambos lados) y se
--         renombra a casing correcto + codigo=60. La de casing correcto
--         queda vacia -> se borra junto a sus 3 puestos_cargo huerfanos.
--
--   3) "CEETPS" (4292 cargos, codigo_registro(85) enganchado, codigo=85)
--      vs   "ceetps" (0 cargos, 0 puestos_cargo, 0 referencias en ninguna
--           tabla, codigo='ceetps-6a0b775' basura)
--      -> SOBREVIVE "CEETPS" (ya esta perfecta). Se borra "ceetps" directo.
--
--   Se verifico que codigos_registro/concursos_ceetps/solicitudes_alta NO
--   tienen filas apuntando a ninguna de las 3 filas que se borran, salvo
--   los 2 casos de codigos_registro ya contemplados arriba (quedan
--   intactos: siguen apuntando al escalafon sobreviviente, que es el
--   mismo id antes y despues, solo cambia nombre/codigo).
--
-- SEGURIDAD: todo en BEGIN;...COMMIT;. ROLLBACK revierte entero.
-- ============================================================================

-- IDs fijos (relevados en el diagnostico — no depende de ninguna heuristica
-- en el momento de aplicar, así que no hay riesgo de que el script agarre
-- la fila equivocada si corrio algo mas entremedio).
-- Autoridades Superiores: sobrevive 34a01513-79da-4bda-9909-d555d17aa44d, se borra 9a8965a2-557c-4425-b726-dc2a0e27072f
-- Carrera Gerencial:      sobrevive 55c7a9f0-3fb7-4cab-af44-b89feff90d67, se borra 39193b3b-44f2-4db4-b146-02ae33187230
-- CEETPS:                 sobrevive b7203670-2f01-4f91-8a60-32f234458a8c, se borra a7410ab6-e2a8-4cbb-afe0-4c8921add534

-- ############################################################################
-- ## SECCION A — DRY-RUN (SOLO SELECT)                                        ##
-- ############################################################################

-- A.1 — Cargos que se van a reasignar (Carrera Gerencial: puesto Title-Case -> puesto lowercase).
SELECT pc_bad.nombre AS puesto_origen, pc_ok.nombre AS puesto_destino, count(c.id) AS cargos_a_reasignar
FROM puestos_cargo pc_bad
JOIN puestos_cargo pc_ok
  ON pc_ok.escalafon_id = '55c7a9f0-3fb7-4cab-af44-b89feff90d67'
 AND pc_ok.nombre = pc_bad.nombre
JOIN cargos c ON c.puesto_cargo_id = pc_bad.id
WHERE pc_bad.escalafon_id = '39193b3b-44f2-4db4-b146-02ae33187230'
GROUP BY pc_bad.nombre, pc_ok.nombre;

-- A.2 — Puestos huerfanos que quedarian sin cargos tras la fusion (a borrar).
SELECT escalafon_id, id, nombre FROM puestos_cargo
WHERE escalafon_id IN (
  '9a8965a2-557c-4425-b726-dc2a0e27072f', -- Autoridades Superiores (Title, 0 cargos)
  '39193b3b-44f2-4db4-b146-02ae33187230'  -- Carrera Gerencial (Title, tras reasignar quedan en 0)
);

-- A.3 — Confirmacion final: 0 filas con casing duplicado tras aplicar (se corre tambien en Seccion C).
SELECT lower(unaccent(nombre)) AS normalizado, count(DISTINCT nombre) AS n
FROM escalafones GROUP BY 1 HAVING count(DISTINCT nombre) > 1;


-- ############################################################################
-- ## SECCION B — APLICAR (BEGIN ... COMMIT)                                   ##
-- ############################################################################

BEGIN;

-- B.1 — Carrera Gerencial: reasignar los 201 cargos de la fila Title-Case a
--       los puestos equivalentes (mismo nombre) de la fila minuscula, que es
--       la que tiene el codigo_registro=60 real enganchado.
UPDATE cargos c
   SET puesto_cargo_id = pc_ok.id,
       escalafon_id    = '55c7a9f0-3fb7-4cab-af44-b89feff90d67',
       updated_at      = now()
  FROM puestos_cargo pc_bad
  JOIN puestos_cargo pc_ok
    ON pc_ok.escalafon_id = '55c7a9f0-3fb7-4cab-af44-b89feff90d67'
   AND pc_ok.nombre = pc_bad.nombre
 WHERE pc_bad.escalafon_id = '39193b3b-44f2-4db4-b146-02ae33187230'
   AND c.puesto_cargo_id = pc_bad.id;

-- B.2 — Borrar los puestos_cargo huerfanos de ambas filas Title-Case (ya sin
--       cargos apuntando: Autoridades Superiores nunca tuvo, Carrera
--       Gerencial quedo en 0 tras B.1).
DELETE FROM puestos_cargo
WHERE escalafon_id IN (
  '9a8965a2-557c-4425-b726-dc2a0e27072f',
  '39193b3b-44f2-4db4-b146-02ae33187230'
);

-- B.3 — Borrar las 3 filas de escalafon sobrantes (ya sin cargos/puestos
--       apuntando; codigos_registro/concursos_ceetps/solicitudes_alta no
--       referencian a ninguna de las 3, verificado en el diagnostico).
DELETE FROM escalafones WHERE id IN (
  '9a8965a2-557c-4425-b726-dc2a0e27072f', -- Autoridades Superiores (Title, orfana)
  '39193b3b-44f2-4db4-b146-02ae33187230', -- Carrera Gerencial (Title, orfana tras fusion)
  'a7410ab6-e2a8-4cbb-afe0-4c8921add534'  -- ceetps (lowercase, orfana)
);

-- B.4 — Dejar las filas sobrevivientes con casing/codigo correctos (recien
--       ahora, una vez libres los valores de `codigo` que tenian las filas
--       borradas — el campo es @unique).
UPDATE escalafones SET nombre = 'Autoridades Superiores', codigo = '25', updated_at = now()
WHERE id = '34a01513-79da-4bda-9909-d555d17aa44d';

UPDATE escalafones SET nombre = 'Carrera Gerencial', codigo = '60', updated_at = now()
WHERE id = '55c7a9f0-3fb7-4cab-af44-b89feff90d67';

COMMIT;


-- ############################################################################
-- ## SECCION C — VERIFICACION (SOLO SELECT)                                   ##
-- ############################################################################

-- C.1 — 0 escalafones duplicados por casing (esperado 0 filas).
SELECT lower(unaccent(nombre)) AS normalizado, count(DISTINCT nombre) AS n
FROM escalafones GROUP BY 1 HAVING count(DISTINCT nombre) > 1;

-- C.2 — Las 3 carreras quedan con un solo escalafon, codigo correcto y todos
--       sus cargos (42, 202, 4292).
SELECT esc.nombre, esc.codigo, count(c.id) AS cargos
FROM escalafones esc LEFT JOIN cargos c ON c.escalafon_id = esc.id
WHERE esc.nombre IN ('Autoridades Superiores','Carrera Gerencial','CEETPS')
GROUP BY esc.nombre, esc.codigo ORDER BY esc.nombre;
