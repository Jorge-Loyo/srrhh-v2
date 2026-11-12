import { describe, it, expect } from 'vitest'
// Núcleo puro: CR deducido de la carrera según los códigos de registro del seed
// (prisma/seed.ts) y la regla única tipoConcursoDeCargo.
const { elegirCrPorCarrera, codigoCrDeEscalafon, resolverCrPorCarrera } = await import('../shared/crPorCarrera.js')
const cr = (codigo: string) => ({ id: `id-${codigo}`, codigo })
describe('elegirCrPorCarrera', () => {
  it('Nueva Carrera Profesional Hospitalaria (22 y 37) => 37, cph', () => {
    expect(elegirCrPorCarrera([cr('22'), cr('37')], 'Médico')).toMatchObject({ codigo: '37', tipo: 'cph' })
  })
  it('Salud - Guardias (23) => 23, cph', () => {
    expect(elegirCrPorCarrera([cr('23')], 'Médico')).toMatchObject({ codigo: '23', tipo: 'cph' })
  })
  it('CEETPS (85) y Nueva Carrera Enfermería (87) => ceetps', () => {
    expect(elegirCrPorCarrera([cr('85')], 'X')).toMatchObject({ codigo: '85', tipo: 'ceetps' })
    expect(elegirCrPorCarrera([cr('87')], 'Enfermero')).toMatchObject({ codigo: '87', tipo: 'ceetps' })
  })
  it('Administrativa (83 y 19): sin tipo salvo puesto de Anexo II', () => {
    expect(elegirCrPorCarrera([cr('19'), cr('83')], 'Administrativo')).toBeNull()
  })
  it('carreras sin CR gestionable (24, 70, 17, vacío) => null', () => {
    expect(elegirCrPorCarrera([cr('24')], 'X')).toBeNull()
    expect(elegirCrPorCarrera([cr('70')], 'X')).toBeNull()
    expect(elegirCrPorCarrera([], 'X')).toBeNull()
  })
})

describe('fallback por código de escalafón (Neon)', () => {
  it('codigoCrDeEscalafon: 37/22 => 37, 23, 83, 85, 87; no gestionados => null', () => {
    expect(codigoCrDeEscalafon('37')).toBe('37')
    expect(codigoCrDeEscalafon('22')).toBe('37')
    expect(['23', '83', '85', '87'].map(codigoCrDeEscalafon)).toEqual(['23', '83', '85', '87'])
    expect(codigoCrDeEscalafon('24')).toBeNull()
    expect(codigoCrDeEscalafon(undefined)).toBeNull()
  })
  it('sin CR propios o sin ninguno clasificable se usa el fallback; si un CR propio clasifica tiene prioridad', () => {
    expect(elegirCrPorCarrera([], 'X', cr('87'))).toMatchObject({ codigo: '87', tipo: 'ceetps' })
    expect(elegirCrPorCarrera([cr('19')], 'X', cr('87'))).toMatchObject({ codigo: '87', tipo: 'ceetps' })
    expect(elegirCrPorCarrera([cr('85')], 'X', cr('87'))).toMatchObject({ codigo: '85' })
    expect(elegirCrPorCarrera([cr('19')], 'Administrativo', cr('83'))).toBeNull()
  })
  it('83 con fallback: solo Anexo II (sin Anexo II => null)', () => {
    expect(elegirCrPorCarrera([], 'Administrativo', cr('83'))).toBeNull()
  })
  function fakeDb(escCodigo: string | null, propios: { id: string; codigo: string; escalafonId: string }[]) {
    const porCodigo = [cr('37'), cr('23'), cr('83'), cr('85'), cr('87')]
    return {
      codigoRegistro: {
        findMany: async () => propios,
        findUnique: async ({ where }: { where: { codigo: string } }) => porCodigo.find((c) => c.codigo === where.codigo) ?? null,
      },
      escalafon: { findUnique: async () => (escCodigo ? { codigo: escCodigo } : null) },
    }
  }
  it.each([
    ['87', 'ceetps', '87'], ['85', 'ceetps', '85'], ['37', 'cph', '37'], ['22', 'cph', '37'], ['23', 'cph', '23'],
  ])('resolver: escalafón %s sin CR propios => %s / CR %s', async (esc, tipo, codigo) => {
    expect(await resolverCrPorCarrera(fakeDb(esc, []), 'e', 'Puesto')).toMatchObject({ tipo, codigo })
  })
  it('alta nueva CPH (Neon: escalafón 22 con CR 22 y 37): siempre CR 37, nunca 22 (resolver + normalizarCrCphId)', async () => {
    const { normalizarCrCphId } = await import('../shared/crCph.js')
    const propios = [{ id: 'id-22', codigo: '22', escalafonId: 'e' }, { id: 'id-37', codigo: '37', escalafonId: 'e' }]
    for (const puesto of ['Médico', 'Bioquímico', 'Puesto']) {
      const r = await resolverCrPorCarrera(fakeDb('22', propios), 'e', puesto)
      expect(r).toMatchObject({ id: 'id-37', codigo: '37', tipo: 'cph' })
      // Lo que guarda _aprobarAltaCargo en el cargo: normalizarCrCphId sobre el CR (deducido o explícito 22).
      const dbCph = {
        codigoRegistro: {
          findUnique: async ({ where }: { where: { id: string } }) => propios.find((c) => c.id === where.id) ?? null,
          findFirst: async ({ where }: { where: { codigo: string; escalafonId: string } }) =>
            propios.find((c) => c.codigo === where.codigo && c.escalafonId === where.escalafonId) ?? null,
        },
      }
      expect(await normalizarCrCphId(dbCph, r!.id)).toBe('id-37')
      expect(await normalizarCrCphId(dbCph, 'id-22')).toBe('id-37')
    }
  })
  it('resolver: 83 sin CR propios, Anexo II => CEETPS; otro puesto => null', async () => {
    expect(await resolverCrPorCarrera(fakeDb('83', []), 'e', 'Administrativo')).toBeNull()
    expect(await resolverCrPorCarrera(fakeDb('83', []), 'e', 'Radioperador')).toMatchObject({ tipo: 'ceetps', codigo: '83' })
  })
  it('resolver: carrera no gestionada sin CR => null; con CR propios clasificables gana el propio; con propios no clasificables cae al código de escalafón', async () => {
    expect(await resolverCrPorCarrera(fakeDb('24', []), 'e', 'X')).toBeNull()
    expect(await resolverCrPorCarrera(fakeDb('87', [{ ...cr('85'), escalafonId: 'e' }]), 'e', 'X')).toMatchObject({ codigo: '85' })
    expect(await resolverCrPorCarrera(fakeDb('87', [{ ...cr('19'), escalafonId: 'e' }]), 'e', 'X')).toMatchObject({ codigo: '87', tipo: 'ceetps' })
  })
})
