import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Inscriptos de concursos CEETPS (Etapa 3): alta, edición, baja, "todos
// entregaron documentación", importación por Excel y orden de mérito automático.
// Los flags "pasa*" y la posición se calculan al listar. Prisma simulado.
// =============================================================================
const concursoCeetps = { findUnique: vi.fn() }
const inscriptoCeetps = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
}
const tx = { concursoCeetps, inscriptoCeetps }
vi.mock('../shared/prisma.js', () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}))

const {
  listInscriptosCeetpsService,
  createInscriptoCeetpsService,
  updateInscriptoCeetpsService,
  deleteInscriptoCeetpsService,
  marcarDocumentacionCeetpsService,
  importarInscriptosCeetpsService,
} = await import('../modules/concursos-ceetps/inscriptos.service.js')
const { inscriptoCeetpsSchema, inscriptoCeetpsPatchSchema, importarInscriptosSchema } =
  await import('../modules/concursos-ceetps/inscriptos.schema.js')

const MSG_BLOQUEO = 'El concurso necesita la autorización de SGRASV para avanzar a la Etapa 2'

function dadoConcurso(
  fila: object = {},
  concurso: object = { motivoConcurso: 'alta_por_baja', autorizadoAt: null },
) {
  concursoCeetps.findUnique.mockResolvedValue({
    id: 'ce1',
    estado: 'en_proceso',
    puntajeMinimoExamen: 60,
    puntajeMinimoCv: null,
    puntajeMinimoEntrevista: null,
    concurso,
    ...fila,
  })
}

const inscriptoBase = {
  id: 'i1',
  concursoCeetpsId: 'ce1',
  apellido: 'GOMEZ',
  nombre: 'LUIS',
  dni: '30111222',
  cuil: null,
  admitido: true,
  presentoExamen: true,
  notaExamen: 70,
  reclamoExamen: false,
  puntajeCv: 8,
  puntajeEntrevista: 9,
  ordenMerito: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  inscriptoCeetps.findMany.mockResolvedValue([])
  inscriptoCeetps.create.mockImplementation(async ({ data }) => ({ id: 'nuevo', ...data }))
  inscriptoCeetps.update.mockImplementation(async ({ data }) => ({ ...inscriptoBase, ...data }))
})

describe('inscriptoCeetpsSchema', () => {
  it('exige apellido y nombre', () => {
    expect(() => inscriptoCeetpsSchema.parse({ apellido: 'A' })).toThrow()
    expect(() => inscriptoCeetpsSchema.parse({ apellido: 'A', nombre: 'B' })).not.toThrow()
  })

  it('rechaza puntajes negativos, el orden de mérito (ya es automático) y campos desconocidos', () => {
    expect(() => inscriptoCeetpsPatchSchema.parse({ notaExamen: -1 })).toThrow()
    expect(() => inscriptoCeetpsPatchSchema.parse({ ordenMerito: 1 })).toThrow()
    expect(() => inscriptoCeetpsPatchSchema.parse({ pasaExamen: true })).toThrow()
  })
})

describe('listInscriptosCeetpsService', () => {
  it('devuelve los inscriptos con los flags calculados contra los mínimos del concurso', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([
      inscriptoBase,
      { ...inscriptoBase, id: 'i2', notaExamen: 50 },
    ])
    const lista = await listInscriptosCeetpsService('ce1')
    expect(lista[0]).toMatchObject({ id: 'i1', pasaExamen: true, finalista: true })
    expect(lista[1]).toMatchObject({ id: 'i2', pasaExamen: false, finalista: false })
  })

  it('la posición se calcula sola: entrevista, después examen, después CV (más alto primero)', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([
      { ...inscriptoBase, id: 'a', apellido: 'A', puntajeEntrevista: 8, notaExamen: 90, puntajeCv: 9 },
      { ...inscriptoBase, id: 'b', apellido: 'B', puntajeEntrevista: 9, notaExamen: 60, puntajeCv: 1 },
      { ...inscriptoBase, id: 'c', apellido: 'C', puntajeEntrevista: 9, notaExamen: 80, puntajeCv: 1 },
      { ...inscriptoBase, id: 'd', apellido: 'D', puntajeEntrevista: 9, notaExamen: 80, puntajeCv: 5 },
      // no finalista (no alcanzó el mínimo del examen): sin posición
      { ...inscriptoBase, id: 'e', apellido: 'E', notaExamen: 10 },
    ])
    const lista = await listInscriptosCeetpsService('ce1')
    const pos = Object.fromEntries(lista.map((i) => [i.id, i.ordenMerito]))
    expect(pos).toEqual({ d: 1, c: 2, b: 3, a: 4, e: null })
  })

  it('un empate en las tres notas se desempata por apellido y se marca', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([
      { ...inscriptoBase, id: 'z', apellido: 'ZETA' },
      { ...inscriptoBase, id: 'a', apellido: 'ALFA' },
    ])
    const lista = await listInscriptosCeetpsService('ce1')
    expect(lista.find((i) => i.id === 'a')).toMatchObject({ ordenMerito: 1, empate: true })
    expect(lista.find((i) => i.id === 'z')).toMatchObject({ ordenMerito: 2, empate: true })
  })

  it('ignora la posición que hubiera quedado guardada en la base', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([{ ...inscriptoBase, ordenMerito: 7 }])
    const [i] = await listInscriptosCeetpsService('ce1')
    expect(i.ordenMerito).toBe(1)
  })

  it('404 si el concurso no existe', async () => {
    concursoCeetps.findUnique.mockResolvedValue(null)
    await expect(listInscriptosCeetpsService('nada')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('createInscriptoCeetpsService', () => {
  it('da de alta y devuelve el inscripto con sus flags', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([
      { id: 'nuevo', apellido: 'PAZ', nombre: 'ANA', presentoExamen: false },
    ])
    const r = await createInscriptoCeetpsService('ce1', {
      apellido: 'PAZ',
      nombre: 'ANA',
      telefono: '1155551234',
    })
    expect(inscriptoCeetps.create).toHaveBeenCalledWith({
      data: { concursoCeetpsId: 'ce1', apellido: 'PAZ', nombre: 'ANA', telefono: '1155551234' },
    })
    expect(r).toMatchObject({ apellido: 'PAZ', pasaAdmision: null, finalista: false })
  })

  it('409 en concurso desierto', async () => {
    dadoConcurso({ estado: 'desierto' })
    await expect(
      createInscriptoCeetpsService('ce1', { apellido: 'PAZ', nombre: 'ANA' }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(inscriptoCeetps.create).not.toHaveBeenCalled()
  })

  it('409 en cargo nuevo sin autorizar', async () => {
    dadoConcurso({}, { motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    await expect(
      createInscriptoCeetpsService('ce1', { apellido: 'PAZ', nombre: 'ANA' }),
    ).rejects.toMatchObject({ statusCode: 409, message: MSG_BLOQUEO })
  })
})

describe('updateInscriptoCeetpsService', () => {
  it('edita cualquier paso, aunque ya se haya avanzado (editable todo el concurso)', async () => {
    dadoConcurso()
    inscriptoCeetps.findFirst.mockResolvedValue(inscriptoBase)
    inscriptoCeetps.findMany.mockResolvedValue([{ ...inscriptoBase, admitido: false }])
    const r = await updateInscriptoCeetpsService('ce1', 'i1', { admitido: false })
    expect(inscriptoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { admitido: false },
    })
    expect(r).toMatchObject({ pasaAdmision: false, pasaExamen: null, finalista: false })
  })

  it('reclamo del examen: lo puede iniciar quien NO aprobó', async () => {
    dadoConcurso()
    const reprobado = { ...inscriptoBase, notaExamen: 40 }
    inscriptoCeetps.findFirst.mockResolvedValue(reprobado)
    inscriptoCeetps.findMany.mockResolvedValue([reprobado])
    await updateInscriptoCeetpsService('ce1', 'i1', { reclamoExamen: true })
    expect(inscriptoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { reclamoExamen: true },
    })
  })

  it('409 si quien aprobó el examen intenta reclamar', async () => {
    dadoConcurso()
    inscriptoCeetps.findFirst.mockResolvedValue(inscriptoBase) // 70 >= 60
    await expect(
      updateInscriptoCeetpsService('ce1', 'i1', { reclamoExamen: true }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(inscriptoCeetps.update).not.toHaveBeenCalled()
  })

  it('un reclamo ya iniciado se conserva aunque la nota corregida ahora apruebe', async () => {
    dadoConcurso()
    const conReclamo = { ...inscriptoBase, reclamoExamen: true, notaExamen: 40 }
    inscriptoCeetps.findFirst.mockResolvedValue(conReclamo)
    inscriptoCeetps.findMany.mockResolvedValue([{ ...conReclamo, notaExamen: 65 }])
    await updateInscriptoCeetpsService('ce1', 'i1', { notaExamen: 65, resultadoReclamoExamen: 'OK' })
    expect(inscriptoCeetps.update).toHaveBeenCalled()
  })

  it('404 si el inscripto es de otro concurso', async () => {
    dadoConcurso()
    inscriptoCeetps.findFirst.mockResolvedValue(null)
    await expect(
      updateInscriptoCeetpsService('ce1', 'otro', { notaExamen: 70 }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(inscriptoCeetps.findFirst).toHaveBeenCalledWith({
      where: { id: 'otro', concursoCeetpsId: 'ce1' },
    })
  })
})

describe('deleteInscriptoCeetpsService', () => {
  it('borra el inscripto del concurso', async () => {
    dadoConcurso()
    inscriptoCeetps.findFirst.mockResolvedValue(inscriptoBase)
    await deleteInscriptoCeetpsService('ce1', 'i1')
    expect(inscriptoCeetps.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })
  })

  it('409 en concurso finalizado', async () => {
    dadoConcurso({ estado: 'finalizado' })
    await expect(deleteInscriptoCeetpsService('ce1', 'i1')).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('marcarDocumentacionCeetpsService', () => {
  it('marca a todos los inscriptos del concurso', async () => {
    dadoConcurso()
    inscriptoCeetps.updateMany.mockResolvedValue({ count: 12 })
    const r = await marcarDocumentacionCeetpsService('ce1', true)
    expect(inscriptoCeetps.updateMany).toHaveBeenCalledWith({
      where: { concursoCeetpsId: 'ce1' },
      data: { entregoDocumentacion: true },
    })
    expect(r).toEqual({ actualizados: 12 })
  })

  it('409 en concurso finalizado', async () => {
    dadoConcurso({ estado: 'finalizado' })
    await expect(marcarDocumentacionCeetpsService('ce1', true)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('importarInscriptosCeetpsService', () => {
  it('schema: exige un paso válido y al menos una fila', () => {
    expect(() => importarInscriptosSchema.parse({ paso: 'orden', filas: [{ DNI: '1' }] })).toThrow()
    expect(() => importarInscriptosSchema.parse({ paso: 'examen', filas: [] })).toThrow()
    expect(() =>
      importarInscriptosSchema.parse({ paso: 'examen', filas: [{ DNI: 1, Nota: 7 }] }),
    ).not.toThrow()
  })

  it('inscripción: crea a los nuevos y actualiza a los que ya estaban (por DNI)', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([inscriptoBase])
    inscriptoCeetps.update.mockImplementation(async ({ data }) => ({ ...inscriptoBase, ...data }))
    const r = await importarInscriptosCeetpsService('ce1', {
      paso: 'inscripcion',
      filas: [
        { Apellido: 'Gomez', Nombre: 'Luis', DNI: '30.111.222', 'Teléfono': '1144445555' },
        { Apellido: 'Paz', Nombre: 'Ana', DNI: '28000111', Email: 'ana@x.com' },
        { Apellido: 'Sin', Nombre: 'Documento' },
      ],
    })
    expect(r).toMatchObject({ creados: 1, actualizados: 1 })
    expect(r.errores).toEqual([{ fila: 4, motivo: 'Falta el DNI o el CUIL.' }])
    expect(inscriptoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: expect.objectContaining({ telefono: '1144445555' }),
    })
    expect(inscriptoCeetps.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ concursoCeetpsId: 'ce1', apellido: 'Paz', dni: '28000111' }),
    })
  })

  it('examen: carga la nota de quien ya está inscripto y avisa de quien no', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([inscriptoBase])
    const r = await importarInscriptosCeetpsService('ce1', {
      paso: 'examen',
      filas: [
        { DNI: '30111222', Nota: '7,5' },
        { DNI: '99999999', Nota: 8 },
      ],
    })
    expect(r).toMatchObject({ creados: 0, actualizados: 1 })
    expect(r.errores).toEqual([
      { fila: 3, motivo: 'No hay un inscripto con DNI/CUIL 99999999 en este concurso.' },
    ])
    expect(inscriptoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { presentoExamen: true, notaExamen: 7.5 },
    })
    expect(inscriptoCeetps.create).not.toHaveBeenCalled()
  })

  it('rechaza valores que no se entienden y filas repetidas', async () => {
    dadoConcurso()
    inscriptoCeetps.findMany.mockResolvedValue([inscriptoBase])
    const r = await importarInscriptosCeetpsService('ce1', {
      paso: 'admisibilidad',
      filas: [
        { DNI: '30111222', Admitido: 'quizás' },
        { DNI: '30111222', Admitido: 'SI' },
        { DNI: '30111222', Admitido: 'NO' },
      ],
    })
    expect(r.actualizados).toBe(1)
    expect(r.errores.map((e) => e.fila)).toEqual([2, 4])
  })
})
