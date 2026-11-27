import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

await p.$executeRaw`CREATE EXTENSION IF NOT EXISTS unaccent`

console.log('Creando dim_personas...')

await p.$executeRaw`DROP TABLE IF EXISTS dim_personas`
await p.$executeRaw`
  CREATE TABLE dim_personas (
    cuil              VARCHAR(11)  PRIMARY KEY,
    id_sial           VARCHAR(20),
    apellido_nombre   VARCHAR(200),
    apellido          VARCHAR(120),
    nombre            VARCHAR(120),
    fecha_nacimiento  DATE,
    sexo              VARCHAR(10),
    especialidad      VARCHAR(200),
    antiguedad_desde  DATE,
    telefono          VARCHAR(20),
    mail_personal     VARCHAR(255),
    mail_laboral      VARCHAR(255),
    domicilio         VARCHAR(255),
    localidad         VARCHAR(150),
    activo            BOOLEAN
  )
`
console.log('Tabla creada.')

// Insertar desde personas, id_sial desde dim_puestos, especialidad desde padron_historico
await p.$executeRaw`
  INSERT INTO dim_personas (
    cuil, id_sial, apellido_nombre, apellido, nombre,
    fecha_nacimiento, sexo, especialidad, antiguedad_desde,
    telefono, mail_personal, mail_laboral,
    domicilio, localidad, activo
  )
  SELECT
    p.cuil,
    dp.id_sial,
    LOWER(UNACCENT(TRIM(p.apellido_nombre)))    AS apellido_nombre,
    LOWER(UNACCENT(TRIM(p.apellido)))           AS apellido,
    LOWER(UNACCENT(TRIM(p.nombre)))             AS nombre,
    p.fecha_nacimiento,
    LOWER(TRIM(p.sexo))                         AS sexo,
    -- especialidad: tomar la más reciente del padrón con valor no vacío
    esp.especialidad,
    p.antiguedad_desde,
    p.telefono,
    LOWER(TRIM(p.mail_personal))                AS mail_personal,
    LOWER(TRIM(p.mail_laboral))                 AS mail_laboral,
    LOWER(UNACCENT(TRIM(p.domicilio)))          AS domicilio,
    LOWER(UNACCENT(TRIM(p.localidad)))          AS localidad,
    p.activo
  FROM personas p
  LEFT JOIN (
    SELECT DISTINCT ON (cuil) cuil, id_sial
    FROM dim_puestos
    WHERE id_sial IS NOT NULL
    ORDER BY cuil, puesto_hasta DESC NULLS FIRST
  ) dp ON dp.cuil = p.cuil
  LEFT JOIN (
    SELECT DISTINCT ON (cuil)
      cuil,
      LOWER(UNACCENT(TRIM(especialidad))) AS especialidad
    FROM padron_historico
    WHERE especialidad IS NOT NULL AND TRIM(especialidad) != ''
    ORDER BY cuil, fecha_asignada DESC
  ) esp ON esp.cuil = p.cuil
`

// Resumen
const totales = await p.$queryRaw<any[]>`
  SELECT
    COUNT(*)                                      AS total,
    COUNT(id_sial)                                AS con_id_sial,
    COUNT(especialidad)                           AS con_especialidad,
    COUNT(fecha_nacimiento)                       AS con_fecha_nac,
    COUNT(antiguedad_desde)                       AS con_antiguedad,
    COUNT(telefono)                               AS con_telefono,
    COUNT(mail_laboral)                           AS con_mail_laboral,
    COUNT(*) FILTER (WHERE activo)                AS activos,
    COUNT(*) FILTER (WHERE NOT activo)            AS inactivos
  FROM dim_personas
`
const t = totales[0]
const total = Number(t.total)
console.log('\n── dim_personas creada ──')
console.log(`  Total:            ${total}`)
console.log(`  Con id_sial:      ${t.con_id_sial} (${Math.round(Number(t.con_id_sial)*100/total)}%)`)
console.log(`  Con especialidad: ${t.con_especialidad} (${Math.round(Number(t.con_especialidad)*100/total)}%)`)
console.log(`  Con fecha nac:    ${t.con_fecha_nac} (${Math.round(Number(t.con_fecha_nac)*100/total)}%)`)
console.log(`  Con antigüedad:   ${t.con_antiguedad} (${Math.round(Number(t.con_antiguedad)*100/total)}%)`)
console.log(`  Con teléfono:     ${t.con_telefono} (${Math.round(Number(t.con_telefono)*100/total)}%)`)
console.log(`  Con mail laboral: ${t.con_mail_laboral} (${Math.round(Number(t.con_mail_laboral)*100/total)}%)`)
console.log(`  Activos:          ${t.activos}`)
console.log(`  Inactivos:        ${t.inactivos}`)

// Muestra
const muestra = await p.$queryRaw<any[]>`
  SELECT cuil, id_sial, apellido_nombre, especialidad, antiguedad_desde, activo
  FROM dim_personas
  WHERE id_sial IS NOT NULL AND especialidad IS NOT NULL
  LIMIT 5
`
console.log('\n── Muestra ──')
for (const r of muestra)
  console.log(`  ${r.cuil} | ${r.id_sial} | ${r.apellido_nombre} | ${r.especialidad} | desde: ${r.antiguedad_desde?.toISOString().slice(0,10)}`)

await p.$disconnect()
