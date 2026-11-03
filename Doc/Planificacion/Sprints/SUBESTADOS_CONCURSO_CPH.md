# Sub-estados del Concurso CPH — qué dispara cada uno

> Referencia del flujo de sub-estados de un concurso CPH. El sub-estado NO es
> editable a mano: lo calcula `calcSubEstado()` en
> `apps/api/src/modules/concursos-cph/concursosCph.calc.ts` a partir de los
> campos que se van cargando. Se evalúa de arriba hacia abajo (gana el primero
> que matchea). Documentado 2026-10-29.

## Cadena de sub-estados (orden de prioridad del calc)

| Sub-estado | Se dispara cuando (campo) | Significado |
| --- | --- | --- |
| `q-desierto` | `fechaDispoDesierta` && `dispoDesierta` | Concurso declarado desierto. Vuelve a Etapa 1 (necesita re-autorización). |
| `o-alta sial` | **`validado`** (validación contra el padrón) ⟵ CAMBIO | La persona apareció en el padrón por su `id_sial_rol`: alta SIAL completada, cargo ocupado. Fin del circuito. |
| `n-designado` | `resolucionDesignacion` ⟵ CAMBIO (ya no exige fecha) | Hay persona designada con resolución. Finalizado administrativamente, esperando que la persona salga en el padrón. |
| `m-reso a la firma` | `resoALaFirma` | Resolución de designación en la firma. |
| `l-pycto de reso` | `proyectoResolucion` | Proyecto de resolución armado. |
| `k-ite` | `fechaIte` | ITE (informe técnico) cargado. |
| `j-apto med` | `fechaAptoMedico` | Apto médico del designado. |
| `i-carga docu` | `cargaDocumentacion` | Carga de documentación del designado. |
| `h-tad` | `eeDesignacion` | Expediente de designación (TAD) iniciado. |
| `g-insal` | `fechaInsal` | INSAL (notificación al ganador) cargado. |
| `f-ifacs` | `fechaIfacs` | IFACS (informe de aptitud para el cargo) cargado. |
| `e-orden de merito` | `ordenMeritoConfirmado` \|\| `fechaOrdenMerito` | Orden de mérito confirmado. |
| `d-examen publicado` | `fechaExamen` \|\| `inscripcionCerrada` | Examen publicado / inscripción cerrada. |
| `c2-inscripcion ex` | `fechaInscDesde` && `fechaInscHasta` | Período de inscripción a examen abierto. |
| `c-dispo de llamado` | `disposicion` | Disposición de llamado a concurso. |
| `b-sorteo jur` | `sorteoJurado` | Sorteo de jurado realizado. |
| `a-autzn` | `fechaAutorizacion` | Autorización (SGRASV). Inicio de Etapa 2. |
| `a-caratulado` | `eeConcurso` && `eeBaja` | Expediente de concurso caratulado (Etapa 1, no autorizado aún). |
| `vacante` | !`eeBaja` && !`eeConcurso` | Sin expediente: cargo vacante sin concurso iniciado. |
| `no iniciado` | (resto) | Estado inicial/indeterminado. |

## Cambios introducidos (sprint estado/designación 2026-10-29)

1. **`n-designado` ya no exige `fechaResolucion`**: basta `resolucionDesignacion`
   (número de resolución). Regla de negocio: "n-designado = se declaró la persona";
   la fecha es opcional. (Ya aplicado en `calcSubEstado`.)

2. **`o-alta sial` pasa a dispararse por `validado`** (validación contra el padrón),
   NO por `cargoSial`. `cargoSial` es un atajo opcional de vinculación, no define el
   estado. El disparo real es "la persona salió en el padrón por su `id_sial_rol`".
   (Pendiente: parte del sprint Paso 2 — requiere agregar `validado` a
   `ConcursoCphCalcInput`/`toCalcInput` y actualizar `concursosCph.calc.test.ts`.)

## Etapas del stepper (agrupación visual, SUB_ESTADOS_POR_ETAPA)

- **Etapa 1**: vacante, no iniciado, a-caratulado (complemento).
- **Etapa 2**: a-autzn, b-sorteo jur, c-dispo de llamado.
- **Etapa 3**: c2-inscripcion ex, d-examen publicado, e-orden de merito.
- **Etapa 4**: f-ifacs, g-insal.
- **Etapa 5**: h-tad, i-carga docu, j-apto med, k-ite, l-pycto de reso,
  m-reso a la firma, n-designado, o-alta sial, q-desierto.

## Nota sobre bypass del calc

`designarConcursoCphService` NO usa `calcConcursoCph`: hardcodea
`subEstado='n-designado'`, `estado='finalizado'`. Para que el cierre a `o-alta sial`
ocurra por el padrón, el Paso 2 debe setear `validado=true` + `validadoIdSialRol` y
**recalcular** estado/subEstado con `calcConcursoCph(toCalcInput(row))`.
