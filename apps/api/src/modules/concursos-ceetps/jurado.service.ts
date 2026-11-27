// =============================================================================
// Jurado de concursos CEETPS (Etapa 2) — asignación manual, reemplaza el sorteo.
// =============================================================================
// Primero se fijan los lugares (titulares y suplentes); después se asignan
// personas con un cargo vigente, activo y ocupado, hasta completarlos. Los datos
// de la persona (nombre, CUIL, hospital, puesto) se congelan al asignar.

import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { AgregarMiembroJuradoBody, CantidadesJuradoBody } from './jurado.schema.js'
import { cargarConcursoCeetps, cargarConcursoCeetpsEditable } from './concursoEditable.js'

type Rol = 'titular' | 'suplente'

const ORDEN_MIEMBROS = [{ rol: 'desc' as const }, { orden: 'asc' as const }] // titular antes que suplente

export async function getJuradoCeetpsService(concursoId: string) {
  const c = await cargarConcursoCeetps(concursoId)
  const miembros = await prisma.miembroJuradoCeetps.findMany({
    where: { concursoCeetpsId: concursoId },
    orderBy: ORDEN_MIEMBROS,
  })
  return { cantTitulares: c.juradoCantTitulares, cantSuplentes: c.juradoCantSuplentes, miembros }
}

function contarPorRol(miembros: { rol: string }[], rol: Rol) {
  return miembros.filter((m) => m.rol === rol).length
}

export async function setCantidadesJuradoService(concursoId: string, body: CantidadesJuradoBody) {
  await cargarConcursoCeetpsEditable(concursoId)
  const miembros = await prisma.miembroJuradoCeetps.findMany({
    where: { concursoCeetpsId: concursoId },
  })
  const titulares = contarPorRol(miembros, 'titular')
  const suplentes = contarPorRol(miembros, 'suplente')
  if (body.cantTitulares < titulares || body.cantSuplentes < suplentes) {
    throw AppError.conflict(
      `Ya hay ${titulares} titular(es) y ${suplentes} suplente(s) asignados. Quitá miembros antes de reducir los lugares.`,
    )
  }
  await prisma.concursoCeetps.update({
    where: { id: concursoId },
    data: { juradoCantTitulares: body.cantTitulares, juradoCantSuplentes: body.cantSuplentes },
  })
  return getJuradoCeetpsService(concursoId)
}

export async function agregarMiembroJuradoService(
  concursoId: string,
  body: AgregarMiembroJuradoBody,
) {
  try {
    await prisma.$transaction(async (tx) => {
      const c = await cargarConcursoCeetpsEditable(concursoId, tx)
      const lugares = body.rol === 'titular' ? c.juradoCantTitulares : c.juradoCantSuplentes
      if (c.juradoCantTitulares == null || c.juradoCantSuplentes == null) {
        throw AppError.conflict('Primero definí cuántos titulares y suplentes tiene el jurado.')
      }

      const miembros = await tx.miembroJuradoCeetps.findMany({
        where: { concursoCeetpsId: concursoId },
      })
      if (miembros.some((m) => m.personaId === body.personaId)) {
        throw AppError.conflict('La persona ya forma parte de este jurado.')
      }
      const delRol = miembros.filter((m) => m.rol === body.rol)
      if (delRol.length >= (lugares ?? 0)) {
        throw AppError.conflict(`Ya están cubiertos los lugares de ${body.rol}.`)
      }

      // Cargo vigente, activo y ocupado: ocupación sin fecha de fin sobre un
      // cargo vigente no eliminado, de una persona activa.
      const ocupacion = await tx.ocupacion.findFirst({
        where: {
          personaId: body.personaId,
          hasta: null,
          cargo: { estado: 'vigente', deletedAt: null },
          persona: { activo: true },
        },
        orderBy: { desde: 'desc' },
        select: {
          persona: { select: { id: true, apellidoNombre: true, cuil: true } },
          cargo: {
            select: { literalPuesto: true, hospital: { select: { nombre: true, sigla: true } } },
          },
        },
      })
      if (!ocupacion) {
        throw AppError.conflict(
          'La persona no tiene un cargo vigente ocupado: no puede integrar el jurado.',
        )
      }

      const orden = delRol.reduce((max, m) => Math.max(max, m.orden), 0) + 1
      await tx.miembroJuradoCeetps.create({
        data: {
          concursoCeetpsId: concursoId,
          personaId: body.personaId,
          rol: body.rol,
          orden,
          apellidoNombre: ocupacion.persona.apellidoNombre,
          cuil: ocupacion.persona.cuil,
          hospitalNombre:
            ocupacion.cargo.hospital?.nombre ?? ocupacion.cargo.hospital?.sigla ?? null,
          puesto: ocupacion.cargo.literalPuesto,
        },
      })
    })
  } catch (e) {
    // Carrera: otra pestaña asignó a la misma persona entre la lectura y el alta.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw AppError.conflict('La persona ya forma parte de este jurado.')
    }
    throw e
  }
  return getJuradoCeetpsService(concursoId)
}

export async function quitarMiembroJuradoService(concursoId: string, miembroId: string) {
  await prisma.$transaction(async (tx) => {
    await cargarConcursoCeetpsEditable(concursoId, tx)
    const miembro = await tx.miembroJuradoCeetps.findFirst({
      where: { id: miembroId, concursoCeetpsId: concursoId },
    })
    if (!miembro) throw AppError.notFound('Miembro del jurado no encontrado')
    await tx.miembroJuradoCeetps.delete({ where: { id: miembroId } })

    // Renumerar el rol para que el orden quede 1, 2, 3... sin huecos.
    const restantes = await tx.miembroJuradoCeetps.findMany({
      where: { concursoCeetpsId: concursoId, rol: miembro.rol },
      orderBy: { orden: 'asc' },
    })
    for (const [i, m] of restantes.entries()) {
      if (m.orden !== i + 1) {
        await tx.miembroJuradoCeetps.update({ where: { id: m.id }, data: { orden: i + 1 } })
      }
    }
  })
  return getJuradoCeetpsService(concursoId)
}
