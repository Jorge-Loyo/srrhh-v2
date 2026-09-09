/**
 * Tests de integración HTTP — módulo padrón
 *
 * Requieren que el stack esté corriendo:
 *   API:        http://localhost:3000
 *   Dotaneitor: http://localhost:5001
 *
 * Se ejecutan con: pnpm test (vitest run)
 * Para correr solo este archivo: pnpm vitest run src/__tests__/padron.http.test.ts
 *
 * NO modifican datos permanentes: usan snapshots en estado error/rechazado
 * para los DELETE, y no aprueban snapshots reales.
 */

import { describe, it, expect, beforeAll } from 'vitest'

// ─── SSRF-safe HTTP helpers ───────────────────────────────────────────────────
//
// All fetch calls are encapsulated here. The base host is resolved from env
// vars but validated against an allowlist before use. The `path` parameter
// is always a string literal supplied by test code, never derived from
// external or user-controlled input.

type Base = 'api' | 'dotaneitor'

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1'])

const BASE_URLS: Record<Base, string> = {
  api:        process.env.TEST_API_URL        ?? 'http://localhost:3000',
  dotaneitor: process.env.TEST_DOTANEITOR_URL ?? 'http://localhost:5001',
}

function resolveBase(base: Base): { protocol: string; host: string } {
  const parsed = new URL(BASE_URLS[base])
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`[SSRF] Host not in allowlist: ${parsed.hostname}`)
  }
  return { protocol: parsed.protocol, host: parsed.host }
}

// Validate all bases at module load time so tests fail fast on bad config
const RESOLVED: Record<Base, { protocol: string; host: string }> = {
  api:        resolveBase('api'),
  dotaneitor: resolveBase('dotaneitor'),
}

function buildUrl(base: Base, path: string): string {
  const { protocol, host } = RESOLVED[base]
  return `${protocol}//${host}${path}`
}

async function GET(base: Base, path: string, token?: string) {
  const url = buildUrl(base, path)
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  return { status: res.status, ok: res.ok, body }
}

async function POST(base: Base, path: string, payload: unknown, token?: string) {
  const url = buildUrl(base, path)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  return { status: res.status, ok: res.ok, body }
}

async function DELETE(base: Base, path: string, token: string) {
  const url = buildUrl(base, path)
  return fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function UPLOAD(base: Base, path: string, form: FormData, token: string) {
  const url = buildUrl(base, path)
  return fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
}

async function GETraw(base: Base, path: string, token: string) {
  const url = buildUrl(base, path)
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

// ─── Setup: obtener token admin ───────────────────────────────────────────────

let token = ''

beforeAll(async () => {
  const { ok, body } = await POST('api', '/api/v1/auth/login', {
    username: process.env.TEST_ADMIN_USER ?? 'admin',
    password: process.env.TEST_ADMIN_PASS ?? 'Admin1234!',
  })
  if (!ok) throw new Error(`Login falló: ${JSON.stringify(body)}`)
  token = body.data.accessToken
}, 10_000)

// ─── Health checks ────────────────────────────────────────────────────────────

describe('Health checks', () => {
  it('API /health → 200 status ok', async () => {
    const { ok, body } = await GET('api', '/health')
    expect(ok).toBe(true)
    expect(body.status).toBe('ok')
  })

  it('Dotaneitor /health → 200 status ok', async () => {
    const { ok, body } = await GET('dotaneitor', '/health')
    expect(ok).toBe(true)
    expect(body.status).toBe('ok')
  })
})

// ─── Autenticación ────────────────────────────────────────────────────────────

describe('Autenticación', () => {
  it('GET /padron/snapshots sin token → 401', async () => {
    const { status } = await GET('api', '/api/v1/padron/snapshots')
    expect(status).toBe(401)
  })

  it('POST /padron/upload sin token → 401', async () => {
    const { status } = await POST('api', '/api/v1/padron/upload', {})
    expect(status).toBe(401)
  })

  it('POST /padron/snapshots/:id/aprobar sin token → 401', async () => {
    const { status } = await POST('api', '/api/v1/padron/snapshots/fake-id/aprobar', {})
    expect(status).toBe(401)
  })
})

// ─── GET /snapshots ───────────────────────────────────────────────────────────

describe('GET /api/v1/padron/snapshots', () => {
  it('responde 200 con array', async () => {
    const { ok, body } = await GET('api', '/api/v1/padron/snapshots', token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('cada snapshot tiene los campos requeridos', async () => {
    const { body } = await GET('api', '/api/v1/padron/snapshots', token)
    const snapshots: unknown[] = body.data
    if (snapshots.length === 0) return

    const s = snapshots[0] as Record<string, unknown>
    expect(s).toHaveProperty('id')
    expect(s).toHaveProperty('fechaAsignada')
    expect(s).toHaveProperty('filename')
    expect(s).toHaveProperty('totalRegistros')
    expect(s).toHaveProperty('estado')
  })

  it('estados válidos en todos los snapshots', async () => {
    const ESTADOS_VALIDOS = ['procesando', 'pendiente', 'aprobado', 'rechazado', 'error']
    const { body } = await GET('api', '/api/v1/padron/snapshots', token)
    for (const s of body.data as Record<string, unknown>[]) {
      expect(ESTADOS_VALIDOS).toContain(s.estado)
    }
  })

  it('snapshots ordenados por fechaAsignada desc', async () => {
    const { body } = await GET('api', '/api/v1/padron/snapshots', token)
    const snapshots = body.data as { fechaAsignada: string }[]
    if (snapshots.length < 2) return

    for (let i = 0; i < snapshots.length - 1; i++) {
      const a = new Date(snapshots[i].fechaAsignada).getTime()
      const b = new Date(snapshots[i + 1].fechaAsignada).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })
})

// ─── GET /snapshots/:id/estado ────────────────────────────────────────────────

describe('GET /api/v1/padron/snapshots/:id/estado', () => {
  it('snapshot inexistente → 404', async () => {
    const { status } = await GET(
      'api',
      '/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/estado',
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot real → 200 con estado válido', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snapshots = listBody.data as { id: string; estado: string }[]
    if (snapshots.length === 0) return

    const { ok, body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${snapshots[0].id}/estado`,
      token,
    )
    expect(ok).toBe(true)
    expect(body.data).toHaveProperty('estado')
    expect(body.data).toHaveProperty('id')
  })
})

// ─── GET /snapshots/:id/diff ──────────────────────────────────────────────────

describe('GET /api/v1/padron/snapshots/:id/diff', () => {
  it('snapshot inexistente → 404', async () => {
    const { status } = await GET(
      'api',
      '/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/diff',
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot aprobado → 200 con estructura completa', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { ok, body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${aprobado.id}/diff`,
      token,
    )
    expect(ok).toBe(true)
    expect(body.data).toHaveProperty('snapshot')
    expect(body.data).toHaveProperty('summary')
    expect(body.data).toHaveProperty('diffs')
    expect(body.data.diffs).toHaveProperty('data')
    expect(body.data.diffs).toHaveProperty('meta')
  })

  it('summary tiene los campos correctos', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body } = await GET('api', `/api/v1/padron/snapshots/${snap.id}/diff`, token)
    const summary = body.data.summary
    expect(summary).toHaveProperty('nuevos')
    expect(summary).toHaveProperty('modificados')
    expect(summary).toHaveProperty('eliminados')
    expect(summary).toHaveProperty('nuevosPendientes')
    expect(summary).toHaveProperty('nuevosRechazados')
    expect(typeof summary.nuevos).toBe('number')
    expect(typeof summary.modificados).toBe('number')
    expect(typeof summary.eliminados).toBe('number')
  })

  it('paginación: page=1 limit=10 devuelve máx 10 items', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { ok, body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${snap.id}/diff?page=1&limit=10`,
      token,
    )
    expect(ok).toBe(true)
    expect(body.data.diffs.data.length).toBeLessThanOrEqual(10)
    expect(body.data.diffs.meta.limit).toBe(10)
    expect(body.data.diffs.meta.page).toBe(1)
  })

  it('filtro tipo=nuevo devuelve solo diffs nuevos', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${snap.id}/diff?tipo=nuevo&limit=20`,
      token,
    )
    for (const d of body.data.diffs.data as { tipo: string }[]) {
      expect(d.tipo).toBe('nuevo')
    }
  })

  it('filtro tipo=modificado devuelve solo diffs modificados', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${snap.id}/diff?tipo=modificado&limit=20`,
      token,
    )
    for (const d of body.data.diffs.data as { tipo: string }[]) {
      expect(d.tipo).toBe('modificado')
    }
  })

  it('búsqueda por q devuelve resultados que contienen el término', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body: diffBody } = await GET(
      'api',
      `/api/v1/padron/snapshots/${snap.id}/diff?limit=1`,
      token,
    )
    const diffs = diffBody.data.diffs.data as { idSialRol: string }[]
    if (diffs.length === 0) return

    const termino = encodeURIComponent(diffs[0].idSialRol.slice(0, 6))
    const { ok, body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${snap.id}/diff?q=${termino}`,
      token,
    )
    expect(ok).toBe(true)
    expect(body.data.diffs.data.length).toBeGreaterThan(0)
  })
})

// ─── POST /snapshots/:id/aprobar — validaciones de negocio ───────────────────

describe('POST /api/v1/padron/snapshots/:id/aprobar — validaciones', () => {
  it('snapshot inexistente → 404', async () => {
    const { status } = await POST(
      'api',
      '/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/aprobar',
      {},
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot ya aprobado → 409 conflict', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { status } = await POST(
      'api',
      `/api/v1/padron/snapshots/${aprobado.id}/aprobar`,
      {},
      token,
    )
    expect(status).toBe(409)
  })

  it('snapshot rechazado → 409 conflict', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const rechazado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'rechazado')
    if (!rechazado) return

    const { status } = await POST(
      'api',
      `/api/v1/padron/snapshots/${rechazado.id}/aprobar`,
      {},
      token,
    )
    expect(status).toBe(409)
  })
})

// ─── POST /snapshots/:id/rechazar — validaciones de negocio ──────────────────

describe('POST /api/v1/padron/snapshots/:id/rechazar — validaciones', () => {
  it('snapshot inexistente → 404', async () => {
    const { status } = await POST(
      'api',
      '/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/rechazar',
      {},
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot ya aprobado → 409 conflict', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { status } = await POST(
      'api',
      `/api/v1/padron/snapshots/${aprobado.id}/rechazar`,
      {},
      token,
    )
    expect(status).toBe(409)
  })
})

// ─── DELETE /snapshots/:id — validaciones ────────────────────────────────────

describe('DELETE /api/v1/padron/snapshots/:id — validaciones', () => {
  it('snapshot inexistente → 404', async () => {
    const res = await DELETE(
      'api',
      '/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000',
      token,
    )
    expect(res.status).toBe(404)
  })

  it('snapshot aprobado → 409 (no se puede eliminar)', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const res = await DELETE('api', `/api/v1/padron/snapshots/${aprobado.id}`, token)
    expect(res.status).toBe(409)
  })

  it('snapshot pendiente → 409 (no se puede eliminar)', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const pendiente = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'pendiente')
    if (!pendiente) return

    const res = await DELETE('api', `/api/v1/padron/snapshots/${pendiente.id}`, token)
    expect(res.status).toBe(409)
  })
})

// ─── GET /snapshots/:id/conflictos-validacion ─────────────────────────────────

describe('GET /api/v1/padron/snapshots/:id/conflictos-validacion', () => {
  it('snapshot aprobado → 200 con array conflictos (puede ser vacío)', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { ok, body } = await GET(
      'api',
      `/api/v1/padron/snapshots/${aprobado.id}/conflictos-validacion`,
      token,
    )
    expect(ok).toBe(true)
    expect(body.data).toHaveProperty('conflictos')
    expect(Array.isArray(body.data.conflictos)).toBe(true)
  })
})

// ─── GET /snapshots/:id/exportar ─────────────────────────────────────────────

describe('GET /api/v1/padron/snapshots/:id/exportar', () => {
  it('snapshot aprobado → 200 con Content-Type Excel', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const aprobado = (listBody.data as { id: string; estado: string; archivoResultadoPath?: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const res = await GETraw('api', `/api/v1/padron/snapshots/${aprobado.id}/exportar`, token)
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      expect(res.headers.get('content-type')).toContain('spreadsheetml')
    }
  })
})

// ─── POST /upload — validaciones sin archivo ─────────────────────────────────

describe('POST /api/v1/padron/upload — validaciones', () => {
  it('sin archivo → 400', async () => {
    const form = new FormData()
    form.append('fechaAsignada', '2099-01-01')

    const res = await UPLOAD('api', '/api/v1/padron/upload', form, token)
    expect(res.status).toBe(400)
  })

  it('fecha inválida → 400', async () => {
    const form = new FormData()
    form.append('fechaAsignada', 'no-es-fecha')
    const blob = new Blob(['fake'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    form.append('file', blob, 'test.xlsx')

    const res = await UPLOAD('api', '/api/v1/padron/upload', form, token)
    expect(res.status).toBe(400)
  })
})

// ─── Dotaneitor endpoints internos ────────────────────────────────────────────

describe('Dotaneitor — endpoints internos', () => {
  it('POST /session → crea sesión con session_id', async () => {
    const { ok, body } = await POST('dotaneitor', '/session', {})
    expect(ok).toBe(true)
    expect(body).toHaveProperty('session_id')
    expect(typeof body.session_id).toBe('string')
    expect((body.session_id as string).length).toBeGreaterThan(0)

    await POST('dotaneitor', '/session/delete', { session_id: body.session_id })
  })

  it('GET /job/inexistente → 404', async () => {
    const { status } = await GET('dotaneitor', '/job/00000000-0000-0000-0000-000000000000')
    expect(status).toBe(404)
  })

  it('GET /preview sin session_id → 422 o 404', async () => {
    const { status } = await GET('dotaneitor', '/preview?session_id=sesion-inexistente')
    expect([404, 422]).toContain(status)
  })

  it('POST /session/delete con session_id inexistente → 200 ok', async () => {
    const { ok, body } = await POST('dotaneitor', '/session/delete', { session_id: 'sesion-que-no-existe' })
    expect(ok).toBe(true)
    expect(body.ok).toBe(true)
  })
})

// ─── Rendimiento básico ───────────────────────────────────────────────────────

describe('Rendimiento — tiempos de respuesta', () => {
  it('GET /snapshots responde en menos de 2s', async () => {
    const start = Date.now()
    await GET('api', '/api/v1/padron/snapshots', token)
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('GET /diff paginado (limit=50) responde en menos de 3s', async () => {
    const { body: listBody } = await GET('api', '/api/v1/padron/snapshots', token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const start = Date.now()
    await GET('api', `/api/v1/padron/snapshots/${snap.id}/diff?limit=50`, token)
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('Dotaneitor /health responde en menos de 1s', async () => {
    const start = Date.now()
    await GET('dotaneitor', '/health')
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
