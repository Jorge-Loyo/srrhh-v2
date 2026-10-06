import { Prisma, PrismaClient } from '@prisma/client'

type DbClient = Pick<PrismaClient, '$queryRaw'>

// ─── S24: ocultamiento de cargos de conducción "redundantes" del SIAL ────────
//
// Regla de negocio (RRHH, 2026-10 — ver Doc/Planificacion/Sprints/SPRINT_24_S2_analisis.md §5):
// La jefatura máxima de un `codigo_repa` es el cargo de conducción cuya ocupación
// vigente tiene JCAT (`codigo_jefaturas`). Igual que en Enfermería, el JCAT —no el
// escalafón ni el prefijo— define la jefatura real.
//
// El SIAL a veces registra a la MISMA persona en DOS cargos de conducción del
// MISMO `codigo_repa`: uno con JCAT (la jefatura real) y otro SIN JCAT (un
// segundo rol administrativo del SIAL, no una segunda dirección). Ese segundo
// cargo sin-JCAT es un rol redundante que NO interesa mostrar.
//
// Decisión del usuario: esos cargos se OCULTAN del sistema (listado de cargos y
// organigrama). Filtrado DINÁMICO: no se persiste marca ni se borra nada —
// se recalcula en cada consulta a partir del padrón vigente, así que si el
// padrón cambia (la persona deja de tener el doble rol) el cargo reaparece solo
// y la reconciliación con el padrón nunca ve un cargo "marcado".
//
// Condición exacta de un cargo a ocultar:
//   - es de conducción (prefijo de código de conducción),
//   - tiene una ocupación vigente (hasta IS NULL) SIN codigo_jefaturas,
//   - existe OTRO cargo de conducción con una ocupación vigente de la MISMA
//     persona en el MISMO codigo_repa CON codigo_jefaturas.
//
// Medido contra la BD local (2026-10): 9 cargos (ej. Elizalde `CPH-D-000007`
// sin JCAT se oculta; `CPH-D-000006` con JCAT P60 queda). Son todos los `CPH-D`
// "doble rol" del hallazgo §5.

// Prefijos de conducción, en forma de alternación regex para el filtro raw.
// Debe mantenerse coherente con PREFIJOS_CONDUCCION de codigoCargo.ts.
const PREFIJO_CONDUCCION_REGEX = '^(AS-MIN|AS-SS|AS-DGA|AS-DG|CPH-D|CPH-SD|CPH-J-POF|CPH-J-POU|RG-CG|EG-D|EG-G|EG-J|TEC-J-POF|TEC-J-POU)'

export async function cargoIdsOcultosPorRolRedundante(db: DbClient): Promise<string[]> {
  const rows = await db.$queryRaw<{ cargo_id: string }[]>(Prisma.sql`
    WITH ov AS (
      SELECT o.cargo_id,
             o.persona_id,
             o.codigo_jefaturas,
             c.codigo_repa
      FROM ocupaciones o
      JOIN cargos c ON c.id = o.cargo_id
      WHERE o.hasta IS NULL
        AND c.deleted_at IS NULL
        AND c.estado IN ('vigente', 'validacion_vacante')
        AND c.codigo ~ ${PREFIJO_CONDUCCION_REGEX}
    )
    SELECT DISTINCT a.cargo_id
    FROM ov a
    JOIN ov b
      ON b.persona_id = a.persona_id
     AND b.codigo_repa = a.codigo_repa
     AND b.cargo_id <> a.cargo_id
     AND b.codigo_jefaturas IS NOT NULL
     AND b.codigo_jefaturas NOT IN ('', '0')
    WHERE a.codigo_jefaturas IS NULL
      AND a.codigo_repa IS NOT NULL
  `)
  return rows.map((r) => r.cargo_id)
}
