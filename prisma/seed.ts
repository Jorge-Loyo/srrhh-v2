import { PrismaClient, RolUsuario } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

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
  { codigo: 'CPH', nombre: 'Carrera Profesional Hospitalaria' },
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

  // Usuario admin
  const passwordHash = await bcrypt.hash('Admin1234!', 12)
  await prisma.usuario.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@gcba.gob.ar',
      passwordHash,
      rol: RolUsuario.admin,
      activo: true,
    },
  })
  console.log('✅ Usuario admin creado (admin / Admin1234!)')

  console.log('🎉 Seed completado.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
