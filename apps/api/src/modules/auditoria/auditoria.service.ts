// audit_logs fue dropeada (D3). Se reimplementará cuando corresponda.
// Por ahora el servicio devuelve respuestas vacías para no romper los endpoints existentes.
import type { ListAuditoriaQuery } from './auditoria.schema.js'

export async function listAuditoriaService(query: ListAuditoriaQuery) {
  const { page, limit } = query
  return { data: [], meta: { total: 0, page, limit, pages: 0 } }
}

export async function purgeAuditoriaService(_dias: number) {
  return { purgados: 0, fechaCorte: new Date() }
}
