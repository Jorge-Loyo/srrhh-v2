import { describe, it, expect } from 'vitest'
import { decidirEspecialidad } from './padron.especialidad.helpers.js'

// Bug A — precedencia PURA de especialidad_puesto_id (sin tx/Prisma).
// Casos del diseño §3.4: id válido+mismo puesto -> usar-id; id válido+otro
// puesto -> fallback; id inexistente -> fallback; sin id+texto real -> fallback;
// sin id+texto vacío/placeholder -> conservar.

const PUESTO = 'puesto-1'
const OTRO_PUESTO = 'puesto-2'
const ID_ESP = 'esp-cirugia-plastica'

describe('decidirEspecialidad', () => {
  it('id válido y mismo puesto -> usar-id', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: ID_ESP,
        puestoDelId: PUESTO,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: 'bioquimica clinica',
      }),
    ).toBe('usar-id')
  })

  it('id válido pero cuelga de otro puesto -> fallback-texto', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: ID_ESP,
        puestoDelId: OTRO_PUESTO,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: 'cirugia plastica y reparadora',
      }),
    ).toBe('fallback-texto')
  })

  it('id inexistente en catálogo (puestoDelId undefined) -> fallback-texto', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: ID_ESP,
        puestoDelId: undefined,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: 'cirugia plastica y reparadora',
      }),
    ).toBe('fallback-texto')
  })

  it('sin id + texto real -> fallback-texto', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: null,
        puestoDelId: undefined,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: 'cardiologia',
      }),
    ).toBe('fallback-texto')
  })

  it('sin id + texto vacío/placeholder -> conservar', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: null,
        puestoDelId: undefined,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: null,
      }),
    ).toBe('conservar')
  })

  it('id en blanco (string vacío) se trata como sin id', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: '',
        puestoDelId: undefined,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: null,
      }),
    ).toBe('conservar')
  })

  // Caso Sargenti: modificación de especialidad con el marcador presente. El id
  // de cirugía plástica cuelga del puesto del cargo -> se usa, NO se re-resuelve
  // por texto (que divergía a bioquímica clínica).
  it('caso Sargenti: id de cirugía plástica válido -> usar-id (no re-resuelve a bioquímica)', () => {
    expect(
      decidirEspecialidad({
        idDotaneitor: ID_ESP,
        puestoDelId: PUESTO,
        puestoDelCargo: PUESTO,
        textoEspecialidadReal: 'cirugia plastica y reparadora',
      }),
    ).toBe('usar-id')
  })
})

// Lectura del marcador __especialidad_puesto_id__ desde el grupo `cambios` de un
// diff 'modificado', replicando la línea del paso 6 del aprobar. Verifica que el
// id viaja (H1) y que su ausencia -> null (fallback automático).
function leerIdDotaEsp(cambios: { campo: string; valorNuevo: string | null }[]): string | null {
  return cambios.find((c) => c.campo === '__especialidad_puesto_id__')?.valorNuevo ?? null
}

describe('lectura del marcador __especialidad_puesto_id__', () => {
  it('con marcador presente -> devuelve el id', () => {
    const cambios = [
      { campo: 'especialidad', valorNuevo: 'cirugia plastica y reparadora' },
      { campo: '__especialidad_puesto_id__', valorNuevo: ID_ESP },
    ]
    expect(leerIdDotaEsp(cambios)).toBe(ID_ESP)
  })

  it('sin marcador -> null (fallback por texto)', () => {
    const cambios = [{ campo: 'especialidad', valorNuevo: 'cirugia plastica y reparadora' }]
    expect(leerIdDotaEsp(cambios)).toBeNull()
  })

  it('marcador con valorNuevo null -> null', () => {
    const cambios = [{ campo: '__especialidad_puesto_id__', valorNuevo: null }]
    expect(leerIdDotaEsp(cambios)).toBeNull()
  })
})
