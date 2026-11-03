-- Tipo/motivo de concurso (SPRINT_tipo_concurso.md, decisión D1): extiende el
-- enum Postgres `MotivoConcurso` de 2 a 4 valores. Se CONSERVAN `nuevo_cargo` y
-- `alta_por_baja` (no se quitan — datos/código existentes los usan) y se agregan
-- `retencion_de_cargo` y `cobertura_dotacion`, los dos motivos de negocio que
-- faltaban (un concurso nace por uno de 3 motivos; `nuevo_cargo` es legacy).
--
-- OJO Postgres: `ALTER TYPE ... ADD VALUE` no puede correr en la misma
-- transacción que un statement que USE el valor nuevo. Acá solo agregamos los
-- valores (idempotente con IF NOT EXISTS), sin usarlos — así que es seguro.
-- El backfill que USA estos valores va aparte, en
-- apps/api/scripts/backfill_tipo_concurso.sql (tampoco se ejecuta acá).
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario (Jorge) corre este .sql en Neon.

ALTER TYPE "MotivoConcurso" ADD VALUE IF NOT EXISTS 'retencion_de_cargo';
ALTER TYPE "MotivoConcurso" ADD VALUE IF NOT EXISTS 'cobertura_dotacion';
