/**
 * Repone `cargos.codigo_repa` / `descripcion_repa` nulos con el dato que el
 * padrón ya cargó (`padron_diff`, campo `completado:codigo_repa` /
 * `completado:descripcion_repa`).
 *
 * Por qué existe: el organigrama une nodo ↔ persona por `cargos.codigo_repa`. Si
 * esa columna queda nula (incidente del 2026-11-19: ~45.900 cargos), casi todos
 * los nodos se ven Vacantes aunque la persona exista. Ver memoria del proyecto.
 *
 * Reglas (las mismas que se aplicaron a mano en Neon `laboratorio`):
 *  - solo cargos NO borrados con `codigo_repa` NULL (nunca pisa un valor);
 *  - la clave es el `id_sial` del cargo = primeras 2 partes del `id_sial_rol`
 *    del diff (`ID-N` o `ID-N-CUIL-N`);
 *  - se usa el valor del diff MÁS RECIENTE por rol, y solo si el `id_sial`
 *    apunta a UNA única repartición (los ambiguos se omiten);
 *  - solo si la repartición existe en `dim_organigrama`.
 *
 * Uso (desde apps/api, con DATABASE_URL apuntando a la base):
 *   npx tsx scripts/reponer_codigo_repa.ts                 # simulación (no escribe)
 *   npx tsx scripts/reponer_codigo_repa.ts --aplicar       # escribe en una transacción
 *   npx tsx scripts/reponer_codigo_repa.ts --aplicar --rollback-file=ruta.txt
 *
 * Con --aplicar guarda la lista de ids modificados (uno por línea). Revertir =
 * poner codigo_repa y descripcion_repa en NULL para esos ids.
 */
import { writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const aplicar = process.argv.includes('--aplicar')
const rbArg = process.argv.find((a) => a.startsWith('--rollback-file='))
const rollbackFile = rbArg ? rbArg.slice('--rollback-file='.length) : `rollback_codigo_repa_${new Date().toISOString().slice(0, 10)}.txt`

const prisma = new PrismaClient()

// Plan común a simulación y aplicación. Un solo statement con CTEs (sin tablas
// temporales: el pooler de Neon reutiliza conexiones).
const PLAN_CTE = `
  f0 AS (
    SELECT DISTINCT ON (pd.id_sial_rol) pd.id_sial_rol rol, NULLIF(trim(pd.valor_nuevo),'') repa
    FROM padron_diff pd JOIN padron_snapshots s ON s.id = pd.snapshot_id
    WHERE pd.campo = 'completado:codigo_repa' AND NULLIF(trim(pd.valor_nuevo),'') IS NOT NULL
    ORDER BY pd.id_sial_rol, s.created_at DESC),
  d0 AS (
    SELECT DISTINCT ON (pd.id_sial_rol) pd.id_sial_rol rol, NULLIF(trim(pd.valor_nuevo),'') descr
    FROM padron_diff pd JOIN padron_snapshots s ON s.id = pd.snapshot_id
    WHERE pd.campo = 'completado:descripcion_repa' AND NULLIF(trim(pd.valor_nuevo),'') IS NOT NULL
    ORDER BY pd.id_sial_rol, s.created_at DESC),
  f AS (SELECT split_part(rol,'-',1)||'-'||split_part(rol,'-',2) id_sial, repa FROM f0),
  fd AS (SELECT split_part(rol,'-',1)||'-'||split_part(rol,'-',2) id_sial, min(descr) descr FROM d0 GROUP BY 1),
  fu AS (SELECT id_sial, min(repa) repa, count(DISTINCT repa) n_repas FROM f GROUP BY id_sial),
  plan AS (
    SELECT c.id cargo_id, fu.repa, fd.descr, fu.n_repas, (o.id IS NOT NULL) repa_existe
    FROM cargos c
    JOIN fu ON fu.id_sial = c.id_sial
    LEFT JOIN dim_organigrama o ON o.codigo_reparticion = fu.repa
    LEFT JOIN fd ON fd.id_sial = c.id_sial
    WHERE c.deleted_at IS NULL AND c.codigo_repa IS NULL)`

async function main() {
  const [r] = await prisma.$queryRawUnsafe<
    { sin_repa: bigint; con_fuente: bigint; ambiguos: bigint; sin_nodo: bigint; aplicables: bigint }[]
  >(`WITH ${PLAN_CTE}
    SELECT (SELECT count(*) FROM cargos WHERE deleted_at IS NULL AND codigo_repa IS NULL) sin_repa,
           (SELECT count(*) FROM plan) con_fuente,
           (SELECT count(*) FROM plan WHERE n_repas > 1) ambiguos,
           (SELECT count(*) FROM plan WHERE n_repas = 1 AND NOT repa_existe) sin_nodo,
           (SELECT count(*) FROM plan WHERE n_repas = 1 AND repa_existe) aplicables`)
  console.log('Cargos sin codigo_repa:          ', Number(r!.sin_repa))
  console.log('  con dato en el padrón:         ', Number(r!.con_fuente))
  console.log('  ambiguos (>1 repa, se omiten): ', Number(r!.ambiguos))
  console.log('  repa inexistente en organigrama (se omiten):', Number(r!.sin_nodo))
  console.log('  APLICABLES:                    ', Number(r!.aplicables))
  console.log('  sin fuente en el padrón:       ', Number(r!.sin_repa) - Number(r!.con_fuente))

  if (!aplicar) {
    console.log('\nSimulación: no se escribió nada. Agregá --aplicar para escribir.')
    return
  }
  const ids = await prisma.$transaction(
    async (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`WITH ${PLAN_CTE}
        UPDATE cargos c
           SET codigo_repa = p.repa, descripcion_repa = COALESCE(c.descripcion_repa, p.descr), updated_at = now()
          FROM plan p
         WHERE c.id = p.cargo_id AND c.codigo_repa IS NULL AND p.n_repas = 1 AND p.repa_existe
        RETURNING c.id`),
    { timeout: 120_000 },
  )
  writeFileSync(rollbackFile, ids.map((x) => x.id).join('\n') + '\n', 'utf8')
  console.log(`\nActualizados: ${ids.length}. Lista de rollback: ${rollbackFile}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
