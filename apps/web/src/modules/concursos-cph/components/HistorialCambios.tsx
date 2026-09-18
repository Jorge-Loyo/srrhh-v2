// Panel "Historial de cambios" del wizard CPH. Reúne los hitos con fecha del
// concurso (y del sorteo de jurado) en una única lista cronológica descendente.
// Los hitos sin fecha propia (bool/expediente) usan la última actualización del
// concurso como fecha de referencia para que igual aparezcan.
import type { ConcursoCph, SorteoJurado } from '@srrhh/types'

interface HistorialCambiosProps {
  esNuevo: boolean
  cphData: ConcursoCph | null | undefined
  juradoData: SorteoJurado | null | undefined
}

export function HistorialCambios({ esNuevo, cphData, juradoData }: HistorialCambiosProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-primary text-sm font-bold text-gray-700 mb-3">Historial de cambios</h3>
      {(() => {
        if (esNuevo || !cphData)
          return <p className="text-sm text-gray-400">Sin historial aún.</p>
        // Fecha de referencia para hitos que ocurrieron pero no tienen
        // una fecha propia (bool/expediente sin fecha): se usa la última
        // actualización del concurso como aproximación, para que el hito
        // igual aparezca en el historial.
        const ref = (cphData.updatedAt ?? cphData.createdAt ?? '') as string
        const bool = (b: boolean | null | undefined) => b === true

        const eventos: { fecha: string; texto: string }[] = [
          {
            fecha: cphData.fechaBaja,
            texto: 'Baja registrada' + (cphData.eeBaja ? `: ${cphData.eeBaja}` : ''),
          },
          {
            fecha: cphData.fechaEeConcurso ?? (cphData.eeConcurso ? ref : null),
            texto:
              'Expediente de concurso' + (cphData.eeConcurso ? `: ${cphData.eeConcurso}` : ''),
          },
          {
            fecha: cphData.fechaAutorizacion,
            texto: 'Autorización registrada',
          },
          // Sorteo de jurado: generado y (si aplica) confirmado.
          {
            fecha: juradoData?.fechaSorteo ?? cphData.sorteoJurado,
            texto: 'Sorteo de jurado realizado',
          },
          {
            fecha: juradoData?.confirmado
              ? (juradoData.confirmadoAt ?? juradoData.fechaSorteo)
              : null,
            texto: 'Jurado confirmado',
          },
          {
            fecha: cphData.disposicion ? (cphData.fechaInscDesde ?? ref) : null,
            texto:
              'Disposición de llamado' + (cphData.disposicion ? `: ${cphData.disposicion}` : ''),
          },
          {
            fecha: cphData.fechaInscDesde,
            texto: 'Apertura de inscripción',
          },
          {
            fecha: cphData.fechaInscHasta,
            texto: 'Cierre de inscripción',
          },
          {
            fecha: cphData.qInscriptos != null ? (cphData.fechaInscHasta ?? ref) : null,
            texto: `Inscriptos: ${cphData.qInscriptos ?? ''}`,
          },
          { fecha: cphData.fechaExamen, texto: 'Publicación de examen' },
          {
            fecha: cphData.fechaOrdenMerito,
            texto: 'Orden de mérito registrado',
          },
          {
            fecha: cphData.fechaIfacs ?? (cphData.ifacs ? ref : null),
            texto: 'IFACS registrado' + (cphData.ifacs ? `: ${cphData.ifacs}` : ''),
          },
          {
            fecha: cphData.fechaInsal ?? (cphData.insal ? ref : null),
            texto: 'INSAL registrado' + (cphData.insal ? `: ${cphData.insal}` : ''),
          },
          {
            fecha: cphData.eeDesignacion ? ref : null,
            texto:
              'TAD / EE de designación' +
              (cphData.eeDesignacion ? `: ${cphData.eeDesignacion}` : ''),
          },
          {
            fecha: bool(cphData.cargaDocumentacion) ? ref : null,
            texto: 'Carga de documentación',
          },
          { fecha: cphData.fechaAptoMedico, texto: 'Apto médico' },
          { fecha: cphData.fechaIte, texto: 'ITE registrado' },
          {
            fecha: bool(cphData.proyectoResolucion) ? ref : null,
            texto: 'Proyecto de resolución',
          },
          {
            fecha: bool(cphData.resoALaFirma) ? ref : null,
            texto: 'Resolución a la firma',
          },
          {
            fecha: cphData.fechaResolucion,
            texto:
              'Resolución de designación' +
              (cphData.resolucionDesignacion ? `: ${cphData.resolucionDesignacion}` : ''),
          },
          {
            fecha: cphData.cargoSial ? ref : null,
            texto: 'Alta SIAL' + (cphData.cargoSial ? `: ${cphData.cargoSial}` : ''),
          },
          {
            fecha: cphData.fechaDispoDesierta,
            texto:
              'Disposición de desierto' +
              (cphData.dispoDesierta ? `: ${cphData.dispoDesierta}` : ''),
          },
        ]
          .filter((e): e is { fecha: string; texto: string } => !!e.fecha)
          .sort((a, b) => b.fecha.localeCompare(a.fecha))

        if (eventos.length === 0)
          return <p className="text-sm text-gray-400">Sin eventos registrados aún.</p>
        return (
          <div className="space-y-2 text-sm text-gray-500">
            {eventos.map((h) => (
              <div key={h.fecha + h.texto} className="flex gap-3">
                <span className="text-gray-300 whitespace-nowrap tabular-nums">
                  {h.fecha.slice(0, 10).split('-').reverse().join('/')}
                </span>
                <span>{h.texto}</span>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
