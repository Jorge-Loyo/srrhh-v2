import type { Etiqueta, SolicitudAlta, SolicitudAltaCargoCreado, SolicitudAltaEstado } from '@srrhh/types'
import { rutaCaratular } from './nuevosCargos'

// Helpers puros de la pestaña "Cargos Históricos" (etiquetas por expediente y
// detalle con una fila por cargo).

/** Etiquetas DISTINTAS (por id) de las solicitudes del expediente, ordenadas por nombre. */
export function etiquetasDeSolicitudes(solicitudes: SolicitudAlta[]): Etiqueta[] {
  const porId = new Map<string, Etiqueta>()
  for (const s of solicitudes) {
    for (const { etiqueta } of s.etiquetas ?? []) {
      if (!porId.has(etiqueta.id)) porId.set(etiqueta.id, etiqueta)
    }
  }
  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** ¿Alguna etiqueta de la solicitud matchea el texto (sin distinguir mayúsculas)? */
export function solicitudMatcheaEtiqueta(s: SolicitudAlta, texto: string): boolean {
  const t = texto.trim().toLowerCase()
  if (!t) return false
  return (s.etiquetas ?? []).some(({ etiqueta }) => etiqueta.nombre.toLowerCase().includes(t))
}

/** Tipo de alta legible, derivado del unificador elegido en el alta. */
export function tipoAltaLabel(unificadorPuesto: string | null): string {
  const u = (unificadorPuesto ?? '').trim()
  if (!u || u === 'ambos') return '—'
  if (u === 'POF') return 'Ejecución POF'
  if (u.startsWith('POU')) return 'POU'
  return u
}

export type TipoConcursoFila = 'cph' | 'ceetps' | 'sin_concurso'

export interface FilaCargoHistorico {
  /** Clave única de la fila. */
  key: string
  solicitudId: string
  /** Id del Cargo real; null si todavía no se creó. */
  cargoId: string | null
  /** Código interno del sistema (CPH-POF-000001). */
  codigo: string | null
  /** Código SAME (idSial del cargo en SIAL). Editable post-aprobación. */
  idSial: string | null
  tipoAlta: string
  hospital: string | null
  carrera: string | null
  puesto: string
  especialidad: string | null
  etiquetas: Etiqueta[]
  desde: string | null
  estado: SolicitudAltaEstado
  tipoConcurso: TipoConcursoFila | null
  /** Ruta al concurso creado (misma navegación que "Caratular" en Nuevos cargos). */
  rutaConcurso: string | null
}

function carreraTexto(codigo: string | null | undefined, nombre: string | null | undefined): string | null {
  if (codigo && nombre) return `${codigo} — ${nombre}`
  return nombre ?? codigo ?? null
}

/**
 * Expande las solicitudes a UNA FILA POR CARGO. Aprobadas: una fila por cada
 * Cargo creado (con su código real). Pendientes/rechazadas (o aprobadas sin
 * datos de cargos): una fila por unidad de `cantidad`, sin cargo ("Aún no creado").
 */
export function filasPorCargo(solicitudes: SolicitudAlta[]): FilaCargoHistorico[] {
  const filas: FilaCargoHistorico[] = []
  for (const s of solicitudes) {
    const etiquetas = (s.etiquetas ?? []).map((e) => e.etiqueta)
    const tipoAlta = tipoAltaLabel(s.unificadorPuesto)
    const creados: SolicitudAltaCargoCreado[] = s.estado === 'aprobada' ? (s.cargosCreados ?? []) : []
    if (creados.length > 0) {
      for (const c of creados) {
        const rutaConcurso =
          c.concurso && c.concurso.tipo !== 'sin_concurso' && c.concurso.detalleId
            ? rutaCaratular({ tipo: c.concurso.tipo, detalleId: c.concurso.detalleId })
            : null
        filas.push({
          key: `${s.id}:${c.id}`,
          solicitudId: s.id,
          cargoId: c.id,
          codigo: c.codigo,
          idSial: c.idSial,
          tipoAlta,
          hospital: c.hospital?.sigla ?? s.hospital?.sigla ?? null,
          carrera: carreraTexto(c.carreraCodigo, c.carrera) ?? carreraTexto(s.escalafon?.codigo, s.escalafon?.nombre),
          puesto: c.puesto ?? s.literalPuesto,
          especialidad: c.especialidad ?? s.especialidad,
          etiquetas,
          desde: c.fechaDesde ?? s.desde,
          estado: s.estado,
          tipoConcurso: c.concurso?.tipo ?? 'sin_concurso',
          rutaConcurso,
        })
      }
      continue
    }
    const unidades = Math.max(1, s.cantidad)
    for (let i = 0; i < unidades; i++) {
      filas.push({
        key: `${s.id}#${i}`,
        solicitudId: s.id,
        cargoId: null,
        codigo: null,
        idSial: null,
        tipoAlta,
        hospital: s.hospital?.sigla ?? null,
        carrera: carreraTexto(s.escalafon?.codigo, s.escalafon?.nombre),
        puesto: s.literalPuesto,
        especialidad: s.especialidad,
        etiquetas,
        desde: s.desde,
        estado: s.estado,
        tipoConcurso: null,
        rutaConcurso: null,
      })
    }
  }
  return filas
}
