/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Prueba del SQL de escritura del sync contra un Postgres REAL y LOCAL, SIEMPRE con ROLLBACK.
//
// Abre UNA transaccion, corre la secuencia completa del modo escritura (limpieza -> escalafon CPH -> carga ->
// recodificacion -> sub_estado -> kpis -> verificacion) con lotes reales (CSV + snapshot de la base) y al final
// lanza un error centinela para que Prisma haga ROLLBACK. Nunca hace COMMIT. Solo imprime conteos (sin datos personales).
//
//   DATABASE_URL=postgresql://...@localhost:5434/srrhh_sync tsx scripts/sync-cargos-msgc/probar-sql-local.ts --input <nominal.csv>
//
// - asegurarBaseLocal + chequeo extra: host SOLO localhost/127.0.0.1 (nunca neon.tech ni otros).
// - SYNC_PRISMA_DIR (opcional): carpeta desde la que se resuelve '@prisma/client' (p.ej. un cliente generado para Windows).
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'
import path from 'node:path'
import { contarCambios, desglosarCambios, ejecutarCarga, proyectarCarga } from './cargar.js'
import { cruzar } from './cruce.js'
import { ejecutarEscalafonCph } from './escalafon.js'
import { ejecutarEscalafonesDuplicados } from './escalafonesDuplicados.js'
import { asegurarBaseLocal } from './guardaBase.js'
import { leerNominal } from './leerNominal.js'
import { ejecutarRecodificacion } from './recodificar.js'
import { crearRepoEscritura, type TxSql } from './repoPrisma.js'
import { cargarSnapshot, leerSnapshot, type TxLectura } from './sistemaReadonly.js'
import { construirAcronimos } from './sincronizar.js'
import { distribucionEsperada, evaluarVerificacion, textoVerificacion } from './verificar.js'

class RollbackPrueba extends Error {
  constructor() {
    super('ROLLBACK de prueba')
  }
}

/** Valida que la URL sea de la maquina local (mas estricto que guardaBase). Devuelve host:puerto. */
export function validarHostPrueba(url: string | undefined): string {
  const host = asegurarBaseLocal(url)
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`probar-sql-local: host "${host}" no permitido (solo localhost o 127.0.0.1).`)
  const u = new URL(url as string)
  return `${host}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`
}

const etiqueta = (sql: string): string => {
  const m = /^\s*(INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i.exec(sql)
  return m ? `${m[1].toUpperCase().replace(' INTO', '').replace(' FROM', '')} ${m[2]}` : sql.trim().slice(0, 40)
}

async function main() {
  const i = process.argv.indexOf('--input')
  const input = i >= 0 ? process.argv[i + 1] : undefined
  if (!input) throw new Error('Uso: probar-sql-local.ts --input <nominal.csv>')
  const url = process.env.DATABASE_URL
  const destino = validarHostPrueba(url)
  console.log(`Destino (local): ${destino}`)

  const dir = process.env.SYNC_PRISMA_DIR
  const req = createRequire(path.join(dir ? path.resolve(dir) : process.cwd(), 'x.js'))
  const { PrismaClient } = req('@prisma/client') as typeof import('@prisma/client')
  const prisma = new PrismaClient({ datasourceUrl: url })
  const filas = leerNominal(input)

  const conteos = async (q: { $queryRawUnsafe<T>(s: string): Promise<T> }) => {
    const r = await q.$queryRawUnsafe<{ cargos: number; concursos: number; bajas: number; corridas: number; escalafon_37: number }[]>(
      "SELECT (SELECT count(*)::int FROM cargos) AS cargos, (SELECT count(*)::int FROM concursos) AS concursos, (SELECT count(*)::int FROM bajas) AS bajas, (SELECT count(*)::int FROM dim_sync_corridas) AS corridas, (SELECT count(*)::int FROM escalafones WHERE codigo = '37') AS escalafon_37",
    )
    return r[0]
  }
  try {
    const antes = await conteos(prisma)
    console.log('Antes :', JSON.stringify(antes))
    const snapshot = await cargarSnapshot(prisma as unknown as Parameters<typeof cargarSnapshot>[0])
    const r1 = cruzar(filas, snapshot)
    console.log(`Filas Excel: ${filas.length}; cargos del sistema: ${snapshot.cargos.length}; operaciones planificadas: ${contarCambios(r1.plan)}`)

    const afectadas = new Map<string, { sentencias: number; filas: number }>()
    try {
      await prisma.$transaction(
        async (txReal) => {
          const tx: TxSql = {
            async $executeRawUnsafe(sql, ...v) {
              const n = Number(await txReal.$executeRawUnsafe(sql, ...v))
              const k = etiqueta(sql)
              const a = afectadas.get(k) ?? { sentencias: 0, filas: 0 }
              a.sentencias += 1
              a.filas += n
              afectadas.set(k, a)
              return n
            },
            $queryRawUnsafe: (sql, ...v) => txReal.$queryRawUnsafe(sql, ...v),
          }
          const repo = crearRepoEscritura(tx, url as string)
          const lectura = txReal as unknown as TxLectura

          const borradas = await repo.limpiar(r1.plan.concursosConservar)
          console.log(`Limpieza: ${Object.values(borradas).reduce((a, b) => a + b, 0)} filas en ${Object.keys(borradas).length} tablas`)
          const esc = await ejecutarEscalafonCph(repo)
          console.log(`Escalafon CPH: ${esc.accion}`)

          const dup = await ejecutarEscalafonesDuplicados(repo)
          console.log(`Escalafones duplicados: ${JSON.stringify(dup)}`)
          const snap2 = await leerSnapshot(lectura)
          const r2 = cruzar(filas, snap2)
          const acronimos = construirAcronimos(r2.plan, snap2)
          // Dry-run = carga: la proyeccion (mismo resolutor, repositorio en memoria) tiene que dar los mismos contadores.
          const proyeccion = snap2.catalogos ? await proyectarCarga(r2.plan, snap2.catalogos) : null
          const carga = await ejecutarCarga(repo, r2.plan, {
            log: (m) => console.log(`  ${m}`),
            // Detalle del fallback (nombres de catalogo y cantidades; sin datos personales).
            alResolver: (res) => {
              for (const p of res.puestosNuevos) console.log(`  PUESTO pendiente_curar: escalafon=${p.escalafonId.slice(0, 8)} ${p.modalidad}/${p.tipoPuesto} "${p.nombre}"`)
              const porPuesto = new Map<string, number>()
              for (const e of res.especialidadesNuevas) porPuesto.set(e.puestoCargoId, (porPuesto.get(e.puestoCargoId) ?? 0) + 1)
              console.log(`  ESPECIALIDADES pendiente_curar: ${res.especialidadesNuevas.length} en ${porPuesto.size} puestos`)
            },
          })
          console.log(proyeccion && JSON.stringify(proyeccion) === JSON.stringify(carga) ? 'OK dry-run = carga: la proyeccion coincide con la carga.' : `FALLA dry-run != carga: proyeccion ${JSON.stringify(proyeccion)}`)
          console.log(`Carga: ${JSON.stringify(carga)}`)
          const recod = await ejecutarRecodificacion(repo, acronimos)
          console.log(`Recodificacion: ${recod.cambios.length} cambios, ${recod.colisiones} colisiones`)
          console.log(`sub_estado recalculado: ${await repo.recalcularSubEstado()} filas`)
          console.log(`kpis_dotacion_snapshot regenerado: ${await repo.regenerarKpisDotacion()} filas`)
          const r3 = cruzar(filas, await leerSnapshot(lectura))
          const datos = await repo.datosVerificacion()
          console.log(textoVerificacion(evaluarVerificacion(datos, filas.length, contarCambios(r3.plan), distribucionEsperada(filas))))
          console.log('2a pasada, desglose:', JSON.stringify(desglosarCambios(r3.plan)))
          // Detalle de lo que sigue pendiente (solo codigos de cargo/fila y atributos de catalogo; sin datos personales).
          const snap3 = await leerSnapshot(lectura)
          for (const it of r3.plan.items) {
            if (it.cargoId === null || it.cambios.length > 0 || it.completarExpediente || it.revision !== null || it.crearConcurso !== null || it.etiquetar) {
              const c = snap3.cargos.find((x) => x.id === it.cargoId)
              console.log('  pendiente:', JSON.stringify({ fila: it.fila.codigo_excel, cat: it.categoria, cambios: it.cambios, rev: it.revision, exp: it.completarExpediente, conc: it.crearConcurso, etq: it.etiquetar, cr: it.fila.cr, sigla: it.fila.sigla, puesto: it.fila.literal_puesto, esp: it.fila.especialidad_cargo, bloque: it.fila.bloque, cargo: c ? { cod: c.codigo, estado: c.estado, puesto: c.puesto, esp: c.especialidad, rev: c.revisionMotivo } : null }))
            }
          }
          for (const id of r3.plan.noVigenteIds) {
            const c = snap3.cargos.find((x) => x.id === id)
            console.log('  a no vigente:', JSON.stringify({ cod: c?.codigo, estado: c?.estado, origen: c?.origen, sigla: c?.sigla, puesto: c?.puesto, esp: c?.especialidad }))
          }
          await repo.registrarCorrida('prueba', null, { prueba: true })
          console.log('Dentro de la transaccion:', JSON.stringify(await conteos(txReal)))
          throw new RollbackPrueba()
        },
        { timeout: 30 * 60 * 1000, maxWait: 15_000 },
      )
    } catch (e) {
      if (!(e instanceof RollbackPrueba)) throw e
      console.log('ROLLBACK ejecutado.')
    }
    console.log('Sentencias de escritura (sentencias, filas afectadas):')
    for (const [k, v] of afectadas) console.log(`  ${k}: ${v.sentencias} sentencias, ${v.filas} filas`)
    const despues = await conteos(prisma)
    console.log('Despues:', JSON.stringify(despues))
    console.log(JSON.stringify(antes) === JSON.stringify(despues) ? 'OK: la base quedo igual (nada persistio).' : 'ALERTA: los conteos cambiaron.')
  } finally {
    await prisma.$disconnect()
  }
}

if (path.basename(process.argv[1] ?? '').startsWith('probar-sql-local')) {
  main().catch((e) => {
    console.error(String(e instanceof Error ? e.message : e).slice(0, 1500))
    process.exit(1)
  })
}
