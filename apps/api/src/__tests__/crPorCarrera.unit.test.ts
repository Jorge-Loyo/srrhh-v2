import { describe, it, expect } from 'vitest'
// Núcleo puro: CR deducido de la carrera según los códigos de registro del seed
// (prisma/seed.ts) y la regla única tipoConcursoDeCargo.
const { elegirCrPorCarrera } = await import('../shared/crPorCarrera.js')
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
