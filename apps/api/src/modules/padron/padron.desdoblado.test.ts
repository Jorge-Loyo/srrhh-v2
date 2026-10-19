import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  esDesdoblado,
  normEspDesdoblado,
  particionarRegistros,
  resolverEspecialidadDesdobladaId,
  prefijoDesdobladoForzado,
  formatearCodigoDesdoblado,
  tipoDiffDesdoblado,
  clasificacionEliminadoDesdoblado,
  type RegistroPython,
} from './padron.diff.helpers.js'

// Silenciar los console.warn que emiten los helpers (claves degradadas /
// duplicadas / prefijo forzado) para no ensuciar la salida del test, y poder
// aseverar que se emitieron cuando corresponde.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('esDesdoblado', () => {
  it("'24' / '07' → true", () => {
    expect(esDesdoblado('24')).toBe(true)
    expect(esDesdoblado('07')).toBe(true)
  })
  it("' 24 ' (con espacios) → true (trim)", () => {
    expect(esDesdoblado(' 24 ')).toBe(true)
  })
  it('otras carreras → false', () => {
    expect(esDesdoblado('37')).toBe(false)
    expect(esDesdoblado('23')).toBe(false)
    expect(esDesdoblado('83')).toBe(false)
  })
  it('vacío / null / undefined → false', () => {
    expect(esDesdoblado('')).toBe(false)
    expect(esDesdoblado(null)).toBe(false)
    expect(esDesdoblado(undefined)).toBe(false)
  })
})

describe('normEspDesdoblado (port de norm_esp)', () => {
  it('quita acentos, baja a minúscula, elimina "(...)" Y su contenido, trim', () => {
    // El trim final es clave: sin él quedaría "pediatria " (espacio de cola).
    expect(normEspDesdoblado('Pediatría (Clínica Pediátrica)')).toBe('pediatria')
  })
  it('unaccent + lower', () => {
    expect(normEspDesdoblado('Cardiología')).toBe('cardiologia')
  })
  it('quita bullet "•" y guiones, colapsa espacios', () => {
    expect(normEspDesdoblado('Bioquímica • Clínica-Área')).toBe('bioquimica clinica area')
  })
  it('vacío / null / undefined → ""', () => {
    expect(normEspDesdoblado('')).toBe('')
    expect(normEspDesdoblado(null)).toBe('')
    expect(normEspDesdoblado(undefined)).toBe('')
  })
})

describe('particionarRegistros', () => {
  it('separa 24/07 (por id_sial_rol) del resto (por id_sial)', () => {
    const registros: RegistroPython[] = [
      { 'ID SIAL': '111', 'CODIGO DE REGISTRO': '37', 'CUIL Y ROL': '20-1' }, // normal
      { 'ID SIAL': '222', 'CODIGO DE REGISTRO': '24', 'CUIL Y ROL': '27-9' }, // desdoblado
      { 'ID SIAL': '333', 'CODIGO DE REGISTRO': '07', 'CUIL Y ROL': '30-5' }, // desdoblado
    ]
    const { nuevosMap, nuevosDesdobladosMap } = particionarRegistros(registros)
    expect([...nuevosMap.keys()]).toEqual(['111'])
    expect([...nuevosDesdobladosMap.keys()]).toEqual(['222-27-9', '333-30-5'])
    // Ninguna clave 24/07 cayó en nuevosMap.
    expect(nuevosMap.has('222')).toBe(false)
    expect(nuevosMap.has('333')).toBe(false)
  })

  it('fila sin ID SIAL se descarta', () => {
    const { nuevosMap, nuevosDesdobladosMap } = particionarRegistros([
      { 'CODIGO DE REGISTRO': '24', 'CUIL Y ROL': '27-9' },
    ])
    expect(nuevosMap.size).toBe(0)
    expect(nuevosDesdobladosMap.size).toBe(0)
  })

  it('fila 24/07 sin CUIL Y ROL → clave degradada a id_sial + warn', () => {
    const warn = vi.spyOn(console, 'warn')
    const { nuevosDesdobladosMap } = particionarRegistros([
      { 'ID SIAL': '555', 'CODIGO DE REGISTRO': '24' },
    ])
    expect([...nuevosDesdobladosMap.keys()]).toEqual(['555'])
    expect(warn).toHaveBeenCalled()
  })

  it('dos filas 24/07 que colapsan a la misma clave → conserva la primera + warn', () => {
    const warn = vi.spyOn(console, 'warn')
    const r1: RegistroPython = { 'ID SIAL': '777', 'CODIGO DE REGISTRO': '24', especialidad: 'uno' }
    const r2: RegistroPython = { 'ID SIAL': '777', 'CODIGO DE REGISTRO': '24', especialidad: 'dos' }
    const { nuevosDesdobladosMap } = particionarRegistros([r1, r2])
    expect(nuevosDesdobladosMap.size).toBe(1)
    expect(nuevosDesdobladosMap.get('777')).toBe(r1) // la primera
    expect(warn).toHaveBeenCalled()
  })

  it('acepta las claves snake_case alternativas del Dotaneitor', () => {
    const { nuevosMap, nuevosDesdobladosMap } = particionarRegistros([
      { id_sial: '888', codigo_de_registro: '07', cuil_y_rol: '23-2' },
    ])
    expect(nuevosMap.size).toBe(0)
    expect([...nuevosDesdobladosMap.keys()]).toEqual(['888-23-2'])
  })
})

describe('resolverEspecialidadDesdobladaId (estricto, REGLA DE ORO)', () => {
  // Índice norm_esp: `${puestoId}:${normEspDesdoblado(nombre)}` -> especialidadId
  const catalogo = new Map<string, string>([
    ['PUESTO1:pediatria', 'esp-pediatria'],
    ['PUESTO1:cardiologia', 'esp-cardio'],
  ])

  it('match exacto (con normalización) → id', () => {
    expect(resolverEspecialidadDesdobladaId(catalogo, 'PUESTO1', 'Pediatría')).toBe('esp-pediatria')
    // Variante con paréntesis normaliza a "pediatria" y matchea igual.
    expect(
      resolverEspecialidadDesdobladaId(catalogo, 'PUESTO1', 'Pediatría (Clínica Pediátrica)'),
    ).toBe('esp-pediatria')
  })

  it('sin match → null (no crea)', () => {
    expect(resolverEspecialidadDesdobladaId(catalogo, 'PUESTO1', 'Neurología')).toBeNull()
    // Puesto distinto → la misma especialidad no matchea.
    expect(resolverEspecialidadDesdobladaId(catalogo, 'PUESTO2', 'Pediatría')).toBeNull()
  })

  it('placeholder / vacío → null (regla de oro: vacío antes que equivocada)', () => {
    expect(resolverEspecialidadDesdobladaId(catalogo, 'PUESTO1', 'SIN ESPECIALIDAD')).toBeNull()
    expect(resolverEspecialidadDesdobladaId(catalogo, 'PUESTO1', '')).toBeNull()
    expect(resolverEspecialidadDesdobladaId(catalogo, 'PUESTO1', null)).toBeNull()
  })
})

describe('prefijoDesdobladoForzado', () => {
  it('24 → RES, 07 → DOC cuando el calculado coincide', () => {
    expect(prefijoDesdobladoForzado('24', 'RES')).toBe('RES')
    expect(prefijoDesdobladoForzado('07', 'DOC')).toBe('DOC')
  })
  it('fuerza por carrera cuando el calculado no coincide (+ warn)', () => {
    const warn = vi.spyOn(console, 'warn')
    expect(prefijoDesdobladoForzado('24', 'CARGO')).toBe('RES')
    expect(prefijoDesdobladoForzado('07', 'CPH-POF')).toBe('DOC')
    expect(warn).toHaveBeenCalled()
  })
  it('cualquier cod_registro distinto de 07 (incluido 24) → RES', () => {
    expect(prefijoDesdobladoForzado('24', null)).toBe('RES')
  })
})

describe('formatearCodigoDesdoblado', () => {
  it('rellena a 6 dígitos y usa el prefijo SIN guion extra', () => {
    expect(formatearCodigoDesdoblado('RES', 1)).toBe('RES-000001')
    expect(formatearCodigoDesdoblado('DOC', 460)).toBe('DOC-000460')
    expect(formatearCodigoDesdoblado('RES', 5254)).toBe('RES-005254')
  })
})

describe('tipoDiffDesdoblado (alta 1:1 vs modificado)', () => {
  it('rol 24/07 sin cargo 1:1 (nunca visto) → alta', () => {
    expect(tipoDiffDesdoblado(false)).toBe('alta')
  })
  it('rol 24/07 con cargo 1:1 existente → modificado', () => {
    expect(tipoDiffDesdoblado(true)).toBe('modificado')
  })
})

describe('clasificacionEliminadoDesdoblado (baja 24/07, sin id_sial)', () => {
  it("estado_cargo 'validacion_vacante' → en_validacion", () => {
    expect(clasificacionEliminadoDesdoblado('validacion_vacante')).toBe('en_validacion')
  })
  it('cualquier otro estado → sin_persona', () => {
    expect(clasificacionEliminadoDesdoblado('vigente')).toBe('sin_persona')
    expect(clasificacionEliminadoDesdoblado('no_vigente')).toBe('sin_persona')
    expect(clasificacionEliminadoDesdoblado(null)).toBe('sin_persona')
    expect(clasificacionEliminadoDesdoblado(undefined)).toBe('sin_persona')
  })
})

// Shape del valorAnterior de una baja 24/07 (§3.4): el listado de eliminados
// NO puede depender de id_sial (NULL en los clones), así que codigo_cargo /
// siglas / escalafon / estado_cargo y la marca desdoblado:true viajan en el
// propio diff. Este test fija ese contrato (lo que calcularDiff serializa y lo
// que el listado lee), sin tocar Prisma.
describe('baja 24/07 — contrato de valorAnterior', () => {
  function bajaValorAnterior(o: {
    cargo: {
      idSial: string | null
      codigo: string | null
      estado: string
      literalPuesto: string | null
      especialidadLegacy: string | null
      agrupador: string | null
      hospital: { sigla: string } | null
      escalafon: { nombre: string } | null
    }
    cuil: string | null
    situacionRevista: string | null
    estadoPersona: string | null
  }) {
    // Réplica EXACTA del objeto que calcularDiff serializa para las bajas 24/07.
    return {
      id_sial: o.cargo.idSial,
      codigo_cargo: o.cargo.codigo,
      desdoblado: true,
      estado_cargo: o.cargo.estado,
      cuil_y_rol: o.cuil ?? null,
      literal_puesto: o.cargo.literalPuesto,
      especialidad: o.cargo.especialidadLegacy,
      agrupador: o.cargo.agrupador,
      situacion_de_revista: o.situacionRevista ?? null,
      estado: o.estadoPersona ?? null,
      siglas: o.cargo.hospital?.sigla ?? null,
      escalafon: o.cargo.escalafon?.nombre ?? null,
    }
  }

  it('clon desdoblado (id_sial NULL) conserva codigo_cargo / siglas / escalafon / estado_cargo', () => {
    const va = bajaValorAnterior({
      cargo: {
        idSial: null, // clon: sin id_sial
        codigo: 'RES-001234',
        estado: 'validacion_vacante',
        literalPuesto: 'medico residente',
        especialidadLegacy: 'pediatria',
        agrupador: null,
        hospital: { sigla: 'HGA' },
        escalafon: { nombre: 'Residencias' },
      },
      cuil: '27368625057',
      situacionRevista: 'activo',
      estadoPersona: 'A',
    })
    expect(va.desdoblado).toBe(true)
    expect(va.id_sial).toBeNull()
    expect(va.codigo_cargo).toBe('RES-001234')
    expect(va.siglas).toBe('HGA')
    expect(va.escalafon).toBe('Residencias')
    // La clasificación del listado se deriva de estado_cargo, no de id_sial.
    expect(clasificacionEliminadoDesdoblado(va.estado_cargo)).toBe('en_validacion')
  })
})
