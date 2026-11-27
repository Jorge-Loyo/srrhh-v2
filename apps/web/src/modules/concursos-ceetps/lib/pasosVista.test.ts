import { describe, it, expect } from 'vitest'
import type { InscriptoCeetpsDto } from '@srrhh/types'
import { filtrarInscriptos, ordenarFinalistas, paginar, pasoActual } from './pasosVista'

function inscripto(id: string, extra: Partial<InscriptoCeetpsDto> = {}): InscriptoCeetpsDto {
  return {
    id,
    concursoCeetpsId: 'ce1',
    apellido: `AP-${id}`,
    nombre: `NOM-${id}`,
    dni: null,
    cuil: null,
    email: null,
    telefono: null,
    observaciones: null,
    entregoDocumentacion: false,
    admitido: null,
    motivoNoAdmision: null,
    reclamoAdmisibilidad: false,
    resultadoReclamoAdmisibilidad: null,
    presentoExamen: false,
    notaExamen: null,
    reclamoExamen: false,
    resultadoReclamoExamen: null,
    puntajeCv: null,
    puntajeEntrevista: null,
    ordenMerito: null,
    pasaAdmision: null,
    pasaExamen: null,
    pasaCv: null,
    pasaEntrevista: null,
    finalista: false,
    empate: false,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...extra,
  }
}

const pendiente = inscripto('a')
const noAdmitido = inscripto('b', { admitido: false, pasaAdmision: false })
const admitido = inscripto('c', { admitido: true, pasaAdmision: true })
const aproboExamen = inscripto('d', { pasaAdmision: true, pasaExamen: true })
const aproboCv = inscripto('e', { pasaAdmision: true, pasaExamen: true, pasaCv: true })
const finalista = inscripto('f', {
  pasaAdmision: true,
  pasaExamen: true,
  pasaCv: true,
  pasaEntrevista: true,
  finalista: true,
})

describe('pasoActual', () => {
  it('sin inscriptos: inscripción', () => {
    expect(pasoActual([])).toBe('inscripcion')
  })
  it('con alguien sin admisión definida: admisibilidad', () => {
    expect(pasoActual([pendiente, admitido])).toBe('admisibilidad')
  })
  it('todos con admisión pero sin notas: examen', () => {
    expect(pasoActual([admitido, noAdmitido])).toBe('examen')
  })
  it('examen completo, falta el CV: análisis curricular', () => {
    expect(pasoActual([aproboExamen, noAdmitido])).toBe('cv')
  })
  it('CV completo, falta la entrevista: entrevista', () => {
    expect(pasoActual([aproboCv, noAdmitido])).toBe('entrevista')
  })
  it('todo completo: orden de mérito', () => {
    expect(pasoActual([finalista, noAdmitido])).toBe('orden')
  })
})

describe('ordenarFinalistas', () => {
  const a = inscripto('a', { ordenMerito: 1, puntajeEntrevista: 9, notaExamen: 70, puntajeCv: 5 })
  const b = inscripto('b', { ordenMerito: 2, puntajeEntrevista: 8, notaExamen: 90, puntajeCv: 9 })
  it('por posición, ascendente y al revés', () => {
    expect(ordenarFinalistas([b, a], 'posicion', false).map((i) => i.id)).toEqual(['a', 'b'])
    expect(ordenarFinalistas([a, b], 'posicion', true).map((i) => i.id)).toEqual(['b', 'a'])
  })
  it('por cada una de las tres notas', () => {
    expect(ordenarFinalistas([a, b], 'entrevista', true).map((i) => i.id)).toEqual(['a', 'b'])
    expect(ordenarFinalistas([a, b], 'examen', true).map((i) => i.id)).toEqual(['b', 'a'])
    expect(ordenarFinalistas([a, b], 'cv', false).map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('filtrarInscriptos / paginar', () => {
  const lista = [
    inscripto('a', { apellido: 'Pérez', nombre: 'Ana', dni: '30111222' }),
    inscripto('b', { apellido: 'Gómez', nombre: 'Luis', cuil: '20301112223' }),
  ]
  it('busca sin importar mayúsculas ni acentos, por nombre, DNI o CUIL', () => {
    expect(filtrarInscriptos(lista, 'perez').map((i) => i.id)).toEqual(['a'])
    expect(filtrarInscriptos(lista, '30111222').map((i) => i.id)).toEqual(['a', 'b'])
    expect(filtrarInscriptos(lista, '  ').length).toBe(2)
  })
  it('pagina y acota la página pedida', () => {
    const r = paginar([1, 2, 3, 4, 5], 9, 2)
    expect(r).toMatchObject({ pagina: 3, paginas: 3, total: 5, items: [5] })
    expect(paginar([], 1, 10)).toMatchObject({ pagina: 1, paginas: 1, items: [] })
  })
})
