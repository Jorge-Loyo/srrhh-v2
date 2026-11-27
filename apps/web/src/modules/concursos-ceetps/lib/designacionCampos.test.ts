import { describe, it, expect } from 'vitest'
import {
  PASOS_DESIGNACION,
  bodyCampoDesignacion,
  designacionCompleta,
  desigFormDesde,
} from './designacionCampos'

const keys = () => PASOS_DESIGNACION.flatMap((p) => p.campos.map((c) => c.key))
const label = (k: string) =>
  PASOS_DESIGNACION.flatMap((p) => p.campos).find((c) => c.key === k)?.label

describe('PASOS_DESIGNACION', () => {
  it('devuelve los campos en el orden pedido', () => {
    expect(keys()).toEqual([
      'eeDesignacion',
      'fechaAptoMedico',
      'numeroAptoMedico',
      'estadoApto',
      'proyectoResolucion',
      'dispoDesignacion',
      'fechaDispoDesignacion',
      'resoALaFirma',
      'resolucionConvalidacion',
      'cargoSial',
    ])
  })

  it('"Designación a la firma" abre la tarjeta de la disposición y "Resolución a la firma" la de la convalidación', () => {
    const primero = (id: string) => PASOS_DESIGNACION.find((p) => p.id === id)?.campos[0].key
    expect(primero('disposicion-designacion')).toBe('proyectoResolucion')
    expect(primero('resolucion-convalidacion')).toBe('resoALaFirma')
  })

  it('no incluye carga de documentación, resolución de designación, su fecha ni la fecha ITE', () => {
    for (const k of ['cargaDocumentacion', 'resolucionDesignacion', 'fechaResolucion', 'fechaIte'])
      expect(keys()).not.toContain(k)
  })

  it('rótulos', () => {
    expect(label('proyectoResolucion')).toBe('Designación a la firma')
    expect(label('resoALaFirma')).toBe('Resolución a la firma')
    expect(label('numeroAptoMedico')).toBe('Número de nota')
  })

  it('cada key aparece una sola vez', () => {
    expect(new Set(keys()).size).toBe(keys().length)
  })
})

describe('desigFormDesde', () => {
  it('sin datos arranca vacío', () => {
    const f = desigFormDesde(undefined)
    expect(f.resoALaFirma).toBe(false)
    expect(f.dispoDesignacion).toBe('')
    expect(f.estadoApto).toBe('')
  })

  it('lee los valores y recorta las fechas ISO', () => {
    const f = desigFormDesde({
      eeDesignacion: 'EX-1',
      fechaAptoMedico: '2026-07-01T00:00:00.000Z',
      numeroAptoMedico: 'NO-9',
      estadoApto: 'APTO',
      proyectoResolucion: true,
    })
    expect(f).toMatchObject({
      eeDesignacion: 'EX-1',
      fechaAptoMedico: '2026-07-01',
      numeroAptoMedico: 'NO-9',
      estadoApto: 'APTO',
      proyectoResolucion: true,
    })
  })

  it('un resultado viejo que no es Apto / No apto se muestra vacío', () => {
    expect(desigFormDesde({ estadoApto: 'SOLICITADO' }).estadoApto).toBe('')
  })
})

describe('bodyCampoDesignacion / designacionCompleta', () => {
  it('la cadena vacía se manda como null', () => {
    expect(bodyCampoDesignacion('dispoDesignacion', '')).toEqual({ dispoDesignacion: null })
    expect(bodyCampoDesignacion('resoALaFirma', false)).toEqual({ resoALaFirma: false })
  })

  it('completa solo con todo cargado y el resultado en Apto', () => {
    const lleno = {
      eeDesignacion: 'EX',
      fechaAptoMedico: '2026-07-01',
      numeroAptoMedico: '1',
      estadoApto: 'APTO',
      proyectoResolucion: true,
      dispoDesignacion: 'DI',
      fechaDispoDesignacion: '2026-07-02',
      resoALaFirma: true,
      resolucionConvalidacion: 'RESOL',
      cargoSial: 'S1',
    }
    expect(designacionCompleta(desigFormDesde(lleno))).toBe(true)
    expect(designacionCompleta(desigFormDesde({ ...lleno, estadoApto: 'NO APTO' }))).toBe(false)
    expect(designacionCompleta(desigFormDesde({ ...lleno, cargoSial: '' }))).toBe(false)
  })
})
