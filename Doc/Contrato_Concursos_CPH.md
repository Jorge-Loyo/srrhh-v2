# Contrato — Concursos CPH

> Fuente de verdad del módulo de **seguimiento de concursos CPH** (Carrera
> Profesional Hospitalaria): etapas del proceso, sorteo de jurado, orden de
> mérito, reutilización de jurados y órdenes de mérito, autorizaciones,
> etiquetas y estados. Todo código que cree o modifique concursos CPH debe
> respetar estas reglas.
>
> Ruta frontend: `/concursos/cph` (lista con pestañas) y
> `/concursos/cph/:id/wizard` (seguimiento por etapas).
> Backend: `apps/api/src/modules/concursos-cph/` bajo `/api/v1/concursos-cph`.

---

## 1. Estados y sub-estados

### 1.1 Estado del concurso (`ConcursoCph.estado`)

Calculado por `calcConcursoCph` (`concursosCph.calc.ts`) en cada write. Valores:
`no_iniciado`, `activo`, `finalizado`, `suspendido`.

Reglas (`calcEstadoBase` + flag `suspendido`):

- `suspendido = true` → **estado `suspendido`** (el flag manda sobre todo).
- Hay `resolucionDesignacion` → `finalizado`.
- **Hay `eeConcurso` (Expediente de Concurso) → `activo`.**
  > Basta con tener el Expediente de Concurso cargado. NO se exige eeBaja ni
  > fechaBaja: los concursos por cargo nuevo no tienen baja.
- Si no, `no_iniciado`.

### 1.2 Semáforo (frontend) y filtro por estado — coherencia obligatoria

El semáforo de la lista y el filtro por estado deben coincidir. El flag
`suspendido` tiene prioridad:

| Semáforo                | Condición                                            |
| ----------------------- | ---------------------------------------------------- |
| 🟢 verde (Activo)       | `estado='activo'` y `suspendido=false`               |
| 🔴 rojo (Suspendido)    | `suspendido=true` (sin importar el estado calculado) |
| 🟠 naranja (Finalizado) | `estado='finalizado'` y `suspendido=false`           |
| ⚪ gris (No iniciado)   | `estado='no_iniciado'` y `suspendido=false`          |

Filtro backend (`listConcursosCphService`): `estado='suspendido'` trae todo lo
que tenga `suspendido=true`; los demás estados exigen `suspendido=false`. Nunca
se mezclan (p.ej. un `Q-DESIERTO` con `estado='activo'` pero `suspendido=true`
cae en "suspendido", no en "activo").

### 1.3 Sub-estado (`subEstado`) — avance por letra

`calcSubEstado` deriva el sub-estado de los campos/fechas presentes: VACANTE /
NO INICIADO → A-CARATULADO → A-AUTZN → B-SORTEO JUR → C-DISPO DE LLAMADO →
C2-INSCRIPCION EX → D-EXAMEN PUBLICADO → E-ORDEN DE MERITO → F-IFACS → G-INSAL →
H-TAD → I-CARGA DOCU → J-APTO MED → K-ITE → L-PYCTO DE RESO → M-RESO A LA FIRMA →
N-DESIGNADO → O-ALTA SIAL; Q-DESIERTO es indicador aparte.

---

## 2. Etapas del wizard (5 etapas, NO 6)

El concurso tiene **5 etapas**. "Declarar desierto" **NO es una etapa**: es una
acción que relanza el concurso desde la Etapa 1.

1. **Baja / Apertura** — datos de la baja (readonly) + Expediente de Concurso,
   Sigla, Escalafón, Puesto, Especialidad e **IF de autorización**.
2. **Autorización / Jurado** — autorización DGAYDRH/SGRASV, sorteo de jurado y
   disposición de llamado.
3. **Inscripción / Examen / OM** — inscriptos, cierre de inscripción, examen,
   presentados y orden de mérito.
4. **IFACS / INSAL** — IFACS e INSAL. Incluye el panel de reutilización de OM.
5. **Designación**.

Mapeo sub-estado → etapa (columna "Etapa" / stepper de la lista):

- Etapa 1: VACANTE, NO INICIADO, A-CARATULADO
- Etapa 2: A-AUTZN, B-SORTEO JUR, C-DISPO DE LLAMADO
- Etapa 3: C2-INSCRIPCION EX, D-EXAMEN PUBLICADO, E-ORDEN DE MERITO
- Etapa 4: F-IFACS, G-INSAL
- Etapa 5: H-TAD … O-ALTA SIAL (y Q-DESIERTO)

Al cambiar de etapa en el wizard, el scroll sube al tope automáticamente.

---

## 3. IF de autorización y flujo de apertura (Etapa 1 → autorización SGRASV)

- Campo `ConcursoCph.ifAutorizacion` (string, nullable) — nro de documento IF.
- En la Etapa 1, con el **Expediente de Concurso** cargado y **sin autorización
  en curso**, se puede: completar el IF y **reservar un candidato de una OM
  compatible** (ver §6).
- **Gatillo de autorización** (`patchConcursoCphService`): al cargar el
  `eeConcurso` por primera vez **con `ifAutorizacion` presente**, se solicita la
  autorización a **SGRASV** (`pendienteAutorizacion=true`, solo sgrasv). Sin IF,
  solo se genera una notificación informativa.
- **Al autorizar SGRASV** (`aprobarAutorizacionCphService`, paso sgrasv aprobado):
  - Si hay **candidato de OM reservado** para el concurso → se **arrastran** del
    concurso de origen de esa OM: `fechaAutorizacion`, `sorteoJurado`,
    `disposicion`, `fechaInscDesde`, `fechaInscHasta`, `inscripcionCerrada`,
    `fechaExamen`, `fechaOrdenMerito`, `presentadosConfirmados`,
    `ordenMeritoConfirmado`; se recalcula y el concurso **salta a la Etapa 4**
    (IFACS/INSAL). No se copia IFACS/INSAL (son propios del nuevo concurso).
  - Si **no hay candidato reservado** → flujo normal a la **Etapa 2**.

> El salto de etapas ocurre **al autorizar**, no al reservar el candidato: si
> SGRASV no autoriza, no se avanza.

---

## 4. Sorteo de jurado (Etapa 2)

Servicio: `sorteoJurado.service.ts`. Un `SorteoJurado` (acta) + N
`MiembroJuradoSorteado`. `fechaSorteo` = día de generación; se confirma aparte.

### 4.1 Padrón de elegibles

Ocupaciones activas (`hasta=null`) cuyo cargo pertenece al **mismo escalafón**
del cargo a concursar (misma profesión), persona activa, excluyendo la persona
de la baja y la designada. Conducción = `codigoJefaturas` no vacío/no '0'.

### 4.2 Reglas en cascada

- **Regla 1**: mismo hospital + conducción + misma especialidad.
- **Regla 2**: mismo hospital + antigüedad ≥ mínima (especialidad opcional).
- **Regla 3**: sistema (cualquier hospital) + conducción.

La cascada acumula por regla hasta alcanzar el total (titulares+suplentes),
agregando el nivel completo de cada regla.

### 4.3 Selección con PRIORIDAD por regla (no azar plano)

`sortearJurado` **prioriza por regla**: llena primero con Regla 1, luego 2,
luego 3. Dentro de cada regla, **primero los que cumplen especialidad**; entre
iguales, orden aleatorio sembrado (auditable). Solo se baja de regla para
completar cupos faltantes.

> Antes se barajaba todo el pool por igual, así que pocos candidatos de Regla 1
> casi nunca salían por azar. Ahora los más idóneos entran primero.

### 4.4 Match de especialidad (ignora paréntesis)

`norm()` normaliza especialidades para comparar: sin acentos, minúsculas,
**se descarta lo que está entre paréntesis** y se colapsan espacios. Motivo: los
cargos legacy guardan `Clinica Medica (Medicina Interna)` mientras el padrón usa
`Clínica Médica`. **No se modifican datos, solo la comparación.** Para el jurado
importa la especialidad base; la distinción del paréntesis no interesa (ver
`Doc/DATA_CLEANING_ESPECIALIDADES.md`).

### 4.5 Jurados vigentes y reutilización

- **Vigencia**: 6 meses desde `fechaSorteo`, confirmado.
- `GET /jurados-vigentes` devuelve TODAS las actas confirmadas con flag
  `vigente` (fechaSorteo dentro de 6 meses). La pestaña "Jurados" es una tabla
  con búsqueda, filtro por especialidad y filtro Activos/Inactivos/Todos.
- **Reutilizar** (`POST /:id/jurado/reutilizar`): copia los miembros de un acta
  confirmada y **vigente** a una nueva acta borrador del concurso destino,
  validando **mismo escalafón + especialidad** y que el destino no tenga acta
  confirmada. Un jurado vencido NO se puede reutilizar.

---

## 5. Orden de mérito (Etapa 3) — modelo reutilizable

Modelos: `OrdenMerito` + `OrdenMeritoIntegrante`. El flujo operativo (inscriptos
con `presentoExamen`/`ordenMerito`) alimenta el documento reutilizable al
confirmar.

- **Al confirmar OM** (`confirmarOrdenMeritoService`): crea `OrdenMerito`
  (`especialidad`, `puesto`, `fechaPublicacion`=hoy, `fechaVencimiento`=+6 meses,
  `estado='vigente'`) + `OrdenMeritoIntegrante` desde los inscriptos presentados
  (posición = `ordenMerito`). Idempotente (reemplaza la OM previa del concurso).
- **Revertir OM**: bloqueado si algún integrante ya fue designado por otro
  concurso; si no, elimina el documento.
- **Vigencia**: 6 meses (+ prórroga opcional de 60 días vía `fechaProrroga`), o
  hasta que todos los integrantes estén designados/anulados.
- `OrdenMeritoIntegrante`: `designado` (Boolean) + `concursoCphDesignadoId` (qué
  concurso lo tomó) + **`anulado`** (Boolean) + `motivoAnulado` (no aceptó el
  cargo). Un integrante está **disponible** si `!designado && !anulado`.
- `GET /ordenes-merito-vigentes`: OM vigentes con ≥1 integrante disponible +
  contador `disponibles`. Pestaña "Órdenes de mérito" = tabla con búsqueda y
  filtro por especialidad.

---

## 6. Reutilización de OM y reelección (Etapas 1 y 4)

- **Compatibilidad de OM**: mismo **puesto + especialidad + escalafón** que el
  concurso destino.
- **Reservar** (`POST /:id/om/reservar`): toma un integrante disponible de una
  OM compatible vigente → `designado=true`, `concursoCphDesignadoId=destino`, y
  lo registra como `personaDesignada` del destino **si tiene `personaId`**. NO
  finaliza el concurso.
- **Rechazar / no aceptó** (`POST /:id/om/rechazar`): marca el integrante
  `anulado=true` (+ motivo), libera la reserva y limpia la persona designada;
  devuelve `disponiblesRestantes`. Si quedan disponibles → reelegir otro; si no
  → declarar desierto.
- **Liberar** (`POST /:id/om/liberar`): revierte la reserva sin anular.
- `GET /:id/om-compatibles` y `GET /:id/candidato-om` alimentan el panel
  `PanelReutilizarOm` (visible en Etapa 1 con eeConcurso cargado, y en Etapa 4).

> **Designación de OM ≠ terminación del concurso.** Reservar/designar de la OM
> solo marca al candidato. El concurso se termina cuando el CUIL del designado
> aparece en el padrón semanal con id_sial/rol (vinculación) — **pendiente de
> implementar (Fase 6b)**.

---

## 7. Etiquetas

Backend genérico ya existente (`/api/v1/etiquetas`): `GET`, `POST`, `PATCH`,
`DELETE` (soft-delete), `POST /:id/asignar` y `DELETE /:id/desasignar` con body
`{ entidad, entidadId }` (entidad `concurso_cph`). Permiso de escritura:
`{ modulo: 'etiquetas', accion: 'crear' }`.

- El `ConcursoCph` devuelve `etiquetas: Etiqueta[]` (aplanado del join).
- Un concurso puede tener varias etiquetas.
- UI: componente `EtiquetasControl` (chips con color + crear/asignar). En la
  lista hay **etiquetado masivo** (seleccionar varios concursos + aplicar una
  etiqueta). En el wizard, dentro del menú "Acciones".

---

## 8. Acciones del concurso (encabezado del wizard)

Menú **"⚙ Acciones"** (desplegable) agrupa: Etiquetas, Ver baja,
**Suspender/Activar** (toggle, `POST /:id/suspender`) y **Declarar desierto**
(`POST /:id/declarar-desierto`, solo si no está finalizado; relanza desde la
Etapa 1). Los badges de estado (sub-estado, sub-estado3, Suspendido) quedan
fuera del menú.

---

## 9. Lista de concursos (`/concursos/cph`)

- **Pestañas**: Concursos · Jurados · Órdenes de mérito.
- **Orden**: por `createdAt` descendente (más recientes primero).
- **Columnas**: Estado (semáforo) · Respaldatoria · Puesto · Especialidad ·
  Hospital · Etapa (stepper 1-5) · Sub-estado · Etiquetas · Acciones (ⓘ detalle + Ver).
- **Respaldatoria** (origen del concurso):
  - **Baja**: tiene baja asociada → muestra `eeBaja`.
  - **Ampliación**: sin baja pero el cargo tiene `expediente` de alta → lo muestra.
  - **Cobertura de dotación**: sin baja ni expediente → "Sin doc.".
- **Filtros**: búsqueda (expediente/persona/observaciones), especialidad,
  hospital, estado, sub-estado, etapa, respaldatoria/origen, "con documentación
  faltante". Se muestran **burbujas de filtros aplicados** con "×" y "Limpiar
  todo". El filtro de especialidad y la búsqueda intersectan por IDs con los
  demás filtros de ese tipo.
- Botón "Publicar fechas de inscripción" se oculta si la inscripción ya está
  cerrada, o hay `fechaExamen`, o el sub-estado avanzó más allá de la
  inscripción (D-EXAMEN PUBLICADO en adelante).

---

## 10. Endpoints (resumen)

Bajo `/api/v1/concursos-cph`:

| Método | Ruta                                                  | Descripción                                    |
| ------ | ----------------------------------------------------- | ---------------------------------------------- |
| GET    | `/`                                                   | Lista paginada con filtros                     |
| GET    | `/jurados-vigentes`                                   | Jurados confirmados (flag `vigente`)           |
| GET    | `/ordenes-merito-vigentes`                            | OM vigentes con disponibles                    |
| GET    | `/:id`                                                | Detalle                                        |
| PATCH  | `/:id`                                                | Actualizar campos (recalcula estado/subEstado) |
| POST   | `/:id/suspender`                                      | Suspender / reactivar                          |
| POST   | `/:id/declarar-desierto`                              | Declarar desierto (relanza)                    |
| POST   | `/:id/designar`                                       | Designación formal (ocupación, finaliza)       |
| POST   | `/:id/generar-sorteo`                                 | Sortear jurado                                 |
| POST   | `/:id/jurado/reutilizar`                              | Reutilizar jurado vigente compatible           |
| POST   | `/:id/jurado/confirmar` \| `/revertir`                | Confirmar / revertir jurado                    |
| DELETE | `/:id/jurado`                                         | Cancelar acta borrador                         |
| GET    | `/:id/om-compatibles`                                 | OM compatibles con disponibles                 |
| GET    | `/:id/candidato-om`                                   | Candidato de OM reservado (o null)             |
| POST   | `/:id/om/reservar` \| `/liberar` \| `/rechazar`       | Gestión del candidato de OM                    |
| ...    | (inscriptos, presentados, orden-merito, importar-csv) | Etapa 3                                        |

---

## 11. Migraciones aplicadas en esta línea de trabajo

- `20260929090000_om_integrante_anulado` — `OrdenMeritoIntegrante.anulado` +
  `motivoAnulado`.
- `20260929100000_cph_if_autorizacion` — `ConcursoCph.ifAutorizacion`.

> Nota Docker: al cambiar el schema Prisma hay que regenerar el client DENTRO
> del contenedor (`docker exec srrhh_api ... prisma generate` + restart), porque
> `node_modules` no está montado por el override (solo el código fuente).

---

## 12. Pendiente

- **Fase 6b — terminación por vinculación con padrón**: cuando el CUIL del
  candidato reservado de OM aparece en el padrón semanal con un id_sial/rol de
  fecha cercana, sugerir la vinculación (no obligatoria) y permitir aceptarla
  para concluir el concurso. Falta definir "fecha cercana" y el disparador.
- **Normalización de especialidades en datos** (ver `DATA_CLEANING_ESPECIALIDADES.md`).
