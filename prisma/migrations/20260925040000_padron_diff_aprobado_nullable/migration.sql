-- Hallazgo 2026-09-14 subiendo un padrón real ("Cargos_salud_20260913.xlsx"):
-- `padron_diff.aprobado` se creó en 0_init como `BOOLEAN NOT NULL DEFAULT
-- true`, pero `schema.prisma` lo tiene como `Boolean?` desde que se agregó
-- el flujo de validación de altas nuevas (null = pendiente de decisión,
-- ver padron.service.ts línea ~431: "d.tipo !== 'nuevo' ? true : null") —
-- nunca se generó la migración que relaja la columna. Resultado real: CADA
-- snapshot con al menos un registro "nuevo" (es decir, todo padrón real
-- distinto al anterior) fallaba en el paso `diff` con
-- "Null constraint violation on the fields: (aprobado)". El único snapshot
-- que existe en la base hoy quedó aprobado porque entró por otra vía (carga
-- inicial), no por este mismo flujo de upload — por eso el bug nunca se
-- había notado antes.
ALTER TABLE "padron_diff" ALTER COLUMN "aprobado" DROP NOT NULL;
ALTER TABLE "padron_diff" ALTER COLUMN "aprobado" DROP DEFAULT;
