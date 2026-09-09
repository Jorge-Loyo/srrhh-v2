import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const p = new PrismaClient({ datasources: { db: { url: 'postgresql://srrhh_user:srrhh_pass@127.0.0.1:5433/srrhh_db' } } })

// idSial es UNIQUE en la tabla cargos, asi que no puede haber duplicados reales.
// Pero podemos verificar: de los 237 concursos reasignados,
// el cargo real (CPH-POF-02xxxx) — cuando fue creado por la migracion,
// ya existia ese idSial en la BD con otro codigo?
// Si idSial es unique, la respuesta es NO por definicion.
// Entonces el problema es otro: la migracion creo cargos nuevos para idSials
// que NO estaban en la BD, pero que SI estaban en SIAL (en el padron real).
// Esos cargos entraron luego por el padron y se vincularon a los mismos cargos.

// Verificar: de los 237 cargos reales (CPH-POF-02xxxx del backfill),
// cuantos tienen su idSial en el padron historico ANTES de la fecha de creacion del cargo
const creados_por_migracion = await p.$queryRaw`
  SELECT
    c_real.codigo,
    c_real.id_sial,
    c_real.created_at::date as cargo_creado,
    h.sigla as hospital,
    MIN(ph.fecha_asignada)::date as primer_padron,
    COUNT(DISTINCT ph.id)::int as q_snapshots
  FROM concursos_cph cc
  JOIN cargos c_real ON c_real.id = cc.cargo_id
  JOIN concursos conc_base ON conc_base.id = cc.concurso_id
  JOIN bajas b_orig ON b_orig.id = conc_base.baja_id
  JOIN cargos c_orig ON c_orig.id = b_orig.cargo_id
  JOIN hospitales h ON h.id = c_real.hospital_id
  LEFT JOIN padron_historico ph ON ph.cargo_id = c_real.id
  WHERE cc.estado = 'finalizado'
    AND cc.cargo_sial IS NOT NULL
    AND c_orig.id != c_real.id
  GROUP BY c_real.codigo, c_real.id_sial, c_real.created_at, h.sigla
  ORDER BY c_real.codigo
  LIMIT 20
`

console.log('=== Cargos reales del backfill: fecha creacion vs primer padron ===')
creados_por_migracion.forEach(r => {
  console.log(r.codigo + ' creado=' + r.cargo_creado + ' primer_padron=' + (r.primer_padron || 'nunca') + ' snapshots=' + r.q_snapshots)
})

// Resumen: cuantos existian en padron ANTES de ser creados por la migracion
const resumen = await p.$queryRaw`
  SELECT
    COUNT(*)::int as total,
    COUNT(CASE WHEN ph_min.primer_padron < c_real.created_at::date THEN 1 END)::int as padron_antes_de_creacion,
    COUNT(CASE WHEN ph_min.primer_padron >= c_real.created_at::date THEN 1 END)::int as padron_despues,
    COUNT(CASE WHEN ph_min.primer_padron IS NULL THEN 1 END)::int as nunca_en_padron
  FROM concursos_cph cc
  JOIN cargos c_real ON c_real.id = cc.cargo_id
  JOIN concursos conc_base ON conc_base.id = cc.concurso_id
  JOIN bajas b_orig ON b_orig.id = conc_base.baja_id
  JOIN cargos c_orig ON c_orig.id = b_orig.cargo_id
  LEFT JOIN (
    SELECT cargo_id, MIN(fecha_asignada) as primer_padron
    FROM padron_historico
    GROUP BY cargo_id
  ) ph_min ON ph_min.cargo_id = c_real.id
  WHERE cc.estado = 'finalizado'
    AND cc.cargo_sial IS NOT NULL
    AND c_orig.id != c_real.id
`

console.log('')
console.log('=== Resumen temporal ===')
const r = resumen[0]
console.log('  Total cargos reales del backfill:          ' + r.total)
console.log('  Padron existia ANTES de crear el cargo:    ' + r.padron_antes_de_creacion + ' <- estos son los "ya existian"')
console.log('  Padron entro DESPUES de crear el cargo:    ' + r.padron_despues)
console.log('  Nunca aparecieron en padron historico:     ' + r.nunca_en_padron)

await p.$disconnect()
