import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const SALEN  = ['capellan', 'chofer de funcionario']
const ENTRAN = ['radio operador', 'radio operador de emergencias', 'chofer de ambulancias']

const regimenes = await p.$queryRaw<{ id: string; nombre: string }[]>`
  SELECT id, nombre FROM regimenes
  WHERE nombre IN ('Carrera Administrativa', 'Carrera Administrativa anexo II')
`
const regimenPorNombre = new Map(regimenes.map(r => [r.nombre, r.id]))
const idAdm   = regimenPorNombre.get('Carrera Administrativa')!
const idAnexo = regimenPorNombre.get('Carrera Administrativa anexo II')!

const fixSalen = await p.$executeRaw`
  UPDATE cargos c SET regimen_id = ${idAdm}::uuid
  FROM codigos_registro cr
  WHERE c.codigo_registro_id = cr.id AND cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${SALEN}::text[])
    AND c.deleted_at IS NULL AND c.regimen_id IS NULL
`
const fixEntran = await p.$executeRaw`
  UPDATE cargos c SET regimen_id = ${idAnexo}::uuid
  FROM codigos_registro cr
  WHERE c.codigo_registro_id = cr.id AND cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${ENTRAN}::text[])
    AND c.deleted_at IS NULL AND c.regimen_id IS NULL
`
console.log(`Fix NULL → Administrativa: ${fixSalen}`)
console.log(`Fix NULL → Anexo II:       ${fixEntran}`)

await p.$disconnect()
