import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ─── Definición de carreras gestionables ──────────────────────────────────────
// tipo_concurso : 'CPH' | 'CEETPS' | null (supervisada sin concurso propio)
// genera_cargos : el sync MSGC crea/gestiona cargos de esta carrera
// supervisada   : MSGC supervisa aunque no genere concursos
// regimen_override: nombre exacto en tabla `regimenes` (reemplaza Sets hardcodeados)
//   — solo para CRs con excepción por literal (83 y 85 se resuelven en derivarRegimen)
//   — para el resto el nombre del régimen ya está en CR_A_REGIMEN de derivarRegimen.ts

const GESTIONABLES: {
  codigoRegistro: string
  tipoConcurso: string | null
  generaCargos: boolean
  supervisada: boolean
  regimenOverride: string | null
}[] = [
  // CPH — carrera profesional hospitalaria
  { codigoRegistro: '37', tipoConcurso: 'CPH',   generaCargos: true,  supervisada: true,  regimenOverride: 'Nueva Carrera Profesional Hospitalaria' },
  { codigoRegistro: '22', tipoConcurso: 'CPH',   generaCargos: true,  supervisada: true,  regimenOverride: 'Nueva Carrera Profesional Hospitalaria' },
  // CEETPS — enfermería y técnicos
  { codigoRegistro: '87', tipoConcurso: 'CEETPS', generaCargos: true, supervisada: true,  regimenOverride: 'Nueva Carrera de Enfermería' },
  { codigoRegistro: '85', tipoConcurso: 'CEETPS', generaCargos: true, supervisada: true,  regimenOverride: null }, // excepción por literal: Técnica vs Enfermería
  // Administrativa — CPH con pocos concursos
  { codigoRegistro: '83', tipoConcurso: 'CPH',   generaCargos: true,  supervisada: true,  regimenOverride: null }, // excepción por literal: Administrativa vs Anexo II
  // Guardias y residencias — MSGC administra, sin concurso propio en el sistema
  { codigoRegistro: '23', tipoConcurso: null,     generaCargos: true,  supervisada: true,  regimenOverride: 'Salud - Guardias' },
  { codigoRegistro: '24', tipoConcurso: null,     generaCargos: true,  supervisada: true,  regimenOverride: 'Residentes' },
]

// ─── Verificar que todos los CRs existen en dim_carreras ──────────────────────
const existentes = await p.$queryRaw<{ codigo_registro: string }[]>`
  SELECT codigo_registro FROM dim_carreras
  WHERE codigo_registro = ANY(${GESTIONABLES.map(g => g.codigoRegistro)}::varchar[])
`
const encontrados = new Set(existentes.map(r => r.codigo_registro))
const faltantes = GESTIONABLES.filter(g => !encontrados.has(g.codigoRegistro))
if (faltantes.length > 0) {
  console.error('❌ CRs no encontrados en dim_carreras:', faltantes.map(g => g.codigoRegistro).join(', '))
  process.exit(1)
}

// ─── Upsert idempotente ────────────────────────────────────────────────────────
let insertados = 0
let actualizados = 0

for (const g of GESTIONABLES) {
  const existe = await p.$queryRaw<{ codigo_registro: string }[]>`
    SELECT codigo_registro FROM dim_gestionables WHERE codigo_registro = ${g.codigoRegistro}
  `
  if (existe.length === 0) {
    await p.$executeRaw`
      INSERT INTO dim_gestionables (codigo_registro, tipo_concurso, genera_cargos, supervisada, regimen_override, activo)
      VALUES (${g.codigoRegistro}, ${g.tipoConcurso}, ${g.generaCargos}, ${g.supervisada}, ${g.regimenOverride}, true)
    `
    insertados++
  } else {
    await p.$executeRaw`
      UPDATE dim_gestionables SET
        tipo_concurso    = ${g.tipoConcurso},
        genera_cargos    = ${g.generaCargos},
        supervisada      = ${g.supervisada},
        regimen_override = ${g.regimenOverride},
        activo           = true
      WHERE codigo_registro = ${g.codigoRegistro}
    `
    actualizados++
  }
}

// ─── Resultado ────────────────────────────────────────────────────────────────
const resultado = await p.$queryRaw<{
  codigo_registro: string
  lit_cod_reg: string
  tipo_concurso: string | null
  genera_cargos: boolean
  supervisada: boolean
  regimen_override: string | null
}[]>`
  SELECT g.codigo_registro, c.lit_cod_reg, g.tipo_concurso, g.genera_cargos, g.supervisada, g.regimen_override
  FROM dim_gestionables g
  JOIN dim_carreras c ON c.codigo_registro = g.codigo_registro
  ORDER BY g.codigo_registro
`

console.log(`\n✅ dim_gestionables poblada: ${insertados} insertados, ${actualizados} actualizados\n`)
console.log('CR   | Carrera                                    | Concurso | Cargos | Superv | Régimen override')
console.log('-----|--------------------------------------------|---------:|:------:|:------:|------------------')
resultado.forEach(r =>
  console.log(
    `${r.codigo_registro.padEnd(4)} | ${r.lit_cod_reg.padEnd(42)} | ${(r.tipo_concurso ?? 'ninguno').padEnd(8)} | ${r.genera_cargos ? '  ✓   ' : '  ✗   '} | ${r.supervisada ? '  ✓   ' : '  ✗   '} | ${r.regimen_override ?? '(por literal)'}`
  )
)

await p.$disconnect()
