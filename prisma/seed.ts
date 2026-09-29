import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const prisma = new PrismaClient()
const __dirname = dirname(fileURLToPath(import.meta.url))

const HOSPITALES = [
  // Agudos
  { sigla: 'HGARM',  nombre: 'Hospital Ramos Mejia',          tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAPP',  nombre: 'Hospital Piñero',               tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HBR',    nombre: 'Hospital Rivadavia',            tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGACD',  nombre: 'Hospital Durand',               tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAP',   nombre: 'Hospital Penna',                tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGADS',  nombre: 'Hospital Santojanni',           tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGACA',  nombre: 'Hospital Argerich',             tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGATA',  nombre: 'Hospital Alvarez',              tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAJAF', nombre: 'Hospital Fernandez',            tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAIP',  nombre: 'Hospital Pirovano',             tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAVS',  nombre: 'Hospital Velez Sarsfield',      tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAT',   nombre: 'Hospital Tornu',                tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGAZ',   nombre: 'Hospital Zubizarreta',          tipo: 'HOSPITALES DE AGUDOS' },
  { sigla: 'HGACG',  nombre: 'Hospital Grierson',             tipo: 'HOSPITALES DE AGUDOS' },
  // Niños
  { sigla: 'HGNPE',  nombre: 'Hospital Elizalde',             tipo: 'HOSPITALES DE NIÑOS' },
  { sigla: 'HGNRG',  nombre: 'Hospital Gutierrez',            tipo: 'HOSPITALES DE NIÑOS' },
  // Salud Mental
  { sigla: 'CSMA',   nombre: 'Centro de Salud Mental Ameghino', tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HEPTA',  nombre: 'Hospital Alvear',               tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HIJCTG', nombre: 'Hospital Tobar Garcia',         tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HNBM',   nombre: 'Hospital Moyano',               tipo: 'HOSPITALES SALUD MENTAL' },
  { sigla: 'HNJTB',  nombre: 'Hospital Borda',                tipo: 'HOSPITALES SALUD MENTAL' },
  // Monovalentes
  { sigla: 'HIFJM',  nombre: 'Hospital Muñiz',                tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HMOMC',  nombre: 'Hospital Marie Curie',          tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HMIRS',  nombre: 'Hospital Sarda',                tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HBU',    nombre: 'Hospital Udaondo',              tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HQ',     nombre: 'Hospital Illia',                tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HRRMF',  nombre: 'Hospital Ferrer',               tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HSL',    nombre: 'Hospital Santa Lucia',          tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'IZLP',   nombre: 'Instituto Pasteur',             tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HMO',    nombre: 'Hospital Dueñas',               tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HRR',    nombre: 'Hospital Rocca',                tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'IRPS',   nombre: 'Instituto R. Psicofisica',      tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HOI',    nombre: 'Hospital Quinquela Martin',     tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HOPL',   nombre: 'Hospital Lagleyze',             tipo: 'HOSPITALES MONOVALENTES' },
  { sigla: 'HO',     nombre: 'Hospital Carrillo',             tipo: 'HOSPITALES MONOVALENTES' },
]

const ESCALAFONES = [
  { codigo: 'ENF', nombre: 'Carrera de Enfermería' },
  { codigo: 'TEC', nombre: 'Carrera de Técnicos de la Salud' },
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
    console.log('ℹ️  Sin catalogo-puestos-curado.json — se omite la carga del catálogo (se puede regenerar con apps/api/scripts/extraer_catalogo_puestos.ts)')
  }

  let puestosCount = 0
  let especialidadesCount = 0
  for (const p of puestosJson) {
    const escalafon = await prisma.escalafon.findUnique({ where: { codigo: p.escalafonCodigo } })
    if (!escalafon) {
      console.warn(`⚠️  Escalafón "${p.escalafonCodigo}" no existe — se omite el puesto "${p.nombre}"`)
      continue
    }
    const puesto = await prisma.puestoCargo.upsert({
      where: { escalafonId_modalidad_nombre: { escalafonId: escalafon.id, modalidad: p.modalidad, nombre: p.nombre } },
      update: {},
      create: { escalafonId: escalafon.id, modalidad: p.modalidad, nombre: p.nombre, tipoPuesto: p.tipoPuesto },
    })
    puestosCount++
    for (const nombreEsp of p.especialidades) {
      await prisma.especialidadPuesto.upsert({
        where: { puestoCargId_nombre: { puestoCargId: puesto.id, nombre: nombreEsp } },
        update: {},
        create: { puestoCargId: puesto.id, nombre: nombreEsp },
      })
      especialidadesCount++
    }
  }
  console.log(`✅ Catálogo puesto/especialidad: ${puestosCount} puestos, ${especialidadesCount} especialidades`)

  console.log('🎉 Seed completado.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
