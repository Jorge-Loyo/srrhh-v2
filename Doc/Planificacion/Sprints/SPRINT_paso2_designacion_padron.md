# Sprint — Paso 2: designación, elegir candidato y cierre automático por padrón

> Plan acordado con Jorge (2026-10-29). Cierra el circuito de concursos CPH:
> elegir candidato (con 3 vías, incluida carga manual), vincular sin ocupar
> (`n-designado`), y cierre automático a `o-alta sial` + cargo ocupado cuando el
> padrón trae a la persona. Base: investigación en
> `.agents/tasks/paso2-padron-designado/findings.md` y
> `Doc/Planificacion/Sprints/SUBESTADOS_CONCURSO_CPH.md`.
>
> Se ejecuta DESPUÉS de desplegar: sprint tipo-concurso, fix calc n-designado, y
> el workflow asignar-designado-manual (vinculación básica). Este sprint los amplía.

---

## Reglas de negocio (confirmadas con el usuario)

1. **El padrón semanal es la nómina legal.** Un designado NO ocupa el cargo hasta
   que aparece en el padrón por su `id_sial_rol`. Mientras tanto, el concurso está
   `finalizado` + `n-designado`.
2. **Elegir candidato tiene 3 vías** (hoy solo existe orden de mérito / inscriptos):
   - (i) Orden de mérito / inscripto reservado (ya existe).
   - (ii) Buscar persona existente en la BD (por CUIL / nombre / DNI).
   - (iii) Carga manual: el operador tipea los datos del candidato. Decisión (b):
     **solo se guarda la referencia** (CUIL/nombre); la persona "real" se crea/vincula
     cuando el padrón la traiga. NO se crea Persona en ese momento.
3. **id_sial**: si el operador lo conoce, lo tipea → match directo. Si no, se intenta
   match automático por CUIL contra el padrón.
4. **Ocupar = solo con match SIAL.** Vincular designado NO ocupa el cargo. El cargo
   pasa a `vigente`/`sub_estado='ocupado'` únicamente cuando el padrón valida (match
   por id_sial_rol o CUIL).

---

## Alcance

### A. Fix del calc — `o-alta sial` por `validado` (base)
- `concursosCph.calc.ts`: cambiar el disparo de `o-alta sial` de `cargoSial` a `validado`.
  `n-designado` ya quedó con `resolucionDesignacion` (hecho en sprint previo).
- Agregar `validado` (y `validadoIdSialRol`) a `ConcursoCphCalcInput` y a `toCalcInput`
  (concursos-cph.service.ts ~L61).
- Mantener `cargoSial` como atajo informativo (opcional: que setear `cargoSial` también
  encienda `validado=true` por compatibilidad).
- Actualizar `apps/api/src/__tests__/concursosCph.calc.test.ts` (hoy prueba
  `cargoSial → o-alta sial` L240 y "o-alta sial gana sobre n-designado" L376).

### B. "Elegir candidato" con 3 vías (frontend wizard + backend)
- Ampliar el modal de designación del wizard (`ConcursoCphWizard.tsx`) para ofrecer:
  OM/inscriptos (existente), búsqueda en BD de personas, y carga manual por referencia.
- Carga manual (vía iii): guarda CUIL + apellido/nombre como referencia en el ConcursoCph
  (campos de referencia del designado — definir si se reusa un campo existente o se agrega
  uno; NO crear Persona). Mostrar si el CUIL matchea una persona en BD y/o tiene id_sial
  que vincula.
- Campo id_sial opcional en el form: si se tipea, se usa para match directo.
- Al confirmar: vincular (persona_designada_id si la persona existe en BD, o referencia si
  es manual), dejar en `n-designado`, SIN ocupar. Reusa/ amplía el endpoint de
  asignar-designado-manual.

### C. Paso 2 — cierre automático por el padrón (el núcleo)
Según findings.md (recomendación de menor riesgo):
- En el camino masivo de aprobación del padrón (`aprobarTodosDiffsPendientesService` /
  `aprobarSnapshotService`), resolver `vincularConcursoId` automáticamente por CUIL del
  designado reutilizando el índice de `getValidacionesPreviewService` (match CUIL +
  carrera + especialidad = `validable`), y delegar en `aprobarDiffNuevoService(...,
  vincularConcursoId)` (mutación ya probada).
- **Reconciliar la ocupación MANUAL**: si el cargo del concurso ya tiene una `Ocupacion`
  `idSialRol LIKE 'MANUAL-{cargoId8}-%'` para la persona, ACTUALIZAR su `idSialRol` al real
  del padrón en vez de crear otra (evita violar UNIQUE y duplicar).
- Al ocupar: setear `cargo.estado='vigente'` + `cargo.sub_estado='ocupado'` + `estadoDesde`.
- Cerrar el concurso: `validado=true`, `validadoAt`, `validadoIdSialRol`, y RECALCULAR
  estado/subEstado con `calcConcursoCph(toCalcInput(row))` → queda en `o-alta sial`.
- Guardas: solo enganchar si el match es confiable (CUIL + carrera + especialidad).
  Los no-validables quedan para decisión manual (ya cubierto por la UI existente).

### D. `Cargo.sub_estado` en runtime (relacionado)
- Hoy `sub_estado` solo lo escribe el backfill manual. El Paso 2 debe setear `'ocupado'`
  al ocupar. Revisar (al menos documentar) que crear/reabrir ocupación y confirmar/rechazar
  baja en el import mantengan `sub_estado` para no romper el invariante del backfill con el
  correr de las semanas.

---

## Riesgo principal (findings.md §6a)
Hoy el camino masivo del padrón, ante un designado nuevo, crea un cargo por `id_sial`
en paralelo al cargo del concurso → DUPLICADO. Este sprint lo cierra. Es el corazón del Paso 2.

## Verificación
- Builds api + web verdes.
- Tests vitest de `apps/api`: `concursosCph.calc.test.ts` (actualizar), `padron.diff.test.ts`
  y afines deben seguir pasando.
- NO ejecutar contra DB. El usuario corre cualquier backfill/validación en Neon.
- Idealmente, un test del enganche automático concurso↔padrón (match por CUIL → ocupa el
  cargo del concurso, no crea duplicado).

## Dependencias / orden
1. Desplegar primero: tipo-concurso + fix calc n-designado + asignar-designado-manual.
2. Este sprint amplía esa base. El fix del calc (A) es prerequisito de C.
