import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Tests de createSolicitudesAltaBatchService: envío de "Cargos pendientes" como
// un LOTE. UNA transacción crea las N solicitudes + N autorizaciones. Reemplaza
// las N requests que se pasaban del timeout de 5 s contra Neon.
//
// - crea N solicitudes + N autorizaciones (no-transferencia) en UNA tx
// - una transferencia se auto-aprueba (no crea autorización)
// - un item con catálogo inválido lanza ANTES de abrir la tx → el lote no se
//   crea a medias (no se llama $transaction)
//
// Se mockea el cliente Prisma y crearAutorizacion (su notificación usa prisma
// real y no es el foco de estos tests). Patrón del repo: *.unit.test.ts con
// vi.mock de ../shared/prisma.js.
// =============================================================================

const hospital       = { findMany: vi.fn() }
const escalafon      = { findMany: vi.fn() }
const puestoCargo    = { findMany: vi.fn() }
const codigoRegistro = { findMany: vi.fn() }
const especialidadPuesto = { findMany: vi.fn() }

const solicitudAlta  = { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() }
const etiqueta           = { findUnique: vi.fn(), create: vi.fn() }
const etiquetaSolicitudAlta = { create: vi.fn() }

const tx = { solicitudAlta, etiqueta, etiquetaSolicitudAlta }

const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx))

vi.mock('../shared/prisma.js', () => ({
  prisma: {
    hospital,
    escalafon,
    puestoCargo,
    codigoRegistro,
    especialidadPuesto,
    $transaction,
  },
}))

const crearAutorizacion = vi.fn()
vi.mock('../modules/autorizaciones/autorizaciones.service.js', () => ({
  crearAutorizacion: (...args: unknown[]) => crearAutorizacion(...args),
}))

const { createSolicitudesAltaBatchService } = await import('../modules/solicitudes-alta/solicitudes-alta.service.js')
const { AppError } = await import('../shared/errors/AppError.js')

// Catálogo base coherente para el happy path.
const HOSP = 'h1'
const ESC  = 'e1'
const PUE  = 'p1'

function baseItem(over: Record<string, unknown> = {}) {
  return {
    hospitalId:  HOSP,
    escalafonId: ESC,
    puestoCargoId: PUE,
    cantidad: 1,
    ...over,
  }
}

function cargarCatalogoValido() {
  hospital.findMany.mockResolvedValue([{ id: HOSP }])
  escalafon.findMany.mockResolvedValue([{ id: ESC }])
  puestoCargo.findMany.mockResolvedValue([{ id: PUE, nombre: 'Medico de planta', escalafonId: ESC }])
  codigoRegistro.findMany.mockResolvedValue([])
  especialidadPuesto.findMany.mockResolvedValue([])
  // create devuelve una solicitud con id incremental; findUnique hace el readback
  let n = 0
  solicitudAlta.create.mockImplementation(async () => ({ id: `s${++n}` }))
  solicitudAlta.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, estado: 'pendiente' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createSolicitudesAltaBatchService', () => {
  it('crea N solicitudes + N autorizaciones en UNA sola transacción', async () => {
    cargarCatalogoValido()
    const items = Array.from({ length: 11 }, () => baseItem({ expediente: 'Prueba_1' }))

    const res = await createSolicitudesAltaBatchService({ items }, 'u1')

    expect($transaction).toHaveBeenCalledTimes(1)           // UNA transacción para todo el lote
    expect(solicitudAlta.create).toHaveBeenCalledTimes(11)  // 11 solicitudes
    expect(crearAutorizacion).toHaveBeenCalledTimes(11)     // 11 autorizaciones (director)
    expect(solicitudAlta.update).not.toHaveBeenCalled()     // ninguna transferencia
    expect(res).toHaveLength(11)
    // Cada autorización apunta a su solicitud y la resuelve el director.
    expect(crearAutorizacion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tipo: 'alta_cargo', resolverPorRolSlug: 'director', referenciaTipo: 'solicitud_alta' }),
    )
  })

  it('usa el timeout holgado (no el default de 5 s) para el batch', async () => {
    cargarCatalogoValido()
    await createSolicitudesAltaBatchService({ items: [baseItem()] }, 'u1')
    // El 2º argumento de $transaction son las opciones de la tx.
    const opts = $transaction.mock.calls[0]![1] as { timeout: number; maxWait: number }
    expect(opts.timeout).toBeGreaterThanOrEqual(30_000)
    expect(opts.maxWait).toBeGreaterThanOrEqual(10_000)
  })

  it('una transferencia se auto-aprueba y NO crea autorización', async () => {
    cargarCatalogoValido()
    const items = [baseItem({ esTransferencia: true })]

    await createSolicitudesAltaBatchService({ items }, 'u1')

    expect(crearAutorizacion).not.toHaveBeenCalled()
    expect(solicitudAlta.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'aprobada' } }),
    )
  })

  it('un item con puesto de otro escalafón lanza ANTES de abrir la tx (lote atómico)', async () => {
    cargarCatalogoValido()
    // El puesto pertenece a ESC, pero el item 2 declara otro escalafón.
    escalafon.findMany.mockResolvedValue([{ id: ESC }, { id: 'e2' }])
    const items = [baseItem(), baseItem({ escalafonId: 'e2' })]

    await expect(createSolicitudesAltaBatchService({ items }, 'u1')).rejects.toBeInstanceOf(AppError)
    // Nunca se abrió la transacción: nada se creó a medias.
    expect($transaction).not.toHaveBeenCalled()
    expect(solicitudAlta.create).not.toHaveBeenCalled()
  })

  it('un hospital inexistente lanza notFound sin abrir la tx', async () => {
    cargarCatalogoValido()
    hospital.findMany.mockResolvedValue([]) // ningún hospital válido

    await expect(createSolicitudesAltaBatchService({ items: [baseItem()] }, 'u1'))
      .rejects.toMatchObject({ statusCode: 404 })
    expect($transaction).not.toHaveBeenCalled()
  })
})
