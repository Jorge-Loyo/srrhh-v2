import { describe, it, expect } from 'vitest'
import {
  construirItemPersistido,
  filtrarPersistidas,
  ordenarPersistidas,
  subTipoOtras,
  type IncidenciaPersistidaRow,
} from './incidencias.persistidas.js'

// Factory de fila cruda del JOIN padron_incidencias → cargos. Default = una
// incidencia 'cayo-del-padron' con datos mínimos de cargo/persona.
const row = (over: Partial<IncidenciaPersistidaRow> = {}): IncidenciaPersistidaRow => ({
  id: 'inc-1',
  tipo: 'cayo-del-padron',
  cargo_id: 'cargo-1',
  id_sial: '001788157',
  id_sial_rol: '001788157-1',
  estado_anterior: null,
  estado_nuevo: null,
  detalle: 'Cargo que cayó del padrón sin baja SIAL',
  created_at: new Date('2024-01-10T00:00:00Z'),
  codigo: 'C-100',
  hospital_sigla: 'HGA',
  carrera: 'Enfermería',
  puesto: 'Enfermero',
  especialidad: 'Clínica',
  persona_cuil: '20111111113',
  persona_nombre: 'PEREZ JUAN',
  fecha_asignada: new Date('2024-01-08T00:00:00Z'),
  ...over,
})

describe('subTipoOtras', () => {
  it('traduce cada slug otras:* a su etiqueta', () => {
    expect(subTipoOtras('otras:nueva-baja')).toBe('Nueva baja')
    expect(subTipoOtras('otras:cambio-persona')).toBe('Cambió la persona')
    expect(subTipoOtras('otras:reaparecio')).toBe('Reapareció')
  })
  it('devuelve el slug tal cual si es desconocido', () => {
    expect(subTipoOtras('otras:xyz')).toBe('otras:xyz')
  })
})

describe('construirItemPersistido', () => {
  it('cayó del padrón: campos base + fecha del snapshot, sin ant/nue de situación/puesto', () => {
    const it = construirItemPersistido(row())
    expect(it.clave).toBe('cayo-del-padron:inc-1')
    expect(it.tipo).toBe('cayo-del-padron')
    expect(it.subTipo).toBeNull()
    expect(it.idSial).toBe('001788157')
    expect(it.codigo).toBe('C-100')
    expect(it.hospitalSigla).toBe('HGA')
    expect(it.carrera).toBe('Enfermería')
    expect(it.personaNombre).toBe('PEREZ JUAN')
    expect(it.fecha).toBe('2024-01-08')
    expect(it.situacionAnterior).toBeNull()
    expect(it.situacionNueva).toBeNull()
    expect(it.elegibleReemplazante).toBe(false)
  })

  it('cambio de situación de revista: expone ant/nue y el flag elegible desde el detalle', () => {
    const it = construirItemPersistido(
      row({
        tipo: 'cambio-situacion-revista',
        estado_anterior: { situacionRevista: 'activo' },
        estado_nuevo: { situacionRevista: 'retencion' },
        detalle: 'Cambio de situación de revista (activo → retencion) — elegible para reemplazante',
      }),
    )
    expect(it.situacionAnterior).toBe('activo')
    expect(it.situacionNueva).toBe('retencion')
    expect(it.elegibleReemplazante).toBe(true)
  })

  it('cambio de situación sin "elegible" en el detalle no marca el flag', () => {
    const it = construirItemPersistido(
      row({
        tipo: 'cambio-situacion-revista',
        estado_anterior: { situacionRevista: 'activo' },
        estado_nuevo: { situacionRevista: 'comision' },
        detalle: 'Cambio de situación de revista (activo → comision)',
      }),
    )
    expect(it.elegibleReemplazante).toBe(false)
  })

  it('cambios del puesto: expone puesto/especialidad ant→nue', () => {
    const it = construirItemPersistido(
      row({
        tipo: 'cambios-del-puesto',
        estado_anterior: { literalPuesto: 'Enfermero', especialidad: 'Clínica' },
        estado_nuevo: { literalPuesto: 'Enfermero Jefe', especialidad: 'Clínica' },
        detalle: 'cambio puesto',
      }),
    )
    expect(it.puestoAnterior).toBe('Enfermero')
    expect(it.puestoNuevo).toBe('Enfermero Jefe')
    expect(it.especialidadAnterior).toBe('Clínica')
    expect(it.especialidadNueva).toBe('Clínica')
  })

  it('otras:*: calcula subTipo legible', () => {
    expect(construirItemPersistido(row({ tipo: 'otras:nueva-baja' })).subTipo).toBe('Nueva baja')
    expect(construirItemPersistido(row({ tipo: 'otras:cambio-persona' })).subTipo).toBe('Cambió la persona')
    expect(construirItemPersistido(row({ tipo: 'otras:reaparecio' })).subTipo).toBe('Reapareció')
  })

  it('es defensivo con estado_anterior/nuevo nulos o no-objeto', () => {
    const it = construirItemPersistido(row({ estado_anterior: null, estado_nuevo: 'x' }))
    expect(it.situacionAnterior).toBeNull()
    expect(it.situacionNueva).toBeNull()
  })

  it('idSial cae al id_sial_rol si id_sial es null', () => {
    const it = construirItemPersistido(row({ id_sial: null, id_sial_rol: '001-ROL' }))
    expect(it.idSial).toBe('001-ROL')
  })
})

describe('filtrarPersistidas', () => {
  const rows = [
    row({ id: 'a', persona_nombre: 'PEREZ JUAN', carrera: 'Enfermería', id_sial: '111' }),
    row({ id: 'b', persona_nombre: 'GOMEZ ANA', carrera: 'Medicina', id_sial: '222' }),
  ]

  it('sin filtros devuelve todas', () => {
    expect(filtrarPersistidas(rows, {})).toHaveLength(2)
  })

  it('filtra por carrera (normalizada)', () => {
    const out = filtrarPersistidas(rows, { carrera: 'medicina' })
    expect(out.map((r) => r.id)).toEqual(['b'])
  })

  it('filtra por búsqueda de nombre (q >= 2 chars)', () => {
    expect(filtrarPersistidas(rows, { q: 'gomez' }).map((r) => r.id)).toEqual(['b'])
  })

  it('filtra por id_sial', () => {
    expect(filtrarPersistidas(rows, { q: '222' }).map((r) => r.id)).toEqual(['b'])
  })
})

describe('ordenarPersistidas', () => {
  it('ordena por fecha asc con nulls al final y desempate por clave', () => {
    const items = [
      construirItemPersistido(row({ id: 'z', fecha_asignada: null })),
      construirItemPersistido(row({ id: 'b', fecha_asignada: new Date('2024-03-01T00:00:00Z') })),
      construirItemPersistido(row({ id: 'a', fecha_asignada: new Date('2024-01-01T00:00:00Z') })),
    ]
    const out = ordenarPersistidas(items)
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'z'])
  })
})
