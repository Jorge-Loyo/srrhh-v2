/**
 * Backfill one-shot: normaliza a minúscula + sin tilde (mantiene ñ) los
 * catálogos de texto libre que quedaron fuera de normalizar_organigrama.ts.
 * Pedido del usuario 2026-10-05: "quiero toda la base de datos en minúscula
 * y sin tilde, no importa que sea".
 *
 * Deliberadamente EXCLUIDOS de este script (y de "toda la base de datos"):
 *  - Cualquier cosa de auth/seguridad: usuarios.email/username/password_hash,
 *    refresh_tokens.* — tocarlas rompe el login.
 *  - Códigos que deben matchear EXACTO con el SIAL/sistema externo o con otra
 *    tabla por FK de texto: *.cuil, *.sigla, *.codigo_repa, *.codigo_reparticion,
 *    *.id_sial, roles.slug, permisos.modulo/accion — tocarlas rompe el
 *    matching (altas/bajas, resolución de jefe, cadena de mando, RBAC).
 *  - hospitales.nombre / escalafones.nombre — se insertan tal cual en los
 *    .docx oficiales que exporta el sistema (disposiciones/designaciones,
 *    ver apps/web/src/shared/lib/exportConcursoDocs.ts); decisión explícita
 *    del usuario 2026-10-05 de dejarlos en Title Case para no romper esos
 *    documentos.
 *  - Las tablas ref_* (ref_agrupadores, ref_unificadores_puesto, etc.): son
 *    los diccionarios de matching que usa el Dotaneitor (Python) para
 *    clasificar el padrón en origen — cambiar su casing ahí es un cambio de
 *    COMPORTAMIENTO del pipeline de ingesta, no de display, y está fuera del
 *    alcance de este script (requiere coordinar con services/dotaneitor).
 *  - Tablas de workflow vacías hoy (concursos_*, bajas, inscriptos_concurso,
 *    miembros_jurado_sorteados, notificaciones, etc.): no hay filas que
 *    normalizar — nada que hacer.
 *
 * Verificado antes de escribir este script: ningún código del backend
 * compara estos campos contra un literal hardcodeado (grep sin resultados),
 * así que normalizarlos es solo un cambio de DISPLAY, no de matching.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/normalizar_catalogos.ts --dry-run
 *   pnpm exec tsx scripts/normalizar_catalogos.ts
 */
import { PrismaClient } from '@prisma/client'
import { normalizarTexto } from '@srrhh/normalizacion'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

type Objetivo = {
  tabla: string
  normalizar: (prisma: PrismaClient) => Promise<{ total: number; cambios: number; ejemplos: Array<{ antes: string; despues: string }> }>
}

// Normaliza una lista de filas {id, valor} contra una función de update genérica.
async function normalizarFilas<T extends { id: string }>(
  filas: T[],
  getValor: (f: T) => string | null,
  update: (id: string, nuevo: string) => Promise<unknown>,
) {
  let cambios = 0
  const ejemplos: Array<{ antes: string; despues: string }> = []
  for (const f of filas) {
    const valor = getValor(f)
    if (valor === null) continue
    const normalizado = normalizarTexto(valor)
    if (normalizado === valor) continue
    cambios++
    if (ejemplos.length < 5) ejemplos.push({ antes: valor, despues: normalizado })
    if (!dryRun) await update(f.id, normalizado)
  }
  return { total: filas.length, cambios, ejemplos }
}

const OBJETIVOS: Objetivo[] = [
  {
    tabla: 'areas_programaticas.nombre',
    normalizar: async (p) => {
      const filas = await p.areaProgramatica.findMany({ select: { id: true, nombre: true } })
      return normalizarFilas(filas, (f) => f.nombre, (id, v) => p.areaProgramatica.update({ where: { id }, data: { nombre: v } }))
    },
  },
  {
    tabla: 'cesacs.direccion',
    normalizar: async (p) => {
      const filas = await p.cesac.findMany({ select: { id: true, direccion: true } })
      return normalizarFilas(filas, (f) => f.direccion, (id, v) => p.cesac.update({ where: { id }, data: { direccion: v } }))
    },
  },
  {
    tabla: 'cesacs.barrio',
    normalizar: async (p) => {
      const filas = await p.cesac.findMany({ select: { id: true, barrio: true } })
      return normalizarFilas(filas, (f) => f.barrio, (id, v) => p.cesac.update({ where: { id }, data: { barrio: v } }))
    },
  },
  {
    tabla: 'unidades_fijas_apayc.nombre',
    normalizar: async (p) => {
      const filas = await p.unidadFijaApayC.findMany({ select: { id: true, nombre: true } })
      return normalizarFilas(filas, (f) => f.nombre, (id, v) => p.unidadFijaApayC.update({ where: { id }, data: { nombre: v } }))
    },
  },
  {
    tabla: 'roles.nombre',
    normalizar: async (p) => {
      const filas = await p.role.findMany({ select: { id: true, nombre: true } })
      return normalizarFilas(filas, (f) => f.nombre, (id, v) => p.role.update({ where: { id }, data: { nombre: v } }))
    },
  },
  {
    tabla: 'roles.descripcion',
    normalizar: async (p) => {
      const filas = await p.role.findMany({ select: { id: true, descripcion: true } })
      return normalizarFilas(filas, (f) => f.descripcion, (id, v) => p.role.update({ where: { id }, data: { descripcion: v } }))
    },
  },
  {
    tabla: 'permisos.descripcion',
    normalizar: async (p) => {
      const filas = await p.permiso.findMany({ select: { id: true, descripcion: true } })
      return normalizarFilas(filas, (f) => f.descripcion, (id, v) => p.permiso.update({ where: { id }, data: { descripcion: v } }))
    },
  },
  {
    tabla: 'codigos_registro.literal',
    normalizar: async (p) => {
      const filas = await p.codigoRegistro.findMany({ select: { id: true, literal: true } })
      return normalizarFilas(filas, (f) => f.literal, (id, v) => p.codigoRegistro.update({ where: { id }, data: { literal: v } }))
    },
  },
]

async function main() {
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Normalizando catálogos...\n`)
  for (const obj of OBJETIVOS) {
    const { total, cambios, ejemplos } = await obj.normalizar(prisma)
    console.log(`${obj.tabla}: ${cambios} / ${total} filas`)
    for (const e of ejemplos) console.log(`  "${e.antes}" -> "${e.despues}"`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
