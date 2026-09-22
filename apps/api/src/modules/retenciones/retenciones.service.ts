import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  esConduccionPorPrefijo,
  esConduccionPorLiteral,
  prefijoDeCargo,
  prefijoRemplazante,
  siguienteCodigoCargo,
} from '../../shared/codigoCargo.js'
import type { RegistrarRetencionBody, TitularCesaBody } from './retenciones.schema.js'

const include = {
  hospital: true,
  escalafon: true,
  codigoRegistro: true,
} satisfies Prisma.CargoInclude

function esCargoDeConduccion(cargo: { codigo: string | null; literalPuesto: string | null }): boolean {
  if (cargo.codigo) return esConduccionPorPrefijo(cargo.codigo)
  return esConduccionPorLiteral(cargo.literalPuesto)
}

// Prefiere el prefijo del código YA asignado al cargo (misma lógica que usa
// scripts/backfill_cadenas_retencion.mjs) en vez de recalcularlo desde
// escalafón/unificador/agrupador — esos campos pueden haberse editado o
// mapeado distinto históricamente y dar un prefijo distinto al que el cargo
// realmente tiene en su código (ej. remplazante CPH-POF-R-… sobre un cargo
// cuyo código real es CPH-J-POF-…). Solo cae al cálculo si no hay código
// (cargos legacy sin codificar).
function prefijoDelCargo(cargo: {
  codigo: string | null
  escalafon: { nombre: string }
  unificadorPuesto: string | null
  agrupador: string | null
}): string {
  if (cargo.codigo) return cargo.codigo.replace(/-\d{6}$/, '')
  return prefijoDeCargo({
    escalafon: cargo.escalafon.nombre,
    unificadorPuesto: cargo.unificadorPuesto,
    agrupador: cargo.agrupador,
  })
}

// ─── S18-4: registrar retención — genera el cargo remplazante (R o TTR) ─────
export async function registrarRetencionService(body: RegistrarRetencionBody) {
  const cargo = await prisma.cargo.findUnique({ where: { id: body.cargoId }, include })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const ocupacionActiva = await prisma.ocupacion.findFirst({
    where: { cargoId: cargo.id, hasta: null },
    include: { persona: true },
  })
  if (!ocupacionActiva) throw AppError.conflict('El cargo no tiene una ocupación activa para retener')

  const conduccion = esCargoDeConduccion(cargo)
  const tipoOrigen = conduccion ? 'TTR' : 'R'

  if (tipoOrigen === 'TTR' && (!body.periodoDesde || !body.periodoHasta)) {
    throw AppError.badRequest('periodoDesde y periodoHasta son obligatorios para retener un cargo de conducción')
  }

  const cargoBaseId = cargo.cargoBaseId ?? cargo.id

  return prisma.$transaction(async (tx) => {
    // Revalidar dentro de la transacción (no solo antes) para achicar la
    // ventana de carrera entre dos POST simultáneos sobre el mismo cargo.
    const remplazanteExistente = await tx.cargo.findFirst({
      where: { cargoRetenidoId: cargo.id, estado: 'vigente' },
    })
    if (remplazanteExistente) {
      throw AppError.conflict('El cargo ya tiene un remplazante vigente — no se puede retener dos veces')
    }

    // R-01: no se puede retener un cargo de ejecución si la persona ya tiene
    // otro cargo de ejecución activo simultáneamente — en ese caso
    // corresponde una baja del cargo anterior, no una retención.
    if (!conduccion) {
      const otrasActivas = await tx.ocupacion.findMany({
        where: { personaId: ocupacionActiva.personaId, hasta: null, cargoId: { not: cargo.id } },
        include: { cargo: true },
      })
      const otraEjecucion = otrasActivas.find((o) => !esCargoDeConduccion(o.cargo))
      if (otraEjecucion) {
        throw AppError.conflict(
          'La persona ya tiene otro cargo de ejecución activo — no puede retener ejecución con ejecución, corresponde una baja'
        )
      }
    }

    await tx.ocupacion.update({
      where: { id: ocupacionActiva.id },
      data: {
        situacionRevista: 'Retencion de Cargo',
        srDocRespaldo: body.srDocRespaldo,
        srComentario: body.srComentario ?? null,
      },
    })

    const prefijo = prefijoRemplazante(prefijoDelCargo(cargo), tipoOrigen)
    const codigo = await siguienteCodigoCargo(prefijo, tx)

    const remplazante = await tx.cargo.create({
      data: {
        idSial: `SISTEMA-${randomUUID().slice(0, 8)}`,
        codigo,
        hospitalId: cargo.hospitalId,
        escalafonId: cargo.escalafonId,
        codigoRegistroId: cargo.codigoRegistroId,
        literalPuesto: cargo.literalPuesto,
        agrupador: cargo.agrupador,
        unificadorPuesto: cargo.unificadorPuesto,
        regimen: cargo.regimen,
        codigoRepa: cargo.codigoRepa,
        estado: 'vigente',
        estadoDesde: new Date(),
        tipoOrigen,
        cargoRetenidoId: cargo.id,
        cargoBaseId,
        ...(tipoOrigen === 'TTR' && {
          periodoDesde: new Date(body.periodoDesde!),
          periodoHasta: new Date(body.periodoHasta!),
        }),
      },
      include,
    })

    return { remplazante, cadena: await getCadenaRetencionTx(tx, cargoBaseId) }
  })
}

// ─── S18-4: consultar la cadena completa de un cargo ────────────────────────
export async function getCadenaRetencionService(cargoId: string) {
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const cargoBaseId = cargo.cargoBaseId ?? cargo.id
  return getCadenaRetencionTx(prisma, cargoBaseId)
}

type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

async function getCadenaRetencionTx(tx: TxClient, cargoBaseId: string) {
  const cargos = await tx.cargo.findMany({
    where: { OR: [{ id: cargoBaseId }, { cargoBaseId }] },
    include: { ocupaciones: { where: { hasta: null }, include: { persona: true } } },
  })

  const nodos = []
  // visitados: guarda contra ciclos (no deberían existir, pero un recorrido
  // sin protección puede colgar el proceso — Node es single-threaded y este
  // while no tiene ningún await adentro).
  const visitados = new Set<string>()
  let actual = cargos.find((c) => c.id === cargoBaseId)
  while (actual && !visitados.has(actual.id)) {
    visitados.add(actual.id)
    const ocup = actual.ocupaciones[0]
    nodos.push({
      id: actual.id,
      codigo: actual.codigo,
      literalPuesto: actual.literalPuesto,
      tipoOrigen: actual.tipoOrigen as 'R' | 'TTR' | null,
      estado: actual.estado,
      estaOcupado: actual.ocupaciones.length > 0,
      ocupanteNombre: ocup?.persona.apellidoNombre,
      ocupanteCuil: ocup?.persona.cuil,
      periodoDesde: actual.periodoDesde?.toISOString().slice(0, 10) ?? null,
      periodoHasta: actual.periodoHasta?.toISOString().slice(0, 10) ?? null,
      cargoRetenidoId: actual.cargoRetenidoId,
    })
    // Si por algún motivo hay más de un remplazante para el mismo nodo
    // (no debería, registrarRetencionService lo previene), preferir el
    // vigente en vez de uno viejo elegido arbitrariamente.
    const siguientes = cargos.filter((c) => c.cargoRetenidoId === actual!.id)
    actual = siguientes.find((c) => c.estado === 'vigente') ?? siguientes[0]
  }

  return { cargoBaseId, nodos }
}

// ─── Validación de retenciones: personas con 2+ cargos activos simultáneos
// sin que ninguno esté ya formalizado como retención ni comisión ─────────────
export async function listValidacionRetencionesService() {
  const rows = await prisma.$queryRaw<{ persona_id: string }[]>`
    SELECT persona_id
    FROM ocupaciones
    WHERE hasta IS NULL
    GROUP BY persona_id
    HAVING count(*) > 1
       AND count(*) FILTER (WHERE situacion_revista IN ('Retencion de Cargo', 'Comision')) = 0
  `
  const personaIds = rows.map((r) => r.persona_id)
  if (personaIds.length === 0) return []

  const personas = await prisma.persona.findMany({
    where: { id: { in: personaIds } },
    select: {
      id: true,
      apellidoNombre: true,
      cuil: true,
      ocupaciones: {
        where: { hasta: null },
        include: {
          cargo: {
            include: { hospital: { select: { sigla: true, nombre: true } }, escalafon: { select: { nombre: true } } },
          },
        },
      },
    },
    orderBy: { apellidoNombre: 'asc' },
  })

  return personas.map((p) => ({
    persona: { id: p.id, apellidoNombre: p.apellidoNombre, cuil: p.cuil },
    cargos: p.ocupaciones.map((o) => ({
      id: o.cargo.id,
      codigo: o.cargo.codigo,
      literalPuesto: o.cargo.literalPuesto,
      tipoOrigen: o.cargo.tipoOrigen as 'R' | 'TTR' | null,
      estado: o.cargo.estado,
      hospital: o.cargo.hospital,
      escalafon: o.cargo.escalafon,
      situacionRevista: o.situacionRevista,
    })),
  }))
}

// ─── S18-5: cargo + su remplazante directo, si existe ───────────────────────
export async function getCargoConRemplazanteService(cargoId: string) {
  const cargo = await prisma.cargo.findUnique({
    where: { id: cargoId },
    include: {
      ...include,
      remplazantes: { where: { estado: 'vigente' }, include },
      cargoRetenido: { include },
    },
  })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')
  return cargo
}

// ─── S18-9: titular cesa — el ocupante del cargo R hereda el cargo titular ──
export async function titularCesaService(body: TitularCesaBody) {
  const cargo = await prisma.cargo.findUnique({ where: { id: body.cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const hoy = new Date()

  return prisma.$transaction(async (tx) => {
    // Revalidar todo dentro de la transacción (no solo antes) — igual
    // criterio que registrarRetencionService, para achicar la ventana de
    // carrera entre dos titular-cesa simultáneos sobre el mismo cargo.
    const ocupacionTitular = await tx.ocupacion.findFirst({ where: { cargoId: cargo.id, hasta: null } })
    if (!ocupacionTitular) throw AppError.conflict('El cargo no tiene titular activo')

    // estado: 'vigente' — si el cargo ya pasó por un ciclo anterior de
    // retención + titular-cesa, puede haber un R viejo (no_vigente) además
    // del actual; sin este filtro findFirst podría devolver cualquiera.
    const cargoR = await tx.cargo.findFirst({
      where: { cargoRetenidoId: cargo.id, tipoOrigen: 'R', estado: 'vigente' },
      orderBy: { createdAt: 'desc' },
    })
    if (!cargoR) throw AppError.notFound('El cargo no tiene un cargo R asociado')

    const ocupacionR = await tx.ocupacion.findFirst({ where: { cargoId: cargoR.id, hasta: null } })
    if (!ocupacionR || ocupacionR.personaId !== body.ocupanteRId) {
      throw AppError.conflict('El ocupante indicado no coincide con el ocupante activo del cargo R')
    }

    await tx.ocupacion.update({
      where: { id: ocupacionTitular.id },
      data: { hasta: hoy, documentacionBaja: body.docRespaldo },
    })

    await tx.ocupacion.update({
      where: { id: ocupacionR.id },
      data: { hasta: hoy, documentacionBaja: body.docRespaldo },
    })

    await tx.ocupacion.create({
      data: {
        personaId: body.ocupanteRId,
        cargoId: cargo.id,
        // random, no determinístico por cargo+fecha — dos ciclos de
        // titular-cesa sobre el mismo cargo el mismo día generarían el
        // mismo idSialRol y violarían la unicidad
        idSialRol: `SISTEMA-${randomUUID().slice(0, 8)}`,
        desde: hoy,
        hasta: null,
        situacionRevista: 'Activo',
      },
    })

    const cargoRActualizado = await tx.cargo.update({
      where: { id: cargoR.id },
      data: { estado: 'no_vigente', estadoDesde: hoy },
    })

    const cargoActualizado = await tx.cargo.findUnique({ where: { id: cargo.id }, include })

    return { cargo: cargoActualizado, cargoR: cargoRActualizado }
  })
}
