// Acceso a los HECHOS que necesita `calcularSubEstado` (subEstado.ts) dentro
// de una transacción Prisma, para no repetir las dos queries en cada servicio.
//
// "Concurso activo" es el espejo exacto del CTE `conc` de
// incidencias.baja-sin-concurso.ts (misma definición que Incidencias):
//   - CPH activo  : estado IN (no_iniciado, activo, suspendido)  = NOT finalizado
//   - CEETPS activo: estado IN (sin_autorizar, autorizado, en_proceso)
//                    = NOT (finalizado, desierto)
// Los enums terminales están confirmados en prisma/schema.prisma
// (EstadoConcursoCph / EstadoConcursoCeetps).
import { prisma } from '../../shared/prisma.js'
import { calcularSubEstado } from './subEstado.js'
import type { SubEstadoCargo } from '@srrhh/types'

// Mismo tipo de transacción que usan los servicios (createConcursoTx, etc.).
export type SubEstadoTx = Omit<
  Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/** ¿El cargo tiene al menos una ocupación viva (hasta IS NULL)? */
export async function tieneOcupanteVigente(tx: SubEstadoTx, cargoId: string): Promise<boolean> {
  const n = await tx.ocupacion.count({ where: { cargoId, hasta: null } })
  return n > 0
}

/** ¿El cargo tiene algún concurso CPH o CEETPS en estado no terminal (activo)? */
export async function tieneConcursoActivo(tx: SubEstadoTx, cargoId: string): Promise<boolean> {
  const [cph, ceetps] = await Promise.all([
    tx.concursoCph.count({ where: { cargoId, estado: { not: 'finalizado' } } }),
    tx.concursoCeetps.count({ where: { cargoId, estado: { notIn: ['finalizado', 'desierto'] } } }),
  ])
  return cph > 0 || ceetps > 0
}

/**
 * Recalcula el sub_estado del cargo (vigente) leyendo ocupante y concurso
 * dentro de la MISMA transacción, y devuelve el valor según `calcularSubEstado`.
 * Para estados distintos de 'vigente' no hace falta consultar nada: es null.
 */
export async function recalcularSubEstado(
  tx: SubEstadoTx,
  cargoId: string,
  estado: string,
): Promise<SubEstadoCargo | null> {
  if (estado !== 'vigente') return calcularSubEstado({ estado, tieneOcupanteVigente: false, tieneConcursoActivo: false })
  const [ocupante, concurso] = await Promise.all([
    tieneOcupanteVigente(tx, cargoId),
    tieneConcursoActivo(tx, cargoId),
  ])
  return calcularSubEstado({ estado, tieneOcupanteVigente: ocupante, tieneConcursoActivo: concurso })
}
