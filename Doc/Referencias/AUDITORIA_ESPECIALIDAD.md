# Auditoría de lectura de especialidad (legacy vs. catálogo)

Fecha: 2026-10-04
Alcance: `apps/api/src`, `apps/web/src`, `packages/types/src` del monorepo `SRRHH-Legacy`.
Modo: SOLO LECTURA. No se modificó código. Las citas incluyen ruta absoluta y número de línea.

---

## 1. Respuesta ejecutiva (resumen primero)

- **La fuente del problema que reportó el usuario ("usa la especialidad vieja, no la correcta") en el módulo CPH está en el backend**, concretamente en `concursos-cph.service.ts`: la query cruda que arma las ocupaciones de la persona lee **solo** `c.especialidad_legacy` (sin `LEFT JOIN especialidades_puesto`), y ese valor alimenta tres cosas a la vez: (a) la lógica de validación carrera+especialidad del concurso, (b) la "especialidad principal" que se muestra en el wizard, y (c) el resumen de ocupación que viaja al front. Esto NO respeta la regla `especialidadPuesto?.nombre ?? especialidadLegacy`. Es el bug de mayor impacto.
- **El error de pantalla del padrón ("No se pudo completar la operación", mensaje #3) NO proviene de un uso de especialidad en el código.** Es el problema de reapertura de ocupaciones que el usuario ya corrigió por SQL (mensajes #1 y #2). No se encontró ninguna referencia viva a la columna eliminada `especialidad_principal` en la ruta de aprobación del padrón ni en ningún `select`/`create` de Prisma; es decir, **no hay Categoría C de riesgo runtime** (ver §4). La columna fue eliminada limpiamente en S21-5.
- Las migraciones S21-8/S21-9 (sorteo de jurado, documentos CPH principales) ya aplican el patrón correcto. Lo que quedó sin migrar son: la query de ocupaciones de CPH, los dos puntos de reutilización de OM/jurado por compatibilidad, la derivación de `especialidadPrincipal` en el detalle del concurso, el acta de sorteo de jurado en el export, y las pantallas de **Cargos** del front (lista y detalle) que muestran `especialidadLegacy` porque el backend ni siquiera trae la relación del catálogo.

Clasificación: **5 focos de Categoría B (bug)**, varios lugares de Categoría A (correctos), **0 de Categoría C**.

---

## 2. CATEGORÍA A — Correcto, NO tocar

Lugares que ya prefieren el catálogo, o que escriben snapshot/legacy legítimamente.

### A.1 Derivación de `especialidadPrincipal` en el listado de personas (patrón de referencia)
`c:\Desarrollo\SRH\SRRHH-Legacy\apps\api\src\modules\personas\personas.service.ts:138`
```sql
COALESCE(ep.nombre, c.especialidad_legacy) AS "especialidadPrincipal"
```
Con `LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id` (línea ~128) sobre la ocupación vigente. Este es el patrón correcto que el resto debe seguir.

### A.2 Sorteo de jurado — generación
`...\concursos-cph\sorteoJurado.service.ts:462`
```ts
const especialidadConcurso = concurso.especialidadSolicitada ?? cargo.especialidadPuesto?.nombre ?? cargo.especialidadLegacy ?? null
```
El fetch (línea ~411) incluye `cargo: { include: { ..., especialidadPuesto: true } }`. Correcto.

### A.3 Sorteo de jurado — reutilizar jurado existente (compatibilidad)
`...\concursos-cph\sorteoJurado.service.ts:919`
```ts
const especialidadDestino = destino.especialidadSolicitada ?? cargo.especialidadPuesto?.nombre ?? cargo.especialidadLegacy ?? null
```
El fetch (línea ~884) incluye `especialidadPuesto: true`. Correcto.

### A.4 Documentos CPH principales (Autorización/Validación y Acta de OM)
`c:\Desarrollo\SRH\SRRHH-Legacy\apps\web\src\shared\lib\exportConcursoDocs.ts:93`, `:662-663`, `:811`
```ts
const especBaja = cargo?.especialidadPuesto?.nombre || cargo?.especialidadLegacy || '-'
// ...
data.especialidadSolicitada ?? cargo?.especialidadPuesto?.nombre ?? cargo?.especialidadLegacy
```
Patrón correcto. Confirma que el payload `ConcursoCph.concurso.cargo` SÍ trae `especialidadPuesto` (ver `packages/types/src/index.ts:183`).

### A.5 Jurado — especialidad propia de la persona = `especialidadCph` (no el cargo)
`...\concursos-cph\sorteoJurado.service.ts:253`
```ts
const especialidadPersona = p.especialidadCph
```
Correcto por diseño (S21-6): la especialidad del candidato a jurado es su `especialidadCph` canónica, no la del cargo. No confundir con el bug de abajo.

### A.6 Escrituras legítimas de `especialidad_legacy` (snapshot al crear/actualizar Cargo) — regla (b)
- `...\cargos\cargos.service.ts:306` → `especialidadLegacy: especialidadPuesto?.nombre ?? null` (alta de cargo desde el catálogo; guarda el nombre canónico como snapshot de auditoría).
- `...\autorizaciones\autorizaciones.service.ts:304` → `especialidadLegacy: solicitud.especialidad ?? null` (alta de cargo al aprobar solicitud).
- `...\solicitudes-alta`/`extraer_catalogo_puestos.ts:64,88` → lectura de `especialidadLegacy` para construir el catálogo (herramienta de migración, no negocio).

### A.7 Escritura del snapshot histórico `padron_historico.especialidad` — regla (a)
`...\padron\padron.service.ts:1712`
```ts
especialidad: ocupacion.cargo.especialidadLegacy ?? null,
```
Es la foto del padrón al aprobar el snapshot. Correcto escribir el texto crudo.

### A.8 Búsquedas full-text que incluyen legacy como un campo más — regla (c)
- `...\cargos\cargos.service.ts:70,73` (búsqueda de cargos: `especialidad_legacy` ILIKE / similarity).
- `...\concursos-cph\concursos-cph.service.ts:190` (filtro por especialidad: `ca.especialidad_legacy` ILIKE).
- `...\pou\pou.service.ts:56,63,73` (vista POU: `especialidad_legacy` como columna informativa de la vista).
Incluir legacy en el match no es incorrecto. Observación menor: estos filtros NO buscan además en `especialidades_puesto.nombre`, así que un cargo cuyo catálogo difiera del legacy podría no matchear por el nombre nuevo. No es un bug de "lee la vieja" sino una cobertura de búsqueda incompleta — opcional de mejorar, baja prioridad.

### A.9 `especialidadCph` de personas (resincronización semanal) — NO confundir
`...\padron\padron.service.ts` (bloque `UPDATE personas SET especialidad_cph = ...` desde `ref_especialidades_cuil`, líneas ~1644 y ~2355). Es la especialidad CPH canónica, otra cosa; es correcto.

---

## 3. CATEGORÍA B — BUG a corregir (lee legacy como negocio/visualización sin preferir el catálogo)

### B.1 (ALTA PRIORIDAD) Query de ocupaciones del concurso CPH lee solo legacy
Archivo: `c:\Desarrollo\SRH\SRRHH-Legacy\apps\api\src\modules\concursos-cph\concursos-cph.service.ts`
Query cruda, línea **1268**:
```sql
c.especialidad_legacy AS "especialidadLegacy",
```
(no hay `LEFT JOIN especialidades_puesto`).

Ese `especialidadLegacy` del `OcupRow` alimenta TRES usos de negocio/visualización:

1. **Validación carrera+especialidad** (línea **1297-1303**, `especialidadCoincideOcup`):
   ```ts
   (!!o.especialidadLegacy && normEsp(o.especialidadLegacy) === eNorm) || ...
   ```
   Si el catálogo corrigió la especialidad y legacy quedó viejo, la triangulación del concurso puede fallar o acertar por el valor equivocado.

2. **Derivación de `especialidadPrincipal`** (líneas **1319-1322**) — esto es lo que ve el usuario en el wizard:
   ```ts
   persona.especialidadPrincipal =
     vigentes[0]?.especialidadLegacy ?? cerradas[0]?.especialidadLegacy ?? null
   ```

3. **Resumen de ocupación al front** (línea **1308**, dentro de `toResumen`):
   ```ts
   especialidadLegacy: o.especialidadLegacy,
   ```

Fix sugerido (una sola corrección en la query cubre los tres usos):
- Agregar el join y traer el nombre del catálogo con fallback:
  ```sql
  LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
  ...
  COALESCE(ep.nombre, c.especialidad_legacy) AS "especialidad",
  c.especialidad_legacy AS "especialidadLegacy",
  ```
- En `especialidadCoincideOcup` y en la derivación de `especialidadPrincipal`, usar el nuevo campo resuelto (`o.especialidad`) en lugar de `o.especialidadLegacy`.
- Para el `toResumen`/contrato (`OcupacionResumen` en `packages/types/src/index.ts:1090`), lo más limpio es exponer el valor resuelto (agregar un campo `especialidad` o reemplazar el significado del existente), para que el front muestre el catálogo. Hoy el tipo solo tiene `especialidadLegacy`.
- `select`/relación: la query es cruda, hay que agregar el `LEFT JOIN` manualmente (no hereda include de Prisma).

### B.2 (MEDIA) Orden de Mérito — especialidad persistida desde legacy
Archivo: `c:\Desarrollo\SRH\SRRHH-Legacy\apps\api\src\modules\concursos-cph\inscriptos.service.ts`
Línea **434-435** (`confirmarOrdenMeritoService`):
```ts
const especialidadOm =
  c.especialidadSolicitada ?? c.concurso?.cargo?.especialidadLegacy ?? 'SIN ESPECIALIDAD'
```
Falta el paso del catálogo. Este valor se **persiste** en `OrdenMerito.especialidad` (línea ~462), así que un valor viejo queda congelado y luego se usa para matchear compatibilidad (ver B.3).

Estado del fetch: el `findUnique` (línea **405-407**) usa `include: { concurso: { include: { cargo: true } } }` → trae solo los escalares del cargo, **NO** la relación `especialidadPuesto`. Hay que ampliar el include.

Fix sugerido:
- Cambiar el include a `cargo: { include: { especialidadPuesto: true } }`.
- Cambiar la expresión a:
  ```ts
  c.especialidadSolicitada ?? c.concurso?.cargo?.especialidadPuesto?.nombre ?? c.concurso?.cargo?.especialidadLegacy ?? 'SIN ESPECIALIDAD'
  ```

### B.3 (MEDIA) Reservar integrante de OM — compatibilidad por legacy
Archivo: `...\concursos-cph\inscriptos.service.ts`
Línea **601** (`reservarIntegranteOmService`):
```ts
const especialidadDestino = destino.especialidadSolicitada ?? cargo?.especialidadLegacy ?? null
```
Esta especialidad se compara (normalizada) contra `om.especialidad` para decidir compatibilidad (líneas ~611-613). Si el destino se resuelve por legacy viejo, un integrante compatible puede rechazarse o aceptarse por el valor equivocado.

Estado del fetch: `findUnique` línea **575-577** con `include: { concurso: { include: { cargo: true } } }` → sin `especialidadPuesto`. Ampliar include.

Fix sugerido:
- Include: `cargo: { include: { especialidadPuesto: true } }`.
- Expresión: `destino.especialidadSolicitada ?? cargo?.especialidadPuesto?.nombre ?? cargo?.especialidadLegacy ?? null`.

### B.4 (MEDIA) OM vigentes — select trae solo legacy
Archivo: `...\concursos-cph\inscriptos.service.ts`
Línea **538** (`listOrdenesMeritoVigentesService`, dentro del `include` del cargo):
```ts
select: {
  codigo: true,
  literalPuesto: true,
  especialidadLegacy: true,     // ← solo legacy
  escalafonId: true,
  hospital: { select: { sigla: true, nombre: true } },
},
```
Si el front muestra la especialidad de la OM/cargo desde este payload, mostrará el valor viejo. Mismo patrón en el select del `include` de `listJuradosVigentesService`:
`...\concursos-cph\sorteoJurado.service.ts:848`.

Fix sugerido: agregar al `select` del cargo:
```ts
especialidadPuesto: { select: { id: true, nombre: true } },
```
y que el consumidor prefiera `especialidadPuesto?.nombre ?? especialidadLegacy`. (Verificar en el front qué campo consume antes de cambiar el contrato.)

### B.5 (MEDIA) Pantallas de Cargos del front muestran legacy — y el backend no trae el catálogo
Síntoma de dos capas: las vistas de Cargos leen `especialidadLegacy`, y el servicio de cargos **ni siquiera incluye** la relación `especialidadPuesto` en el payload, así que no tienen de dónde sacar el catálogo.

Backend (raíz del problema):
- `...\cargos\cargos.service.ts:141-150` (`listCargosService`): `include` con `hospital`, `escalafon`, `ocupaciones` — **sin** `especialidadPuesto`.
- `...\cargos\cargos.service.ts:~177` (`getCargoByIdService`): `include` con `hospital`, `escalafon`, `codigoRegistro`, `ocupaciones`, `remplazantes` — **sin** `especialidadPuesto`.

Front (lee legacy):
- `c:\Desarrollo\SRH\SRRHH-Legacy\apps\web\src\modules\cargos\pages\CargosPage.tsx:208` (export XLS): `Especialidad: capitalizar(c.especialidadLegacy ?? c.especialidad)`
- `...\CargosPage.tsx:402` (celda de tabla): `capitalizar(c.especialidadLegacy) || '—'`
- `...\cargos\pages\CargoDetailPanel.tsx:56-57` (subtítulo), `:92` (condición de sección), `:94` (`<Dato label="Especialidad" value={cargo.especialidadLegacy ?? cargo.especialidad} />`)
- `...\cargos\pages\NuevaBajaPage.tsx:110` (celda) y `:189` (`especialidad: det.especialidadLegacy ?? det.especialidad ?? ''`)

Fix sugerido:
1. Backend: agregar `especialidadPuesto: { select: { id: true, nombre: true } }` al `include` de `listCargosService` y `getCargoByIdService`. El tipo `Cargo` ya declara `especialidadPuesto?` en `packages/types/src/index.ts:183`, así que no rompe el contrato.
2. Front: cambiar las lecturas a `cargo.especialidadPuesto?.nombre ?? cargo.especialidadLegacy ?? cargo.especialidad`. Aplica el mismo patrón en los 3 archivos listados (un solo criterio).

Nota: El campo `especialidad` (string) está marcado `@deprecated — usar especialidadLegacy` en `packages/types/src/index.ts:175`; mantener el fallback a `especialidadLegacy` y, al migrar, preferir primero el catálogo.

### B.6 (BAJA) Acta de Sorteo de Jurado y caso CEETPS leen solo legacy
Archivo: `c:\Desarrollo\SRH\SRRHH-Legacy\apps\web\src\shared\lib\exportConcursoDocs.ts`
Línea **254** (`getCasoCeetps`, acta de concursos CEETPS 83/85/87):
```ts
const especBaja = cargo?.especialidadLegacy || '-'
```
A diferencia de `getCasoCph` (que ya usa `especialidadPuesto?.nombre`, ver A.4), este caso lee solo legacy. El comentario dice que la relación "no viene en el payload" para CEETPS.

Prioridad baja porque: (a) en escalafones CEETPS (Enfermería/Técnicos/Servicios Generales) la "especialidad" médica del catálogo casi no aplica; (b) requiere además confirmar que el payload `ConcursoCeetps.concurso.cargo` incluya `especialidadPuesto` (hay que revisar el servicio de concursos-ceetps antes de cambiar el front).

Fix sugerido (si se decide homogeneizar): verificar/agregar `especialidadPuesto` en el payload de ceetps y usar `cargo?.especialidadPuesto?.nombre ?? cargo?.especialidadLegacy ?? '-'`.

---

## 4. CATEGORÍA C — Riesgo runtime por la columna eliminada `especialidad_principal`

**No se encontró ningún riesgo de Categoría C.** La columna `especialidad_principal` (campo Prisma `especialidadPrincipal` sobre el modelo `Persona`) fue eliminada limpiamente en S21-5:

- `prisma/schema.prisma:262` solo tiene un comentario explicando la eliminación; el campo no existe en el modelo.
- Los tres `persona.create` del padrón (`...\padron\padron.service.ts:1241`, `:2309`, `:2657`) y el `createMany` (`:1346`) **no** incluyen `especialidadPrincipal` en `data`. No hay `select` de Prisma que lo pida.
- Donde sigue apareciendo el identificador `especialidadPrincipal` es como **propiedad del contrato de API** (DTO/plain object), no como campo Prisma, y siempre se **deriva en runtime**:
  - `...\personas\personas.service.ts:138` → `COALESCE(ep.nombre, c.especialidad_legacy) AS "especialidadPrincipal"` (query cruda).
  - `...\concursos-cph\concursos-cph.service.ts:1222` → se inicializa `especialidadPrincipal: null` y se completa en `:1320` (plain object del response; ver B.1).
  - `packages/types/src/index.ts:109` y `:1070` → campo del tipo de respuesta, documentado como derivado.
  - Front: `apps/web/src/modules/personas/pages/PersonasPage.tsx:202,380`, `PersonaDetailPanel.tsx:151`, `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx:4750-4754` → leen `p.especialidadPrincipal`/`v.persona.especialidadPrincipal` del DTO. Son consumos del contrato, no de la columna; no lanzan error. (Su valor correcto depende de que el backend lo derive bien — por eso B.1 impacta el wizard.)

Conclusión: no hay `PrismaClientValidationError` latente por este tema.

---

## 5. Relación con los mensajes del usuario

- **Mensajes #1 y #2 (SQL de reapertura):** operación de datos sobre `ocupaciones`/`personas`/`cargos` para reabrir ocupaciones cerradas por error y reactivar personas/cargos. Es corrección de datos, no de código, y ya la ejecutó el usuario. Fuera del alcance de esta auditoría de especialidad.
- **Mensaje #3 ("No se pudo completar la operación" al aprobar el padrón):** no está causado por un uso de especialidad ni por la columna eliminada (ver §4). Si el error persiste, hay que mirar la ruta de aprobación del snapshot (`aprobarSnapshotService` en `padron.service.ts`) por otra causa (p. ej. la reapertura/cierre de ocupaciones), no por `especialidad`.
- **Mensaje #4 ("que use la correcta no la vieja"):** se corresponde directamente con **B.1** (y secundariamente B.2–B.6). El módulo CPH que ve el usuario toma la especialidad de la query de ocupaciones que lee solo `especialidad_legacy`.

---

## 6. Lista final priorizada de cambios

1. **[ALTA] `concursos-cph.service.ts` — query de ocupaciones (línea 1268).** Agregar `LEFT JOIN especialidades_puesto` y usar `COALESCE(ep.nombre, c.especialidad_legacy)` para: validación (`especialidadCoincideOcup`, 1297), derivación de `especialidadPrincipal` (1319-1322) y resumen al front (`toResumen`, 1308). Ajustar `OcupacionResumen` en `packages/types/src/index.ts:1090` para exponer el valor resuelto. Es el fix que resuelve la queja del usuario.
2. **[MEDIA] `cargos.service.ts` + 3 páginas del front (B.5).** Incluir `especialidadPuesto` en `listCargosService` y `getCargoByIdService`; cambiar `CargosPage.tsx` (208, 402), `CargoDetailPanel.tsx` (56-57, 92, 94) y `NuevaBajaPage.tsx` (110, 189) a `especialidadPuesto?.nombre ?? especialidadLegacy`.
3. **[MEDIA] `inscriptos.service.ts` — OM confirmada (B.2, línea 435).** Ampliar include a `cargo.especialidadPuesto` y preferir el catálogo antes de persistir `OrdenMerito.especialidad`.
4. **[MEDIA] `inscriptos.service.ts` — reservar integrante (B.3, línea 601).** Mismo include + expresión del catálogo en el chequeo de compatibilidad.
5. **[MEDIA] Selects de OM/jurado vigentes (B.4): `inscriptos.service.ts:538` y `sorteoJurado.service.ts:848`.** Agregar `especialidadPuesto` al select y que el front lo prefiera.
6. **[BAJA] `exportConcursoDocs.ts:254` (caso CEETPS, B.6).** Verificar el payload de concursos-ceetps y homogeneizar al patrón del catálogo si aplica.

Fuera de alcance (no es bug de especialidad): investigar el error de aprobación del padrón del mensaje #3 por el lado de reapertura/cierre de ocupaciones.

---

Nota de método: la verificación se hizo por lectura directa de los archivos citados (no por grep aislado). No se ejecutaron builds ni tests por tratarse de una auditoría de solo lectura. Para validar los fixes, los comandos del proyecto son los de la raíz del monorepo (pnpm + turbo); correr los tests unitarios de los módulos tocados (p. ej. `apps/api/src/__tests__/padron.unit.test.ts` ya referencia `especialidadLegacy`).
