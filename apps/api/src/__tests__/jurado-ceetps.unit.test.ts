import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Wizard CEETPS — Etapa 2: asignación manual del jurado (reemplaza el sorteo).
// Primero se fijan los lugares (titulares/suplentes), después se asignan
// personas con cargo vigente. Prisma simulado.
// =============================================================================
const concursoCeetps = { findUnique: vi.fn(), update: vi.fn() }
const miembroJuradoCeetps = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}
const ocupacion = { findFirst: vi.fn() }
const persona = { findUnique: vi.fn() }
const tx = { concursoCeetps, miembroJuradoCeetps, ocupacion, persona }
vi.mock('../shared/prisma.js', () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}))

const {
  getJuradoCeetpsService,
  setCantidadesJuradoService,
  agregarMiembroJuradoService,
  quitarMiembroJuradoService,
} = await import('../modules/concursos-ceetps/jurado.service.js')

const MSG_BLOQUEO = 'El concurso necesita la autorización de SGRASV para avanzar a la Etapa 2'
const otroMotivo = { motivoConcurso: 'alta_por_baja', autorizadoAt: null }
const nuevoSin = { motivoConcurso: 'nuevo_cargo', autorizadoAt: null }

function dadoConcurso(fila: object = {}, concurso: object = otroMotivo) {
  concursoCeetps.findUnique.mockResolvedValue({
    id: 'ce1',
    estado: 'autorizado',
    juradoCantTitulares: 2,
    juradoCantSuplentes: 1,
    concurso,
    ...fila,
  })
}

const ocupacionVigente = {
  persona: { id: 'p1', apellidoNombre: 'PEREZ, ANA', cuil: '27111111112', activo: true },
  cargo: { literalPuesto: 'ENFERMERA', hospital: { nombre: 'Hospital Argerich', sigla: 'HA' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  miembroJuradoCeetps.findMany.mockResolvedValue([])
  miembroJuradoCeetps.findFirst.mockResolvedValue(null)
  miembroJuradoCeetps.count.mockResolvedValue(0)
  miembroJuradoCeetps.create.mockResolvedValue({ id: 'm1' })
  concursoCeetps.update.mockResolvedValue({ id: 'ce1' })
  ocupacion.findFirst.mockResolvedValue(ocupacionVigente)
})

describe('getJuradoCeetpsService', () => {
  it('devuelve los lugares y los miembros ordenados', async () => {
    dadoConcurso()
    miembroJuradoCeetps.findMany.mockResolvedValue([{ id: 'm1', rol: 'titular', orden: 1 }])
    const j = await getJuradoCeetpsService('ce1')
    expect(j).toEqual({
      cantTitulares: 2,
      cantSuplentes: 1,
      miembros: [{ id: 'm1', rol: 'titular', orden: 1 }],
    })
    expect(miembroJuradoCeetps.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { concursoCeetpsId: 'ce1' } }),
    )
  })

  it('404 si el concurso no existe', async () => {
    concursoCeetps.findUnique.mockResolvedValue(null)
    await expect(getJuradoCeetpsService('nada')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('setCantidadesJuradoService', () => {
  it('guarda los lugares', async () => {
    dadoConcurso({ juradoCantTitulares: null, juradoCantSuplentes: null })
    await setCantidadesJuradoService('ce1', { cantTitulares: 3, cantSuplentes: 2 })
    expect(concursoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'ce1' },
      data: { juradoCantTitulares: 3, juradoCantSuplentes: 2 },
    })
  })

  it('409 al bajar los lugares por debajo de los miembros ya asignados', async () => {
    dadoConcurso()
    miembroJuradoCeetps.findMany.mockResolvedValue([
      { id: 'm1', rol: 'titular', orden: 1 },
      { id: 'm2', rol: 'titular', orden: 2 },
    ])
    await expect(
      setCantidadesJuradoService('ce1', { cantTitulares: 1, cantSuplentes: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(concursoCeetps.update).not.toHaveBeenCalled()
  })

  it('409 en concurso finalizado', async () => {
    dadoConcurso({ estado: 'finalizado' })
    await expect(
      setCantidadesJuradoService('ce1', { cantTitulares: 1, cantSuplentes: 0 }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('409 en cargo nuevo sin autorizar', async () => {
    dadoConcurso({}, nuevoSin)
    await expect(
      setCantidadesJuradoService('ce1', { cantTitulares: 1, cantSuplentes: 0 }),
    ).rejects.toMatchObject({ statusCode: 409, message: MSG_BLOQUEO })
  })
})

describe('agregarMiembroJuradoService', () => {
  it('agrega un titular elegible con los datos congelados y el siguiente orden', async () => {
    dadoConcurso()
    miembroJuradoCeetps.findMany.mockResolvedValue([
      { id: 'm0', personaId: 'p0', rol: 'titular', orden: 1 },
    ])
    await agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'titular' })
    expect(miembroJuradoCeetps.create).toHaveBeenCalledWith({
      data: {
        concursoCeetpsId: 'ce1',
        personaId: 'p1',
        rol: 'titular',
        orden: 2,
        apellidoNombre: 'PEREZ, ANA',
        cuil: '27111111112',
        hospitalNombre: 'Hospital Argerich',
        puesto: 'ENFERMERA',
      },
    })
  })

  it('busca la ocupación vigente: hasta null, cargo vigente sin borrar, persona activa', async () => {
    dadoConcurso()
    await agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'suplente' })
    expect(ocupacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personaId: 'p1',
          hasta: null,
          cargo: { estado: 'vigente', deletedAt: null },
          persona: { activo: true },
        },
      }),
    )
  })

  it('409 si la persona ya está en el jurado (aunque sea en el otro rol)', async () => {
    dadoConcurso()
    miembroJuradoCeetps.findMany.mockResolvedValue([
      { id: 'm1', personaId: 'p1', rol: 'titular', orden: 1 },
    ])
    await expect(
      agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'suplente' }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(miembroJuradoCeetps.create).not.toHaveBeenCalled()
  })

  it('409 si todavía no se definieron los lugares', async () => {
    dadoConcurso({ juradoCantTitulares: null, juradoCantSuplentes: null })
    await expect(
      agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'titular' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('409 si el rol ya está completo', async () => {
    dadoConcurso({ juradoCantSuplentes: 1 })
    miembroJuradoCeetps.findMany.mockResolvedValue([
      { id: 'm1', personaId: 'p9', rol: 'suplente', orden: 1 },
    ])
    await expect(
      agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'suplente' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('409 si la persona no tiene un cargo vigente', async () => {
    dadoConcurso()
    ocupacion.findFirst.mockResolvedValue(null)
    await expect(
      agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'titular' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('409 en concurso desierto', async () => {
    dadoConcurso({ estado: 'desierto' })
    await expect(
      agregarMiembroJuradoService('ce1', { personaId: 'p1', rol: 'titular' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('quitarMiembroJuradoService', () => {
  it('borra el miembro y renumera el orden de su rol', async () => {
    dadoConcurso()
    miembroJuradoCeetps.findFirst.mockResolvedValue({ id: 'm1', rol: 'titular', orden: 1 })
    miembroJuradoCeetps.findMany.mockResolvedValue([{ id: 'm2', rol: 'titular', orden: 2 }])
    await quitarMiembroJuradoService('ce1', 'm1')
    expect(miembroJuradoCeetps.delete).toHaveBeenCalledWith({ where: { id: 'm1' } })
    expect(miembroJuradoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'm2' },
      data: { orden: 1 },
    })
  })

  it('404 si el miembro no es de este concurso', async () => {
    dadoConcurso()
    miembroJuradoCeetps.findFirst.mockResolvedValue(null)
    await expect(quitarMiembroJuradoService('ce1', 'otro')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
