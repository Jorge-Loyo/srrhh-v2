/**
 * S23-3: carga el catálogo oficial de Áreas Programáticas/CeSACs (Anexo III,
 * IF-2026-33586335-GCABA-MSGC) y la estructura fija de la Subsecretaría APAyC
 * (Decreto 306-26, Anexo XI/XII, sección 5).
 *
 * Datos hardcodeados a propósito (igual que EVOLUTIVO_ESPECIALIDAD_HISTORICO
 * en reportes.schema.ts): vienen de un decreto firmado, no de una tabla que
 * vaya a cambiar con el padrón semanal. codigoReparticion viene de cruzar
 * contra el árbol legacy (organigramas) en la auditoría S23-1 (2026-10-05) —
 * 50 de los 52 CeSACs matchearon (faltan Nº51 y Nº53, no estaban en ese dump);
 * CEMAR IV no tiene nodo en el árbol legacy.
 *
 * Re-ejecutable (upsert por clave natural: nombre en AreaProgramatica, numero
 * en Cesac, nombre en UnidadFijaApayC) — a diferencia de Organigrama/Pou no
 * hace delete+recreate, porque Cargo.cesacId/unidadFijaId son FK reales que
 * no deben quedar huérfanas una vez que S23-4 backfillee cargos reales.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/seed_areas_programaticas.ts
 */
import { PrismaClient, type NivelCesac, type NivelOrganicoUnidadFija, type TipoUnidadFija } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Las 13 Áreas Programáticas — hospital de referencia (sigla real del
// catálogo `hospitales`) y codigoReparticion del nodo "DEPT Área Programática
// de Salud" correspondiente en el árbol legacy (organigramas), confirmado
// real en la auditoría S23-1. ───
const AREAS_PROGRAMATICAS: { nombre: string; hospitalSigla: string; codigoReparticion: string }[] = [
  { nombre: 'AP — ÁLVAREZ',         hospitalSigla: 'HGATA', codigoReparticion: '40275300' },
  { nombre: 'AP — ARGERICH',        hospitalSigla: 'HGACA', codigoReparticion: '40220513' },
  { nombre: 'AP — DURAND',          hospitalSigla: 'HGACD', codigoReparticion: '40220613' },
  { nombre: 'AP — FERNÁNDEZ',       hospitalSigla: 'HGAJAF', codigoReparticion: '40220711' },
  { nombre: 'AP — GRIERSON',        hospitalSigla: 'HGACG', codigoReparticion: '40222170' },
  { nombre: 'AP — PENNA',           hospitalSigla: 'HGAP',  codigoReparticion: '40292400' },
  { nombre: 'AP — PIÑERO',          hospitalSigla: 'HGAPP', codigoReparticion: '40290400' },
  { nombre: 'AP — PIROVANO',        hospitalSigla: 'HGAIP', codigoReparticion: '40224900' },
  { nombre: 'AP — RAMOS MEJÍA',     hospitalSigla: 'HGARM', codigoReparticion: '40223900' },
  { nombre: 'AP — SANTOJANNI',      hospitalSigla: 'HGADS', codigoReparticion: '40221117' },
  { nombre: 'AP — TORNÚ',           hospitalSigla: 'HGAT',  codigoReparticion: '40291500' },
  { nombre: 'AP — VÉLEZ SARSFIELD', hospitalSigla: 'HGAVS', codigoReparticion: '40229300' },
  { nombre: 'AP — ZUBIZARRETA',     hospitalSigla: 'HGAZ',  codigoReparticion: '40011010' },
]

// ─── Los 52 CeSACs del Anexo III: número, dirección, barrio, nivel (UNIDAD*
// en el Anexo = depende de ella una Jefatura Sección = unidad_con_seccion),
// AP de referencia y codigoReparticion (null = sin nodo en el árbol legacy). ───
interface CesacSeed {
  numero: number
  direccion: string
  barrio: string
  nivel: NivelCesac
  ap: string
  codigoReparticion: string | null
}

const UNIDAD: NivelCesac = 'unidad'
const UNIDAD_CON_SECCION: NivelCesac = 'unidad_con_seccion'

const CESACS: CesacSeed[] = [
  { numero: 34, direccion: 'Gral. José G. Artigas 2262', barrio: 'La Paternal', nivel: UNIDAD, ap: 'AP — ÁLVAREZ', codigoReparticion: '40220420' },
  { numero: 9,  direccion: 'Irala 1254', barrio: 'La Boca', nivel: UNIDAD, ap: 'AP — ARGERICH', codigoReparticion: '40220520' },
  { numero: 15, direccion: 'Balcarce 1150 (Ex PADELAI)', barrio: 'San Telmo', nivel: UNIDAD_CON_SECCION, ap: 'AP — ARGERICH', codigoReparticion: '40220530' },
  { numero: 41, direccion: 'Ministro Brin 843', barrio: 'La Boca', nivel: UNIDAD, ap: 'AP — ARGERICH', codigoReparticion: '40220540' },
  { numero: 46, direccion: 'Av. Regimiento de Patricios 1941', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — ARGERICH', codigoReparticion: '40221581' },
  { numero: 22, direccion: 'Fragata Pres. Sarmiento 2152', barrio: 'Paternal', nivel: UNIDAD, ap: 'AP — DURAND', codigoReparticion: '40220620' },
  { numero: 38, direccion: 'Av. Medrano 350', barrio: 'Almagro', nivel: UNIDAD, ap: 'AP — DURAND', codigoReparticion: '40220630' },
  { numero: 42, direccion: 'Av. La Plata 2241', barrio: 'Pompeya', nivel: UNIDAD, ap: 'AP — DURAND', codigoReparticion: '40011011' },
  { numero: 17, direccion: 'El Salvador 4037', barrio: 'Palermo', nivel: UNIDAD, ap: 'AP — FERNÁNDEZ', codigoReparticion: '40220720' },
  { numero: 21, direccion: 'Ulla Ulla 2839', barrio: 'Retiro', nivel: UNIDAD, ap: 'AP — FERNÁNDEZ', codigoReparticion: '40220730' },
  { numero: 25, direccion: 'Vicuña 1432', barrio: 'Retiro', nivel: UNIDAD, ap: 'AP — FERNÁNDEZ', codigoReparticion: '40220740' },
  { numero: 26, direccion: 'Gurruchaga 1939', barrio: 'Palermo', nivel: UNIDAD, ap: 'AP — FERNÁNDEZ', codigoReparticion: '40220750' },
  { numero: 47, direccion: 'Alpaca 620', barrio: 'Retiro - Barrio Padre Mugica', nivel: UNIDAD, ap: 'AP — FERNÁNDEZ', codigoReparticion: '40222712' },
  { numero: 3,  direccion: 'Av. Soldado de la Frontera 5144', barrio: 'Villa Lugano - Barrio Gral Savio', nivel: UNIDAD_CON_SECCION, ap: 'AP — GRIERSON', codigoReparticion: '40221120' },
  { numero: 18, direccion: 'Nelly Beltrán 4280', barrio: 'Villa Lugano', nivel: UNIDAD, ap: 'AP — GRIERSON', codigoReparticion: '40220850' },
  { numero: 43, direccion: 'Forouge 4377 (esq. Chilavert)', barrio: 'Villa Lugano', nivel: UNIDAD, ap: 'AP — GRIERSON', codigoReparticion: '40220892' },
  { numero: 53, direccion: 'Ana María Janer 3861 (Esq. Juan Pablo II)', barrio: 'Villa Soldati - Piletones', nivel: UNIDAD, ap: 'AP — GRIERSON', codigoReparticion: null },
  { numero: 1,  direccion: 'Av. Vélez Sarsfield 1271', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221420' },
  { numero: 8,  direccion: 'Osvaldo Cruz 3469', barrio: 'Barracas - Barrio 21-24', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221430' },
  { numero: 10, direccion: 'Av. Amancio Alcorta 1402', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221440' },
  { numero: 16, direccion: 'Osvaldo Cruz 2055', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221450' },
  { numero: 30, direccion: 'Av. Amancio Alcorta 3100', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221460' },
  { numero: 32, direccion: 'Charrúa 2900', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221470' },
  { numero: 35, direccion: 'Osvaldo Cruz y Zavaleta', barrio: 'Barracas', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221480' },
  { numero: 39, direccion: '24 de Noviembre 1679', barrio: 'Parque Patricios', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221490' },
  { numero: 49, direccion: 'Orma y Agustín Magaldi', barrio: 'Barracas - Barrio Orma', nivel: UNIDAD, ap: 'AP — PENNA', codigoReparticion: '40221435' },
  { numero: 6,  direccion: 'Av. Mariano Acosta 3673', barrio: 'Villa Soldati - Barrio Soldati', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220820' },
  { numero: 13, direccion: 'Av. Directorio 4210', barrio: 'Parque Avellaneda', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220830' },
  { numero: 14, direccion: 'Pje. Saravia 2486', barrio: 'Villa Lugano', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220840' },
  { numero: 19, direccion: 'Curapaligüe 1905', barrio: 'Flores', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220860' },
  { numero: 20, direccion: 'Ana María Janer 2300', barrio: 'Flores', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220870' },
  { numero: 24, direccion: 'Pasaje L 2300 (entre Martínez Castro y Laguna)', barrio: 'Villa Soldati - Barrio Ramón Carrillo', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220880' },
  { numero: 31, direccion: 'Ana María Janer 262', barrio: 'Flores', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220890' },
  { numero: 40, direccion: 'Av. Coronel Esteban Bonorino 1729', barrio: 'Flores', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220891' },
  { numero: 44, direccion: 'Saraza 4202', barrio: 'Villa Lugano', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220893' },
  { numero: 48, direccion: 'Av. Francisco Fernández de la Cruz 1753', barrio: 'Flores', nivel: UNIDAD, ap: 'AP — PIÑERO', codigoReparticion: '40220894' },
  { numero: 2,  direccion: 'Terrada 5850', barrio: 'Villa Pueyrredón', nivel: UNIDAD, ap: 'AP — PIROVANO', codigoReparticion: '40220920' },
  { numero: 12, direccion: 'Av. Olazábal 3960', barrio: 'Villa Urquiza', nivel: UNIDAD, ap: 'AP — PIROVANO', codigoReparticion: '40220930' },
  { numero: 27, direccion: 'Arias 3781', barrio: 'Saavedra', nivel: UNIDAD, ap: 'AP — PIROVANO', codigoReparticion: '40220940' },
  { numero: 51, direccion: 'Moldes y Zabala (Parque Ferroviario)', barrio: 'Colegiales', nivel: UNIDAD, ap: 'AP — PIROVANO', codigoReparticion: null },
  { numero: 11, direccion: 'Agüero 940', barrio: 'Balvanera', nivel: UNIDAD, ap: 'AP — RAMOS MEJÍA', codigoReparticion: '40221020' },
  { numero: 45, direccion: 'Cochabamba 2622', barrio: 'San Cristóbal', nivel: UNIDAD, ap: 'AP — RAMOS MEJÍA', codigoReparticion: '40221030' },
  { numero: 4,  direccion: 'Av. Juan B. Alberdi 6300', barrio: 'Mataderos', nivel: UNIDAD_CON_SECCION, ap: 'AP — SANTOJANNI', codigoReparticion: '40221130' },
  { numero: 5,  direccion: 'Av. Piedra Buena 3151', barrio: 'Villa Lugano', nivel: UNIDAD_CON_SECCION, ap: 'AP — SANTOJANNI', codigoReparticion: '40221140' },
  { numero: 7,  direccion: 'Pje. 2 de Abril de 1982 6850', barrio: 'Villa Lugano - Barrio Piedra Buena', nivel: UNIDAD_CON_SECCION, ap: 'AP — SANTOJANNI', codigoReparticion: '40221150' },
  { numero: 28, direccion: 'Santander 5955', barrio: 'Villa Lugano - Barrio 15, Cdad. Oculta', nivel: UNIDAD, ap: 'AP — SANTOJANNI', codigoReparticion: '40221160' },
  { numero: 29, direccion: 'Av. Gral Paz 15378', barrio: 'Villa Lugano', nivel: UNIDAD, ap: 'AP — SANTOJANNI', codigoReparticion: '40221170' },
  { numero: 37, direccion: 'Av. de los Corrales 6999', barrio: 'Mataderos', nivel: UNIDAD, ap: 'AP — SANTOJANNI', codigoReparticion: '40221180' },
  { numero: 33, direccion: 'Av. Córdoba 5741', barrio: 'Palermo', nivel: UNIDAD, ap: 'AP — TORNÚ', codigoReparticion: '40220320' },
  { numero: 23, direccion: 'Bacacay 5640', barrio: 'Villa Luro', nivel: UNIDAD, ap: 'AP — VÉLEZ SARSFIELD', codigoReparticion: '40229313' },
  { numero: 36, direccion: 'Mercedes 1371/79', barrio: 'Floresta', nivel: UNIDAD, ap: 'AP — VÉLEZ SARSFIELD', codigoReparticion: '40221220' },
  { numero: 50, direccion: 'Av. Lastra 4180', barrio: 'Villa Devoto', nivel: UNIDAD, ap: 'AP — ZUBIZARRETA', codigoReparticion: '40011012' },
]

// ─── Las 7 unidades fijas de la Subsecretaría APAyC (Decreto 306-26, sección
// 5): sin AP asignada, el decreto no la define. CEMAR III y IV son "División +
// Sección" en el decreto (5.4 + 5.4.1) — de ahí el 4to valor del enum. CEMAR
// IV no tiene nodo en el árbol legacy (hueco confirmado en S23-1). ───
interface UnidadFijaSeed {
  nombre: string
  tipo: TipoUnidadFija
  nivelOrganico: NivelOrganicoUnidadFija
  codigoReparticion: string | null
}

const UNIDADES_FIJAS: UnidadFijaSeed[] = [
  { nombre: 'CEMAR I',   tipo: 'cemar', nivelOrganico: 'division',             codigoReparticion: '40011210' },
  { nombre: 'CEMAR II',  tipo: 'cemar', nivelOrganico: 'division',             codigoReparticion: '40011220' },
  { nombre: 'CEMAR III', tipo: 'cemar', nivelOrganico: 'division_con_seccion', codigoReparticion: '40011211' },
  { nombre: 'CEMAR IV',  tipo: 'cemar', nivelOrganico: 'division_con_seccion', codigoReparticion: null },
  { nombre: 'Centro Odontológico Infantil N°1', tipo: 'centro_odontologico_infantil', nivelOrganico: 'unidad', codigoReparticion: '40011013' },
  { nombre: 'Centro Odontológico Infantil N°2', tipo: 'centro_odontologico_infantil', nivelOrganico: 'unidad', codigoReparticion: '40011014' },
  { nombre: 'Red de Odontología', tipo: 'red_odontologia', nivelOrganico: 'fuera_de_nivel', codigoReparticion: '40010900' },
]

async function main() {
  console.log('🌱 Seed Áreas Programáticas / CeSACs / Unidades fijas (S23-3)...')

  const apIdPorNombre = new Map<string, string>()
  for (const ap of AREAS_PROGRAMATICAS) {
    const hospital = await prisma.hospital.findUnique({ where: { sigla: ap.hospitalSigla } })
    if (!hospital) throw new Error(`Hospital no encontrado para sigla ${ap.hospitalSigla} (${ap.nombre})`)
    const row = await prisma.areaProgramatica.upsert({
      where: { nombre: ap.nombre },
      update: { hospitalId: hospital.id, codigoReparticion: ap.codigoReparticion },
      create: { nombre: ap.nombre, hospitalId: hospital.id, codigoReparticion: ap.codigoReparticion },
    })
    apIdPorNombre.set(ap.nombre, row.id)
  }
  console.log(`✅ Áreas Programáticas: ${AREAS_PROGRAMATICAS.length}`)

  let cesacsConCodigo = 0
  for (const c of CESACS) {
    const areaProgramaticaId = apIdPorNombre.get(c.ap)
    if (!areaProgramaticaId) throw new Error(`AP no encontrada: ${c.ap} (CeSAC Nº${c.numero})`)
    await prisma.cesac.upsert({
      where: { numero: c.numero },
      update: {
        direccion: c.direccion, barrio: c.barrio, nivel: c.nivel,
        areaProgramaticaId, codigoReparticion: c.codigoReparticion,
      },
      create: {
        numero: c.numero, direccion: c.direccion, barrio: c.barrio, nivel: c.nivel,
        areaProgramaticaId, codigoReparticion: c.codigoReparticion,
      },
    })
    if (c.codigoReparticion) cesacsConCodigo++
  }
  console.log(`✅ CeSACs: ${CESACS.length} (${cesacsConCodigo} con codigoReparticion del árbol legacy, ${CESACS.length - cesacsConCodigo} sin — backfill por texto en S23-4)`)

  for (const u of UNIDADES_FIJAS) {
    const existente = await prisma.unidadFijaApayC.findFirst({ where: { nombre: u.nombre } })
    if (existente) {
      await prisma.unidadFijaApayC.update({
        where: { id: existente.id },
        data: { tipo: u.tipo, nivelOrganico: u.nivelOrganico, codigoReparticion: u.codigoReparticion },
      })
    } else {
      await prisma.unidadFijaApayC.create({
        data: { nombre: u.nombre, tipo: u.tipo, nivelOrganico: u.nivelOrganico, codigoReparticion: u.codigoReparticion },
      })
    }
  }
  console.log(`✅ Unidades fijas: ${UNIDADES_FIJAS.length}`)

  console.log('🎉 Seed completado.')
}

main()
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
