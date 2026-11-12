import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 3 (2b-b) — los endpoints de Etapa 2+ de CPH (jurado, inscriptos/examen/OM,
// designar, desierto) devuelven 409 si el concurso es nuevo_cargo sin autorizar.
// Los concursos que no son nuevo_cargo no se bloquean.
// =============================================================================
const estado = vi.hoisted(() => ({ concurso: { motivoConcurso: 'nuevo_cargo', autorizadoAt: null } as unknown }))

// Prisma falso: concursoCph.findUnique devuelve el concurso (lo que lee el bloqueo);
// cualquier otra operación resuelve null, así el servicio corta con su propio 404.
const prismaMock = vi.hoisted(() => {
  const nodo = (): unknown =>
    new Proxy(() => undefined, {
      get: () => nodo(),
      apply: async () => null,
    })
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, modelo: string) => {
      if (modelo === 'concursoCph')
        return new Proxy({}, { get: () => async () => ({ id: 'cph1', concurso: estado.concurso }) })
      return nodo()
    },
  })
})
vi.mock('../shared/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion: vi.fn() }))
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: vi.fn() }))
vi.mock('../modules/autorizaciones/autorizaciones.service.js', () => ({
  crearAutorizacion: vi.fn(), resolverSlugPorPermiso: vi.fn(), usuarioPuedeResolverSgrasv: vi.fn(), autoAprobarConcurso: vi.fn(),
}))
vi.mock('../modules/tareas/tareas.service.js', () => ({ cerrarTareasDeConcurso: vi.fn() }))

const ins = await import('../modules/concursos-cph/inscriptos.service.js')
const sor = await import('../modules/concursos-cph/sorteoJurado.service.js')
const svc = await import('../modules/concursos-cph/concursos-cph.service.js')
const salto = await import('../modules/concursos-cph/omSalto.service.js')
const { MENSAJE_BLOQUEO_ETAPA_2 } = await import('../modules/concursos-cph/autorizacionNuevoCargo.js')

const ID = 'cph1'
const endpoints: [string, () => Promise<unknown>][] = [
  ['sorteoJurado: generar', () => sor.generarSorteoJuradoService(ID, {} as never, null)],
  ['sorteoJurado: asignar existente', () => sor.asignarJuradoExistenteService(ID, 'o1', null)],
  ['sorteoJurado: confirmar', () => sor.confirmarSorteoService(ID, null)],
  ['sorteoJurado: revertir', () => sor.revertirConfirmacionSorteoService(ID)],
  ['sorteoJurado: cancelar', () => sor.cancelarSorteoService(ID)],
  ['inscriptos: alta', () => ins.createInscriptoService(ID, {} as never)],
  ['inscriptos: modificar', () => ins.updateInscriptoService(ID, 'i1', {} as never)],
  ['inscriptos: eliminar', () => ins.deleteInscriptoService(ID, 'i1')],
  ['inscriptos: importar', () => ins.importarInscriptosService(ID, Buffer.from(''))],
  ['inscriptos: cerrar inscripción', () => ins.cerrarInscripcionService(ID)],
  ['inscriptos: publicar examen', () => ins.publicarExamenService(ID)],
  ['inscriptos: despublicar examen', () => ins.despublicarExamenService(ID)],
  ['inscriptos: reabrir inscripción', () => ins.reabrirInscripcionService(ID)],
  ['inscriptos: confirmar presentados', () => ins.confirmarPresentadosService(ID)],
  ['inscriptos: revertir presentados', () => ins.revertirPresentadosService(ID)],
  ['inscriptos: confirmar OM', () => ins.confirmarOrdenMeritoService(ID)],
  ['inscriptos: revertir OM', () => ins.revertirOrdenMeritoService(ID)],
  ['inscriptos: reservar integrante OM', () => ins.reservarIntegranteOmService(ID, 'int1', null)],
  ['salto OM: listar OM disponibles', () => salto.listOmDisponiblesService(ID)],
  ['salto OM: designar desde OM', () => salto.designarDesdeOmService(ID, 'int1', { usuarioId: null })],
  ['designar', () => svc.designarConcursoCphService(ID, {} as never)],
  ['asignar designado', () => svc.asignarDesignadoConcursoCphService(ID, {} as never)],
  ['desierto', () => svc.declararDesiertoService(ID, {} as never, 'u1')],
]

describe('CPH — bloqueo 409 de Etapa 2+ en nuevo_cargo sin autorizar', () => {
  beforeEach(() => {
    estado.concurso = { motivoConcurso: 'nuevo_cargo', autorizadoAt: null }
  })

  it.each(endpoints)('%s → 409 con el mensaje de SGRASV', async (_n, llamar) => {
    await expect(llamar()).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_BLOQUEO_ETAPA_2 })
  })

  it.each(endpoints)('%s → no bloquea si NO es nuevo_cargo (comportamiento idéntico)', async (_n, llamar) => {
    estado.concurso = { motivoConcurso: null, autorizadoAt: null }
    const err = await llamar().then(() => null, (e: Error) => e)
    expect(err?.message).not.toBe(MENSAJE_BLOQUEO_ETAPA_2)
  })

  it.each(endpoints)('%s → no bloquea si el nuevo_cargo ya está autorizado', async (_n, llamar) => {
    estado.concurso = { motivoConcurso: 'nuevo_cargo', autorizadoAt: new Date('2026-11-10') }
    const err = await llamar().then(() => null, (e: Error) => e)
    expect(err?.message).not.toBe(MENSAJE_BLOQUEO_ETAPA_2)
  })
})
