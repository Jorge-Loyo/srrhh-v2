# POST-SPRINT 18 — Wizard CPH: Etapa 2 (Sorteo de Jurado) + Etapa 3 (Inscripción / Examen / Orden de Mérito) + Etapa 4 (guardado por grupo)

**Estado:** ✅ Completado — commits `3156727` (Prisma), `47dc4f4` (backend), `c7dfb82` (frontend)
**Fecha:** 2026-09
**Autor:** Jorge
**Rama:** `jorge` → integrado a `main` y `deploy`

---

## Objetivo

Completar la operatoria de las etapas 2, 3 y 4 del wizard de concursos CPH, que hasta
ahora solo tenían campos de fecha sueltos. Se agrega toda la lógica de negocio del
**sorteo de jurado** (Etapa 2), la gestión de **inscriptos, examen y orden de mérito**
(Etapa 3) y el **guardado por grupo** de IFACS/INSAL (Etapa 4), con documentos (actas
PDF), confirmaciones formales y avance de sub-estados coherente.

---

## Etapa 2 — Autorización / Jurado

### Sorteo de jurado

Formación de jurado según el reglamento CPH: titulares y suplentes sorteados entre
profesionales del sistema con **cargo activo** y **misma profesión** (escalafón) que el
cargo a concursar, por un esquema de **3 reglas en cascada** (en orden de prioridad):

| Regla | Condición |
|-------|-----------|
| **1** | Mismo hospital + cargo de conducción + misma especialidad |
| **2** | Mismo hospital + antigüedad ≥ N años (default 15) |
| **3** | Sistema de salud (cualquier hospital) + cargo de conducción |

- Se acumulan candidatos por regla hasta reunir el **total requerido** (titulares +
  suplentes). Si una regla ya alcanza el total, no se baja a la siguiente.
- El sorteo (RNG **sembrado/reproducible**) mezcla el pool y reparte: los primeros
  sorteados = titulares, los siguientes = suplentes.
- Cada miembro guarda la **regla por la que entró**, el ámbito (mismo hospital / sistema)
  y los criterios cumplidos (especialidad, conducción, antigüedad).
- Convención de "cargo de conducción": `Ocupacion.codigoJefaturas` no nulo/vacío/`'0'`
  (misma regla que `organigrama.service.ts` / `cadena-mando`).

### Criterios configurables

Cantidad de titulares (3), suplentes (3), antigüedad mínima (15 años), semilla opcional
y observaciones. Los flags "exigir especialidad" y "ampliar a sistema" se eliminaron
porque quedaron implícitos en las 3 reglas.

### Flujo de confirmación

- **Generar sorteo** crea un borrador (no avanza el sub-estado).
- **Confirmar jurado** fija el acta, registra `sorteoJurado` en el concurso y avanza el
  sub-estado a **B — Sorteo de jurado**. Queda de solo lectura.
- **Revertir confirmación** vuelve a borrador. **Cancelar** descarta el borrador.
- **Acta de jurado (PDF)**: se genera al confirmar; disponible en Documentación.

### Tipo de gestión

Nuevo campo `tipoGestion` (**centralizado** / **descentralizado**). Por ahora informativo
(centralizado → interviene SGOCDCPS en etapa 3; descentralizado → un tercero). Requerido
para completar la Etapa 2.

### Regla de completitud de la Etapa 2

Se completa (verde) solo con: fecha de autorización + **jurado confirmado** + disposición
de llamado + tipo de gestión. Mientras falta alguno, "Guardar y continuar" no avanza y
muestra el faltante.

---

## Etapa 3 — Inscripción / Examen / Orden de Mérito

### Nuevo sub-estado "C — Inscripción de exámenes" (`C2-INSCRIPCION EX`)

Entre C-Dispo y D-Publicación Examen. Aparece cuando hay ambas fechas de inscripción y el
examen aún no se publicó.

### Inscriptos

Modelo nuevo `InscriptoConcurso` (datos personales principales). Carga **manual** (modal)
o por **importación Excel/CSV** (headers flexibles con sinónimos/acentos, fechas en serial
Excel o dd/mm/yyyy). La **cantidad de inscriptos se autocalcula** de la lista (no se carga
a mano).

### Flujo con botones "Publicar" (guardado inmediato al backend)

Resuelve el problema de que las fechas escritas en inputs no se guardaban hasta "Guardar
y continuar":

1. **Publicar fechas de inscripción**: guarda desde/hasta + cierra el período →
   `C2-INSCRIPCION EX` verde, **D — Publicación Examen** amarillo. (Reabrir para revertir.)
2. **Publicar examen** (condicional a inscripción publicada): guarda `fechaExamen` →
   **D** verde, **E — Orden de mérito** amarillo. (Despublicar para revertir.)

### Presentados y orden de mérito

- Checkbox **"Presentó"** por inscripto (readonly una vez confirmado).
- **Confirmar presentados** (requiere fecha de examen): congela quién se presentó.
- Columna **"Orden mérito"** (posición) para los presentados.
- **Confirmar orden de mérito** (requiere presentados confirmados + posiciones únicas y
  completas): setea `fechaOrdenMerito = hoy`, avanza a **E — Orden de mérito**, fija el
  ranking y habilita el **Acta de orden de mérito (PDF)**.
- Cada confirmación tiene su **revertir**.

### Validaciones y avance

- Aviso de posiciones repetidas / faltantes.
- "Guardar y continuar" hacia la Etapa 4 exige: fecha de examen + presentados confirmados
  + orden de mérito confirmado.
- Botón **Declarar desierto** también disponible en Etapa 3 (relanza el concurso).

---

## Etapa 4 — IFACS / INSAL

Guardado **por grupo** sin pasar de etapa: botones **"Guardar IFACS"** y **"Guardar
INSAL"** (PATCH inmediato). Se **deshabilitan** si no hay nada cargado o si ya está
guardado igual (muestran "✓ ... guardado").

---

## Panel de sub-estados (regla general)

Se unificó la lógica: **verde = completado, amarillo = primer paso pendiente**. El
marcador amarillo se ubica en el siguiente sub-estado al último alcanzado. El label
"D — Examen publicado" se renombró a **"D — Publicación Examen"**.

---

## UX transversal

- Se reemplazaron **todos** los `window.confirm` / `window.alert` del wizard por
  **modales y toasts propios** (`useConfirm`, `useToast` en `shared/components/ui`).
- Los mensajes de error muestran el motivo real del backend (`error.response.data.error.message`).

---

## Modelo de datos (Prisma)

### Modelos nuevos

- **`SorteoJurado`**: acta del sorteo (`fechaSorteo`, `semilla`, `criterios` JSON,
  `ambito`, `observaciones`, `confirmado`, `confirmadoAt/PorId`, `generadoPorId`).
- **`MiembroJuradoSorteado`**: rol (titular/suplente), orden, snapshot de la persona
  (apellido/nombre, cuil, hospital, puesto, especialidad, ámbito), `reglaAplicada`,
  flags `cumpleEspecialidad`/`esConduccion`/`antiguedadAnios`. `onDelete: Cascade`.
- **`InscriptoConcurso`**: datos personales (apellido, nombre, dni, cuil, sexo,
  fechaNacimiento, nacionalidad, telefono, email, titulo, matricula, especialidad),
  `presentoExamen`, `ordenMerito`, `observaciones`. `onDelete: Cascade`.

### Campos nuevos en `ConcursoCph`

`tipoGestion`, `inscripcionCerrada`, `fechaCierreInscripcion`, `presentadosConfirmados`,
`ordenMeritoConfirmado`. Relaciones inversas `sorteosJurado`, `inscriptos`.

### Migraciones (aplicadas en DB local, corren en deploy vía `prisma migrate deploy`)

| Migración | Contenido |
|-----------|-----------|
| `20260929000000_sorteo_jurado_cph` | Tablas `sorteos_jurado` + `miembros_jurado_sorteados` |
| `20260929010000_sorteo_jurado_confirmacion` | `confirmado`/`confirmado_at`/`confirmado_por_id` |
| `20260929020000_miembro_jurado_regla` | `regla_aplicada` en miembros |
| `20260929030000_cph_tipo_gestion` | `tipo_gestion` |
| `20260929040000_inscriptos_concurso` | Tabla `inscriptos_concurso` |
| `20260929050000_inscripto_presento_examen` | `presento_examen` |
| `20260929060000_cph_cierre_inscripcion` | `inscripcion_cerrada` + `fecha_cierre_inscripcion` |
| `20260929070000_inscripto_orden_merito` | `orden_merito` en inscriptos |
| `20260929080000_cph_confirmaciones_etapa3` | `presentados_confirmados` + `orden_merito_confirmado` |

---

## Backend — endpoints nuevos (`/api/v1/concursos-cph/:id`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/generar-sorteo` | Genera el sorteo (borrador) según criterios |
| GET | `/jurado` | Acta del sorteo vigente |
| POST | `/jurado/confirmar` · `/jurado/revertir` | Confirmar / revertir jurado |
| DELETE | `/jurado` | Cancelar borrador |
| GET/POST | `/inscriptos` | Listar / alta manual |
| PATCH/DELETE | `/inscriptos/:inscriptoId` | Editar (incl. presentó/orden) / borrar |
| POST | `/inscriptos/importar` | Importar Excel/CSV |
| POST | `/inscripciones/cerrar` · `/inscripciones/reabrir` | Publicar / reabrir fechas de inscripción |
| POST | `/examen/publicar` · `/examen/despublicar` | Publicar / despublicar examen |
| POST | `/presentados/confirmar` · `/presentados/revertir` | Confirmar / revertir presentados |
| POST | `/orden-merito/confirmar` · `/orden-merito/revertir` | Confirmar / revertir orden de mérito |
| GET | `/api/v1/personas/:id/sial-roles` | Roles SIAL activos de una persona (para designación) |

`calcConcursoCph` amplió su input (`fechaInscDesde`, `inscripcionCerrada`,
`ordenMeritoConfirmado`) y sus reglas: `C2-INSCRIPCION EX` (fechas insc. cargadas),
`D-EXAMEN PUBLICADO` (inscripción cerrada o fecha examen), `E-ORDEN DE MERITO`
(OM confirmada o fecha OM).

---

## Archivos principales

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Modelos `SorteoJurado`, `MiembroJuradoSorteado`, `InscriptoConcurso` + campos y relaciones en `ConcursoCph` |
| `apps/api/.../concursos-cph/sorteoJurado.service.ts` | Elegibilidad por 3 reglas, sorteo sembrado, confirmar/revertir/cancelar |
| `apps/api/.../concursos-cph/inscriptos.service.ts` | CRUD + import XLSX/CSV, cierre inscripción, publicar examen, confirmar presentados/OM |
| `apps/api/.../concursos-cph/inscriptos.schema.ts` | Zod de inscripto + publicar |
| `apps/api/.../concursos-cph/concursos-cph.{routes,schema,service}.ts` | Rutas nuevas, `generarSorteoJuradoSchema`, `tipoGestion` en PATCH |
| `apps/api/.../concursos-cph/concursosCph.calc.ts` | Nuevos campos e input + sub-estado `C2-INSCRIPCION EX` |
| `apps/api/.../personas/personas.{routes,service}.ts` | Endpoint `sial-roles` |
| `apps/web/.../concursos-cph/pages/ConcursoCphWizard.tsx` | Etapas 2/3/4 completas |
| `apps/web/.../concursos-cph/hooks/useConcursosCph.ts` | Hooks de sorteo, inscriptos, publicaciones y confirmaciones |
| `apps/web/src/shared/lib/exportConcursoDocs.ts` | `exportJuradoPdf`, `exportOrdenMeritoPdf` |
| `apps/web/src/shared/components/ui/useConfirm.tsx`, `useToast.tsx` | Modales/toasts propios reutilizables |
| `packages/types/src/index.ts` | Tipos de sorteo, jurado, inscriptos, criterios y flags |

---

## Criterio de éxito

- [x] Sorteo de jurado por 3 reglas en cascada, reproducible por semilla, con acta PDF
- [x] Confirmar/revertir jurado avanza/retrocede el sub-estado B
- [x] Tipo de gestión persistido y requerido en Etapa 2
- [x] Inscriptos por alta manual e importación Excel/CSV; cantidad autocalculada
- [x] Publicar fechas de inscripción / examen guardan al backend y avanzan sub-estados
- [x] Confirmar presentados congela la marca; confirmar OM fija ranking, fecha=hoy y acta PDF
- [x] Panel de sub-estados: verde = hecho, amarillo = primer pendiente
- [x] `window.confirm`/`alert` reemplazados por modales/toasts propios
- [x] `tsc` sin errores (tipos, API, web); `prisma validate` OK; imagen Docker reconstruida
- [ ] Verificación E2E completa del flujo etapa 2→3→4 con datos reales — pendiente
- [ ] Etapa 5 (Designación): tomar persona del orden de mérito — pendiente (próximo)

---

## Notas

- **Docker local con hot-reload**: `docker-compose.override.yml` monta el código fuente
  (`apps/api/src`, `packages/*/src`, `prisma`) como volumen con `CHOKIDAR_USEPOLLING`.
  Los cambios de TS se recargan solos; solo se reconstruye la imagen cuando cambia el
  schema Prisma (para regenerar el cliente) o dependencias.
- **DB local**: el Postgres nativo de Windows ocupa el 5432; el contenedor se usa por el
  **5433** (ver `docker-compose.override.yml`).
- **Excel de prueba** de inscriptos en `Doc/Referencias/inscriptos_prueba.xlsx`.
- **Fecha de sorteo / OM**: no se eligen; se toman del día en que se genera/confirma.
