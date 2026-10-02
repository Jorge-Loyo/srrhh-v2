-- S21-5: eliminar personas.especialidad_principal.
-- Era una columna write-once al alta de la persona que nunca se resincronizaba
-- en padrones posteriores (quedaba stale). La "especialidad del cargo actual"
-- se resuelve ahora en runtime desde el Cargo vigente (especialidad_puesto del
-- catálogo, con fallback a especialidad_legacy) — ver personas.service.ts y el
-- fallback de sorteoJurado.service.ts. Ya no hay ningún lector ni escritor del
-- campo en código (verificado). especialidad_cph se conserva (es otra cosa:
-- la especialidad CPH canónica de ref_especialidades_cuil).
ALTER TABLE "personas" DROP COLUMN IF EXISTS "especialidad_principal";
