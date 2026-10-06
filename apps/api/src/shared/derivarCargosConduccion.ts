/**
 * S24-4/5/7: derivación de cargos de conducción VACANTES desde el organigrama.
 *
 * Núcleo reutilizable (extraído del script scripts/derivar_cargos_conduccion.ts):
 *  - El script CLI lo invoca para el backfill manual (con --dry-run).
 *  - reemplazarOrganigramaService lo invoca tras subir un árbol nuevo (S24-7),
 *    para dar de alta los cargos de los nodos nuevos sin duplicar los existentes.
 *
 * Universo: TODO nodo de conducción del organigrama que NO tenga ya una jefatura
 * que el organigrama vaya a mostrar (cargo de conducción por código, o una
 * ocupación con JCAT ACTIVA). Los nodos sin personal activo se generan igual,
 * marcados revisionDato=true (vacante "fría"). Fuera: GO/SGO/Ministerio/docente,
 * régimen "fuera de norma", y nodos que ya tienen cargo origen='organigrama'
 * (idempotente). Ver SPRINT_24_cargos_conduccion_vacantes.md y S2_analisis §1.
 */
import { Prisma, PrismaClient } from '@prisma/client'
import { prefijoDeCargo, siguienteCodigoCargo } from './codigoCargo.js'

// ── Mapeo régimen_empleo del organigrama → escalafón (código canónico) ──
const REGIMEN_A_ESCALAFON: Record<string, string> = {
  'Carrera de Profesionales de la Salud': '22',
  'Direccion Medica': '22',
  'Carrera de Enfermeria': '87',
  'Escalafon General / Carrera Administrativa': '83',
  'Carrera de Técnicos de la Salud': '85',
  'Autoridades Superiores': '25',
}

// ── Mapeo tipo del nodo → nivel de conducción + literal del puesto ──
const TIPO_A_PUESTO: Record<string, { literal: string; nivelJcat: string }> = {
  'SSEC/DIREJE': { literal: 'subsecretario', nivelJcat: 'subsecretario' },
  'DG':          { literal: 'director general', nivelJcat: 'director general' },
  'F/N DG':      { literal: 'director general', nivelJcat: 'director general' },
  'UAI DG':      { literal: 'director general', nivelJcat: 'director general' },
  'UAI MSTR':    { literal: 'director general', nivelJcat: 'director general' },
  'DHOS':        { literal: 'director', nivelJcat: 'director' },
  'SDHOS':       { literal: 'sub-director', nivelJcat: 'sub-director' },
  'DEPT':        { literal: 'jefe de departamento', nivelJcat: 'jefe de departamento' },
  'DEPT CA':     { literal: 'jefe de departamento', nivelJcat: 'jefe de departamento' },
  'DIV':         { literal: 'jefe de division', nivelJcat: 'jefe de division' },
  'DIV CA':      { literal: 'jefe de division', nivelJcat: 'jefe de division' },
  'UNID':        { literal: 'jefe de unidad', nivelJcat: 'jefe de unidad' },
  'SECCION':     { literal: 'jefe de seccion', nivelJcat: 'jefe de seccion' },
  'SECCION CA':  { literal: 'jefe de seccion', nivelJcat: 'jefe de seccion' },
  'F/N DEJE':    { literal: 'director', nivelJcat: 'director' },
}

// Los tipos con sufijo CA fuerzan escalafón Escalafón General (83)
const ES_CA = new Set(['DEPT CA', 'DIV CA', 'SECCION CA'])

function familiaJcat(codigoEscalafon: string): string {
  if (codigoEscalafon === '83') return 'G'
  if (codigoEscalafon === '87') return 'Z'
  return 'P'
}

interface NodoCandidato {
  codigo_reparticion: string
  tipo: string
  desc_rep: string
  regimen_empleo: string
  sigla: string
  tiene_personal_activo: boolean
}

export interface ResultadoDerivacion {
  candidatos: number
  creados: number
  saltados: number
  errores: string[]
  detalle: Array<{ codigoRepa: string; codigo: string; frio: boolean }>
}

/**
 * Deriva (o simula con dryRun) los cargos de conducción vacantes faltantes.
 * Idempotente: no toca los que ya existen con origen='organigrama'.
 */
export async function derivarCargosConduccionService(
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<ResultadoDerivacion> {
  const dryRun = opts.dryRun ?? false

  // ── 1. Nodos candidatos (universo completo, sin jefatura ACTIVA modelada) ──
  const nodos = await prisma.$queryRaw<NodoCandidato[]>(Prisma.sql`
    SELECT og.codigo_reparticion, og.tipo, og.desc_rep, og.regimen_empleo, og.sigla,
           (SELECT count(*) FROM cargos cg JOIN ocupaciones o ON o.cargo_id=cg.id AND o.hasta IS NULL
              AND lower(unaccent(o.situacion_revista))='activo'
            WHERE cg.codigo_repa=og.codigo_reparticion AND cg.deleted_at IS NULL) > 0
             AS tiene_personal_activo
    FROM organigramas og
    WHERE og.tipo NOT IN ('GO','SGO','F/N MSTR - GO','Ministerio','PLTA TRANS. DOCENTE')
      AND lower(og.regimen_empleo) NOT LIKE '%fuera de norma%'
      AND lower(og.regimen_empleo) NOT LIKE '%director docente%'
      AND NOT EXISTS (
        SELECT 1 FROM cargos cg
        WHERE cg.codigo_repa = og.codigo_reparticion AND cg.deleted_at IS NULL
          AND (
            cg.codigo LIKE 'CPH-J-%' OR cg.codigo LIKE 'CPH-D-%' OR cg.codigo LIKE 'CPH-SD-%'
            OR cg.codigo LIKE 'TEC-J-%' OR cg.codigo LIKE 'EG-J-%' OR cg.codigo LIKE 'EG-D-%'
            OR cg.codigo LIKE 'EG-G-%' OR cg.codigo LIKE 'RG-CG-%' OR cg.codigo LIKE 'AS-%'
            OR EXISTS (SELECT 1 FROM ocupaciones o2 WHERE o2.cargo_id=cg.id AND o2.hasta IS NULL
                       AND lower(unaccent(o2.situacion_revista)) = 'activo'
                       AND o2.codigo_jefaturas IS NOT NULL AND o2.codigo_jefaturas <> '' AND o2.codigo_jefaturas <> '0')
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM cargos cg
        WHERE cg.origen = 'organigrama' AND cg.codigo_repa = og.codigo_reparticion AND cg.deleted_at IS NULL
      )
    ORDER BY og.tipo, og.desc_rep
  `)

  const res: ResultadoDerivacion = { candidatos: nodos.length, creados: 0, saltados: 0, errores: [], detalle: [] }
  if (nodos.length === 0) return res

  // ── 2. Catálogos ──
  const escalafones = await prisma.escalafon.findMany({ where: { activo: true } })
  const escalafonPorCodigo = new Map(escalafones.map((e) => [e.codigo, e]))
  const hospitales = await prisma.hospital.findMany()
  const hospitalPorSigla = new Map(hospitales.map((h) => [h.sigla, h]))
  const jcats = await prisma.$queryRaw<{ jcat: string; cargo_jefatura: string; familia: string }[]>(
    Prisma.sql`SELECT jcat, cargo_jefatura, familia FROM jcat_cargo_jefatura`
  )
  const jcatPorNivelFamilia = new Map<string, string>()
  for (const j of jcats) jcatPorNivelFamilia.set(`${j.familia}:${j.cargo_jefatura}`, j.jcat)

  const puestos = await prisma.puestoCargo.findMany({
    where: { activo: true },
    select: { id: true, escalafonId: true, nombre: true, modalidad: true },
  })
  const sinNivel = (s: string) => s.replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase()
  const puestoPorEscLiteral = new Map<string, { id: string }>()
  for (const p of puestos) puestoPorEscLiteral.set(`${p.escalafonId}:${sinNivel(p.nombre)}`, { id: p.id })

  async function resolverPuestoConduccion(escalafonId: string, literal: string): Promise<string> {
    const hit = puestoPorEscLiteral.get(`${escalafonId}:${literal}`)
    if (hit) return hit.id
    if (dryRun) return '(se crearía)'
    const creado = await prisma.puestoCargo.create({
      data: { escalafonId, nombre: literal, modalidad: 'ambos', tipoPuesto: 'conduccion', pendienteCurar: true },
      select: { id: true },
    })
    puestoPorEscLiteral.set(`${escalafonId}:${literal}`, { id: creado.id })
    return creado.id
  }

  // ── 3. Generar ──
  for (const nodo of nodos) {
    const tipoInfo = TIPO_A_PUESTO[nodo.tipo]
    if (!tipoInfo) {
      res.errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: tipo '${nodo.tipo}' sin mapeo a puesto`)
      res.saltados++
      continue
    }
    const codigoEsc = ES_CA.has(nodo.tipo) ? '83' : REGIMEN_A_ESCALAFON[nodo.regimen_empleo]
    if (!codigoEsc) {
      res.errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: régimen '${nodo.regimen_empleo}' sin mapeo a escalafón`)
      res.saltados++
      continue
    }
    const escalafon = escalafonPorCodigo.get(codigoEsc)
    if (!escalafon) {
      res.errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: escalafón '${codigoEsc}' no encontrado`)
      res.saltados++
      continue
    }
    const hospital = hospitalPorSigla.get(nodo.sigla)
    if (!hospital) {
      res.errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: sigla '${nodo.sigla}' sin hospital`)
      res.saltados++
      continue
    }

    const familia = familiaJcat(codigoEsc)
    const jcat = jcatPorNivelFamilia.get(`${familia}:${tipoInfo.nivelJcat}`) ?? null
    const puestoId = await resolverPuestoConduccion(escalafon.id, tipoInfo.literal)
    const prefijo = prefijoDeCargo({
      escalafon: escalafon.nombre,
      unificadorPuesto: 'jefatura',
      agrupador: tipoInfo.literal,
      puestoCargo: { nombre: tipoInfo.literal, tipoPuesto: 'conduccion', modalidad: 'pof' },
    })
    const revisionDato = !nodo.tiene_personal_activo
    const revisionMotivo = revisionDato ? 'Nodo del organigrama sin personal activo (vacante fría)' : null

    if (dryRun) {
      res.detalle.push({ codigoRepa: nodo.codigo_reparticion, codigo: `${prefijo}-XXXXXX`, frio: revisionDato })
      res.creados++
      continue
    }

    await prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigoCargo(prefijo, tx)
      await tx.cargo.create({
        data: {
          idSial: null,
          codigo,
          hospitalId: hospital.id,
          escalafonId: escalafon.id,
          puestoCargoId: puestoId,
          literalPuesto: tipoInfo.literal,
          codigoRepa: nodo.codigo_reparticion,
          descripcionRepa: nodo.desc_rep,
          regimen: escalafon.nombre.toLowerCase(),
          estado: 'vigente',
          origen: 'organigrama',
          revisionDato,
          revisionMotivo,
          agrupador: jcat ? `jcat:${jcat}` : null,
        },
      })
      res.detalle.push({ codigoRepa: nodo.codigo_reparticion, codigo, frio: revisionDato })
    })
    res.creados++
  }

  return res
}
