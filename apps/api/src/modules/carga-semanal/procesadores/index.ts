import type { TipoCarga } from '../carga-semanal.schema.js'
import { TIPOS_CON_PREVIEW } from '../carga-semanal.schema.js'
import { marcarSesionError, marcarSesionCompletada, registrarResumenParcial } from '../carga-semanal.service.js'
import type { ResolucionesConfirmar } from '../carga-semanal.service.js'

/**
 * Despacha el preview (fase 1) de un tipo dentro de una sesión.
 * tiposEnSesion: todos los tipos que forman parte de esta sesión (para saber cuándo marcar pendiente_confirmacion).
 */
export async function despacharPreview(
  sesionId: string,
  tipo: TipoCarga,
  buffer: Buffer,
  tiposEnSesion: TipoCarga[] = [tipo],
): Promise<void> {
  try {
    switch (tipo) {
      case 'cargos_salud': {
        const { parsearYDiffearCargosSalud } = await import('./cargos-salud.js')
        const resumen = await parsearYDiffearCargosSalud(sesionId, buffer)
        await registrarResumenParcial(sesionId, tipo, resumen as any, tiposEnSesion)
        break
      }
      case 'bajas_salud': {
        const { parsearYDiffearBajasSalud } = await import('./bajas-salud.js')
        const resumen = await parsearYDiffearBajasSalud(sesionId, buffer)
        await registrarResumenParcial(sesionId, tipo, resumen as any, tiposEnSesion)
        break
      }
      // Tipos sin preview: procesan directo y marcan completado solo si no hay tipos con preview en la sesión
      case 'arbol': {
        const { parsearYDiffearArbol } = await import('./arbol.js')
        const resumen = await parsearYDiffearArbol(sesionId, buffer)
        await registrarResumenParcial(sesionId, tipo, resumen as any, tiposEnSesion)
        break
      }
      case 'ocupacion_pou': {
        const { procesarOcupacionPou } = await import('./ocupacion-pou.js')
        const hayPreview = tiposEnSesion.some((t) => TIPOS_CON_PREVIEW.has(t))
        await procesarOcupacionPou(sesionId, buffer, !hayPreview)
        break
      }
      case 'pou_decreto': {
        const { procesarPouDecreto } = await import('./pou-decreto.js')
        const hayPreview = tiposEnSesion.some((t) => TIPOS_CON_PREVIEW.has(t))
        await procesarPouDecreto(sesionId, buffer, !hayPreview)
        break
      }
      default: {
        const _exhaustive: never = tipo
        throw new Error(`Tipo de carga no soportado: ${_exhaustive}`)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await marcarSesionError(sesionId, msg)
    throw err
  }
}

export async function despacharConfirmar(
  sesionId: string,
  tiposEnSesion: TipoCarga[],
  buffers: Map<TipoCarga, Buffer>,
  resoluciones: ResolucionesConfirmar,
): Promise<void> {
  try {
    // Aplicar en paralelo todos los tipos con preview que tienen buffer
    const tareas = tiposEnSesion
      .filter((t) => TIPOS_CON_PREVIEW.has(t) && buffers.has(t))
      .map(async (tipo) => {
        const buffer = buffers.get(tipo)!
        switch (tipo) {
          case 'cargos_salud': {
            const { aplicarCambiosCargosSalud } = await import('./cargos-salud.js')
            return aplicarCambiosCargosSalud(sesionId, buffer, resoluciones)
          }
          case 'bajas_salud': {
            const { aplicarCambiosBajasSalud } = await import('./bajas-salud.js')
            return aplicarCambiosBajasSalud(sesionId, buffer, resoluciones)
          }
          case 'arbol': {
            const { aplicarCambiosArbol } = await import('./arbol.js')
            return aplicarCambiosArbol(sesionId, buffer)
          }
        }
      })

    await Promise.all(tareas)

    // Marcar completado con informe consolidado
    await marcarSesionCompletada(sesionId, { confirmado: true, tipos: tiposEnSesion })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await marcarSesionError(sesionId, msg)
    throw err
  }
}
