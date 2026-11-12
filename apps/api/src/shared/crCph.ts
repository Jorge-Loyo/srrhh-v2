import pino from 'pino'
import { DESEMPATE_CR_POR_ESCALAFON } from '../modules/padron/derivarCodigoRegistro.js'
// ─── CR duplicado del escalafón CPH (22 → 37) ────────────────────────────────
//
// El escalafón CPH tiene DOS códigos de registro con el mismo literal
// ('Nueva Carrera Profesional Hospitalaria'): el 22 y el 37. Los cargos reales
// usan el 37; el 22 es un duplicado que NO debe usarse en concursos. Mismo
// mapeo que `DESEMPATE_CR_POR_ESCALAFON['22']` (derivarCodigoRegistro.ts).
// La lectura del dato histórico con 22 sigue siendo tolerante; esto solo
// normaliza al ESCRIBIR (crear concurso / cargo).
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
export const CR_CPH_DUPLICADO = '22'
export const CR_CPH_VIGENTE = DESEMPATE_CR_POR_ESCALAFON[CR_CPH_DUPLICADO] ?? '37'
// Subconjunto de Prisma que necesita el helper (acepta `prisma` o un `tx`).
export interface CrCphDb {
  codigoRegistro: {
    findUnique(args: {
      where: { id: string }
      select: { codigo: true; escalafonId: true }
    }): Promise<{ codigo: string; escalafonId: string } | null>
    findFirst(args: {
      where: { codigo: string; escalafonId: string }
      select: { id: true }
    }): Promise<{ id: string } | null>
  }
}
/**
 * Si `crId` es el CR 22 duplicado, devuelve el id del CR 37 del MISMO
 * escalafón; en cualquier otro caso (null, otra carrera, ya 37, o 37 inexistente)
 * devuelve `crId` sin cambios.
 */
export async function normalizarCrCphId<T extends string | null | undefined>(
  db: CrCphDb,
  crId: T,
): Promise<T | string> {
  if (!crId) return crId
  const cr = await db.codigoRegistro.findUnique({
    where: { id: crId },
    select: { codigo: true, escalafonId: true },
  })
  if (!cr || cr.codigo !== CR_CPH_DUPLICADO) return crId
  const vigente = await db.codigoRegistro.findFirst({
    where: { codigo: CR_CPH_VIGENTE, escalafonId: cr.escalafonId },
    select: { id: true },
  })
  if (!vigente) return crId
  logger.warn({ desde: crId, hacia: vigente.id }, 'CR CPH 22 normalizado a 37')
  return vigente.id
}
// Subconjunto para normalizar el CR de un cargo existente.
export interface CargoCrCphDb extends CrCphDb {
  cargo: {
    findUnique(args: {
      where: { id: string }
      select: { codigoRegistroId: true }
    }): Promise<{ codigoRegistroId: string | null } | null>
    update(args: { where: { id: string }; data: { codigoRegistroId: string } }): Promise<unknown>
  }
}
/** Si el cargo tiene CR 22 (CPH), lo corrige a 37. Devuelve true si lo cambió. */
export async function normalizarCrCphDeCargo(db: CargoCrCphDb, cargoId: string): Promise<boolean> {
  const cargo = await db.cargo.findUnique({ where: { id: cargoId }, select: { codigoRegistroId: true } })
  if (!cargo?.codigoRegistroId) return false
  const nuevo = await normalizarCrCphId(db, cargo.codigoRegistroId)
  if (nuevo === cargo.codigoRegistroId) return false
  await db.cargo.update({ where: { id: cargoId }, data: { codigoRegistroId: nuevo } })
  return true
}
