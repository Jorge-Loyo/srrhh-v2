# CEETPS: asignación de jurado, pasos del concurso y Etapa 5 — Plan de implementación

> **Para quien ejecute:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** en el wizard de concursos CEETPS, reemplazar el sorteo de jurado por una asignación manual, registrar los pasos del proceso concursal (inscripción → admisibilidad → examen → análisis curricular → entrevista → orden de mérito) y rehacer los campos de la Etapa 5 (Designación).

**Arquitectura:** CEETPS pasa a tener sus propias tablas y endpoints (hoy el wizard CEETPS es una copia del CPH que descarta todo campo que `concursos_ceetps` no tiene, y las acciones de jurado/inscriptos son stubs "no disponible" en `useCeetpsWizard.ts`). Backend: columnas nuevas en `ConcursoCeetps` + dos tablas (`miembros_jurado_ceetps`, `inscriptos_ceetps`) + endpoints bajo `/api/v1/concursos-ceetps/:id`. Frontend: tres componentes nuevos en `concursos-ceetps/components/` que reemplazan los bloques CPH dentro de `ConcursoCeetpsWizard.tsx`. El wizard CPH no se toca.

**Stack:** Fastify 5, Prisma 5.22 + PostgreSQL, Zod, Vitest; React 18, TanStack Query, Tailwind.

**Spec:** pedido de Agustín del 2026-11-17 (conversación, sin documento aparte); queda resumido en "Requisitos acordados".

## Requisitos acordados

1. **Jurado:** se quita el sorteo. Primero se define cuántos **titulares** y cuántos **suplentes**; recién después se buscan personas (búsqueda completa del proyecto, incluido CUIL) entre quienes tienen **cargo vigente, activo y ocupado**, y se asignan hasta completar los lugares.
2. **Pasos del concurso** (orden fijo): Inscripción → Admisibilidad → Examen escrito → Análisis curricular → Entrevista → Orden de mérito final. Cada paso muestra a quienes **pasaron el anterior**, trae lo cargado y es **editable durante todo el concurso**. Cada paso exige un **puntaje mínimo** que fija el jurado (a nivel concurso).
3. **Orden de mérito final:** lo carga el jurado a mano.
4. **Reclamos** (admisibilidad y nota de examen): se registran (hubo reclamo + resultado) y además la nota/admisión se puede editar.
5. **Cronograma:** se cargan todas las fechas del cronograma del proceso (18 hitos, ver Task 1).
6. **Etapa 5:** sacar "Fecha ITE"; "Carga de documentación" va primero; renombres y campos nuevos según Task 3. Los campos del pedido que se repiten ("Resolución a la firma", "Fecha de resolución") quedan **una sola vez**. La selección Trámite a Distancia / Proyecto de Resolución (GENE1303) y sus ramas se dejan **para el final** (Task 9, bloqueada).
7. **Solo CEETPS.**

## Restricciones globales

- No tocar archivos de `modules/concursos-cph/` (backend ni frontend).
- Escrituras de CEETPS: `requirePermiso({ modulo: 'concursos-ceetps', accion: 'editar' })`, igual que el PATCH actual. Lecturas: solo `authenticate`.
- Toda escritura nueva responde 409 si el concurso está `finalizado`/`desierto` (mismo criterio que `patchConcursoCeetpsService`) o si `esNuevoCargoSinAutorizar(concurso)` (mismo bloqueo de Etapa 2+ que ya existe, mensaje `MENSAJE_BLOQUEO_ETAPA_2`).
- Fechas como `YYYY-MM-DD` (regex `fecha` de `concursos-ceetps.schema.ts`). Textos en español rioplatense, como el resto de la UI.
- Migración nueva con timestamp posterior a `20261117000001`. La API corre en Docker sin bind mount: tras tocar backend, `docker compose up -d --build api` (vía WSL) antes de probar en la UI.
- **No commitear sin que Agustín lo pida.** Los pasos "Commit" se ejecutan solo con su OK; mensajes en español, estilo `feat(ceetps): ...`, terminados con la línea de atribución vigente.
- Verificación estándar: `pnpm --filter @srrhh/api exec tsc --noEmit` (el API ya arrastra errores previos: no deben aparecer nuevos), `pnpm --filter @srrhh/web exec tsc --noEmit`, `pnpm --filter @srrhh/web exec vitest run`.

## Revisión: casos que el pedido no menciona

1. Misma persona asignada dos veces al jurado (como titular y suplente, o repetida) → 409.
2. Bajar las cantidades de titulares/suplentes por debajo de los miembros ya asignados → 409.
3. Nota exactamente igual al mínimo **pasa** (`>=`); sin mínimo configurado, pasa.
4. Orden de mérito duplicado en el concurso, o asignado a alguien que no es finalista → 409.
5. Escrituras sobre concurso `finalizado`/`desierto` o cargo nuevo sin autorizar → 409.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` + migración `20261118000000_ceetps_jurado_inscriptos_etapa5` | columnas nuevas de `ConcursoCeetps`, tablas `MiembroJuradoCeetps` e `InscriptoCeetps` |
| `packages/types/src/index.ts` | DTOs y constante `CRONOGRAMA_CEETPS_PASOS` |
| `apps/api/src/modules/concursos-ceetps/concursos-ceetps.schema.ts` / `.service.ts` | campos nuevos del PATCH |
| `apps/api/src/modules/concursos-ceetps/jurado.service.ts` / `jurado.schema.ts` (nuevos) | asignación de jurado |
| `apps/api/src/modules/concursos-ceetps/inscriptos.service.ts` / `inscriptos.schema.ts` / `inscriptos.calc.ts` (nuevos) | inscriptos, pasos y flags de "pasó" |
| `apps/api/src/modules/concursos-ceetps/concursos-ceetps.routes.ts` | rutas nuevas |
| `apps/api/src/modules/personas/personas.schema.ts` / `.service.ts` | filtro `conCargoVigente` |
| `apps/web/src/modules/concursos-ceetps/lib/designacionCampos.ts`, `juradoCeetps.ts`, `inscriptosCeetps.ts` (nuevos) | lógica pura testeable |
| `apps/web/src/modules/concursos-ceetps/components/JuradoAsignacionPanel.tsx`, `InscriptosCeetpsPanel.tsx`, `CronogramaCeetps.tsx` (nuevos) | UI |
| `apps/web/src/modules/concursos-ceetps/hooks/useCeetpsWizard.ts`, `lib/ceetpsComoCph.ts`, `pages/ConcursoCeetpsWizard.tsx` | integración |

---

### Task 1: Modelo de datos, migración y tipos compartidos

**Files:**
- Modify: `prisma/schema.prisma` (modelo `ConcursoCeetps`, líneas ~1190-1250; relaciones en `Persona`)
- Create: `prisma/migrations/20261118000000_ceetps_jurado_inscriptos_etapa5/migration.sql` (generada)
- Modify: `packages/types/src/index.ts` (interfaz `ConcursoCeetps`, línea ~542)

**Interfaces:**
- Produces (columnas nuevas de `ConcursoCeetps`, todas opcionales salvo aclaración): `cargaDocumentacion Boolean?`, `tramiteDesignacion String? @db.VarChar(10)` (`'tad'|'gene1303'`), `fechaAptoMedico Date?`, `fechaDispoDesignacion Date?`, `resolucionConvalidacion String? @db.VarChar(500)`, `proyectoResolucion Boolean?`, `resoALaFirma Boolean?`, `fechaResolucion Date?`, `juradoCantTitulares Int?`, `juradoCantSuplentes Int?`, `puntajeMinimoExamen Float?`, `puntajeMinimoCv Float?`, `puntajeMinimoEntrevista Float?`, `cronograma Json @default("{}") @db.JsonB`. (`dispoDesignacion` ya existe y se reutiliza para "Disposición de designación".)
- Produces (tablas, mapeadas a `miembros_jurado_ceetps` e `inscriptos_ceetps`, `onDelete: Cascade` desde `ConcursoCeetps`):
  - `MiembroJuradoCeetps { id, concursoCeetpsId, personaId, rol('titular'|'suplente'), orden Int, apellidoNombre, cuil(VarChar 11), hospitalNombre?, puesto?, createdAt; @@unique([concursoCeetpsId, personaId]) }`
  - `InscriptoCeetps { id, concursoCeetpsId, apellido, nombre, dni?, cuil?, email?, telefono?, observaciones?, entregoDocumentacion Boolean @default(false), admitido Boolean?, motivoNoAdmision?, reclamoAdmisibilidad Boolean @default(false), resultadoReclamoAdmisibilidad?, presentoExamen Boolean @default(false), notaExamen Float?, reclamoExamen Boolean @default(false), resultadoReclamoExamen?, puntajeCv Float?, puntajeEntrevista Float?, ordenMerito Int?, createdAt, updatedAt; @@index([concursoCeetpsId]) }`
- Produces en `@srrhh/types`: `export const CRONOGRAMA_CEETPS_PASOS: { key: string; label: string }[]` con las 18 claves, en este orden: `publicacion_normativa`, `inscripcion_desde`, `inscripcion_hasta`, `analisis_admisibilidad`, `comunicacion_admitidos`, `reclamos_admisibilidad`, `respuesta_jurado_admisibilidad`, `examen`, `comunicacion_resultado_examen`, `reclamos_nota_examen`, `respuesta_jurado_examen`, `analisis_curricular`, `comunicacion_resultado_cv`, `comunicacion_resultado_reclamos`, `entrevistas_desde`, `entrevistas_hasta`, `comunicacion_orden_merito`, `adjudicacion_cargos` (labels = las filas del cronograma de ejemplo, p. ej. "Publicación normativa concurso en web", "Análisis de admisibilidad"); `type ClaveCronogramaCeetps`; y los DTOs `MiembroJuradoCeetpsDto`, `JuradoCeetpsDto { cantTitulares: number|null; cantSuplentes: number|null; miembros: MiembroJuradoCeetpsDto[] }`, `InscriptoCeetpsDto` (columnas de arriba + `pasaAdmision: boolean|null`, `pasaExamen: boolean|null`, `pasaCv: boolean|null`, `pasaEntrevista: boolean|null`, `finalista: boolean`). `ConcursoCeetps` suma las columnas nuevas; las fechas llegan como `string | null`.

- [ ] **Step 1:** Agregar columnas y modelos al schema y las relaciones inversas (`ConcursoCeetps.miembrosJurado`, `.inscriptos`; `Persona.miembrosJuradoCeetps`).
- [ ] **Step 2:** Generar la migración con `pnpm db:migrate -- --name ceetps_jurado_inscriptos_etapa5` (Postgres local levantado, ver `Doc/Desarrollo/ARRANQUE_LOCAL.md`). Esperado: carpeta nueva con solo `ALTER TABLE ... ADD COLUMN` y dos `CREATE TABLE`; ningún `DROP`.
- [ ] **Step 3:** Agregar a `packages/types/src/index.ts` la constante, los DTOs y los campos nuevos de `ConcursoCeetps`.
- [ ] **Step 4:** Verificar: `pnpm db:generate` y `pnpm --filter @srrhh/api exec tsc --noEmit`. Esperado: sin errores nuevos.
- [ ] **Step 5: Commit** — `feat(ceetps): modelo de datos para jurado, inscriptos y etapa 5`.

---

### Task 2: PATCH de CEETPS acepta los campos nuevos

**Files:**
- Modify: `apps/api/src/modules/concursos-ceetps/concursos-ceetps.schema.ts` (`patchConcursoCeetpsSchema`)
- Modify: `apps/api/src/modules/concursos-ceetps/concursos-ceetps.service.ts` (set `CAMPOS_FECHA`)
- Modify: `apps/api/src/modules/concursos-ceetps/autorizacionNuevoCargo.ts:17-50` (`CAMPOS_ETAPA_2_EN_ADELANTE_CEETPS`)
- Test: `apps/api/src/__tests__/concursos-ceetps-etapa5.unit.test.ts` (nuevo; mismo esquema de mocks que `concursos-ceetps-autorizacion.unit.test.ts`)

**Interfaces:**
- Produces: `patchConcursoCeetpsSchema` suma `cargaDocumentacion`, `proyectoResolucion`, `resoALaFirma` (`boolean().nullable()`); `tramiteDesignacion` (`enum(['tad','gene1303']).nullable()`); `fechaAptoMedico`, `fechaDispoDesignacion`, `fechaResolucion` (`fecha.nullable()`); `resolucionConvalidacion` (`string().trim().max(500).nullable()`); `puntajeMinimoExamen|Cv|Entrevista` (`number().min(0).nullable()`); `cronograma` (`z.record(z.enum(claves de CRONOGRAMA_CEETPS_PASOS), fecha.nullable())`). `juradoCant*` **no** entra al PATCH (tienen endpoint propio, Task 4).

- [ ] **Step 1: Test que falla** — en el archivo nuevo:
  - `acepta los campos nuevos de etapa 5`: `patchConcursoCeetpsSchema.parse({ tramiteDesignacion: 'gene1303', fechaAptoMedico: '2026-11-01', resolucionConvalidacion: 'RESFC-1', resoALaFirma: true })` no lanza.
  - `rechaza fechaIte y juradoCantTitulares` (schema `.strict()`): ambos lanzan.
  - `rechaza tramiteDesignacion fuera de tad/gene1303` y `rechaza clave de cronograma desconocida`.
  - `convierte fechaResolucion a Date al guardar`: con el prisma mockeado (patrón del test existente), `patchConcursoCeetpsService(id, { fechaResolucion: '2026-11-02' }, 'u1')` llama a `concursoCeetps.update` con `data.fechaResolucion instanceof Date`.
  - `cargo nuevo sin autorizar: cambiar tramiteDesignacion devuelve 409` (usa `validarBloqueoEtapa2Ceetps`).
- [ ] **Step 2:** Correr `pnpm --filter @srrhh/api exec vitest run src/__tests__/concursos-ceetps-etapa5.unit.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Agregar los campos al schema; sumar `fechaAptoMedico`, `fechaDispoDesignacion`, `fechaResolucion` a `CAMPOS_FECHA`; sumar todos los campos de Etapa 5 y los de jurado/pasos a `CAMPOS_ETAPA_2_EN_ADELANTE_CEETPS` (el cronograma, los puntajes mínimos y la Etapa 5 son Etapa 2+).
- [ ] **Step 4:** Correr el test de nuevo y también `concursos-ceetps-autorizacion.unit.test.ts`, `concursosCeetps.calc.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commit** — `feat(ceetps): el PATCH acepta campos de etapa 5, mínimos y cronograma`.

---

### Task 3: Etapa 5 en el wizard (campos, orden, renombres, sin ITE)

**Files:**
- Create: `apps/web/src/modules/concursos-ceetps/lib/designacionCampos.ts`
- Modify: `apps/web/src/modules/concursos-ceetps/lib/ceetpsComoCph.ts` (`CAMPOS_CPH_A_CEETPS` y `ceetpsComoCph`)
- Modify: `apps/web/src/modules/concursos-ceetps/pages/ConcursoCeetpsWizard.tsx` (etapa `designacion`, líneas ~544-605; bloque `SUB_IDX` de faltantes, líneas ~3336-3375; estado inicial de la etapa 5, línea ~804)
- Test: `apps/web/src/modules/concursos-ceetps/lib/designacionCampos.test.ts`, `lib/ceetpsComoCph.test.ts` (ya existe, ampliar)

**Interfaces:**
- Produces: `export function camposDesignacion(v: (k: string) => string, vb: (k: string) => boolean): CampoEtapa[]` donde `CampoEtapa = { key: string; label: string; tipo: 'texto' | 'fecha' | 'checkbox'; valor: string | boolean }` (copiar la forma que hoy usa el array `campos` del wizard).
- Orden y etiquetas exactos (key → label): `cargaDocumentacion` → "Carga de documentación" (checkbox, **primero**); `eeDesignacion` → "EE de designación (TAD)"; `fechaAptoMedico` → "Fecha apto médico"; `dispoDesignacion` → "Disposición de designación (DI / RESOL)" (texto); `fechaDispoDesignacion` → "Fecha de disposición"; `resolucionConvalidacion` → "Resolución de convalidación (RESOL / RESFC)" (texto); `proyectoResolucion` → "Designación a la firma" (checkbox; antes "Proyecto de resolución"); `resolucionDesignacion` → "Resolución de designación"; `fechaResolucion` → "Fecha de resolución"; `resoALaFirma` → "Resolución a la firma" (checkbox; antes "Reso a la firma"); `cargoSial` → "Cargo SIAL (alta)". **No** existe `fechaIte`.

- [ ] **Step 1: Test que falla** — `designacionCampos.test.ts`: `devuelve las keys en el orden pedido` (assert sobre el array de keys anterior), `no incluye fechaIte`, `renombra proyectoResolucion y resoALaFirma` (labels exactos), `cargaDocumentacion es el primero`. En `ceetpsComoCph.test.ts`: `ceetpsComoCph lee los campos de etapa 5` (cargaDocumentacion, fechaAptoMedico, fechaResolucion, resoALaFirma, proyectoResolucion, dispoDesignacion, fechaDispoDesignacion, resolucionConvalidacion, tramiteDesignacion llegan al objeto) y `cphPatchACeetps ya no descarta esos campos` (`descartados` vacío).
- [ ] **Step 2:** `pnpm --filter @srrhh/web exec vitest run src/modules/concursos-ceetps`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `camposDesignacion`; en el adaptador, agregar a `CAMPOS_CPH_A_CEETPS` los 9 campos (misma key a ambos lados) y poblarlos en `ceetpsComoCph` en lugar de los `null` fijos (`cargaDocumentacion`, `fechaAptoMedico`, `proyectoResolucion`, `resoALaFirma`, `fechaResolucion`; `fechaIte` queda `null`).
- [ ] **Step 4:** En el wizard: la etapa `designacion` usa `camposDesignacion(v, vb)`; descripción nueva "TAD, documentación, apto médico, disposición y resolución de designación."; agregar al estado inicial de la Etapa 5 (línea ~804) las keys nuevas y quitar `fechaIte`; en el bloque `SUB_IDX` borrar la línea de "Fecha ITE" y renombrar los textos "Proyecto de resolución" → "Designación a la firma" y "Reso a la firma" → "Resolución a la firma". No hay un encabezado "Pasos para designación" en el wizard hoy: la lista de campos de la etapa es esa sección.
- [ ] **Step 5:** Correr los tests del Step 2 y `pnpm --filter @srrhh/web exec tsc --noEmit`. Esperado: PASS / sin errores.
- [ ] **Step 6: Commit** — `feat(ceetps): etapa 5 sin ITE, con campos de disposición y convalidación`.

---

### Task 4: Backend de asignación de jurado + filtro de personas con cargo vigente

**Files:**
- Modify: `apps/api/src/modules/personas/personas.schema.ts`, `personas.service.ts` (filtro `conCargoVigente`)
- Create: `apps/api/src/modules/concursos-ceetps/jurado.schema.ts`, `jurado.service.ts`
- Modify: `apps/api/src/modules/concursos-ceetps/concursos-ceetps.routes.ts`
- Test: `apps/api/src/__tests__/jurado-ceetps.unit.test.ts`

**Interfaces:**
- Produces (personas): query param `conCargoVigente` (`'true'|'false'`, mismo parseo que `activo`). Con `true` agrega `EXISTS (SELECT 1 FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id WHERE o.persona_id = p.id AND o.hasta IS NULL AND c.deleted_at IS NULL)` y `p.activo = true`. Si `Cargo` tiene un campo de estado propio (activo/estado), incluirlo en la condición y en `personaElegibleParaJurado`.
- Produces (servicio): `getJuradoCeetpsService(concursoId): Promise<JuradoCeetpsDto>`; `setCantidadesJuradoService(concursoId, { cantTitulares: number; cantSuplentes: number }): Promise<JuradoCeetpsDto>` (`cantTitulares >= 1`, `cantSuplentes >= 0`); `agregarMiembroJuradoService(concursoId, { personaId: string; rol: 'titular'|'suplente' }): Promise<JuradoCeetpsDto>`; `quitarMiembroJuradoService(concursoId, miembroId): Promise<JuradoCeetpsDto>`; `personaElegibleParaJurado(personaId): Promise<boolean>`.
- Produces (rutas, bajo `/api/v1/concursos-ceetps`): `GET /:id/jurado`, `PUT /:id/jurado/cantidades`, `POST /:id/jurado/miembros`, `DELETE /:id/jurado/miembros/:miembroId` (escrituras con `WRITE_PERMISO`). Cada escritura aplica las restricciones globales de 409.
- Reglas: no se agrega miembro hasta que las cantidades estén definidas; no se supera la cantidad del rol (409); persona repetida (en cualquier rol) → 409; persona no elegible → 409; `orden` = siguiente libre dentro del rol; `apellidoNombre`, `cuil`, `hospitalNombre`, `puesto` se congelan desde la persona y su ocupación vigente al asignar.

- [ ] **Step 1: Test que falla** (`jurado-ceetps.unit.test.ts`, prisma mockeado como en los otros tests de CEETPS): `agrega titular elegible y devuelve el jurado`; `409 si la persona ya está en el jurado (titular y luego suplente)`; `409 si no hay cantidades definidas`; `409 si el rol ya está completo`; `409 si la persona no tiene cargo vigente`; `409 al bajar cantidades por debajo de los asignados`; `409 en concurso finalizado`; `409 en nuevo cargo sin autorizar`; `quitar miembro reordena el orden del rol`.
- [ ] **Step 2:** Correr `pnpm --filter @srrhh/api exec vitest run src/__tests__/jurado-ceetps.unit.test.ts`. Esperado: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar schemas Zod, servicio y rutas; agregar `conCargoVigente` a personas (la condición va junto a `soloJefes`, mismo estilo `Prisma.sql`). Agregar un test en `personas` (o ampliar el existente de `personas.service`) que verifique que la query con `conCargoVigente=true` incluye la cláusula `o.hasta IS NULL`.
- [ ] **Step 4:** Correr el test nuevo y `pnpm --filter @srrhh/api exec vitest run` (suite completa). Esperado: PASS salvo las 3 fallas de limpieza ya conocidas.
- [ ] **Step 5: Commit** — `feat(ceetps): asignación manual de jurado y filtro de personas con cargo vigente`.

---

### Task 5: Frontend de asignación de jurado (reemplaza el sorteo)

**Files:**
- Create: `apps/web/src/modules/concursos-ceetps/lib/juradoCeetps.ts` (+ `juradoCeetps.test.ts`), `components/JuradoAsignacionPanel.tsx`
- Modify: `apps/web/src/modules/concursos-ceetps/hooks/useCeetpsWizard.ts`
- Modify: `apps/web/src/modules/personas/hooks/usePersonas.ts` y el tipo `PersonaFilters` en `@srrhh/types` (agregar `conCargoVigente?: boolean`)
- Modify: `apps/web/src/modules/concursos-ceetps/pages/ConcursoCeetpsWizard.tsx`

**Interfaces:**
- Produces (lib): `juradoCompleto(j: JuradoCeetpsDto | null | undefined): boolean` (cantidades definidas y miembros por rol == cantidad); `faltantesJurado(j): string[]` (mensajes tipo "Faltan 1 titular"; `[]` si completo).
- Produces (hooks): `useJuradoCeetps(id)`, `useGuardarCantidadesJuradoCeetps(id)`, `useAgregarMiembroJuradoCeetps(id)`, `useQuitarMiembroJuradoCeetps(id)`; todos invalidan `[CEETPS_WIZARD_KEY, id]` y la query del jurado.
- Produces (componente): `JuradoAsignacionPanel({ concursoId, bloqueado }: { concursoId: string; bloqueado: boolean })`. Paso 1: dos inputs numéricos (titulares ≥ 1, suplentes ≥ 0) + "Guardar cantidades". Paso 2 (habilitado solo con cantidades guardadas): buscador sobre `usePersonas({ search, conCargoVigente: true, ... })` reutilizando `shared/components/filtros/FiltrosCatalogo` igual que `PersonasPage`; cada resultado tiene botones "Agregar como titular" / "Agregar como suplente" (deshabilitados si el rol está completo o la persona ya fue asignada). Lista de asignados por rol con botón quitar y contador "2/3 titulares".

- [ ] **Step 1: Test que falla** — `juradoCeetps.test.ts`: `null no está completo`; `sin cantidades no está completo`; `2/2 titulares y 1/1 suplente es completo`; `faltantesJurado devuelve "Faltan 1 suplente"` con un suplente sin asignar.
- [ ] **Step 2:** `pnpm --filter @srrhh/web exec vitest run src/modules/concursos-ceetps/lib/juradoCeetps.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar lib, hooks (en `useCeetpsWizard.ts`, reemplazando los stubs `useJuradoCph`/`useJuradosVigentes` y las acciones de sorteo; el wizard deja de importarlos) y el componente.
- [ ] **Step 4:** En el wizard: borrar el modal de criterios de sorteo (bloque `modalGenerarSorteo`, ~líneas 1671-1960), el estado y mutaciones del sorteo (~690-780), el bloque de render del jurado sorteado (el que usa `juradoData`, ~4200-4520) y el botón de PDF del jurado (`exportJuradoPdf`, ~3470); en su lugar montar `<JuradoAsignacionPanel>` en la Etapa 2. Reemplazar `juradoConfirmado` por `juradoCompleto(juradoData)` en `etapa2Completa` (~línea 331) y el faltante "Confirmar el sorteo de jurado" (~1426) por `...faltantesJurado(juradoData)`. Quitar el campo `sorteoJurado` de la etapa 2 y la línea "Sorteo de jurado" del bloque `SUB_IDX`; actualizar la descripción de la etapa ("Autorización por DGAYDRH, asignación de jurado y disposición de llamado.") y los textos de `ceetpsComoCph.ts` / `concursosCeetps.calc.ts` que dicen "sorteo". Dejar que `tsc` guíe el resto de referencias huérfanas.
- [ ] **Step 5:** Correr el test del Step 1, `tsc --noEmit` y `vitest run` de web. Esperado: PASS / sin errores nuevos.
- [ ] **Step 6: Commit** — `feat(ceetps): asignación manual de jurado en la etapa 2`.

---

### Task 6: Backend de inscriptos y pasos del concurso

**Files:**
- Create: `apps/api/src/modules/concursos-ceetps/inscriptos.calc.ts`, `inscriptos.schema.ts`, `inscriptos.service.ts`
- Modify: `apps/api/src/modules/concursos-ceetps/concursos-ceetps.routes.ts`
- Test: `apps/api/src/__tests__/inscriptos-ceetps.calc.test.ts`, `apps/api/src/__tests__/inscriptos-ceetps.unit.test.ts`

**Interfaces:**
- Produces (calc, función pura): `evaluarPasos(i: { admitido: boolean|null; presentoExamen: boolean; notaExamen: number|null; puntajeCv: number|null; puntajeEntrevista: number|null }, minimos: { examen: number|null; cv: number|null; entrevista: number|null }): { pasaAdmision: boolean|null; pasaExamen: boolean|null; pasaCv: boolean|null; pasaEntrevista: boolean|null; finalista: boolean }`. Reglas: `pasaAdmision = admitido`; cada paso siguiente es `null` si el anterior no es `true` o si falta el dato (para examen: `!presentoExamen` o nota `null`); si el dato existe, `pasa = mínimo == null || dato >= mínimo`; `finalista = pasaEntrevista === true`.
- Produces (servicio): `listInscriptosCeetpsService(concursoId): Promise<InscriptoCeetpsDto[]>` (orden apellido, nombre; con flags de `evaluarPasos` usando los mínimos del concurso); `createInscriptoCeetpsService(concursoId, body)`; `updateInscriptoCeetpsService(concursoId, inscriptoId, body)`; `deleteInscriptoCeetpsService(concursoId, inscriptoId)`.
- Produces (rutas): `GET /:id/inscriptos`, `POST /:id/inscriptos`, `PATCH /:id/inscriptos/:inscriptoId`, `DELETE /:id/inscriptos/:inscriptoId`. `body` del POST exige `apellido` y `nombre`; el PATCH acepta cualquier columna editable (`.partial().strict()`); puntajes `>= 0`; `ordenMerito` entero `>= 1`.
- Reglas: `ordenMerito` repetido en el concurso → 409; `ordenMerito` sobre alguien que no es `finalista` → 409; las demás escrituras son siempre posibles (el flag `pasa*` se recalcula al listar, así editar un paso anterior no deja a nadie con resultados "colgados"). Mismas restricciones globales de 409.

- [ ] **Step 1: Tests que fallan.** `inscriptos-ceetps.calc.test.ts`: `no admitido corta la cadena (todo null, finalista false)`; `nota igual al mínimo pasa`; `sin mínimo configurado pasa`; `no presentó examen => pasaExamen null`; `pasó examen sin puntaje de CV => pasaCv null`; `finalista solo con los tres pasos aprobados`; `admitido vuelto a false anula pasaExamen aunque tenga nota`. `inscriptos-ceetps.unit.test.ts` (prisma mockeado): `alta devuelve el inscripto con flags`; `409 por ordenMerito duplicado`; `409 por ordenMerito a un no finalista`; `409 en concurso desierto`; `409 en nuevo cargo sin autorizar`; `404 si el inscripto es de otro concurso`.
- [ ] **Step 2:** `pnpm --filter @srrhh/api exec vitest run src/__tests__/inscriptos-ceetps`. Esperado: FAIL.
- [ ] **Step 3:** Implementar calc, schema, servicio y rutas.
- [ ] **Step 4:** Correr los tests nuevos y la suite completa del API. Esperado: PASS salvo las 3 fallas conocidas.
- [ ] **Step 5: Commit** — `feat(ceetps): inscriptos y pasos del concurso con puntaje mínimo`.

---

### Task 7: Frontend de pasos, mínimos y cronograma (Etapa 3)

**Files:**
- Create: `apps/web/src/modules/concursos-ceetps/lib/inscriptosCeetps.ts` (+ `inscriptosCeetps.test.ts`), `components/InscriptosCeetpsPanel.tsx`, `components/CronogramaCeetps.tsx`
- Modify: `apps/web/src/modules/concursos-ceetps/hooks/useCeetpsWizard.ts`
- Modify: `apps/web/src/modules/concursos-ceetps/lib/ceetpsComoCph.ts` (exponer `cronograma` y mínimos)
- Modify: `apps/web/src/modules/concursos-ceetps/pages/ConcursoCeetpsWizard.tsx`

**Interfaces:**
- Produces (lib): `type PasoCeetps = 'inscripcion' | 'admisibilidad' | 'examen' | 'cv' | 'entrevista' | 'orden'`; `inscriptosDelPaso(items: InscriptoCeetpsDto[], paso: PasoCeetps): InscriptoCeetpsDto[]` (inscripción: todos; admisibilidad: todos; examen: `pasaAdmision === true`; cv: `pasaExamen === true`; entrevista: `pasaCv === true`; orden: `finalista`); `ordenMeritoCompleto(items): boolean` (hay al menos un finalista y todos tienen `ordenMerito`); `faltantesEtapa3(items): string[]` (mensajes "No hay finalistas" / "Falta orden de mérito de N finalista(s)").
- Produces (hooks): `useInscriptosCeetps(id)`, `useCrearInscriptoCeetps(id)`, `useActualizarInscriptoCeetps(id)`, `useEliminarInscriptoCeetps(id)`, `usePatchConcursoCeetps(id)` (PATCH directo para mínimos y cronograma; invalida `[CEETPS_WIZARD_KEY, id]`). Reemplazan los stubs de inscriptos de `useCeetpsWizard.ts`.
- Produces (componentes): `InscriptosCeetpsPanel({ concursoId, bloqueado })` con una pestaña por paso; cada pestaña lista `inscriptosDelPaso` con celdas editables en línea: Inscripción (datos personales, ¿entregó documentación?), Admisibilidad (admitido sí/no/pendiente + motivo, ¿reclamo? + resultado), Examen (presente + nota, ¿reclamo? + resultado), Análisis curricular (puntaje), Entrevista (puntaje), Orden de mérito final (posición, solo finalistas); en las pestañas con mínimo (Examen, CV, Entrevista) un input "Puntaje mínimo" que guarda con `usePatchConcursoCeetps`; cada fila marca visualmente aprobó/no aprobó. `CronogramaCeetps({ concursoId, cronograma, bloqueado })`: una fila de fecha por cada entrada de `CRONOGRAMA_CEETPS_PASOS`, guardado con `usePatchConcursoCeetps` enviando el objeto `cronograma` completo.

- [ ] **Step 1: Test que falla** — `inscriptosCeetps.test.ts`: `inscriptosDelPaso('examen') excluye a los no admitidos`; `inscriptosDelPaso('orden') solo devuelve finalistas`; `ordenMeritoCompleto es false sin finalistas`; `ordenMeritoCompleto es false si un finalista no tiene posición`; `faltantesEtapa3 informa cuántos finalistas faltan`.
- [ ] **Step 2:** `pnpm --filter @srrhh/web exec vitest run src/modules/concursos-ceetps/lib/inscriptosCeetps.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar lib, hooks, y los dos componentes.
- [ ] **Step 4:** En el wizard: reemplazar el bloque de render de la Etapa 3 (inscripción/presentados/examen/orden de mérito, ~líneas 4520-5200) por `<InscriptosCeetpsPanel>` + `<CronogramaCeetps>`; la etapa `inscripcion` queda con `campos: []` y `tieneInscripcion = inscriptos.length > 0 || !!cronograma.inscripcion_desde`; el faltante de avance 3→4 (~líneas 1441-1455) pasa a `faltantesEtapa3(inscriptos)`; quitar las mutaciones de publicar examen, confirmar presentados/orden de mérito y cerrar/reabrir inscripción que ya no se usan (guiarse por `tsc`). La Etapa 4 (propuesta INSAL) lee candidatos del orden de mérito: alimentarla con los finalistas ordenados por `ordenMerito` en lugar del cálculo CPH (~líneas 108-125 y 850-870).
- [ ] **Step 5:** Correr el test del Step 1, `tsc --noEmit` y `vitest run` de web. Esperado: PASS / sin errores nuevos.
- [ ] **Step 6: Commit** — `feat(ceetps): pasos del concurso, puntajes mínimos y cronograma en la etapa 3`.

---

### Task 8: Verificación punta a punta y documentación

**Files:**
- Create: `Doc/Planificacion/Sprints/SPRINT_27_ceetps_jurado_y_pasos.md` (convención del proyecto: un archivo por sprint; resumen de lo hecho, decisiones, pendientes)
- Modify: memoria `wizard-ceetps-etapas-srrhh.md` (etapas 2, 3 y 5 adaptadas)

- [ ] **Step 1:** `docker compose up -d --build api` (vía WSL) y `pnpm dev` para la web.
- [ ] **Step 2:** En un concurso CEETPS de prueba, recorrer: definir 2 titulares + 1 suplente; buscar por CUIL una persona con cargo vigente y asignarla; confirmar que una persona sin cargo vigente no aparece; completar el jurado y verificar que la Etapa 2 pasa a completa. Cargar 3 inscriptos, admitir 2, cargar notas (una igual al mínimo, una menor), CV y entrevista, y asignar orden de mérito; confirmar que cada pestaña muestra solo a quienes pasaron el paso anterior y que se puede editar hacia atrás sin errores. Cargar el cronograma y recargar la página (persiste).
- [ ] **Step 3:** Etapa 5: confirmar orden y rótulos de la lista de campos, ausencia de ITE, y que cada campo nuevo persiste al guardar y recargar.
- [ ] **Step 4:** `tsc --noEmit` (api y web) y las suites completas de vitest. Reportar resultados tal cual, incluidas las fallas preexistentes.
- [ ] **Step 5:** Escribir el doc del sprint y actualizar la memoria. Avisar a Jorge que hay una migración nueva para correr en Neon/producción al desplegar.
- [ ] **Step 6: Commit** — `docs(sprints): sprint 27 jurado y pasos del concurso CEETPS`.

---

### Task 9 (BLOQUEADA): Selector Trámite a Distancia / Proyecto de Resolución (GENE1303)

Pendiente de definición de Agustín (se decidió dejarlo para el final). **No ejecutar hasta tener:** qué campos aparecen en cada camino (TAD vs GENE1303) y cuáles son obligatorios.

Lo ya preparado: la columna `tramiteDesignacion` (`'tad' | 'gene1303'`) existe desde Task 1 y el PATCH la acepta desde Task 2. Falta: el selector al inicio de la Etapa 5 (junto a "Carga de documentación"), mostrar/ocultar campos según el camino en `camposDesignacion`, y ajustar el bloque de faltantes. Se planifica con tareas propias (test sobre `camposDesignacion` por camino → implementación) cuando llegue la definición.

## Fuera de alcance

El módulo de Jurados (se hará más adelante), importación de inscriptos por Excel, PDF del jurado, cualquier cambio en CPH, y un segundo "Fecha de resolución" (Agustín lo revisará).
