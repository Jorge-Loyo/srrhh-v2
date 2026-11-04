-- Normaliza el CR duplicado del escalafon CPH (22) al CR vigente (37).
-- Disenio: .agents/tasks/cph-solo-cr37 (pedido de Jorge: "todos los concursos
-- de Nueva Carrera Profesional Hospitalaria son 37; en todo el universo no
-- puede existir concursos de 22 - Nueva Carrera Profesional Hospitalaria").
--
-- Contexto: el escalafon CPH ('Nueva Carrera Prof. Hosp') tiene DOS codigos
-- de registro con el MISMO literal 'Nueva Carrera Profesional Hospitalaria':
-- codigos_registro.codigo = '22' y '37'. Los cargos reales usan el 37; el 22
-- es un duplicado heredado de la carga masiva que no debe quedar en cargos
-- con concurso CPH. La app sigue leyendo el 22 de forma tolerante (lectura de
-- dato historico) en varios modulos (derivarCodigoRegistro, autorizaciones,
-- cargos.service, reportes) - este script NO cambia esa lectura, solo corrige
-- los datos para que deje de haber concursos CPH sobre un cargo con CR 22.
--
-- Lo corre Jorge en WSL contra Neon (los agentes no tienen acceso):
--   psql "$NEON_DIRECT" -P pager=off -f scripts/sql/normalizar-cr22-a-37-cph.sql
--
-- DRY-RUN por defecto: todo corre dentro de una transaccion que termina en
-- ROLLBACK. Para aplicar de verdad, comentar el ROLLBACK final y descomentar
-- el COMMIT.
--
-- Idempotente: una segunda corrida no encuentra cargos con CR 22 y no hace nada.
\echo '== Resolviendo ids de CR 22 y CR 37 del escalafon CPH =='
CREATE TEMP VIEW v_cr_cph AS
SELECT
  (SELECT cr.id FROM codigos_registro cr
     JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE cr.codigo = '22' AND e.codigo = '22') AS cr22_id,
  (SELECT cr.id FROM codigos_registro cr
     JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE cr.codigo = '37' AND e.codigo = '22') AS cr37_id;
SELECT * FROM v_cr_cph;
BEGIN;
\echo '== DIAGNOSTICO (solo lectura) =='
\echo '-- Cargos CPH por codigo de registro (22 vs 37) --'
SELECT cr.codigo, cr.literal, COUNT(*) AS cargos
FROM cargos c
JOIN v_cr_cph v ON c.codigo_registro_id IN (v.cr22_id, v.cr37_id)
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE c.deleted_at IS NULL
GROUP BY cr.codigo, cr.literal
ORDER BY cr.codigo;
\echo '-- Cargos con CR 22 que tienen concurso_cph vinculado --'
SELECT COUNT(*) AS cargos_cr22_con_concurso_cph
FROM cargos c
JOIN v_cr_cph v ON c.codigo_registro_id = v.cr22_id
WHERE c.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM concursos_cph cc WHERE cc.cargo_id = c.id);
\echo '-- Cargos con CR 22 que tienen ocupante vigente (ocupaciones.hasta IS NULL) --'
SELECT COUNT(*) AS cargos_cr22_con_ocupante_vigente
FROM cargos c
JOIN v_cr_cph v ON c.codigo_registro_id = v.cr22_id
WHERE c.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL);
\echo '-- Concursos CPH afectados (su cargo tiene CR 22) --'
SELECT COUNT(*) AS concursos_cph_afectados
FROM concursos_cph cc
JOIN cargos c ON c.id = cc.cargo_id
JOIN v_cr_cph v ON c.codigo_registro_id = v.cr22_id;
\echo '-- Total cargos con CR 22 (con o sin concurso) --'
SELECT COUNT(*) AS total_cargos_cr22
FROM cargos c
JOIN v_cr_cph v ON c.codigo_registro_id = v.cr22_id
WHERE c.deleted_at IS NULL;
\echo '== UPDATE por defecto: solo cargos CR 22 CON concurso_cph vinculado -> CR 37 =='
UPDATE cargos c
SET codigo_registro_id = v.cr37_id,
    updated_at = now()
FROM v_cr_cph v
WHERE c.codigo_registro_id = v.cr22_id
  AND EXISTS (SELECT 1 FROM concursos_cph cc WHERE cc.cargo_id = c.id);
-- ── OPCIONAL (comentado): normalizar TODOS los cargos con CR 22, con o sin
-- concurso vinculado. Descomentar solo si Jorge decide, tras ver el
-- diagnostico, que tambien quiere corregir los cargos CR 22 sin concurso.
-- UPDATE cargos c
-- SET codigo_registro_id = v.cr37_id,
--     updated_at = now()
-- FROM v_cr_cph v
-- WHERE c.codigo_registro_id = v.cr22_id
--   AND c.deleted_at IS NULL;
\echo '== VERIFICACION: no deben quedar concursos_cph con cargo en CR 22 =='
SELECT COUNT(*) AS concursos_cph_aun_en_cr22
FROM concursos_cph cc
JOIN cargos c ON c.id = cc.cargo_id
JOIN v_cr_cph v ON c.codigo_registro_id = v.cr22_id;
-- DRY-RUN: descartar todo. Para aplicar de verdad, comentar la linea ROLLBACK
-- y descomentar la linea COMMIT.
ROLLBACK;
-- COMMIT;
