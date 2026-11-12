import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { esPuestoEnfermeria, esEspecialidadEnfermeriaPermitida, violaReglaEnfermeria } from '../shared/especialidadesEnfermeria.js'

// Revisión estática de la migración (no se ejecuta contra ninguna base).
const MIGRACION = fileURLToPath(new URL(
  '../../../../prisma/migrations/20261114000000_especialidades_enfermeria_atp_atc/migration.sql', import.meta.url))

describe('migración especialidades enfermería ATP/ATC', () => {
  const sql = readFileSync(MIGRACION, 'utf8')
  const ejecutable = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  it('crea las dos especialidades con los nombres que acepta la regla', () => {
    expect(ejecutable).toContain("('Enfermeros ATP'), ('Enfermeros ATC')")
    expect(esEspecialidadEnfermeriaPermitida('Enfermeros ATP')).toBe(true)
    expect(esEspecialidadEnfermeriaPermitida('Enfermeros ATC')).toBe(true)
  })
  it('es idempotente y solo inserta (sin UPDATE/DELETE/DDL)', () => {
    expect(ejecutable).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM especialidades_puesto ep\s+WHERE ep\.puesto_cargo_id = pc\.id/)
    expect(ejecutable).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i)
  })
  it('excluye auxiliar y cuidador, igual que esPuestoEnfermeria', () => {
    expect(ejecutable).toContain("LIKE '%enfermer%'")
    expect(ejecutable).toContain("NOT LIKE 'auxiliar%'")
    expect(ejecutable).toContain("NOT LIKE 'cuidador%'")
  })
})

describe('regla enfermería ATP/ATC (backend)', () => {
  it.each(['Enfermero/a', 'Licenciado en Enfermería', 'lic. en enfermeria', 'Enfermero Jefe', 'ENFERMERIA'])(
    'puesto alcanzado: %s', (p) => expect(esPuestoEnfermeria(p)).toBe(true))
  it.each(['Auxiliar de Enfermería', 'cuidador enfermero de animales', 'Medico de planta', ''])(
    'puesto no alcanzado: %s', (p) => expect(esPuestoEnfermeria(p)).toBe(false))

  it.each(['Enfermeros ATP', 'Enfermeros ATC', 'enfermero atc', 'ENFERMERÍA ATP', 'ATC Enfermeros'])(
    'especialidad permitida: %s', (e) => expect(esEspecialidadEnfermeriaPermitida(e)).toBe(true))
  it.each(['enfermeria', 'Enfermeros', 'ATP', 'enfermeros atpx'])(
    'especialidad no permitida: %s', (e) => expect(esEspecialidadEnfermeriaPermitida(e)).toBe(false))

  it('viola solo con puesto de enfermería y especialidad no ATP/ATC', () => {
    expect(violaReglaEnfermeria('Enfermero/a', 'enfermeria')).toBe(true)
    expect(violaReglaEnfermeria('Enfermero/a', 'Enfermeros ATP')).toBe(false)
    expect(violaReglaEnfermeria('Enfermero/a', null)).toBe(false)
    expect(violaReglaEnfermeria('Medico de planta', 'cardiologia')).toBe(false)
  })
})
