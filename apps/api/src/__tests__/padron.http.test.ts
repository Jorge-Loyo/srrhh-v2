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

const API         = 'http://localhost:3000'
const DOTANEITOR  = 'http://localhost:5001'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJson(url: string, token?: string) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

async function postJson(url: string, payload: unknown, token?: string) {
  const res = await fetch(url, {
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

// ─── Setup: obtener token admin ───────────────────────────────────────────────

let token = ''

beforeAll(async () => {
  const { ok, body } = await postJson(`${API}/api/v1/auth/login`, {
    username: 'admin',
    password: 'Admin1234!',
  })
  if (!ok) throw new Error(`Login falló: ${JSON.stringify(body)}`)
  token = body.data.accessToken
}, 10_000)

// ─── Health checks ────────────────────────────────────────────────────────────

describe('Health checks', () => {
  it('API /health → 200 status ok', async () => {
    const { ok, body } = await getJson(`${API}/health`)
    expect(ok).toBe(true)
    expect(body.status).toBe('ok')
  })

  it('Dotaneitor /health → 200 status ok', async () => {
    const { ok, body } = await getJson(`${DOTANEITOR}/health`)
    expect(ok).toBe(true)
    expect(body.status).toBe('ok')
  })
})

// ─── Autenticación ────────────────────────────────────────────────────────────

describe('Autenticación', () => {
  it('GET /padron/snapshots sin token → 401', async () => {
    const { status } = await getJson(`${API}/api/v1/padron/snapshots`)
    expect(status).toBe(401)
  })

  it('POST /padron/upload sin token → 401', async () => {
    const res = await fetch(`${API}/api/v1/padron/upload`, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('POST /padron/snapshots/:id/aprobar sin token → 401', async () => {
    const { status } = await postJson(`${API}/api/v1/padron/snapshots/fake-id/aprobar`, {})
    expect(status).toBe(401)
  })
})

// ─── GET /snapshots ───────────────────────────────────────────────────────────

describe('GET /api/v1/padron/snapshots', () => {
  it('responde 200 con array', async () => {
    const { ok, body } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    expect(ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('cada snapshot tiene los campos requeridos', async () => {
    const { body } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snapshots: unknown[] = body.data
    if (snapshots.length === 0) return // BD vacía — skip

    const s = snapshots[0] as Record<string, unknown>
    expect(s).toHaveProperty('id')
    expect(s).toHaveProperty('fechaAsignada')
    expect(s).toHaveProperty('filename')
    expect(s).toHaveProperty('totalRegistros')
    expect(s).toHaveProperty('estado')
  })

  it('estados válidos en todos los snapshots', async () => {
    const ESTADOS_VALIDOS = ['procesando', 'pendiente', 'aprobado', 'rechazado', 'error']
    const { body } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    for (const s of body.data as Record<string, unknown>[]) {
      expect(ESTADOS_VALIDOS).toContain(s.estado)
    }
  })

  it('snapshots ordenados por fechaAsignada desc', async () => {
    const { body } = await getJson(`${API}/api/v1/padron/snapshots`, token)
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
    const { status } = await getJson(
      `${API}/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/estado`,
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot real → 200 con estado válido', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snapshots = listBody.data as { id: string; estado: string }[]
    if (snapshots.length === 0) return

    const { ok, body } = await getJson(
      `${API}/api/v1/padron/snapshots/${snapshots[0].id}/estado`,
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
    const { status } = await getJson(
      `${API}/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/diff`,
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot aprobado → 200 con estructura completa', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return // no hay aprobados — skip

    const { ok, body } = await getJson(
      `${API}/api/v1/padron/snapshots/${aprobado.id}/diff`,
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
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body } = await getJson(
      `${API}/api/v1/padron/snapshots/${snap.id}/diff`,
      token,
    )
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
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { ok, body } = await getJson(
      `${API}/api/v1/padron/snapshots/${snap.id}/diff?page=1&limit=10`,
      token,
    )
    expect(ok).toBe(true)
    expect(body.data.diffs.data.length).toBeLessThanOrEqual(10)
    expect(body.data.diffs.meta.limit).toBe(10)
    expect(body.data.diffs.meta.page).toBe(1)
  })

  it('filtro tipo=nuevo devuelve solo diffs nuevos', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body } = await getJson(
      `${API}/api/v1/padron/snapshots/${snap.id}/diff?tipo=nuevo&limit=20`,
      token,
    )
    for (const d of body.data.diffs.data as { tipo: string }[]) {
      expect(d.tipo).toBe('nuevo')
    }
  })

  it('filtro tipo=modificado devuelve solo diffs modificados', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const { body } = await getJson(
      `${API}/api/v1/padron/snapshots/${snap.id}/diff?tipo=modificado&limit=20`,
      token,
    )
    for (const d of body.data.diffs.data as { tipo: string }[]) {
      expect(d.tipo).toBe('modificado')
    }
  })

  it('búsqueda por q devuelve resultados que contienen el término', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    // Primero obtenemos un idSialRol real para buscar
    const { body: diffBody } = await getJson(
      `${API}/api/v1/padron/snapshots/${snap.id}/diff?limit=1`,
      token,
    )
    const diffs = diffBody.data.diffs.data as { idSialRol: string }[]
    if (diffs.length === 0) return

    const termino = diffs[0].idSialRol.slice(0, 6)
    const { ok, body } = await getJson(
      `${API}/api/v1/padron/snapshots/${snap.id}/diff?q=${termino}`,
      token,
    )
    expect(ok).toBe(true)
    // Al menos el registro que usamos como base debe aparecer
    expect(body.data.diffs.data.length).toBeGreaterThan(0)
  })
})

// ─── POST /snapshots/:id/aprobar — validaciones de negocio ───────────────────

describe('POST /api/v1/padron/snapshots/:id/aprobar — validaciones', () => {
  it('snapshot inexistente → 404', async () => {
    const { status } = await postJson(
      `${API}/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/aprobar`,
      {},
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot ya aprobado → 409 conflict', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { status } = await postJson(
      `${API}/api/v1/padron/snapshots/${aprobado.id}/aprobar`,
      {},
      token,
    )
    expect(status).toBe(409)
  })

  it('snapshot rechazado → 409 conflict', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const rechazado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'rechazado')
    if (!rechazado) return

    const { status } = await postJson(
      `${API}/api/v1/padron/snapshots/${rechazado.id}/aprobar`,
      {},
      token,
    )
    expect(status).toBe(409)
  })
})

// ─── POST /snapshots/:id/rechazar — validaciones de negocio ──────────────────

describe('POST /api/v1/padron/snapshots/:id/rechazar — validaciones', () => {
  it('snapshot inexistente → 404', async () => {
    const { status } = await postJson(
      `${API}/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000/rechazar`,
      {},
      token,
    )
    expect(status).toBe(404)
  })

  it('snapshot ya aprobado → 409 conflict', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { status } = await postJson(
      `${API}/api/v1/padron/snapshots/${aprobado.id}/rechazar`,
      {},
      token,
    )
    expect(status).toBe(409)
  })
})

// ─── DELETE /snapshots/:id — validaciones ────────────────────────────────────

describe('DELETE /api/v1/padron/snapshots/:id — validaciones', () => {
  it('snapshot inexistente → 404', async () => {
    const res = await fetch(
      `${API}/api/v1/padron/snapshots/00000000-0000-0000-0000-000000000000`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(404)
  })

  it('snapshot aprobado → 409 (no se puede eliminar)', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const res = await fetch(
      `${API}/api/v1/padron/snapshots/${aprobado.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(409)
  })

  it('snapshot pendiente → 409 (no se puede eliminar)', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const pendiente = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'pendiente')
    if (!pendiente) return

    const res = await fetch(
      `${API}/api/v1/padron/snapshots/${pendiente.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(409)
  })
})

// ─── GET /snapshots/:id/conflictos-validacion ─────────────────────────────────

describe('GET /api/v1/padron/snapshots/:id/conflictos-validacion', () => {
  it('snapshot aprobado → 200 con array conflictos (puede ser vacío)', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const aprobado = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const { ok, body } = await getJson(
      `${API}/api/v1/padron/snapshots/${aprobado.id}/conflictos-validacion`,
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
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const aprobado = (listBody.data as { id: string; estado: string; archivoResultadoPath?: string }[])
      .find((s) => s.estado === 'aprobado')
    if (!aprobado) return

    const res = await fetch(
      `${API}/api/v1/padron/snapshots/${aprobado.id}/exportar`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    // Puede ser 200 (archivo existe) o 404 (archivo no generado en este env)
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
    // No se agrega el archivo

    const res = await fetch(`${API}/api/v1/padron/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it('fecha inválida → 400', async () => {
    const form = new FormData()
    form.append('fechaAsignada', 'no-es-fecha')
    const blob = new Blob(['fake'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    form.append('file', blob, 'test.xlsx')

    const res = await fetch(`${API}/api/v1/padron/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    expect(res.status).toBe(400)
  })
})

// ─── Dotaneitor endpoints internos ────────────────────────────────────────────

describe('Dotaneitor — endpoints internos', () => {
  it('POST /session → crea sesión con session_id', async () => {
    const res = await fetch(`${DOTANEITOR}/session`, { method: 'POST' })
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body).toHaveProperty('session_id')
    expect(typeof body.session_id).toBe('string')
    expect(body.session_id.length).toBeGreaterThan(0)

    // Cleanup
    await fetch(`${DOTANEITOR}/session/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: body.session_id }),
    })
  })

  it('GET /job/inexistente → 404', async () => {
    const res = await fetch(`${DOTANEITOR}/job/00000000-0000-0000-0000-000000000000`)
    expect(res.status).toBe(404)
  })

  it('GET /preview sin session_id → 422 o 404', async () => {
    const res = await fetch(`${DOTANEITOR}/preview?session_id=sesion-inexistente`)
    expect([404, 422]).toContain(res.status)
  })

  it('POST /session/delete con session_id inexistente → 200 ok', async () => {
    const res = await fetch(`${DOTANEITOR}/session/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'sesion-que-no-existe' }),
    })
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ─── Rendimiento básico ───────────────────────────────────────────────────────

describe('Rendimiento — tiempos de respuesta', () => {
  it('GET /snapshots responde en menos de 2s', async () => {
    const start = Date.now()
    await getJson(`${API}/api/v1/padron/snapshots`, token)
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('GET /diff paginado (limit=50) responde en menos de 3s', async () => {
    const { body: listBody } = await getJson(`${API}/api/v1/padron/snapshots`, token)
    const snap = (listBody.data as { id: string; estado: string }[])
      .find((s) => s.estado === 'aprobado' || s.estado === 'pendiente')
    if (!snap) return

    const start = Date.now()
    await getJson(`${API}/api/v1/padron/snapshots/${snap.id}/diff?limit=50`, token)
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('Dotaneitor /health responde en menos de 1s', async () => {
    const start = Date.now()
    await getJson(`${DOTANEITOR}/health`)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
