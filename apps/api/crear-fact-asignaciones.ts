import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

console.log('Creando fact_asignaciones...')

await p.$executeRaw`DROP TABLE IF EXISTS fact_asignaciones`
await p.$executeRaw`
  CREATE TABLE fact_asignaciones (
    id              SERIAL PRIMARY KEY,
    id_sial_rol     VARCHAR(50)  NOT NULL,
    id_sial         VARCHAR(20),
    cuil            VARCHAR(11),
    codigo_cargo    VARCHAR(30),
    situacion_revista VARCHAR(50),
    fecha_desde     DATE         NOT NULL,
    fecha_hasta     DATE,
    es_actual       BOOLEAN      GENERATED ALWAYS AS (fecha_hasta IS NULL) STORED
  )
`
await p.$executeRaw`CREATE INDEX ON fact_asignaciones (id_sial_rol)`
await p.$executeRaw`CREATE INDEX ON fact_asignaciones (cuil)`
await p.$executeRaw`CREATE INDEX ON fact_asignaciones (codigo_cargo)`
await p.$executeRaw`CREATE INDEX ON fact_asignaciones (es_actual)`
console.log('Tabla e índices creados.')

// Colapsar snapshots semanales en intervalos de vigencia
// Un intervalo nuevo se abre cuando cambia cargo_id o situacion_revista
// fecha_hasta = fecha del snapshot siguiente donde ya no aparece (o cambió) - 1 día
// fecha_hasta = NULL si sigue en el último snapshot
console.log('Insertando intervalos...')
await p.$executeRaw`
  INSERT INTO fact_asignaciones (id_sial_rol, id_sial, cuil, codigo_cargo, situacion_revista, fecha_desde, fecha_hasta)
  WITH snapshots_ordenados AS (
    SELECT
      ph.id_sial_rol,
      SPLIT_PART(ph.id_sial_rol, '-', 1)              AS id_sial,
      ph.cuil,
      c.codigo                                         AS codigo_cargo,
      LOWER(UNACCENT(TRIM(ph.situacion_revista)))      AS situacion_revista,
      ph.fecha_asignada,
      -- próxima fecha donde cambia algo (o NULL si es el último)
      LEAD(ph.fecha_asignada) OVER (
        PARTITION BY ph.id_sial_rol
        ORDER BY ph.fecha_asignada
      ) AS fecha_siguiente,
      -- detectar si en el próximo snapshot cambió cargo o situación
      LEAD(c.codigo) OVER (
        PARTITION BY ph.id_sial_rol
        ORDER BY ph.fecha_asignada
      ) AS cargo_siguiente,
      LEAD(LOWER(UNACCENT(TRIM(ph.situacion_revista)))) OVER (
        PARTITION BY ph.id_sial_rol
        ORDER BY ph.fecha_asignada
      ) AS sit_siguiente
    FROM padron_historico ph
    JOIN cargos c ON c.id = ph.cargo_id
    WHERE ph.id_sial_rol IS NOT NULL
  ),
  -- marcar inicio de cada intervalo (primera fila o cuando cambia algo)
  con_cambio AS (
    SELECT *,
      CASE WHEN
        LAG(codigo_cargo) OVER (PARTITION BY id_sial_rol ORDER BY fecha_asignada) IS DISTINCT FROM codigo_cargo
        OR LAG(situacion_revista) OVER (PARTITION BY id_sial_rol ORDER BY fecha_asignada) IS DISTINCT FROM situacion_revista
        OR LAG(id_sial_rol) OVER (ORDER BY id_sial_rol, fecha_asignada) IS DISTINCT FROM id_sial_rol
      THEN 1 ELSE 0 END AS es_inicio
    FROM snapshots_ordenados
  ),
  -- numerar grupos de intervalo
  con_grupo AS (
    SELECT *,
      SUM(es_inicio) OVER (PARTITION BY id_sial_rol ORDER BY fecha_asignada) AS grupo
    FROM con_cambio
  )
  -- tomar primera y última fecha de cada grupo
  SELECT
    id_sial_rol,
    id_sial,
    MAX(cuil)              AS cuil,
    MAX(codigo_cargo)      AS codigo_cargo,
    MAX(situacion_revista) AS situacion_revista,
    MIN(fecha_asignada)    AS fecha_desde,
    -- si el último snapshot del grupo no es el más reciente global → cerrar intervalo
    CASE
      WHEN MAX(fecha_asignada) = (SELECT MAX(fecha_asignada) FROM padron_historico) THEN NULL
      ELSE MAX(fecha_asignada)
    END                    AS fecha_hasta
  FROM con_grupo
  GROUP BY id_sial_rol, id_sial, cuil, grupo
  ORDER BY id_sial_rol, MIN(fecha_asignada)
`

// Enriquecer fecha_hasta con baja_sial cuando existe fecha más precisa
console.log('Enriqueciendo fecha_hasta con bajas_sial...')
await p.$executeRaw`
  UPDATE fact_asignaciones fa
  SET fecha_hasta = b.cargo_hasta
  FROM (
    SELECT DISTINCT ON (cargo)
      cargo, cargo_hasta
    FROM baja_sial_registros
    WHERE cargo_hasta IS NOT NULL
    ORDER BY cargo, snapshot_id DESC
  ) b
  WHERE fa.id_sial_rol = b.cargo
    AND fa.fecha_hasta IS NOT NULL
    AND b.cargo_hasta < fa.fecha_hasta
`

// Resumen
const totales = await p.$queryRaw<any[]>`
  SELECT
    COUNT(*)                                        AS total_intervalos,
    COUNT(DISTINCT id_sial_rol)                     AS roles_unicos,
    COUNT(DISTINCT cuil)                            AS cuils_unicos,
    COUNT(DISTINCT codigo_cargo)                    AS cargos_unicos,
    COUNT(*) FILTER (WHERE es_actual)               AS activos,
    COUNT(*) FILTER (WHERE NOT es_actual)           AS historicos,
    AVG(COALESCE(fecha_hasta, CURRENT_DATE) - fecha_desde)::int AS dias_promedio_intervalo
  FROM fact_asignaciones
`
console.log('\n── fact_asignaciones creada ──')
console.log(`  Total intervalos:    ${totales[0].total_intervalos}`)
console.log(`  Roles únicos:        ${totales[0].roles_unicos}`)
console.log(`  CUILs únicos:        ${totales[0].cuils_unicos}`)
console.log(`  Cargos únicos:       ${totales[0].cargos_unicos}`)
console.log(`  Activos hoy:         ${totales[0].activos}`)
console.log(`  Históricos:          ${totales[0].historicos}`)
console.log(`  Días prom/intervalo: ${totales[0].dias_promedio_intervalo}`)

// Muestra de un rol con múltiples intervalos
const multiIntervalo = await p.$queryRaw<any[]>`
  SELECT id_sial_rol, codigo_cargo, situacion_revista, fecha_desde, fecha_hasta, es_actual
  FROM fact_asignaciones
  WHERE id_sial_rol IN (
    SELECT id_sial_rol FROM fact_asignaciones GROUP BY id_sial_rol HAVING COUNT(*) > 1 LIMIT 1
  )
  ORDER BY fecha_desde
`
if (multiIntervalo.length) {
  console.log(`\n── Ejemplo rol con múltiples intervalos: ${multiIntervalo[0].id_sial_rol} ──`)
  for (const r of multiIntervalo)
    console.log(`  ${r.fecha_desde.toISOString().slice(0,10)} → ${r.fecha_hasta?.toISOString().slice(0,10) ?? 'activo'}  cargo: ${r.codigo_cargo}  sit: ${r.situacion_revista}`)
}

await p.$disconnect()
