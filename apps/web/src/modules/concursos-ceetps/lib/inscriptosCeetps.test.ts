import { describe, it, expect } from 'vitest'
import type { InscriptoCeetpsDto } from '@srrhh/types'
import {
  faltantesEtapa3,
  inscriptoComoCph,
  inscriptosDelPaso,
  ordenMeritoCompleto,
} from './inscriptosCeetps'

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
const todos = [pendiente, noAdmitido, admitido, aproboExamen, aproboCv, finalista]
const ids = (xs: InscriptoCeetpsDto[]) => xs.map((x) => x.id)

describe('inscriptosDelPaso', () => {
  it('inscripción y admisibilidad muestran a todos', () => {
    expect(ids(inscriptosDelPaso(todos, 'inscripcion'))).toEqual(ids(todos))
    expect(ids(inscriptosDelPaso(todos, 'admisibilidad'))).toEqual(ids(todos))
  })

  it('examen excluye a los no admitidos y a los pendientes', () => {
    expect(ids(inscriptosDelPaso(todos, 'examen'))).toEqual(['c', 'd', 'e', 'f'])
  })

  it('cada paso siguiente muestra solo a quienes aprobaron el anterior', () => {
    expect(ids(inscriptosDelPaso(todos, 'cv'))).toEqual(['d', 'e', 'f'])
    expect(ids(inscriptosDelPaso(todos, 'entrevista'))).toEqual(['e', 'f'])
  })

  it('orden de mérito solo muestra finalistas', () => {
    expect(ids(inscriptosDelPaso(todos, 'orden'))).toEqual(['f'])
  })
})

describe('ordenMeritoCompleto', () => {
  it('es false sin finalistas', () => {
    expect(ordenMeritoCompleto([pendiente, admitido])).toBe(false)
  })

  it('es false si un finalista no tiene posición', () => {
    expect(
      ordenMeritoCompleto([
        { ...finalista, ordenMerito: 1 },
        { ...finalista, id: 'g', ordenMerito: null },
      ]),
    ).toBe(false)
  })

  it('es true con todos los finalistas ubicados', () => {
    expect(ordenMeritoCompleto([pendiente, { ...finalista, ordenMerito: 1 }])).toBe(true)
  })
})

describe('faltantesEtapa3', () => {
  it('sin finalistas lo informa', () => {
    expect(faltantesEtapa3([pendiente])).toEqual([
      'No hay finalistas: nadie aprobó todavía todos los pasos',
    ])
  })

  it('informa cuántos finalistas no tienen posición', () => {
    expect(
      faltantesEtapa3([
        finalista,
        { ...finalista, id: 'g' },
        { ...finalista, id: 'h', ordenMerito: 1 },
      ]),
    ).toEqual(['Falta el orden de mérito de 2 finalistas'])
    expect(faltantesEtapa3([finalista])).toEqual(['Falta el orden de mérito de 1 finalista'])
  })

  it('completo no tiene faltantes', () => {
    expect(faltantesEtapa3([{ ...finalista, ordenMerito: 1 }])).toEqual([])
  })
})

describe('inscriptoComoCph', () => {
  it('traduce la nota y deja la posición solo a los finalistas (para la Etapa 4)', () => {
    const r = inscriptoComoCph({
      ...finalista,
      notaExamen: 80,
      presentoExamen: true,
      ordenMerito: 2,
    })
    expect(r).toMatchObject({
      id: 'f',
      nota: 80,
      presentoExamen: true,
      ordenMerito: 2,
      especialidad: null,
    })
    expect(inscriptoComoCph({ ...aproboCv, ordenMerito: 3 }).ordenMerito).toBeNull()
  })
})
