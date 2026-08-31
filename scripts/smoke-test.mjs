// S6-8: smoke test completo del sistema (dev, docker + vite nativo).
// Recorre health checks + login + un GET representativo de cada modulo
// registrado en app.ts + los 5 endpoints de kpis. No es un test de
// integracion formal (no hay suite en el repo) -- es la verificacion manual
// que pide S6-8, scriptada para que sea repetible.
const API = 'http://localhost:3000'
const DOTANEITOR = 'http://localhost:5001'
const WEB = 'http://localhost:5180'

const results = []

async function check(name, fn) {
  try {
    const r = await fn()
    results.push({ name, ok: true, detail: r })
  } catch (e) {
    results.push({ name, ok: false, detail: e.message })
  }
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`)
  return body
}

let token = ''

await check('API /health', async () => {
  const r = await fetch(`${API}/health`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()).status
})

await check('Dotaneitor /health', async () => {
  const r = await fetch(`${DOTANEITOR}/health`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()).status ?? 'ok'
})

await check('Web dev server (200)', async () => {
  const r = await fetch(WEB)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.status
})

await check('POST /auth/login (admin)', async () => {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin1234!' }),
  })
  const body = await r.json()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(body)}`)
  token = body.data.accessToken
  return 'token OK'
})

const modulos = [
  ['GET /padron/snapshots', '/api/v1/padron/snapshots'],
  ['GET /personas', '/api/v1/personas?limit=5'],
  ['GET /cargos', '/api/v1/cargos?limit=5'],
  ['GET /concursos-cph', '/api/v1/concursos-cph?limit=5'],
  ['GET /concursos-ceetps', '/api/v1/concursos-ceetps?limit=5'],
  ['GET /hospitales', '/api/v1/hospitales'],
  ['GET /escalafones', '/api/v1/escalafones'],
  ['GET /puestos', '/api/v1/puestos'],
  ['GET /usuarios', '/api/v1/usuarios'],
  ['GET /bajas', '/api/v1/bajas?limit=5'],
  ['GET /kpis/dotacion', '/api/v1/kpis/dotacion'],
  ['GET /kpis/concursos', '/api/v1/kpis/concursos'],
  ['GET /kpis/concursos-cph', '/api/v1/kpis/concursos-cph'],
  ['GET /kpis/concursos-ceetps', '/api/v1/kpis/concursos-ceetps'],
  ['GET /kpis/alertas', '/api/v1/kpis/alertas'],
  ['GET /kpis/dotacion-historica', '/api/v1/kpis/dotacion-historica'],
]

for (const [name, path] of modulos) {
  await check(name, async () => {
    const body = await getJson(`${API}${path}`, token)
    const data = body.data
    if (Array.isArray(data)) return `${data.length} items`
    if (data?.data && Array.isArray(data.data)) return `${data.data.length} items (paginado)`
    if (data?.meta) return `${data.data?.length ?? '?'} items, total=${data.meta.total}`
    return typeof data
  })
}

// Ruta protegida sin token -> debe dar 401, no 200 (verifica que el guard de auth sigue activo)
await check('GET /personas sin token -> 401 esperado', async () => {
  const r = await fetch(`${API}/api/v1/personas`)
  if (r.status !== 401) throw new Error(`esperaba 401, recibi ${r.status}`)
  return '401 OK'
})

console.log('\n=== SMOKE TEST S6-8 ===\n')
let fails = 0
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? ` — ${r.detail}` : `\n     ${r.detail}`}`)
  if (!r.ok) fails++
}
console.log(`\n${results.length - fails}/${results.length} OK`)
process.exit(fails > 0 ? 1 : 0)
