import { describe, it, expect, vi, beforeEach } from 'vitest'
const { crearNotificacion } = vi.hoisted(() => ({ crearNotificacion: vi.fn() }))
vi.mock('../shared/prisma.js', () => ({ prisma: {} }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion }))
import {
  notificarSgrasvYHijos,
  origenKeyPorRol,
  slugsDestinatariosSgrasv,
} from '../modules/notificaciones/notificarSgrasv.js'
function fakeTx(roles: { slug: string }[], jerarquia: { rolHijoSlug: string; rolPadreSlug: string }[]) {
  return {
    role: { findMany: vi.fn().mockResolvedValue(roles) },
    roleJerarquia: { findMany: vi.fn().mockResolvedValue(jerarquia) },
  } as never
}
const JERARQUIA = [
  { rolHijoSlug: 'sgrasv_5ac494e', rolPadreSlug: 'director' },
  { rolHijoSlug: 'supervision_de_concursos_4ff21d6', rolPadreSlug: 'sgrasv_5ac494e' },
]
describe('notificarSgrasv', () => {
  beforeEach(() => crearNotificacion.mockReset())
  it('devuelve SGRASV real + descendientes', async () => {
    const slugs = await slugsDestinatariosSgrasv(fakeTx([{ slug: 'sgrasv_5ac494e' }], JERARQUIA))
    expect(slugs).toEqual(['sgrasv_5ac494e', 'supervision_de_concursos_4ff21d6'])
  })
  it('sin rol SGRASV devuelve [] y no lanza', async () => {
    await expect(slugsDestinatariosSgrasv(fakeTx([], JERARQUIA))).resolves.toEqual([])
  })
  it('más de un rol con el permiso devuelve [] y no lanza', async () => {
    const tx = fakeTx([{ slug: 'a' }, { slug: 'b' }], JERARQUIA)
    await expect(slugsDestinatariosSgrasv(tx)).resolves.toEqual([])
  })
  it('crea una notificación por rol con origenKey distinto', async () => {
    await notificarSgrasvYHijos(
      { tipo: 'concurso_iniciado', titulo: 't', mensaje: 'm', origenKey: 'k:1' },
      fakeTx([{ slug: 'sgrasv_5ac494e' }], JERARQUIA),
    )
    expect(crearNotificacion).toHaveBeenCalledTimes(2)
    const keys = crearNotificacion.mock.calls.map((c) => c[0].origenKey)
    expect(keys).toEqual(['k:1:sgrasv_5ac494e', 'k:1:supervision_de_concursos_4ff21d6'])
    expect(new Set(keys).size).toBe(2)
    expect(origenKeyPorRol('k:1', 'x')).toBe('k:1:x')
  })
  it('sin destinatarios no crea notificaciones', async () => {
    await notificarSgrasvYHijos({ tipo: 'concurso_iniciado', titulo: 't', mensaje: 'm' }, fakeTx([], []))
    expect(crearNotificacion).not.toHaveBeenCalled()
  })
})
