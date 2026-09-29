import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const prisma = new PrismaClient()
const __dirname = dirname(fileURLToPath(import.meta.url))

const HOSPITALES = [
  // Agudos
  { sigla: 'HGARM', nombre: 'Hospital Ramos Mejia', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAPP', nombre: 'Hospital Piñero', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HBR', nombre: 'Hospital Rivadavia', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGACD', nombre: 'Hospital Durand', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAP', nombre: 'Hospital Penna', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGADS', nombre: 'Hospital Santojanni', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGACA', nombre: 'Hospital Argerich', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGATA', nombre: 'Hospital Alvarez', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAJAF', nombre: 'Hospital Fernandez', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAIP', nombre: 'Hospital Pirovano', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAVS', nombre: 'Hospital Velez Sarsfield', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAT', nombre: 'Hospital Tornu', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAZ', nombre: 'Hospital Zubizarreta', tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGACG', nombre: 'Hospital Grierson', tipo: 'HOSPITALES DE AGUDOS' },
  // Niños
  { sigla: 'HGNPE', nombre: 'Hospital Elizalde', tipo: 'HOSPITALES DE NIÑOS' },
  { sigla: 'HGNRG', nombre: 'Hospital Gutierrez', tipo: 'HOSPITALES DE NIÑOS' },
  // Salud Mental
  { sigla: 'CSMA', nombre: 'Centro de Salud Mental Ameghino', tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HEPTA', nombre: 'Hospital Alvear', tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HIJCTG', nombre: 'Hospital Tobar Garcia', tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HNBM', nombre: 'Hospital Moyano', tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HNJTB', nombre: 'Hospital Borda', tipo: 'HOSPITALES SALUD MENTAL' },
  // Monovalentes
  { sigla: 'HIFJM', nombre: 'Hospital Muñiz', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HMOMC', nombre: 'Hospital Marie Curie', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HMIRS', nombre: 'Hospital Sarda', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HBU', nombre: 'Hospital Udaondo', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HQ', nombre: 'Hospital Illia', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HRRMF', nombre: 'Hospital Ferrer', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HSL', nombre: 'Hospital Santa Lucia', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'IZLP', nombre: 'Instituto Pasteur', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HMO', nombre: 'Hospital Dueñas', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HRR', nombre: 'Hospital Rocca', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'IRPS', nombre: 'Instituto R. Psicofisica', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HOI', nombre: 'Hospital Quinquela Martin', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HOPL', nombre: 'Hospital Lagleyze', tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HO', nombre: 'Hospital Carrillo', tipo: 'HOSPITALES MONOVALENTES' },
]

// Escalafones canónicos. Los numéricos (código SIAL) venían de una migración
// histórica; al consolidar el historial (limpieza de raíz S21) se movieron acá,
// junto a los dos sembrados a mano (ENF/TEC). El upsert por código los hace
// idempotentes.
const ESCALAFONES = [
  { codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' },
  { codigo: '23', nombre: 'Salud - Guardias' },
  { codigo: '24', nombre: 'Residencias' },
  { codigo: '25', nombre: 'Autoridades Superiores' },
  { codigo: '17', nombre: 'Gabinete' },
  { codigo: '17B', nombre: 'Régimen Modular Extraordinario PG' },
  { codigo: '60', nombre: 'Carrera Gerencial' },
  { codigo: '65', nombre: 'Plantas Transitorias Acta 06/2014' },
  { codigo: '7', nombre: 'Docentes Históricos' },
  { codigo: '16T', nombre: 'Plantas Transitorias Modulo Operativo' },
  { codigo: '70', nombre: 'Cuerpo Especialistas Profesionales' },
  { codigo: '83', nombre: 'Nueva Carrera Administrativa' },
  { codigo: '85', nombre: 'CEETPS' },
  { codigo: '87', nombre: 'Nueva Carrera Enfermería' },
  { codigo: 'ENF', nombre: 'Carrera de Enfermería' },
  { codigo: 'TEC', nombre: 'Carrera de Técnicos de la Salud' },
]

// A21-13: normaliza texto a minúscula + sin tilde/diéresis (mantiene la ñ),
// colapsa espacios. Es la regla transversal del proyecto (ver
// Doc/Referencias/DOTANEITOR_DECISIONES.md §9.1 / A21-1). Al sembrar el
// catálogo con esta función, los duplicados por casing/tilde
// ("Jefe de División" vs "Jefe de Division") colapsan solos vía el upsert
// por nombre (A21-14).
function normalizarTexto(s: string): string {
  return (
    s
      .normalize('NFD')
      // saca diacríticos excepto la tilde de la ñ (\u0303)
      .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  )
}

// A21-15: el catalogo-puestos-curado.json trae algunos escalafonCodigo
// "basura" (nombres de escalafones duplicados auto-creados por el padrón
// pre-reset, con sufijo hash). Se remapean al código canónico SIAL antes de
// sembrar, para no omitir esos puestos (médicos de planta, CEETPS, etc.).
const REMAP_ESCALAFON_CODIGO: Record<string, string> = {
  'Médicos-e47d1ac': '22', // CPH — Médico de Planta y especialidades
  CPH: '22', // CPH — variante vieja del nombre
  'CEETPS-d7fc610': '85', // CEETPS / Técnicos
  'Escalafón Ge-af6efb0': '83', // Nueva Carrera Administrativa
}

// A21-12: mapeo código de registro SIAL → escalafón canónico (por código).
// Fuente de verdad para que el import del padrón (y el Dotaneitor v2, S22-5)
// resuelvan la carrera por el CODIGO DE REGISTRO en vez del nombre del Excel.
// Un escalafón puede tener más de un código (CPH: 22 y 37).
// literal = nombre tal como suele venir en LIT_COD_REG del Excel.
const CODIGOS_REGISTRO: { codigo: string; escalafonCodigo: string; literal: string }[] = [
  { codigo: '37', escalafonCodigo: '22', literal: 'Nueva Carrera Profesional Hospitalaria' },
  { codigo: '22', escalafonCodigo: '22', literal: 'Nueva Carrera Profesional Hospitalaria' },
  { codigo: '23', escalafonCodigo: '23', literal: 'Salud - Guardias' },
  { codigo: '24', escalafonCodigo: '24', literal: 'Residencias' },
  { codigo: '83', escalafonCodigo: '83', literal: 'Nueva Carrera Administrativa' },
  { codigo: '85', escalafonCodigo: '85', literal: 'CEETPS' },
  { codigo: '87', escalafonCodigo: '87', literal: 'Nueva Carrera Enfermería' },
]

async function main() {
  console.log('🌱 Iniciando seed...')

  // Hospitales
  let hCount = 0
  for (const h of HOSPITALES) {
    await prisma.hospital.upsert({
      where: { sigla: h.sigla },
      update: {},
      create: { sigla: h.sigla, nombre: h.nombre, tipo: h.tipo, activo: true },
    })
    hCount++
  }
  console.log(`✅ Hospitales: ${hCount}`)

  // Escalafones
  let eCount = 0
  for (const e of ESCALAFONES) {
    await prisma.escalafon.upsert({
      where: { codigo: e.codigo },
      update: {},
      create: { codigo: e.codigo, nombre: e.nombre, activo: true },
    })
    eCount++
  }
  console.log(`✅ Escalafones: ${eCount}`)

  // A21-12: códigos de registro SIAL → escalafón canónico
  let crCount = 0
  for (const cr of CODIGOS_REGISTRO) {
    const escalafon = await prisma.escalafon.findUnique({ where: { codigo: cr.escalafonCodigo } })
    if (!escalafon) {
      console.warn(`⚠️  codigos_registro: escalafón "${cr.escalafonCodigo}" no existe — se omite el código ${cr.codigo}`)
      continue
    }
    await prisma.codigoRegistro.upsert({
      where: { codigo: cr.codigo },
      update: { escalafonId: escalafon.id, literal: cr.literal },
      create: { codigo: cr.codigo, escalafonId: escalafon.id, literal: cr.literal },
    })
    crCount++
  }
  console.log(`✅ Códigos de registro: ${crCount}`)

  // Usuario admin — el rol "admin" lo siembra la migración de RBAC dinámico
  // (prisma/migrations/20260901120000_rbac_dinamico), acá solo se busca por slug.
  const rolAdmin = await prisma.role.findUnique({ where: { slug: 'admin' } })
  if (!rolAdmin) {
    throw new Error('No existe el rol "admin" — ¿corriste `prisma migrate deploy` antes del seed?')
  }

  const passwordHash = await bcrypt.hash('Admin1234!', 12)
  await prisma.usuario.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@gcba.gob.ar',
      passwordHash,
      roleId: rolAdmin.id,
      activo: true,
    },
  })
  console.log('✅ Usuario admin creado (admin / Admin1234!)')

  // S20-4: catálogo curado de puesto/especialidad — extraído de los ~48k
  // cargos reales pre-reset (2026-09-28, ver
  // Doc/Planificacion/Sprints/SPRINT_20_consolidacion_puesto_escalafon_especialidad.md)
  // más los ~167 puestos ya sembrados a mano. Solo se cargan puestos cuyo
  // escalafón tiene un código ESTABLE (numérico SIAL o sembrado a mano
  // ENF/TEC/CPH) — los escalafones "basura" con sufijo random (duplicados
  // auto-creados por el padrón, fuera de alcance de este sprint) se saltean.
  type PuestoCurado = {
    escalafonCodigo: string
    nombre: string
    modalidad: 'pof' | 'pou' | 'ambos'
    tipoPuesto: 'ejecucion' | 'conduccion'
    especialidades: string[]
  }
  let puestosJson: PuestoCurado[] = []
  try {
    puestosJson = JSON.parse(readFileSync(join(__dirname, 'catalogo-puestos-curado.json'), 'utf-8'))
  } catch {
    console.log(
      'ℹ️  Sin catalogo-puestos-curado.json — se omite la carga del catálogo (se puede regenerar con apps/api/scripts/extraer_catalogo_puestos.ts)',
    )
  }

  let puestosCount = 0
  let especialidadesCount = 0
  const escalafonesNoResueltos = new Set<string>()
  for (const p of puestosJson) {
    // A21-15: remapear códigos "basura" al canónico antes de resolver
    const codigoEscalafon = REMAP_ESCALAFON_CODIGO[p.escalafonCodigo] ?? p.escalafonCodigo
    const escalafon = await prisma.escalafon.findUnique({ where: { codigo: codigoEscalafon } })
    if (!escalafon) {
      escalafonesNoResueltos.add(p.escalafonCodigo)
      continue
    }
    // A21-13/14: normalizar nombre a minúscula/sin tilde → colapsa duplicados
    const nombrePuesto = normalizarTexto(p.nombre).slice(0, 200)
    const puesto = await prisma.puestoCargo.upsert({
      where: {
        escalafonId_modalidad_nombre: {
          escalafonId: escalafon.id,
          modalidad: p.modalidad,
          nombre: nombrePuesto,
        },
      },
      update: {},
      create: {
        escalafonId: escalafon.id,
        modalidad: p.modalidad,
        nombre: nombrePuesto,
        tipoPuesto: p.tipoPuesto,
      },
    })
    puestosCount++
    for (const nombreEsp of p.especialidades) {
      const nombreEspNorm = normalizarTexto(nombreEsp).slice(0, 200)
      if (!nombreEspNorm) continue
      await prisma.especialidadPuesto.upsert({
        where: { puestoCargId_nombre: { puestoCargId: puesto.id, nombre: nombreEspNorm } },
        update: {},
        create: { puestoCargId: puesto.id, nombre: nombreEspNorm },
      })
      especialidadesCount++
    }
  }
  if (escalafonesNoResueltos.size > 0) {
    console.warn(
      `⚠️  Escalafones no resueltos (revisar REMAP_ESCALAFON_CODIGO): ${[...escalafonesNoResueltos].join(', ')}`,
    )
  }
  console.log(
    `✅ Catálogo puesto/especialidad: ${puestosCount} puestos, ${especialidadesCount} especialidades`,
  )

  console.log('🎉 Seed completado.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
