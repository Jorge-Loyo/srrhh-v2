import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

console.log('Creando dim_puestos...')

await prisma.$executeRaw`DROP TABLE IF EXISTS dim_puestos`
await prisma.$executeRaw`
  CREATE TABLE dim_puestos (
    id_sial_rol       VARCHAR(50)  PRIMARY KEY,
    id_sial           VARCHAR(20),
    cuil              VARCHAR(11),
    literal_puesto    VARCHAR(200),
    especialidad      VARCHAR(200),
    escalafon         VARCHAR(150),
    hospital_sigla    VARCHAR(20),
    situacion_revista VARCHAR(50),
    puesto_desde      DATE,
    puesto_hasta      DATE,
    motivo_baja       VARCHAR(200),
    doc_resp_baja     VARCHAR(200)
  )
`
console.log('Tabla creada.')

// ── 1. Base desde padron_historico ────────────────────────────────────────────
// Tomar el snapshot más reciente donde aparece cada id_sial_rol
console.log('Cargando desde padron_historico...')
await prisma.$executeRaw`
  INSERT INTO dim_puestos (
    id_sial_rol, id_sial, cuil,
    literal_puesto, especialidad, escalafon,
    hospital_sigla, situacion_revista
  )
  SELECT DISTINCT ON (ph.id_sial_rol)
    ph.id_sial_rol,
    SPLIT_PART(ph.id_sial_rol, '-', 1)                        AS id_sial,
    ph.cuil,
    LOWER(UNACCENT(TRIM(ph.literal_puesto)))                  AS literal_puesto,
    NULLIF(LOWER(UNACCENT(TRIM(ph.especialidad))), '')        AS especialidad,
    LOWER(UNACCENT(TRIM(ph.escalafon)))                       AS escalafon,
    ph.hospital_sigla,
    LOWER(UNACCENT(TRIM(ph.situacion_revista)))               AS situacion_revista
  FROM padron_historico ph
  WHERE ph.id_sial_rol IS NOT NULL
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
  ON CONFLICT DO NOTHING
`

const desdePadron = await prisma.$queryRaw<{n: bigint}[]>`SELECT COUNT(*) AS n FROM dim_puestos`
console.log(`  ${desdePadron[0].n} puestos desde padrón`)

// ── 2. Enriquecer con fechas y motivo desde baja_sial_registros ───────────────
// Usar el snapshot más reciente de bajas para cada id_sial_rol
console.log('Enriqueciendo con bajas_sial...')
await prisma.$executeRaw`
  UPDATE dim_puestos dp
  SET
    cuil          = COALESCE(dp.cuil, REGEXP_REPLACE(b.cuil, '[^0-9]', '', 'g')),
    puesto_desde  = b.cargo_desde,
    puesto_hasta  = b.cargo_hasta,
    motivo_baja   = NULLIF(TRIM(b.mot_baja), ''),
    doc_resp_baja = NULLIF(TRIM(b.doc_resp_baja), '')
  FROM (
    SELECT DISTINCT ON (cargo)
      cargo, cuil, cargo_desde, cargo_hasta, mot_baja, doc_resp_baja
    FROM baja_sial_registros
    ORDER BY cargo, snapshot_id DESC
  ) b
  WHERE dp.id_sial_rol = b.cargo
`

// ── 3. Insertar roles que solo están en bajas (ya no están en el padrón activo)
console.log('Insertando roles solo en bajas...')
await prisma.$executeRaw`
  INSERT INTO dim_puestos (
    id_sial_rol, id_sial, cuil,
    literal_puesto, escalafon,
    situacion_revista,
    puesto_desde, puesto_hasta,
    motivo_baja, doc_resp_baja
  )
  SELECT DISTINCT ON (b.cargo)
    b.cargo,
    SPLIT_PART(b.cargo, '-', 1)                       AS id_sial,
    NULLIF(REGEXP_REPLACE(b.cuil, '[^0-9]', '', 'g'), '') AS cuil,
    NULLIF(LOWER(UNACCENT(TRIM(b.lit_puesto))), '')   AS literal_puesto,
    NULLIF(LOWER(UNACCENT(TRIM(b.escalafon))), '')    AS escalafon,
    NULLIF(LOWER(UNACCENT(TRIM(b.sit_rev))), '')      AS situacion_revista,
    b.cargo_desde,
    b.cargo_hasta,
    NULLIF(LOWER(UNACCENT(TRIM(b.mot_baja))), ''),
    NULLIF(LOWER(UNACCENT(TRIM(b.doc_resp_baja))), '')
  FROM baja_sial_registros b
  ORDER BY b.cargo, b.snapshot_id DESC
  ON CONFLICT DO NOTHING
`

// ── Resumen ───────────────────────────────────────────────────────────────────
const totales = await prisma.$queryRaw<any[]>`
  SELECT
    COUNT(*)                                          AS total,
    COUNT(*) FILTER (WHERE puesto_hasta IS NULL)      AS activos,
    COUNT(*) FILTER (WHERE puesto_hasta IS NOT NULL)  AS con_baja,
    COUNT(*) FILTER (WHERE motivo_baja IS NOT NULL)   AS con_motivo,
    COUNT(DISTINCT id_sial)                           AS personas_unicas,
    COUNT(DISTINCT cuil)                              AS cuils_unicos
  FROM dim_puestos
`
console.log('\n── dim_puestos creada ──')
console.log(`  Total puestos:      ${totales[0].total}`)
console.log(`  Activos (sin baja): ${totales[0].activos}`)
console.log(`  Con fecha de baja:  ${totales[0].con_baja}`)
console.log(`  Con motivo de baja: ${totales[0].con_motivo}`)
console.log(`  Personas únicas:    ${totales[0].personas_unicas}`)
console.log(`  CUILs únicos:       ${totales[0].cuils_unicos}`)

await prisma.$disconnect()
