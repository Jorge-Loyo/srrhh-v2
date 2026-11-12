import { describe, expect, it } from 'vitest'
import { asegurarBaseLocal } from './guardaBase.js'

describe('asegurarBaseLocal', () => {
  it('se niega con neon.tech (minusculas, mayusculas, pooler)', () => {
    expect(() => asegurarBaseLocal('postgresql://u:p@ep-abc.us-east-2.aws.neon.tech/db')).toThrow(/neon\.tech/)
    expect(() => asegurarBaseLocal('postgresql://u:p@EP-ABC.AWS.NEON.TECH/db')).toThrow(/neon\.tech/)
    expect(() => asegurarBaseLocal('postgresql://u:p@ep-abc-pooler.us-east-2.aws.neon.tech/db?sslmode=require')).toThrow(/neon\.tech/)
  })

  it('se niega si neon.tech aparece como userinfo y el host real es otro', () => {
    expect(() => asegurarBaseLocal('postgresql://localhost:x@host-remoto.com/db?h=neon.tech')).toThrow()
    expect(() => asegurarBaseLocal('postgresql://u@localhost:p@ep-x.neon.tech/db')).toThrow()
    expect(() => asegurarBaseLocal('postgresql://ep-x.neon.tech:p@localhost/db')).toThrow(/neon\.tech/)
  })

  it('se niega con hosts no locales, vacios o no parseables', () => {
    expect(() => asegurarBaseLocal('postgresql://u:p@db.ejemplo.com/db')).toThrow(/no es local/)
    expect(() => asegurarBaseLocal('postgresql://u:p@localhost.ejemplo.com/db')).toThrow(/no es local/)
    expect(() => asegurarBaseLocal('')).toThrow()
    expect(() => asegurarBaseLocal(undefined)).toThrow()
    expect(() => asegurarBaseLocal('no es una url')).toThrow(/no parseable/)
  })

  it('acepta localhost, 127.0.0.1 y srrhh_postgres', () => {
    expect(asegurarBaseLocal('postgresql://u:p@localhost:5432/db')).toBe('localhost')
    expect(asegurarBaseLocal('postgresql://u:p@127.0.0.1:5432/db')).toBe('127.0.0.1')
    expect(asegurarBaseLocal('postgresql://u:p@srrhh_postgres:5432/db')).toBe('srrhh_postgres')
  })

  it('no incluye la contraseña en el mensaje de error', () => {
    try {
      asegurarBaseLocal('postgresql://u:SECRETO123@db.ejemplo.com/db')
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRETO123')
    }
  })
})
