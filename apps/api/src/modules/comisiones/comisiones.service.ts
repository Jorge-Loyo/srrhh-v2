import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { RegistrarComisionBody } from './comisiones.schema.js'

// ─── S19-6: registrar una comisión ──────────────────────────────────────────
// Una comisión NO es una entidad separada: es la ocupación activa de la persona
// marcada con situacionRevista = 'comision' + los campos comision/repaComision/
// crComentario. El cargo de origen sigue ocupado (no se toca `hasta`) — la
// persona está prestando servicios en otra repartición pero conserva su cargo.
// S22-2/S22-3 (Dotaneitor): normalización total a minúscula sin tilde — los
// literales de situacionRevista se comparan/escriben siempre en minúscula
// ('activo'/'comision'/'retencion de cargo'), nunca con mayúscula ni tilde.
export async function registrarComisionService(body: RegistrarComisionBody) {
  const ocupacion = await prisma.ocupacion.findUnique({
    where: { id: body.ocupacionId },
    include: { persona: { select: { id: true, apellidoNombre: true, cuil: true } } },
  })
  if (!ocupacion) throw AppError.notFound('Ocupación no encontrada')
  if (ocupacion.hasta !== null) {
    throw AppError.conflict('La ocupación no está activa — no se puede poner en comisión')
  }
  if (ocupacion.situacionRevista === 'comision') {
    throw AppError.conflict('La ocupación ya está en comisión')
  }

  // No puede haber otra comisión activa de la misma persona en paralelo.
  const otraComision = await prisma.ocupacion.findFirst({
    where: {
      personaId: ocupacion.personaId,
      hasta: null,
      situacionRevista: 'comision',
      id: { not: ocupacion.id },
    },
  })
  if (otraComision) {
    throw AppError.conflict('La persona ya tiene una comisión activa')
  }

  return prisma.ocupacion.update({
    where: { id: ocupacion.id },
    data: {
      situacionRevista: 'comision',
      comision: body.comision,
      repaComision: body.repaComision,
      crComentario: body.crComentario ?? null,
    },
  })
}

// ─── S19-7: fin manual de comisión ──────────────────────────────────────────
// Vuelve la ocupación a 'activo' y limpia los campos de comisión. Solo se usa
// cuando el fin lo registra SGRASV a mano; si Meta4 (padrón) trae el cambio de
// 'comision' → 'activo' primero, aprobarSnapshotService ya lo actualiza.
export async function finComisionService(ocupacionId: string) {
  const ocupacion = await prisma.ocupacion.findUnique({ where: { id: ocupacionId } })
  if (!ocupacion) throw AppError.notFound('Ocupación no encontrada')
  if (ocupacion.situacionRevista !== 'comision') {
    throw AppError.conflict('La ocupación no está en comisión')
  }

  return prisma.ocupacion.update({
    where: { id: ocupacionId },
    data: {
      situacionRevista: 'activo',
      comision: null,
      repaComision: null,
      crComentario: null,
    },
  })
}
