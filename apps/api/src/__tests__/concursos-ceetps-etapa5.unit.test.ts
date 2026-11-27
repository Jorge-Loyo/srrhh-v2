import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Wizard CEETPS — campos nuevos del PATCH: Etapa 5 (designación), puntajes
// mínimos y cronograma de la Etapa 3. Schema + guardado con prisma simulado.
// =============================================================================
const concursoCeetps = { findUnique: vi.fn(), update: vi.fn() }
const autorizacion = { findFirst: vi.fn() }
const usuario = { findUnique: vi.fn() }
const tx = { concursoCeetps, autorizacion, usuario }
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

const { patchConcursoCeetpsSchema } =
  await import('../modules/concursos-ceetps/concursos-ceetps.schema.js')
const { patchConcursoCeetpsService } =
  await import('../modules/concursos-ceetps/concursos-ceetps.service.js')
const { camposEtapa2Modificados } =
  await import('../modules/concursos-ceetps/autorizacionNuevoCargo.js')

const MSG = 'El concurso necesita la autorización de SGRASV para avanzar a la Etapa 2'
const nuevoSin = { motivoConcurso: 'nuevo_cargo', autorizadoAt: null }
const otroMotivo = { motivoConcurso: 'alta_por_baja', autorizadoAt: null }

const filaBase = {
  id: 'ce1',
  concursoId: 'c1',
  cargoId: 'cg1',
  estado: 'autorizado',
  subEstado: null,
  expedienteConcurso: 'EE-1',
  ifAutorizacion: null,
  fechaCaratulacion: null,
  fechaAutorizacion: null,
  puestoSolicitado: null,
  dispoLlamado: null,
  fechaIfacs: null,
  fechaInsal: null,
  expedienteDesignacion: null,
  dispoDesignacion: null,
  resolucionDesignacion: null,
  puestoDesignado: null,
  estadoApto: null,
  numeroAptoMedico: null,
  fechaProyectoDispo: null,
  altaSial: null,
  codigoSial: null,
  tramiteDesignacion: null,
  fechaResolucion: null,
  cronograma: {},
}

function dado(concursoRow: object, fila: object = {}) {
  concursoCeetps.findUnique.mockResolvedValue({
    ...filaBase,
    ...fila,
    concurso: { ...concursoRow, cargo: { codigo: 'CEE-1' } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  concursoCeetps.update.mockResolvedValue({ id: 'ce1' })
  autorizacion.findFirst.mockResolvedValue(null)
})

describe('patchConcursoCeetpsSchema — campos nuevos', () => {
  it('acepta los campos nuevos de etapa 5, puntajes mínimos y cronograma', () => {
    expect(() =>
      patchConcursoCeetpsSchema.parse({
        cargaDocumentacion: true,
        tramiteDesignacion: 'gene1303',
        fechaAptoMedico: '2026-11-01',
        fechaDispoDesignacion: '2026-11-02',
        resolucionConvalidacion: 'RESFC-1',
        proyectoResolucion: false,
        resoALaFirma: true,
        fechaResolucion: '2026-11-03',
        puntajeMinimoExamen: 60,
        puntajeMinimoCv: 7.5,
        puntajeMinimoEntrevista: null,
        cronograma: { examen: '2026-09-10', inscripcion_desde: null },
      }),
    ).not.toThrow()
  })

  it('rechaza fechaIte y los lugares del jurado (tienen endpoint propio)', () => {
    expect(() => patchConcursoCeetpsSchema.parse({ fechaIte: '2026-11-01' })).toThrow()
    expect(() => patchConcursoCeetpsSchema.parse({ juradoCantTitulares: 3 })).toThrow()
  })

  it('rechaza tramiteDesignacion fuera de tad/gene1303', () => {
    expect(() => patchConcursoCeetpsSchema.parse({ tramiteDesignacion: 'otro' })).toThrow()
    expect(() => patchConcursoCeetpsSchema.parse({ tramiteDesignacion: 'tad' })).not.toThrow()
  })

  it('rechaza claves de cronograma desconocidas y fechas mal formadas', () => {
    expect(() =>
      patchConcursoCeetpsSchema.parse({ cronograma: { cualquiera: '2026-09-10' } }),
    ).toThrow()
    expect(() =>
      patchConcursoCeetpsSchema.parse({ cronograma: { examen: '10/09/2026' } }),
    ).toThrow()
  })

  it('rechaza puntajes mínimos negativos', () => {
    expect(() => patchConcursoCeetpsSchema.parse({ puntajeMinimoExamen: -1 })).toThrow()
  })
})

describe('patchConcursoCeetpsService — campos nuevos', () => {
  it('convierte las fechas nuevas a Date al guardar', async () => {
    dado(otroMotivo)
    await patchConcursoCeetpsService(
      'ce1',
      {
        fechaResolucion: '2026-11-02',
        fechaAptoMedico: '2026-11-01',
        fechaDispoDesignacion: '2026-11-03',
      },
      'u1',
    )
    const data = concursoCeetps.update.mock.calls[0][0].data
    expect(data.fechaResolucion).toBeInstanceOf(Date)
    expect(data.fechaAptoMedico).toBeInstanceOf(Date)
    expect(data.fechaDispoDesignacion).toBeInstanceOf(Date)
  })

  it('guarda el cronograma tal cual (las fechas quedan como texto dentro del JSON)', async () => {
    dado(otroMotivo)
    await patchConcursoCeetpsService('ce1', { cronograma: { examen: '2026-09-10' } }, 'u1')
    expect(concursoCeetps.update.mock.calls[0][0].data.cronograma).toEqual({ examen: '2026-09-10' })
  })

  it('cargo nuevo sin autorizar: cambiar tramiteDesignacion devuelve 409 y no escribe', async () => {
    dado(nuevoSin)
    await expect(
      patchConcursoCeetpsService('ce1', { tramiteDesignacion: 'tad' }, 'u1'),
    ).rejects.toMatchObject({ statusCode: 409, message: MSG })
    expect(concursoCeetps.update).not.toHaveBeenCalled()
  })
})

describe('camposEtapa2Modificados — cronograma y puntajes', () => {
  it('un cronograma con el mismo contenido no cuenta como cambio (orden de claves y nulls no importan)', () => {
    const existing = {
      ...filaBase,
      cronograma: { examen: '2026-09-10', inscripcion_desde: '2026-08-27' },
    }
    expect(
      camposEtapa2Modificados(
        {
          cronograma: {
            inscripcion_desde: '2026-08-27',
            examen: '2026-09-10',
            entrevistas_desde: null,
          },
        },
        existing,
      ),
    ).toEqual([])
    expect(camposEtapa2Modificados({ cronograma: {} }, { ...filaBase, cronograma: {} })).toEqual([])
  })

  it('un cronograma con una fecha distinta sí cuenta como cambio', () => {
    const existing = { ...filaBase, cronograma: { examen: '2026-09-10' } }
    expect(camposEtapa2Modificados({ cronograma: { examen: '2026-09-11' } }, existing)).toEqual([
      'cronograma',
    ])
  })

  it('puntajes mínimos y campos de etapa 5 cuentan como Etapa 2+', () => {
    expect(
      camposEtapa2Modificados(
        { puntajeMinimoExamen: 60, resoALaFirma: true, fechaResolucion: '2026-11-02' },
        filaBase,
      ),
    ).toEqual(expect.arrayContaining(['puntajeMinimoExamen', 'resoALaFirma', 'fechaResolucion']))
  })
})
