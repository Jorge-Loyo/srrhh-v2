// Opciones de `prisma.$transaction` interactiva para transacciones cuyo trabajo
// crece con la cantidad de ítems (altas/bajas por lote, concursos automáticos).
//
// Prisma corta por defecto a los 5 s (timeout) y espera 2 s por la conexión
// (maxWait). Con Neon remota cada consulta tarda cientos de ms, así que una
// transacción con varias decenas de consultas secuenciales vence y la siguiente
// consulta falla con "Transaction API error: Transaction not found".
export const TX_OPTS_LARGA = { timeout: 90_000, maxWait: 15_000 } as const
