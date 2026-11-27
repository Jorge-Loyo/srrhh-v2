import { describe, it, expect, vi, beforeEach } from 'vitest'

// Etapa 5: "No apto" guarda el historial del candidato, lo excluye del orden de
// mérito y deja la Etapa 5 en blanco. Además: el PATCH rechaza fechas fuera de orden.
const concursoCeetps = { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() }
const inscriptoCeetps = { findUnique: vi.fn() }
const designacionHistorialCeetps = { create: vi.fn(), findMany: vi.fn() }
const tx = { concursoCeetps, inscriptoCeetps, designacionHistorialCeetps }
vi.mock('../shared/prisma.js', () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({
  crearNotificacion: vi.fn(),
}))
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: vi.fn() }))
vi.mock('../modules/tareas/tareas.service.js', () => ({
  crearTareaPendiente: vi.fn(),
  mensajeTareaRechazo: vi.fn(() => 'motivo'),
}))

const { registrarNoAptoCeetpsService, patchConcursoCeetpsService } =
  await import('../modules/concursos-ceetps/concursos-ceetps.service.js')

const concursoBase = { motivoConcurso: 'alta_por_baja', autorizadoAt: null }
const fila = {
  id: 'ce1',
  estado: 'en_proceso',
  concurso: concursoBase,
  codigoSial: null,
  inscriptoReservadoId: 'i1',
  insalRechazados: ['i0'],
  designadoRefCuil: '20111111112',
  designadoRefNombre: 'PEREZ, ANA',
  expedienteDesignacion: 'EX-1',
  fechaAptoMedico: new Date('2026-07-10'),
  numeroAptoMedico: 'NO-123',
  proyectoResolucion: true,
  dispoDesignacion: 'DI-9',
  fechaDispoDesignacion: new Date('2026-07-20'),
  resoALaFirma: null,
  resolucionConvalidacion: null,
  fechaIfacs: new Date('2026-06-01'),
  fechaInsal: new Date('2026-06-15'),
  expedienteConcurso: 'EE',
  fechaCaratulacion: null,
  puestoSolicitado: 'X',
  dispoLlamado: 'D',
  resolucionDesignacion: null,
  cronograma: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  concursoCeetps.findUnique.mockResolvedValue(fila)
  concursoCeetps.findUniqueOrThrow.mockResolvedValue(fila)
  inscriptoCeetps.findUnique.mockResolvedValue({
    id: 'i1',
    apellido: 'PEREZ',
    nombre: 'ANA',
    cuil: '20111111112',
  })
  concursoCeetps.update.mockResolvedValue({ id: 'ce1' })
})

describe('registrarNoAptoCeetpsService', () => {
  it('guarda el historial, excluye al candidato y limpia la Etapa 5', async () => {
    await registrarNoAptoCeetpsService('ce1')
    const hist = designacionHistorialCeetps.create.mock.calls[0][0].data
    expect(hist).toMatchObject({
      concursoCeetpsId: 'ce1',
      inscriptoId: 'i1',
      apellidoNombre: 'PEREZ, ANA',
      motivo: 'no_apto',
      numeroNota: 'NO-123',
    })
    expect(hist.datos).toMatchObject({
      dispoDesignacion: 'DI-9',
      estadoApto: 'NO APTO',
      fechaInsal: '2026-06-15',
    })
    const upd = concursoCeetps.update.mock.calls[0][0].data
    expect(upd).toMatchObject({
      inscriptoReservadoId: null,
      insalRechazados: ['i0', 'i1'],
      dispoDesignacion: null,
      fechaAptoMedico: null,
      proyectoResolucion: null,
      fechaInsal: null,
      designadoRefCuil: null,
      personaDesignadaId: null,
    })
    expect(upd.fechaIfacs).toBeUndefined() // IFACS es del concurso: se conserva
    expect(upd.subEstado).toBe('IFACS') // sin INSAL, vuelve a la etapa 4
  })

  it('409 si el padrón ya enganchó un ID SIAL', async () => {
    concursoCeetps.findUniqueOrThrow.mockResolvedValue({ ...fila, codigoSial: '123' })
    await expect(registrarNoAptoCeetpsService('ce1')).rejects.toThrow(/ID SIAL/)
    expect(designacionHistorialCeetps.create).not.toHaveBeenCalled()
  })

  it('409 si no hay candidato propuesto', async () => {
    const sin = { ...fila, inscriptoReservadoId: null, designadoRefNombre: null }
    concursoCeetps.findUnique.mockResolvedValue(sin)
    concursoCeetps.findUniqueOrThrow.mockResolvedValue(sin)
    await expect(registrarNoAptoCeetpsService('ce1')).rejects.toThrow(/No hay un candidato/)
  })

  it('409 si el concurso está finalizado', async () => {
    concursoCeetps.findUnique.mockResolvedValue({ ...fila, estado: 'finalizado' })
    await expect(registrarNoAptoCeetpsService('ce1')).rejects.toThrow(/finalizado/)
  })
})

describe('patchConcursoCeetpsService — orden de fechas', () => {
  it('rechaza (400) una fecha anterior a un paso previo', async () => {
    await expect(
      patchConcursoCeetpsService('ce1', { fechaAptoMedico: '2026-06-10' }, 'u1'),
    ).rejects.toThrow(/no puede ser anterior a «Fecha INSAL»/)
    expect(concursoCeetps.update).not.toHaveBeenCalled()
  })

  it('acepta una fecha igual o posterior', async () => {
    await patchConcursoCeetpsService('ce1', { fechaAptoMedico: '2026-06-15' }, 'u1')
    expect(concursoCeetps.update).toHaveBeenCalled()
  })
})
