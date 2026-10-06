/**
 * S24-4/5: genera cargos de conducción VACANTES derivados del organigrama.
 *
 * Universo (ampliado con el usuario, 2026-10 — "en el organigrama todos los
 * cargos tienen que tener un código de cargo, incluidas las vacantes"):
 * TODO nodo de conducción del organigrama que NO tenga ya un cargo de
 * conducción modelado, SIN importar si tiene o no personal activo. En esta
 * fase de armado de datos (sin concursos ni bajas SIAL validadas) ningún nodo
 * debe quedar "Sin cargo en sistema". Un nodo sin personal activo se genera
 * igual, marcado con revisionDato=true (vacante "fría": nodo del árbol sin
 * dotación hoy) para que RRHH lo distinga del vacante con gente trabajando.
 *
 * Quedan fuera solo: GO/SGO/Ministerio/PLTA TRANS. DOCENTE, régimen "fuera de
 * norma"/"director docente", y los nodos que YA tienen un cargo de conducción
 * (del padrón o de una corrida previa de este script — no se duplica).
 *
 * Evolución: 101 (solo con personal activo) → 68 (excluyendo los que ya tenían
 * jefatura del padrón) → universo completo (se quita el filtro de personal
 * activo). Los 68 ya generados no se regeneran (idempotente por origen).
 *
 * Por cada nodo candidato, genera un Cargo con:
 *   escalafón → del regimen_empleo del nodo (mapeo fijo)
 *   puesto    → del tipo del nodo (DHOS→Director, DEPT→Jefe de Depto, etc.)
 *   JCAT      → del nivel + familia (jcat_cargo_jefatura al revés)
 *   código    → prefijoDeCargo() + siguienteCodigoCargo() (cadena existente)
 *   id_sial   → NULL (dato externo del SIAL; el sistema no lo inventa, lo trae
 *               el padrón cuando una persona ocupe el cargo — S24-6)
 *   origen    → 'organigrama'
 *   estado    → 'vigente', sin ocupación
 *
 * Idempotente: solo crea cargo para nodos que NO tengan ya un cargo con
 * origen='organigrama' para esa repartición. Re-ejecutable sin duplicar.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/derivar_cargos_conduccion.ts [--dry-run]
 */
import { Prisma, PrismaClient } from '@prisma/client'
import { prefijoDeCargo, siguienteCodigoCargo } from '../src/shared/codigoCargo.js'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

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
// El literal se usa para resolver el puesto en el catálogo y para prefijoDeCargo.
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

// Familia del JCAT según escalafón: P=profesional, G=general/administrativo, Z=enfermería
function familiaJcat(codigoEscalafon: string): string {
  if (codigoEscalafon === '83') return 'G'
  if (codigoEscalafon === '87') return 'Z'
  return 'P' // 22, 85, 25 → profesional
}

interface NodoCandidato {
  codigo_reparticion: string
  tipo: string
  desc_rep: string
  regimen_empleo: string
  sigla: string
  tiene_personal_activo: boolean
}

async function main() {
  console.log(`🏗️  Derivación de cargos de conducción vacantes (S24-4/5)${dryRun ? ' [DRY RUN]' : ''}...\n`)

  // ── 1. Obtener los nodos candidatos (universo completo del organigrama) ──
  // Ya NO se exige personal activo: todo nodo de conducción sin jefatura
  // modelada entra. `tiene_personal_activo` se calcula para marcar revisionDato
  // en los que no tienen gente trabajando (vacante "fría").
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
      -- NO duplicar: excluir nodos que YA tienen una jefatura que el organigrama
      -- VA A MOSTRAR. Son dos vías, alineadas con la lógica del organigrama:
      --   (1) un cargo de conducción reconocido por su CÓDIGO (prefijos de
      --       conducción): el organigrama lo muestra esté ocupado o vacante
      --       (ej. un director en 'validacion_vacante' sin ocupante activo).
      --   (2) una ocupación con JCAT que esté ACTIVA. La situación de revista
      --       importa: un jefe en 'Retención de Cargo'/'Comisión' NO cuenta
      --       como jefatura presente (se fue a ejercer otro cargo), igual que
      --       en el organigrama (SPRINT_24_S2_analisis.md §1). Sin el filtro de
      --       'activo', un nodo cuyo único jefe con JCAT está retenido (y cuyo
      --       cargo NO es de conducción por código, ej. ENF-xxx con JCAT Z24)
      --       quedaba sin cargo generado Y vacante en el organigrama — sin
      --       código (caso testigo: 40233110 DIV Turno Mañana A, HEPTA).
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
      -- Idempotencia: excluir nodos que ya tienen un cargo generado desde el
      -- organigrama (origen='organigrama') para esa repartición.
      AND NOT EXISTS (
        SELECT 1 FROM cargos cg
        WHERE cg.origen = 'organigrama' AND cg.codigo_repa = og.codigo_reparticion AND cg.deleted_at IS NULL
      )
    ORDER BY og.tipo, og.desc_rep
  `)

  console.log(`   Nodos candidatos: ${nodos.length}\n`)
  if (nodos.length === 0) {
    console.log('🎉 Sin nodos a procesar (todos ya tienen cargo generado o jefatura activa).')
    return
  }

  // ── 2. Cargar catálogos necesarios ──
  const escalafones = await prisma.escalafon.findMany({ where: { activo: true } })
  const escalafonPorCodigo = new Map(escalafones.map((e) => [e.codigo, e]))

  const hospitales = await prisma.hospital.findMany()
  const hospitalPorSigla = new Map(hospitales.map((h) => [h.sigla, h]))

  const jcats = await prisma.$queryRaw<{ jcat: string; cargo_jefatura: string; familia: string }[]>(
    Prisma.sql`SELECT jcat, cargo_jefatura, familia FROM jcat_cargo_jefatura`
  )
  // Índice: "familia:cargo_jefatura" → jcat (para buscar al revés)
  const jcatPorNivelFamilia = new Map<string, string>()
  for (const j of jcats) {
    jcatPorNivelFamilia.set(`${j.familia}:${j.cargo_jefatura}`, j.jcat)
  }

  // Puesto del catálogo para cada (escalafón, literal). El catálogo guarda los
  // puestos de jefatura con el sufijo de nivel entre paréntesis (ej. "jefe de
  // seccion (06)"), así que se indexa por el nombre NORMALIZADO sin ese sufijo
  // para poder matchear contra el literal genérico ("jefe de seccion").
  const puestos = await prisma.puestoCargo.findMany({
    where: { activo: true },
    select: { id: true, escalafonId: true, nombre: true, modalidad: true },
  })
  // quita " (NN)" final para comparar: "jefe de seccion (06)" → "jefe de seccion"
  const sinNivel = (s: string) => s.replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase()
  const puestoPorEscLiteral = new Map<string, { id: string }>()
  for (const p of puestos) {
    puestoPorEscLiteral.set(`${p.escalafonId}:${sinNivel(p.nombre)}`, { id: p.id })
  }

  // Resuelve el puestoCargoId para (escalafón, literal de jefatura). Si no existe
  // en el catálogo para ese escalafón (ej. Enfermería/CEETPS/Administrativa no
  // tienen el puesto genérico de jefatura), lo auto-crea con pendienteCurar=true
  // — mismo criterio que el import del padrón ante un puesto nuevo.
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

  // ── 3. Generar cargos ──
  let creados = 0
  let saltados = 0
  const errores: string[] = []

  for (const nodo of nodos) {
    const tipoInfo = TIPO_A_PUESTO[nodo.tipo]
    if (!tipoInfo) {
      errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: tipo '${nodo.tipo}' sin mapeo a puesto`)
      saltados++
      continue
    }

    // Escalafón: CA fuerza 83; resto por régimen
    const codigoEsc = ES_CA.has(nodo.tipo) ? '83' : REGIMEN_A_ESCALAFON[nodo.regimen_empleo]
    if (!codigoEsc) {
      errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: régimen '${nodo.regimen_empleo}' sin mapeo a escalafón`)
      saltados++
      continue
    }
    const escalafon = escalafonPorCodigo.get(codigoEsc)
    if (!escalafon) {
      errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: escalafón código '${codigoEsc}' no encontrado en BD`)
      saltados++
      continue
    }

    // Hospital
    const hospital = hospitalPorSigla.get(nodo.sigla)
    if (!hospital) {
      errores.push(`${nodo.codigo_reparticion} ${nodo.desc_rep}: sigla '${nodo.sigla}' sin hospital en BD`)
      saltados++
      continue
    }

    // JCAT (al revés: familia + nivel → jcat)
    const familia = familiaJcat(codigoEsc)
    const jcatKey = `${familia}:${tipoInfo.nivelJcat}`
    const jcat = jcatPorNivelFamilia.get(jcatKey) ?? null
    // JCAT puede ser null para niveles que no están en la tabla (ej. subsecretario,
    // director general) — no es un error, simplemente no aplica para AS/DG.

    // Puesto del catálogo — se resuelve o auto-crea para el escalafón.
    const puestoId = await resolverPuestoConduccion(escalafon.id, tipoInfo.literal)

    // Código de cargo
    const prefijo = prefijoDeCargo({
      escalafon: escalafon.nombre,
      unificadorPuesto: 'jefatura',
      agrupador: tipoInfo.literal,
      puestoCargo: { nombre: tipoInfo.literal, tipoPuesto: 'conduccion', modalidad: 'pof' },
    })

    // Vacante "fría": nodo sin personal activo hoy. Se genera igual (el usuario
    // quiere TODO nodo con código) pero marcado para que RRHH lo distinga.
    const revisionDato = !nodo.tiene_personal_activo
    const revisionMotivo = revisionDato ? 'Nodo del organigrama sin personal activo (vacante fría)' : null

    if (dryRun) {
      const marca = revisionDato ? ' ⚠️ fría' : ''
      console.log(`   ✅ ${nodo.tipo.padEnd(10)} ${nodo.codigo_reparticion} ${nodo.desc_rep.substring(0, 45).padEnd(45)} → ${prefijo}-XXXXXX | ${escalafon.nombre} | JCAT=${jcat ?? '—'} | ${hospital.sigla}${marca}`)
      creados++
      continue
    }

    // Crear el cargo en transacción (secuencial atómico)
    await prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigoCargo(prefijo, tx)
      await tx.cargo.create({
        data: {
          // id_sial NULL: dato externo del SIAL, el sistema no lo inventa. Lo
          // asigna el padrón cuando una persona ocupe el cargo (S24-6).
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
          // JCAT no va en Cargo (vive en la Ocupación), pero lo registro
          // en el agrupador como referencia para cuando se cree la ocupación.
          agrupador: jcat ? `jcat:${jcat}` : null,
        },
      })
    })
    creados++
  }

  console.log(`\n📊 Resultado:`)
  console.log(`   Cargos ${dryRun ? 'a generar' : 'generados'}:  ${creados}`)
  console.log(`   Saltados (error de mapeo): ${saltados}`)
  if (errores.length > 0) {
    console.log(`\n⚠️  Errores de mapeo:`)
    for (const e of errores) console.log(`   · ${e}`)
  }
  console.log(`\n🎉 ${dryRun ? 'Dry-run completado.' : 'Derivación completada.'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
