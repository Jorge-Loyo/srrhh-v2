-- MANUAL: lo corre Jorge en Neon. El workflow NO ejecuta NADA contra la DB.
--
-- Paso 2 — Decisión A (opcional): con el nuevo disparador de 'o-alta sial' por
-- `validado`, los concursos históricos que tenían el alta SIAL cargada a mano
-- (cargo_sial IS NOT NULL) pero sin `validado` ya NO quedarían en 'o-alta sial'.
-- Este backfill enciende `validado` donde hay cargo_sial, para conservar ese
-- estado histórico. El sub_estado persistido se refresca recién en el próximo
-- write del concurso (el listado recalcula sub_estado_3 en vivo); si se quiere
-- el sub_estado fresco de inmediato, tocar/guardar cada concurso o recalcular.
BEGIN;

UPDATE concursos_cph
   SET validado = true,
       validado_at = COALESCE(validado_at, now())
 WHERE cargo_sial IS NOT NULL
   AND validado = false;

-- Verificación: cuántos quedaron validados por cargo_sial.
SELECT count(*) AS validados_por_cargo_sial
  FROM concursos_cph
 WHERE cargo_sial IS NOT NULL
   AND validado = true;

COMMIT;
