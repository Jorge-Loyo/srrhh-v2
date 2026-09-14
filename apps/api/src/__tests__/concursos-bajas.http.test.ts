/**
 * Tests de integración HTTP — módulos concursos-cph y bajas
 * Requieren stack corriendo: API en http://localhost:3000
 */

import { describe, it, expect, beforeAll } from 'vitest'

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1'])
const BASE_URL = process.env.TEST_API_URL ?? 'http://localhost:3000'

function resolveBase(): { protocol: string; host: string } {
  const parsed = new URL(BASE_URL)
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`[SSRF] Host not in allowlist: ${parsed.hostname}`)
  return { protocol: parsed.protocol, host: parsed.host }
}

const RESOLVED = resolveBase()

function buildUrl(path: string): string {
  return `${RESOLVED.protocol}//${RESOLVED.host}${path}`
}

async function GET(path: string, token?: string) {
  const res = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const json = await res.json().catch(() => ({}))
  // Algunos endpoints devuelven { data, meta } directamente (bajas, concursos-cph)
  // otros devuelven { data: { data, meta } } (padron). Normalizamos acá.
  const body = json.data !== undefined && !Array.isArray(json.data) && json.data?.data !== undefined
    ? json
    : { data: json }
  return { status: res.status, ok: res.ok, body: json, raw: json }
}

async function POST(path: string, payload: unknown, token?: string) {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

async function PATCH(path: string, payload: unknown, token: string) {
  const res = await fetch(buildUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let token = ''

beforeAll(async () => {
  const { ok, body } = await POST('/api/v1/auth/login', {
    username: process.env.TEST_ADMIN_USER ?? 'admin',
    password: process.env.TEST_ADMIN_PASS ?? 'Admin1234!',
  })
  if (!ok) throw new Error(`Login falló: ${JSON.stringify(body)}`)
  token = (body.data as Record<string, unknown>).accessToken as string
}, 10_000)

// ─── Concursos CPH — autenticación ───────────────────────────────────────────

describe('Concursos CPH — autenticación', () => {
  it('GET /concursos-cph sin token → 401', async () => {
    const { status } = await GET('/api/v1/concursos-cph')
    expect(status).toBe(401)
  })

  it('GET /concursos-cph/:id sin token → 401', async () => {
    const { status } = await GET('/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000')
    expect(status).toBe(401)
  })
})

// ─── Concursos CPH — listado ──────────────────────────────────────────────────
// Respuesta: { data: [...], meta: {...} } directamente en el body

describe('GET /api/v1/concursos-cph', () => {
  it('responde 200 con data + meta', async () => {
    const { ok, body } = await GET('/api/v1/concursos-cph', token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty('meta')
  })

  it('meta tiene total, page, limit, pages', async () => {
    const { body } = await GET('/api/v1/concursos-cph', token)
    const meta = body.meta
    expect(typeof meta.total).toBe('number')
    expect(typeof meta.page).toBe('number')
    expect(typeof meta.limit).toBe('number')
    expect(typeof meta.pages).toBe('number')
    expect(meta.total).toBeGreaterThan(0)
  })

  it('cada concurso tiene campos requeridos', async () => {
    const { body } = await GET('/api/v1/concursos-cph?limit=5', token)
    for (const c of body.data as Record<string, unknown>[]) {
      expect(c).toHaveProperty('id')
      expect(c).toHaveProperty('estado')
      expect(c).toHaveProperty('subEstado')
      expect(c).toHaveProperty('updatedAt')
    }
  })

  it('filtro estado=activo devuelve solo activos', async () => {
    const { body } = await GET('/api/v1/concursos-cph?estado=activo&limit=20', token)
    for (const c of body.data as { estado: string }[]) {
      expect(c.estado).toBe('activo')
    }
  })

  it('filtro estado=suspendido devuelve solo suspendidos', async () => {
    const { body } = await GET('/api/v1/concursos-cph?estado=suspendido&limit=20', token)
    for (const c of body.data as { estado: string }[]) {
      expect(c.estado).toBe('suspendido')
    }
  })

  it('filtro suspendido=true devuelve solo suspendidos', async () => {
    const { body } = await GET('/api/v1/concursos-cph?suspendido=true&limit=20', token)
    for (const c of body.data as { suspendido: boolean }[]) {
      expect(c.suspendido).toBe(true)
    }
  })

  it('filtro suspendido=false devuelve solo no suspendidos', async () => {
    const { body } = await GET('/api/v1/concursos-cph?suspendido=false&limit=20', token)
    // suspendido=false filtra los que tienen suspendido=false en DB
    // pero el campo en la respuesta puede ser true si el estado es suspendido por otro motivo
    // — verificamos que ninguno tenga suspendido=true en el campo
    for (const c of body.data as { suspendido: boolean }[]) {
      expect(c.suspendido).toBe(false)
    }
  })

  it('paginación: limit=5 devuelve máx 5 items', async () => {
    const { body } = await GET('/api/v1/concursos-cph?limit=5', token)
    expect((body.data as unknown[]).length).toBeLessThanOrEqual(5)
    expect(body.meta.limit).toBe(5)
  })

  it('filtro conFaltantes=true devuelve concursos con campos vacíos', async () => {
    const { ok, body } = await GET('/api/v1/concursos-cph?conFaltantes=true&limit=50', token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    for (const c of body.data as { estado: string; suspendido: boolean }[]) {
      expect(['activo', 'no_iniciado']).toContain(c.estado)
      expect(c.suspendido).toBe(false)
    }
  })

  it('filtro conFaltantes=true + estado=activo combina correctamente', async () => {
    const { ok, body } = await GET('/api/v1/concursos-cph?conFaltantes=true&estado=activo&limit=20', token)
    expect(ok).toBe(true)
    for (const c of body.data as { estado: string }[]) {
      expect(c.estado).toBe('activo')
    }
  })

  it('búsqueda por texto devuelve resultados', async () => {
    const { ok, body } = await GET('/api/v1/concursos-cph?search=HGATA&limit=10', token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect((body.data as unknown[]).length).toBeGreaterThan(0)
  })

  it('búsqueda sin resultados devuelve array vacío con total=0', async () => {
    const { ok, body } = await GET('/api/v1/concursos-cph?search=ZZZZINEXISTENTEZZZ', token)
    expect(ok).toBe(true)
    expect(body.data).toHaveLength(0)
    expect(body.meta.total).toBe(0)
  })
})

// ─── Concursos CPH — detalle ──────────────────────────────────────────────────

describe('GET /api/v1/concursos-cph/:id', () => {
  it('id inexistente → 404', async () => {
    const { status } = await GET('/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000', token)
    expect(status).toBe(404)
  })

  it('id real → 200 con campos completos', async () => {
    const { body: list } = await GET('/api/v1/concursos-cph?limit=1', token)
    const first = (list.data as { id: string }[])[0]
    if (!first) return

    const { ok, body } = await GET(`/api/v1/concursos-cph/${first.id}`, token)
    expect(ok).toBe(true)
    const c = body.data as Record<string, unknown>
    expect(c).toHaveProperty('id')
    expect(c).toHaveProperty('estado')
    expect(c).toHaveProperty('subEstado')
    expect(c).toHaveProperty('hospital')
    // cargo está anidado en concurso.cargo
    expect(c).toHaveProperty('concurso')
    expect((c.concurso as Record<string, unknown>)).toHaveProperty('cargo')
  })
})

// ─── Concursos CPH — PATCH validaciones ──────────────────────────────────────

describe('PATCH /api/v1/concursos-cph/:id — validaciones', () => {
  it('id inexistente → 404', async () => {
    const { status } = await PATCH(
      '/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000',
      { observaciones: 'test' },
      token,
    )
    expect(status).toBe(404)
  })

  it('sin token → 401', async () => {
    const res = await fetch(buildUrl('/api/v1/concursos-cph/00000000-0000-0000-0000-000000000000'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })
})

// ─── Bajas — autenticación ────────────────────────────────────────────────────

describe('Bajas — autenticación', () => {
  it('GET /bajas sin token → 401', async () => {
    const { status } = await GET('/api/v1/bajas')
    expect(status).toBe(401)
  })
})

// ─── Bajas — listado ─────────────────────────────────────────────────────────
// Respuesta: { data: [...], meta: {...} } directamente en el body

describe('GET /api/v1/bajas', () => {
  it('responde 200 con data array + meta', async () => {
    const { ok, body } = await GET('/api/v1/bajas', token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty('meta')
  })

  it('cada baja tiene campos requeridos', async () => {
    const { body } = await GET('/api/v1/bajas?limit=5', token)
    for (const b of body.data as Record<string, unknown>[]) {
      expect(b).toHaveProperty('id')
      expect(b).toHaveProperty('estado')
      expect(b).toHaveProperty('cargo')
    }
  })

  it('campo enSial es boolean', async () => {
    const { body } = await GET('/api/v1/bajas?limit=10', token)
    for (const b of body.data as Record<string, unknown>[]) {
      expect(typeof b.enSial).toBe('boolean')
    }
  })

  it('paginación: limit=5 devuelve máx 5 items', async () => {
    const { body } = await GET('/api/v1/bajas?limit=5', token)
    expect((body.data as unknown[]).length).toBeLessThanOrEqual(5)
    expect(body.meta.limit).toBe(5)
  })
})

// ─── Bajas — detalle ─────────────────────────────────────────────────────────

describe('GET /api/v1/bajas/:id', () => {
  it('id inexistente → 404', async () => {
    const { status } = await GET('/api/v1/bajas/00000000-0000-0000-0000-000000000000', token)
    expect(status).toBe(404)
  })

  it('id real → 200 con campos completos', async () => {
    const { body: list } = await GET('/api/v1/bajas?limit=1', token)
    const first = (list.data as { id: string }[])[0]
    if (!first) return

    const { ok, body } = await GET(`/api/v1/bajas/${first.id}`, token)
    expect(ok).toBe(true)
    const b = body.data as Record<string, unknown>
    expect(b).toHaveProperty('id')
    expect(b).toHaveProperty('estado')
    expect(b).toHaveProperty('cargo')
  })
})

// ─── Rendimiento ──────────────────────────────────────────────────────────────

describe('Rendimiento', () => {
  it('GET /concursos-cph (limit=50) responde en menos de 2s', async () => {
    const start = Date.now()
    await GET('/api/v1/concursos-cph?limit=50', token)
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('GET /concursos-cph?conFaltantes=true responde en menos de 3s', async () => {
    const start = Date.now()
    await GET('/api/v1/concursos-cph?conFaltantes=true&limit=50', token)
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('GET /bajas (limit=50) responde en menos de 2s', async () => {
    const start = Date.now()
    await GET('/api/v1/bajas?limit=50', token)
    expect(Date.now() - start).toBeLessThan(2000)
  })
})
