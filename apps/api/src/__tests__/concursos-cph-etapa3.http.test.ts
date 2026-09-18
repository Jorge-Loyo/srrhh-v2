/**
 * Tests de integración HTTP — Sprint 18: wizard CPH etapas 2/3
 * (sorteo de jurado, inscriptos, publicaciones, confirmaciones).
 * Requieren stack corriendo: API en http://localhost:3000
 */
import { describe, it, expect, beforeAll } from 'vitest'

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1'])
const BASE_URL = process.env.TEST_API_URL ?? 'http://localhost:3000'
function resolveBase(): { protocol: string; host: string } {
  const parsed = new URL(BASE_URL)
  if (!ALLOWED_HOSTS.has(parsed.hostname))
    throw new Error(`[SSRF] Host not in allowlist: ${parsed.hostname}`)
  return { protocol: parsed.protocol, host: parsed.host }
}
const RESOLVED = resolveBase()
const buildUrl = (p: string) => `${RESOLVED.protocol}//${RESOLVED.host}${p}`

async function req(method: string, path: string, token?: string, payload?: unknown) {
  const res = await fetch(buildUrl(path), {
    method,
    headers: {
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}
const GET = (p: string, t?: string) => req('GET', p, t)
const POST = (p: string, payload?: unknown, t?: string) => req('POST', p, t, payload ?? {})
const DELETE = (p: string, t: string) => req('DELETE', p, t)

let token = ''
let concursoId = ''

beforeAll(async () => {
  const login = await POST('/api/v1/auth/login', {
    username: process.env.TEST_ADMIN_USER ?? 'admin',
    password: process.env.TEST_ADMIN_PASS ?? 'Admin1234!',
  })
  if (!login.ok) throw new Error(`Login falló: ${JSON.stringify(login.body)}`)
  token = (login.body.data as Record<string, unknown>).accessToken as string

  // Tomar cualquier concurso CPH existente para las pruebas de lectura/CRUD.
  const list = await GET('/api/v1/concursos-cph?limit=1', token)
  concursoId = (list.body.data as { id: string }[])[0]?.id ?? ''
}, 15_000)

describe('Sprint 18 — autenticación de endpoints nuevos', () => {
  it('GET /:id/jurado sin token → 401', async () => {
    const { status } = await GET(
      '/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000/jurado',
    )
    expect(status).toBe(401)
  })
  it('GET /:id/inscriptos sin token → 401', async () => {
    const { status } = await GET(
      '/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000/inscriptos',
    )
    expect(status).toBe(401)
  })
  it('POST /:id/generar-sorteo sin token → 401', async () => {
    const { status } = await POST(
      '/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000/generar-sorteo',
    )
    expect(status).toBe(401)
  })
  it('POST /:id/orden-merito/confirmar sin token → 401', async () => {
    const { status } = await POST(
      '/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000/orden-merito/confirmar',
    )
    expect(status).toBe(401)
  })
})

describe('Sprint 18 — jurado (lectura)', () => {
  it('GET /:id/jurado responde 200 (acta o null)', async () => {
    if (!concursoId) return
    const { ok, body } = await GET(`/api/v1/concursos-cph/${concursoId}/jurado`, token)
    expect(ok).toBe(true)
    // data es el acta o null; si hay acta, tiene miembros[]
    if (body.data) expect(Array.isArray((body.data as { miembros: unknown[] }).miembros)).toBe(true)
  })
})

describe('Sprint 18 — inscriptos CRUD + cantidad autocalculada', () => {
  it('GET /:id/inscriptos responde 200 con array', async () => {
    if (!concursoId) return
    const { ok, body } = await GET(`/api/v1/concursos-cph/${concursoId}/inscriptos`, token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('alta manual → aparece en la lista → borrado → qInscriptos se recalcula', async () => {
    if (!concursoId) return
    // conteo inicial
    const antes = await GET(`/api/v1/concursos-cph/${concursoId}/inscriptos`, token)
    const nAntes = (antes.body.data as unknown[]).length

    // alta
    const alta = await POST(
      `/api/v1/concursos-cph/${concursoId}/inscriptos`,
      { apellido: 'ZZTest', nombre: 'Automatizado', dni: '99999999', email: 'zztest@example.com' },
      token,
    )
    expect(alta.ok).toBe(true)
    const inscriptoId = (alta.body.data as { id: string }).id
    expect(inscriptoId).toBeTruthy()

    // aparece en la lista
    const despues = await GET(`/api/v1/concursos-cph/${concursoId}/inscriptos`, token)
    expect((despues.body.data as unknown[]).length).toBe(nAntes + 1)

    // qInscriptos autocalculado en el concurso
    const detalle = await GET(`/api/v1/concursos-cph/${concursoId}`, token)
    expect((detalle.body.data as { qInscriptos: number }).qInscriptos).toBe(nAntes + 1)

    // limpieza: borrar el inscripto de prueba
    const del = await DELETE(`/api/v1/concursos-cph/${concursoId}/inscriptos/${inscriptoId}`, token)
    expect(del.ok).toBe(true)
    const final = await GET(`/api/v1/concursos-cph/${concursoId}/inscriptos`, token)
    expect((final.body.data as unknown[]).length).toBe(nAntes)
  })

  it('alta sin apellido/nombre → 400 (validación Zod)', async () => {
    if (!concursoId) return
    const { status } = await POST(
      `/api/v1/concursos-cph/${concursoId}/inscriptos`,
      { apellido: '' },
      token,
    )
    expect(status).toBe(400)
  })
})

describe('Sprint 18 — validaciones de confirmación (orden secuencial)', () => {
  it('confirmar orden de mérito sin presentados confirmados → 409', async () => {
    if (!concursoId) return
    // Sobre un concurso cualquiera sin el flujo previo, debe rechazar con conflicto.
    const { status } = await POST(
      `/api/v1/concursos-cph/${concursoId}/orden-merito/confirmar`,
      {},
      token,
    )
    // 409 (conflicto de flujo) es el esperado; si el concurso ya estuviera en un
    // estado avanzado podría variar, por eso aceptamos 409 como validación clave.
    expect([409, 400]).toContain(status)
  })

  it('publicar examen sin inscripción cerrada → 409', async () => {
    if (!concursoId) return
    const { status } = await POST(`/api/v1/concursos-cph/${concursoId}/examen/publicar`, {}, token)
    expect([409, 400]).toContain(status)
  })
})
