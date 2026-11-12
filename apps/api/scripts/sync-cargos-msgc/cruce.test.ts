import { describe, expect, it } from 'vitest'
import {
  claveRolExcel, claveRolSial, cruzar, normalizarExpediente, SNAPSHOT_VACIO,
  type CargoSistema, type ConcursoSistema, type SnapshotSistema,
} from './cruce.js'
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
    expect(r.entradas.f.every((e) => e.accion === 'pasar a no_vigente')).toBe(true)
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

  it('h: no vigente, eliminados y validacion_vacante CON ocupante son informativos', () => {
    const r = cruzar([], snapshot([
      cargo({ id: 'h1', codigo: 'CPH-POF-000401', estado: 'no_vigente', subEstado: null }),
      cargo({ id: 'h2', codigo: 'CPH-POF-000402', estado: 'validacion_vacante', subEstado: null }),
      cargo({ id: 'h3', codigo: 'CPH-POF-000403', eliminado: true }),
    ], [[ROL(3), 'h2']]))
    expect(r.conteos.h).toBe(3)
    expect(r.h_desglose).toEqual({ no_vigente: 1, validacion_vacante: 1, eliminado: 1 })
    expect(r.cierre.vigentes_hoy).toBe(0)
    expect(r.cierre.validacion_vacante_hoy).toBe(1)
    expect(r.conteos.f).toBe(0)
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

  it('cierre: vigente + validacion_vacante == filas del Excel (los cargos reusados no se duplican)', () => {
    const r = cruzar(filas, sis())
    const c = r.cierre
    expect(c.vigentes_hoy).toBe(3) // c1, c9, v1
    expect(c.validacion_vacante_hoy).toBe(1) // vv
    expect(c.e_reusadas).toBe(2) // v1 -> fila 4 (Vigente), vv -> fila 5 (En validacion)
    expect(c.a_crear).toBe(r.conteos.c + r.conteos.d) // ninguna e queda sin cargo
    expect(c.g_a_no_vigente).toBe(1) // c9
    expect(c.f_a_no_vigente + c.validacion_a_no_vigente).toBe(0)
    expect(c.proyectado_vigente_mas_validacion).toBe(5)
    expect(c.diferencia_vigente_mas_validacion).toBe(0)
    expect(Object.values(c.diferencia_por_categoria).reduce((x, y) => x + y, 0)).toBe(0)
    // secundario: vv pasa a ser el cupo "En validacion" (queda en validacion_vacante)
    expect(c.proyectado_solo_vigente).toBe(c.excel_vigente)
    expect(c.excel_en_validacion).toBe(1)
  })

  it('cierre que no cierra: la diferencia se reparte por categoria y suma la diferencia total', () => {
    // Fila con rol repetido sin explicacion (i de fila): no genera cargo. Un cargo vigente ocupado no esta en el Excel pero
    // tiene OTRA ocupacion cuyo rol si esta (no es g): queda en el sistema sin fila propia.
    const r = cruzar(
      [
        fila({ codigo_excel: 'CPH-P-00030', id_sial_rol: ROL(4) }),
        fila({ codigo_excel: 'CPH-P-00031', id_sial_rol: ROL(4) }),
        fila({ codigo_excel: 'CPH-P-00032', id_sial_rol: ROL(5) }),
      ],
      snapshot([cargo({ id: 'z1', codigo: 'CPH-POF-000701' }), cargo({ id: 'z2', codigo: 'CPH-POF-000702' })], [[ROL(5), 'z1'], [ROL(6), 'z2'], [ROL(5), 'z2']]),
    )
    const c = r.cierre
    expect(r.particion.i_filas).toBe(2)
    expect(c.diferencia_vigente_mas_validacion).not.toBe(0)
    expect(Object.values(c.diferencia_por_categoria).reduce((x, y) => x + y, 0)).toBe(c.diferencia_vigente_mas_validacion)
    expect(c.diferencia_por_categoria.i_filas).toBe(-2)
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

describe('cruzar: validacion_vacante entra al cupo', () => {
  const vv = (id: string, codigo: string, p: Partial<CargoSistema> = {}) =>
    cargo({ id, codigo, estado: 'validacion_vacante', subEstado: null, ...p })

  it('validacion_vacante se reusa por cupo y propone la transicion de estado del Excel (Vigente)', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00040', bloque: 'Nunca levantado', estado: 'Vigente' })],
      snapshot([vv('w1', 'CPH-POF-000801')], []),
    )
    expect(r.conteos.h).toBe(0)
    expect(r.cierre.validacion_vacante_hoy).toBe(1)
    expect(r.cierre.validacion_reusados).toBe(1)
    expect(r.cierre.a_crear).toBe(0)
    expect(r.entradas.e[0].accion).toBe('reusar cargo del sistema')
    expect(r.entradas.e[0].cargo_codigo_sistema).toBe('CPH-POF-000801')
    expect(r.entradas.e[0].motivo).toContain('validacion_vacante -> vigente')
    const f = r.entradas.f[0]
    expect(f.accion).toBe('reusar para cupo del Excel')
    expect(f.codigo_excel).toBe('CPH-P-00040')
    expect(f.motivo).toContain('transicion de estado validacion_vacante -> vigente')
    expect(r.cierre.proyectado_vigente_mas_validacion).toBe(1)
    expect(r.cierre.proyectado_solo_vigente).toBe(1)
  })

  it("'En validacion' del Excel -> validacion_vacante: el cargo que ya esta en ese estado no cambia", () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00041', bloque: 'Nunca levantado', estado: 'En validación' })],
      snapshot([vv('w2', 'CPH-POF-000802'), cargo({ id: 'w3', codigo: 'CPH-POF-000803' })], []),
    )
    // Elige el validacion_vacante (estado coincidente); la vacante vigente sobra.
    expect(r.entradas.e[0].cargo_codigo_sistema).toBe('CPH-POF-000802')
    expect(r.entradas.e[0].motivo).toContain('estado validacion_vacante (sin cambio)')
    expect(r.cierre.f_a_no_vigente).toBe(1)
    expect(r.cierre.proyectado_vigente_mas_validacion).toBe(1)
    expect(r.cierre.proyectado_solo_vigente).toBe(0)
  })

  it('validacion_vacante sobrante pasa a no vigente y no suma al proyectado', () => {
    const r = cruzar([], snapshot([vv('w4', 'CPH-POF-000804')], []))
    expect(r.cierre.validacion_a_no_vigente).toBe(1)
    expect(r.cierre.proyectado_vigente_mas_validacion).toBe(0)
    expect(r.cierre.diferencia_vigente_mas_validacion).toBe(0)
    expect(r.entradas.f[0].accion).toBe('pasar a no_vigente')
    expect(r.entradas.f[0].motivo).toContain('validacion_vacante')
    expect(r.cupos.sobran).toBe(1)
    expect(r.cupos.sistema_validacion).toBe(1)
  })

  it('sin cupo equivalente en el Excel no se reusa: la fila e se crea', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00042', bloque: 'Concurso', literal_puesto: 'Otro puesto' })],
      snapshot([vv('w5', 'CPH-POF-000805')], []),
    )
    expect(r.cierre.e_reusadas).toBe(0)
    expect(r.cierre.a_crear).toBe(1)
    expect(r.cierre.validacion_a_no_vigente).toBe(1)
    expect(r.cierre.proyectado_vigente_mas_validacion).toBe(1)
  })
})

const concurso = (cargoId: string, p: Partial<ConcursoSistema> = {}): ConcursoSistema => ({
  cargoId, tipo: 'cph', estado: 'activo', subEstado: null, motivoConcurso: null, autorizado: false, expedientes: [], ...p,
})
const conConcursos = (cargos: CargoSistema[], concursos: ConcursoSistema[], ocup: [string, string][] = []): SnapshotSistema => ({
  ...snapshot(cargos, ocup), concursos,
})

describe('normalizarExpediente', () => {
  it('normaliza a EX-AAAA-NNNNNNNN', () => {
    expect(normalizarExpediente('EX-2024-1234567')).toBe('EX-2024-01234567')
    expect(normalizarExpediente(' ex-2024-01234567-GDEBA-DGAYCS ')).toBe('EX-2024-01234567')
    expect(normalizarExpediente('sin expediente')).toBeNull()
    expect(normalizarExpediente(null)).toBeNull()
  })
})

describe('cruzar: prioridad por expediente y orden de preferencia', () => {
  const EXP = 'EX-2024-01234567'

  it('el expediente del concurso activo tiene prioridad sobre el orden normal dentro del cupo', () => {
    // Sin expediente, una fila que NO es del bloque Concurso prefiere el cargo sin concurso activo (a1, codigo menor).
    const sis = (): SnapshotSistema => conConcursos(
      [cargo({ id: 'a1', codigo: 'CPH-POF-000901' }), cargo({ id: 'a2', codigo: 'CPH-POF-000902' })],
      [concurso('a2', { expedientes: ['EX-2024-1234567-GDEBA-X'] })],
    )
    const sinExp = cruzar([fila({ codigo_excel: 'CPH-P-00050', bloque: 'Nunca levantado' })], sis())
    expect(sinExp.entradas.e[0].cargo_codigo_sistema).toBe('CPH-POF-000901')
    const conExp = cruzar([fila({ codigo_excel: 'CPH-P-00050', bloque: 'Nunca levantado', expediente: EXP })], sis())
    expect(conExp.entradas.e[0].cargo_codigo_sistema).toBe('CPH-POF-000902')
    expect(conExp.entradas.e[0].motivo).toContain('por expediente')
    expect(conExp.cierre.e_reusadas_por_expediente).toBe(1)
  })

  it('el expediente reusa el cargo aunque el cupo (puesto) difiera, si es 1 a 1', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00051', bloque: 'Concurso', expediente: EXP, literal_puesto: 'Medico', especialidad_cargo: '' })],
      conConcursos(
        [cargo({ id: 'b1', codigo: 'CPH-POF-001001', puesto: 'Otro puesto' })],
        [concurso('b1', { expedientes: [EXP] })],
      ),
    )
    expect(r.entradas.e[0].accion).toBe('reusar cargo del sistema')
    expect(r.entradas.e[0].motivo).toContain('el cupo difiere')
    expect(r.cierre.e_reusadas_por_expediente).toBe(1)
    expect(r.concursos_colgados.filas).toHaveLength(0)
  })

  it('concurso NO activo (finalizado) o nuevo_cargo sin autorizar no da prioridad por expediente', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00052', bloque: 'Concurso', expediente: EXP })],
      conConcursos(
        [cargo({ id: 'b2', codigo: 'CPH-POF-001002' }), cargo({ id: 'b3', codigo: 'CPH-POF-001003' })],
        [
          concurso('b3', { estado: 'finalizado', expedientes: [EXP] }),
          concurso('b2', { motivoConcurso: 'nuevo_cargo', autorizado: false, expedientes: [EXP] }),
        ],
      ),
    )
    expect(r.cierre.e_reusadas_por_expediente).toBe(0)
    expect(r.cierre.e_reusadas).toBe(1)
  })

  it('bloque Concurso prefiere cargos con concurso activo; Nunca levantado deja esos cargos para Concurso', () => {
    const r = cruzar(
      [
        fila({ codigo_excel: 'CPH-P-00060', bloque: 'Nunca levantado' }),
        fila({ codigo_excel: 'CPH-P-00061', bloque: 'Concurso' }),
      ],
      conConcursos(
        [cargo({ id: 'p1', codigo: 'CPH-POF-001101' }), cargo({ id: 'p2', codigo: 'CPH-POF-001102' })],
        [concurso('p1', { expedientes: ['EX-2023-0000009'] })],
      ),
    )
    const e = Object.fromEntries(r.entradas.e.map((x) => [x.codigo_excel, x.cargo_codigo_sistema]))
    expect(e['CPH-P-00061']).toBe('CPH-POF-001101') // Concurso -> el del concurso activo
    expect(e['CPH-P-00060']).toBe('CPH-POF-001102')
  })

  it('empate de estado: entre cargos de igual preferencia gana el de mas vinculos y luego el menor codigo', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00062', bloque: 'Nunca levantado' })],
      snapshot([
        cargo({ id: 'q1', codigo: 'CPH-POF-001201' }),
        cargo({ id: 'q2', codigo: 'CPH-POF-001202', vinculos: { ...VINC0, bajas: 2 } }),
      ], []),
    )
    expect(r.entradas.e[0].cargo_codigo_sistema).toBe('CPH-POF-001202')
  })
})

describe('cruzar: concursos_colgados', () => {
  const EXP = 'EX-2024-01234567'
  const EXP_OTRO = 'EX-2022-00000777'

  const resultado = () => cruzar(
    // a: cargo ocupado cuyo expediente coincide con el concurso activo de f1 (que queda colgado).
    [fila({ codigo_excel: 'CPH-P-00070', id_sial_rol: ROL(1), expediente: EXP })],
    conConcursos(
      [
        cargo({ id: 'c1', codigo: 'CPH-P-000070' }),
        cargo({ id: 'f1', codigo: 'CPH-POF-001301', vinculos: { ...VINC0, concursosCph: 2, concursosCeetps: 1, bajas: 2, solicitudesAlta: 1 } }),
        cargo({ id: 'f2', codigo: 'CPH-POF-001302', estado: 'validacion_vacante', subEstado: null, vinculos: { ...VINC0, bajas: 1 } }),
        cargo({ id: 'f3', codigo: 'CPH-POF-001303' }),
      ],
      [
        concurso('f1', { tipo: 'cph', estado: 'activo', subEstado: 'EN-CURSO', expedientes: ['EX-2024-1234567-GDEBA-X'] }),
        concurso('f1', { tipo: 'cph', estado: 'finalizado', expedientes: [EXP_OTRO] }),
        concurso('f1', { tipo: 'ceetps', estado: 'en_proceso', motivoConcurso: 'nuevo_cargo', autorizado: false, expedientes: [null, 'EX-2021-5'] }),
      ],
      [[ROL(1), 'c1']],
    ),
  )

  it('una fila por concurso de los cargos sobrantes, con activo segun la regla unica y sin datos personales', () => {
    const r = resultado()
    const filas = r.concursos_colgados.filas
    expect(filas).toHaveLength(4) // 3 concursos de f1 + f2 (solo bajas)
    const f1 = filas.filter((x) => x.cargo_codigo_sistema === 'CPH-POF-001301')
    expect(f1).toHaveLength(3)
    const activo = f1.find((x) => x.estado_concurso === 'activo')!
    expect(activo).toMatchObject({
      tipo_concurso: 'CPH', activo: 'si', sub_estado_concurso: 'EN-CURSO', autorizado: 'no',
      expediente_concurso: EXP, expediente_en_excel: 'si', fila_excel: 'CPH-P-00070',
      otros_vinculos: 'bajas 2, solicitudes_alta 1', estado_cargo: 'vigente',
    })
    expect(activo.revision).toBe('revisar: el Excel tiene este expediente en otra fila')
    const fin = f1.find((x) => x.estado_concurso === 'finalizado')!
    expect(fin).toMatchObject({ activo: 'no', expediente_en_excel: 'no', revision: '', fila_excel: '' })
    // CEETPS en proceso pero nuevo_cargo sin autorizar: la regla unica NO lo cuenta como activo.
    const ce = f1.find((x) => x.tipo_concurso === 'CEETPS')!
    expect(ce).toMatchObject({ activo: 'no', motivo_concurso: 'nuevo_cargo', autorizado: 'no', expediente_concurso: 'EX-2021-00000005' })
    // validacion_vacante con solo bajas: una fila sin concurso.
    const sin = filas.find((x) => x.cargo_codigo_sistema === 'CPH-POF-001302')!
    expect(sin).toMatchObject({ tipo_concurso: 'sin concurso', activo: 'n/a', estado_cargo: 'validacion_vacante', otros_vinculos: 'bajas 1' })
    // f3 no tiene vinculos: no aparece.
    expect(filas.some((x) => x.cargo_codigo_sistema === 'CPH-POF-001303')).toBe(false)
    expect(JSON.stringify(r.concursos_colgados)).not.toMatch(/\d{11}|id_sial|cuil/i)
  })

  it('totales por tipo y por activo / no activo', () => {
    const t = resultado().concursos_colgados.totales
    expect(t.filas).toBe(4)
    expect(t.cargos).toBe(2)
    expect(t.por_tipo).toEqual({ CEETPS: 1, CPH: 2, 'sin concurso': 1 })
    expect(t.activos).toBe(1)
    expect(t.no_activos).toBe(2)
    expect(t.por_tipo_activo).toEqual({ CEETPS: { activo: 0, no_activo: 1 }, CPH: { activo: 1, no_activo: 1 } })
    expect(t.revisar).toBe(1)
  })

  it('los cargos reusados no aparecen como colgados', () => {
    const r = cruzar(
      [fila({ codigo_excel: 'CPH-P-00071', bloque: 'Concurso' })],
      conConcursos([cargo({ id: 'u1', codigo: 'CPH-POF-001401', vinculos: { ...VINC0, concursosCph: 1 } })], [concurso('u1')]),
    )
    expect(r.cierre.e_reusadas).toBe(1)
    expect(r.concursos_colgados.filas).toHaveLength(0)
  })
})
