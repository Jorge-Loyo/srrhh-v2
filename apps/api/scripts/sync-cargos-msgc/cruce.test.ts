import { describe, expect, it } from 'vitest'
import { claveRolExcel, claveRolSial, cruzar, SNAPSHOT_VACIO, type CargoSistema, type SnapshotSistema } from './cruce.js'
import type { FilaNominal } from './leerNominal.js'

// Fixtures 100% sintéticos: roles y códigos inventados.
// Clave del Excel: legajo-rol (9 digitos, un digito de rol). El sistema guarda legajo-rol-cuil-rol.
const ROL = (n: number) => `90000000${n}-${n}`
/** Forma del sistema: legajo-rol + CUIL inventado + rol. */
const enSistema = (rol: string) => `${rol}-20000000000-${rol.split('-')[1]}`

function fila(p: Partial<FilaNominal> & { codigo_excel: string }): FilaNominal {
  return {
    cr: '37', sigla: 'HTAL', tipo: 'Ejecución', planta_guardia: 'Planta', estado: 'Vigente',
    situacion: 'Ocupado', literal_puesto: 'Medico', expediente: '', id_sial_rol: '',
    situacion_revista: 'Activo', acronimo: 'CPH-P', bloque: 'Dotación', especialidad_cargo: '',
    nivel_conduccion: '', cod_rep: '', detalle: '', linea_pou: '',
    ...p,
  }
}

const VINC0 = { concursos: 0, concursosCph: 0, concursosCeetps: 0, bajas: 0, padronHistorico: 0, padronIncidencias: 0, etiquetas: 0, solicitudesAlta: 0 }

function cargo(p: Partial<CargoSistema> & { id: string; codigo: string | null }): CargoSistema {
  return {
    estado: 'vigente', subEstado: 'ocupado', eliminado: false, origen: 'padron', tipoOrigen: null,
    expediente: null, codigoRepa: null, sigla: 'HTAL', cr: '37', escalafon: 'CPH', puesto: 'Medico',
    especialidad: null, cargoBaseId: null, cargoRetenidoId: null, vinculos: { ...VINC0 },
    ...p,
  }
}

const CATALOGOS = {
  siglasHospital: ['HTAL'],
  siglasOrganigrama: ['HTAL', 'XORG'],
  codigosRegistro: [{ codigo: '37', escalafon: 'CPH' }, { codigo: '87', escalafon: 'ENF' }, { codigo: '85', escalafon: 'TEC' }],
  puestos: [
    { escalafon: 'CPH', nombre: 'Medico' },
    { escalafon: 'ENF', nombre: 'Enfermero' },
    { escalafon: 'TEC', nombre: 'Tecnico en esterilizacion' },
  ],
  especialidades: ['Enfermeros ATC'],
}

function snapshot(cargos: CargoSistema[], ocupaciones: [string, string][]): SnapshotSistema {
  return {
    ...CATALOGOS,
    cargos,
    ocupaciones: ocupaciones.map(([idSialRol, cargoId]) => ({ idSialRol: enSistema(idSialRol), cargoId })),
  }
}

describe('cruzar: categorías a–j', () => {
  it('a: ocupado cruzado sin diferencias', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00001', id_sial_rol: ROL(1) })],
      snapshot([cargo({ id: 'c1', codigo: 'CPH-P-000001' })], [[ROL(1), 'c1']]),
    )
    expect(r.conteos.a).toBe(1)
    expect(r.conteos.b).toBe(0)
    expect(r.entradas.a[0].accion).toBe('ninguna')
  })

  it('b: cruzado con diferencia de prefijo (CPH-POF -> CPH-P)', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00002', id_sial_rol: ROL(2) })],
      snapshot([cargo({ id: 'c2', codigo: 'CPH-POF-000002' })], [[ROL(2), 'c2']]),
    )
    expect(r.conteos.b).toBe(1)
    expect(r.entradas.b[0].codigo_propuesto).toBe('CPH-P-000002')
    expect(r.entradas.b[0].motivo).toContain('acronimo/prefijo')
  })

  it('b: difiere sigla, puesto, especialidad y estado', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00003', id_sial_rol: ROL(3), sigla: 'OTRA', literal_puesto: 'Otro', especialidad_cargo: 'cardio' })],
      snapshot([cargo({ id: 'c3', codigo: 'CPH-P-000003', estado: 'vigente' })], [[ROL(3), 'c3']]),
    )
    expect(r.entradas.b[0].motivo).toMatch(/sigla.*puesto.*especialidad/)
  })

  it('c: ocupado sin ocupación viva en el sistema', () => {
    const r = cruzar([fila({ codigo_excel: 'CPH-P-00004', id_sial_rol: ROL(4) })], snapshot([], []))
    expect(r.conteos.c).toBe(1)
    expect(r.entradas.c[0].accion).toBe('crear cargo')
  })

  it('d: jefatura ENF-J con cargo base existente', () => {
    const filas = [
      fila({ codigo_excel: 'ENF-00001', id_sial_rol: ROL(5), cr: '87', acronimo: 'ENF', literal_puesto: 'Enfermero' }),
      fila({ codigo_excel: 'ENF-J-00001', id_sial_rol: ROL(5), cr: '87', acronimo: 'ENF-J', literal_puesto: 'Enfermero', tipo: 'Conducción' }),
    ]
    const r = cruzar(filas, snapshot([cargo({ id: 'c5', codigo: 'ENF-000001', cr: '87', escalafon: 'ENF', puesto: 'Enfermero' })], [[ROL(5), 'c5']]))
    expect(r.conteos.d).toBe(1)
    expect(r.entradas.d[0].codigo_excel).toBe('ENF-J-00001')
    expect(r.entradas.d[0].motivo).toContain('cargo base existe')
    expect(r.conteos.a + r.conteos.b).toBe(1)
  })

  it('d: jefatura sin cargo base en el sistema', () => {
    const filas = [
      fila({ codigo_excel: 'ENF-00002', id_sial_rol: ROL(6), cr: '87', acronimo: 'ENF', literal_puesto: 'Enfermero' }),
      fila({ codigo_excel: 'ENF-J-00002', id_sial_rol: ROL(6), cr: '87', acronimo: 'ENF-J', literal_puesto: 'Enfermero' }),
    ]
    const r = cruzar(filas, snapshot([], []))
    expect(r.conteos.d).toBe(1)
    expect(r.entradas.d[0].motivo).toContain('NO existe')
    expect(r.conteos.c).toBe(1)
  })

  it('e: filas sin ocupante, con cupos Excel vs sistema', () => {
    const filas = [
      fila({ codigo_excel: 'CPH-P-00010', bloque: 'Concurso' }),
      fila({ codigo_excel: 'CPH-P-00011', bloque: 'Concurso' }),
      fila({ codigo_excel: 'CPH-P-00012', bloque: 'Nunca levantado', estado: 'En validación' }),
    ]
    const r = cruzar(filas, snapshot([cargo({ id: 'v1', codigo: 'CPH-POF-000100', subEstado: 'vacante' })], []))
    expect(r.conteos.e).toBe(3)
    expect(r.cupos.excel).toBe(3)
    expect(r.cupos.sistema).toBe(1)
    expect(r.cupos.faltan).toBe(2)
    expect(r.cupos.excel_por_bloque).toEqual({ Concurso: 2, 'Nunca levantado': 1 })
    expect(r.cierre.a_crear_como_validacion).toBe(1)
  })

  it('f: vacantes del sistema, separadas en sin vínculos / con vínculos', () => {
    const r = cruzar([], snapshot([
      cargo({ id: 'f1', codigo: 'CPH-POF-000201' }),
      cargo({ id: 'f2', codigo: 'CPH-POF-000202', vinculos: { ...VINC0, concursos: 1, bajas: 2 } }),
    ], []))
    expect(r.conteos.f).toBe(2)
    expect(r.f_desglose.sin_vinculos).toBe(1)
    expect(r.f_desglose.con_vinculos).toBe(1)
    expect(r.f_desglose.por_vinculo.concursos).toBe(1)
    expect(r.entradas.f.find((e) => e.cargo_codigo_sistema === 'CPH-POF-000202')?.motivo).toContain('concursos 1')
  })

  it('g: ocupante vivo cuyo rol no está en el Excel pasa a no vigente', () => {
    const r = cruzar([], snapshot([cargo({ id: 'g1', codigo: 'CPH-POF-000301' })], [[ROL(7), 'g1']]))
    expect(r.conteos.g).toBe(1)
    expect(r.entradas.g[0].accion).toBe('pasar a no_vigente')
    expect(r.conteos.f).toBe(0)
  })

  it('h: no vigente, validacion_vacante y eliminados son informativos', () => {
    const r = cruzar([], snapshot([
      cargo({ id: 'h1', codigo: 'CPH-POF-000401', estado: 'no_vigente', subEstado: null }),
      cargo({ id: 'h2', codigo: 'CPH-POF-000402', estado: 'validacion_vacante', subEstado: null }),
      cargo({ id: 'h3', codigo: 'CPH-POF-000403', eliminado: true }),
    ], []))
    expect(r.conteos.h).toBe(3)
    expect(r.h_desglose).toEqual({ no_vigente: 1, validacion_vacante: 1, eliminado: 1 })
    expect(r.cierre.vigentes_hoy).toBe(0)
    expect(r.cierre.validacion_vacante_hoy).toBe(1)
  })

  it('i: rol repetido sin explicación de jefatura', () => {
    const r = cruzar([
      fila({ codigo_excel: 'CPH-P-00020', id_sial_rol: ROL(8) }),
      fila({ codigo_excel: 'CPH-P-00021', id_sial_rol: ROL(8) }),
    ], snapshot([], []))
    expect(r.particion.i_filas).toBe(2)
    expect(r.conteos.c).toBe(0)
    expect(r.entradas.i[0].motivo).toContain('repetido')
  })

  it('i: rol apuntando a un cargo no vigente', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00022', id_sial_rol: ROL(9) })],
      snapshot([cargo({ id: 'n1', codigo: 'CPH-POF-000501', estado: 'no_vigente', subEstado: null })], [[ROL(9), 'n1']]),
    )
    expect(r.particion.i_filas).toBe(1)
    expect(r.entradas.i[0].motivo).toContain('no vigente')
  })

  it('i: cargo con más de una ocupación viva y cargo -TTR-', () => {
    const r = cruzar([], snapshot([
      cargo({ id: 'm1', codigo: 'CPH-POF-000601' }),
      cargo({ id: 'm2', codigo: 'CPH-POF-TTR-000602', tipoOrigen: 'TTR' }),
    ], [[ROL(1), 'm1'], [ROL(2), 'm1']]))
    const motivos = r.entradas.i.map((e) => e.motivo)
    expect(motivos).toContain('cargo con 2 ocupaciones vivas')
    expect(motivos.some((m) => m.includes('-TTR-'))).toBe(true)
  })

  it('i: colisión de recodificación TEC-POF-000005 / TEC-POU-000005', () => {
    const filas = [
      fila({ codigo_excel: 'TEC-00001', id_sial_rol: ROL(1), cr: '85', acronimo: 'TEC', literal_puesto: 'Tecnico en esterilizacion' }),
      fila({ codigo_excel: 'TEC-00002', id_sial_rol: ROL(2), cr: '85', acronimo: 'TEC', literal_puesto: 'Tecnico en esterilizacion' }),
    ]
    const base = { cr: '85', escalafon: 'TEC', puesto: 'Tecnico en esterilizacion' }
    const r = cruzar(filas, snapshot([
      cargo({ id: 't1', codigo: 'TEC-POF-000005', ...base }),
      cargo({ id: 't2', codigo: 'TEC-POU-000005', ...base }),
    ], [[ROL(1), 't1'], [ROL(2), 't2']]))
    const col = r.entradas.i.filter((e) => e.motivo.startsWith('colision'))
    expect(col).toHaveLength(2)
    expect(col.every((e) => e.codigo_propuesto === 'TEC-000005')).toBe(true)
    expect(r.colisiones).toBe(2)
  })

  it('j: no resolubles contra catálogos (sigla, CR, puesto, especialidad)', () => {
    const r = cruzar([
      fila({ codigo_excel: 'X-1', sigla: 'SSAME', cr: '99', literal_puesto: 'Inexistente', especialidad_cargo: 'rara' }),
      fila({ codigo_excel: 'X-2', sigla: 'XORG', cr: '37' }),
      fila({ codigo_excel: 'X-3', cr: '85', literal_puesto: 'Tecnico' }),
    ], snapshot([], []))
    const j = Object.fromEntries(r.entradas.j.map((e) => [e.codigo_excel, e.motivo]))
    expect(j['X-1']).toContain('sigla fuera de hospitales (a crear)')
    expect(j['X-1']).toContain('no esta en organigramas.sigla')
    expect(j['X-1']).toContain('CR sin codigos_registro')
    expect(j['X-1']).toContain('especialidad sin catalogo')
    expect(j['X-2']).toContain('esta en organigramas.sigla')
    expect(j['X-3']).toContain('puesto sin destino definido')
  })
})

describe('cruzar: cierre, partición e idempotencia', () => {
  const filas = [
    fila({ codigo_excel: 'CPH-P-00001', id_sial_rol: ROL(1) }),
    fila({ codigo_excel: 'CPH-P-00002', id_sial_rol: ROL(2) }),
    fila({ codigo_excel: 'CPH-P-00003', id_sial_rol: ROL(3) }),
    fila({ codigo_excel: 'CPH-P-00004', bloque: 'Concurso' }),
    fila({ codigo_excel: 'CPH-P-00005', bloque: 'Sin designar', estado: 'En validación' }),
  ]
  const sis = () => snapshot([
    cargo({ id: 'c1', codigo: 'CPH-POF-000001' }),
    cargo({ id: 'c9', codigo: 'CPH-POF-000009' }),
    cargo({ id: 'v1', codigo: 'CPH-POF-000100', subEstado: 'vacante' }),
    cargo({ id: 'vv', codigo: 'CPH-POF-000101', estado: 'validacion_vacante', subEstado: null }),
  ], [[ROL(1), 'c1'], [ROL(9), 'c9']])

  it('la partición de filas del Excel suma el total', () => {
    const r = cruzar(filas, sis())
    expect(r.particion.suma).toBe(filas.length)
  })

  it('con sistema vacío todas las filas caen en c/d/e', () => {
    const r = cruzar(filas, SNAPSHOT_VACIO)
    expect(r.conteos.c + r.conteos.d + r.conteos.e).toBe(filas.length)
    expect(r.cierre.proyectado_vigente_mas_validacion).toBe(filas.length)
  })

  it('cierre aritmético: vigentes_hoy + (c+d+e) − f − g', () => {
    const r = cruzar(filas, sis())
    const c = r.cierre
    expect(c.vigentes_hoy).toBe(3) // c1, c9, v1
    expect(c.a_crear).toBe(r.conteos.c + r.conteos.d + r.conteos.e)
    expect(c.f_reemplazados).toBe(1) // v1
    expect(c.g_a_no_vigente).toBe(1) // c9
    expect(c.proyectado_vigente_mas_validacion).toBe(3 + 1 + c.a_crear - 1 - 1)
    expect(c.proyectado_solo_vigente).toBe(3 + (c.a_crear - 1) - 1 - 1)
    expect(c.diferencia_vigente_mas_validacion).toBe(c.proyectado_vigente_mas_validacion - 5)
  })

  it('idempotencia: dos corridas dan salida idéntica (también con el orden de entrada alterado)', () => {
    const a = JSON.stringify(cruzar(filas, sis()))
    const b = JSON.stringify(cruzar(filas, sis()))
    expect(a).toBe(b)
    const c = JSON.stringify(cruzar([...filas].reverse(), sis()))
    expect(c).toBe(a)
  })

  it('las entradas no llevan el ID SIAL Rol', () => {
    const r = cruzar(filas, sis())
    const todo = JSON.stringify(r.entradas)
    for (const n of [1, 2, 3, 9]) expect(todo).not.toContain(ROL(n))
  })
})

describe('claveRolSial', () => {
  it('toma los dos primeros segmentos (rol de 1 y de 2 digitos)', () => {
    expect(claveRolSial('123456789-1-20000000000-1')).toBe('123456789-1')
    expect(claveRolSial('123456789-12-20000000000-12')).toBe('123456789-12')
  })
  it('no toca los digitos (conserva ceros a la izquierda) y hace trim', () => {
    expect(claveRolSial('  000123456-01-20000000000-01 ')).toBe('000123456-01')
    expect(claveRolExcel(' 000123456-01 ')).toBe('000123456-01')
  })
  it('acepta un valor ya en forma legajo-rol', () => {
    expect(claveRolSial('123456789-1')).toBe('123456789-1')
  })
  it('valores mal formados -> null', () => {
    for (const v of ['', '   ', '123456789', '123456789-', '-1-2', 'abc-1-2', '123456789-x-2', null, undefined]) {
      expect(claveRolSial(v), String(v)).toBeNull()
    }
  })
})
describe('cruzar: clave legajo-rol contra id_sial_rol del sistema', () => {
  it('cruza a/b y el par de jefatura (d) con base resuelta por la clave', () => {
    const filas = [
      fila({ codigo_excel: 'CPH-P-00101', id_sial_rol: '900000001-1' }),
      fila({ codigo_excel: 'CPH-P-00102', id_sial_rol: '900000002-12' }),
      fila({ codigo_excel: 'ENF-00103', id_sial_rol: '900000003-1', cr: '87', acronimo: 'ENF', literal_puesto: 'Enfermero' }),
      fila({ codigo_excel: 'ENF-J-00103', id_sial_rol: '900000003-1', cr: '87', acronimo: 'ENF-J', literal_puesto: 'Enfermero' }),
    ]
    const sis: SnapshotSistema = {
      ...CATALOGOS,
      cargos: [
        cargo({ id: 'k1', codigo: 'CPH-P-000101' }),
        cargo({ id: 'k2', codigo: 'CPH-POF-000102' }),
        cargo({ id: 'k3', codigo: 'ENF-000103', cr: '87', escalafon: 'ENF', puesto: 'Enfermero' }),
      ],
      ocupaciones: [
        { idSialRol: '900000001-1-20111111111-1', cargoId: 'k1' },
        { idSialRol: '900000002-12-20222222222-12', cargoId: 'k2' },
        { idSialRol: '900000003-1-20333333333-1', cargoId: 'k3' },
      ],
    }
    const r = cruzar(filas, sis)
    expect(r.conteos.c).toBe(0)
    expect(r.conteos.a).toBe(2)
    expect(r.conteos.b).toBe(1)
    expect(r.conteos.d).toBe(1)
    expect(r.entradas.d[0].motivo).toContain('cargo base existe')
    expect(r.conteos.g).toBe(0)
  })
  it('i: dos cargos vivos con la misma clave legajo-rol y distinto CUIL se reportan', () => {
    const sis: SnapshotSistema = {
      ...CATALOGOS,
      cargos: [cargo({ id: 'p1', codigo: 'CPH-P-000201' }), cargo({ id: 'p2', codigo: 'CPH-P-000202' })],
      ocupaciones: [
        { idSialRol: '900000009-1-20111111111-1', cargoId: 'p1' },
        { idSialRol: '900000009-1-20222222222-1', cargoId: 'p2' },
      ],
    }
    const r = cruzar([], sis)
    const m = r.entradas.i.filter((e) => e.motivo.includes('misma clave legajo-rol'))
    expect(m).toHaveLength(2)
    expect(JSON.stringify(r.entradas)).not.toMatch(/\d{11}/)
  })
  it('i: id_sial_rol mal formado del sistema va a diagnostico', () => {
    const sis: SnapshotSistema = {
      ...CATALOGOS,
      cargos: [cargo({ id: 'q1', codigo: 'CPH-P-000301' })],
      ocupaciones: [{ idSialRol: 'sin-formato', cargoId: 'q1' }],
    }
    const r = cruzar([], sis)
    expect(r.entradas.i.some((e) => e.motivo.includes('mal formado'))).toBe(true)
  })
})
