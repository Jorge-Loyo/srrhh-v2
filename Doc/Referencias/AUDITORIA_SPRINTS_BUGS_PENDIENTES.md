# Auditoría de sprints — bugs pendientes

**Fecha:** 2026-10-06
**Origen:** auditoría completa de los 24 sprints de implementación (00-22, excluyendo Sprint 23 que ya se auditó y cerró en esta misma sesión) contra el código real, disparada por encontrar que Sprint 14 decía "✅ Completado" pero tenía 3 piezas rotas de verdad. Mismo método aplicado a todos: no confiar en el doc, verificar cada tarea marcada ✅ contra el código actual.

Cada bug tiene un número fijo (`BUG-01`, `BUG-02`, ...) para referenciarlo en conversación o en commits. Marcar `[x]` cuando esté arreglado y verificado.

**Actualización 2026-10-06:** tras descartar BUG-01 como falso positivo del agente auditor, se re-verificaron manualmente BUG-02 a BUG-10 (lectura directa de código + consultas contra la BD local viva, sin confiar en los reportes de los agentes). Los 9 se confirman reales — cada uno tiene ahora una nota "✅ re-verificado manualmente" con la evidencia concreta.

---

## 🔴 Críticos — bugs funcionales reales

### ~~BUG-01 — Bajas: el flujo normal no fuerza `estado: 'confirmada'`~~ — FALSO POSITIVO, descartado 2026-10-06
- [x] Revisado — no es un bug, la lógica es correcta
- **Sprint:** 17 (Bajas SGRASV / vinculación padrón)
- **Por qué se descartó:** el hallazgo original del agente auditor miraba solo el `tx.baja.create()` (`bajas.service.ts:628-648`, que en efecto no fuerza `estado` ahí) y concluía que todo caía en el `@default(pendiente)` de Prisma. Se le escapó que la misma función **termina** con un `tx.baja.update({ where: { id: baja.id }, data: { estado: 'confirmada' } })` incondicional (líneas 700-703), salvo un único `return` temprano en la línea 651 cuando `body.estado === 'resolucion_a_la_firma'` (el marcador explícito de borrador).
- **Verificado contra el frontend real** (`apps/web/src/modules/cargos/pages/NuevaBajaPage.tsx`):
  - `mutCrear` (botón real "Registrar baja", flujo completo) → `buildBody()` no manda `estado` → no dispara el `return` temprano → cae en el update final → **confirmada**. Correcto.
  - `mutBorrador` ("Guardar borrador") → manda `estado: 'resolucion_a_la_firma'` explícito → dispara el `return` temprano → queda como borrador, sin tocar el cargo. Correcto.
  - Terminar de editar un borrador (`modoEdicion` + `mutCrear`) → el PATCH manda `estado: 'confirmada'` explícito. Correcto.
- **Conclusión:** la regla de negocio real (SGRASV confirma al registrar; un borrador incompleto queda pendiente) ya está implementada tal cual en los tres caminos. El doc de Sprint 17 estaba bien, el agente auditor leyó la función a medias.

### BUG-02 — Concursos CPH: falta el backstop en BD contra la condición de carrera de duplicados
- [ ] Pendiente
- **Sprint:** 04 (Concursos CPH) — **no es que Sprint 04 nunca lo haya hecho bien**, se perdió después (ver historia completa abajo)
- **Archivos:** `prisma/schema.prisma` (línea ~823-827, comentario que referencia una migración con la ruta vieja), `apps/api/src/modules/concursos-cph/concursos-cph.service.ts:856`
- **Qué pasa hoy:** no existe ningún índice único parcial sobre `concursos_cph.cargo_id` — el guard de aplicación (`findFirst` + `create`, no atómico) es la única defensa contra dos concursos CPH abiertos para el mismo cargo.
- **Impacto:** dos requests concurrentes todavía pueden crear dos concursos CPH abiertos para el mismo cargo — exactamente la regla de negocio central que el guard de aplicación (no atómico) no garantiza por sí solo.
- **✅ Re-verificado manualmente (2026-10-06):** `\di concursos_cph*` contra la BD local viva confirma solo `concursos_cph_concurso_id_key` (FK 1:1 a `Concurso`), `_estado_idx`, `_hospital_id_idx`, `_sub_estado_idx` y la PK — ningún índice único parcial sobre `cargo_id`. Grep de `UNIQUE` en los 10 `migration.sql` reales solo encuentra ese mismo FK 1:1 en `0_init`, nada relacionado a `cargo_id`/`estado`.
- **🔎 Historia completa, reconstruida con `git log`/`git show` a pedido del usuario (2026-10-06)** — el bug es real, pero no por negligencia de Sprint 04:
  1. **Sprint 04** (commit `627ac6e`, 2026-08-26) creó correctamente `prisma/migrations/concurso_cph_unique_abierto/migration.sql`: `CREATE UNIQUE INDEX concursos_cph_cargo_abierto_unique ON concursos_cph (cargo_id) WHERE estado NOT IN ('finalizado', 'desierto')`. Confirmado leyendo el contenido exacto del archivo en ese commit.
  2. **Sprint 20** (commit `5ae38d7`, 2026-09-29) la **renombró** (no la borró) a `20260805010000_concurso_cph_unique_abierto/` como parte de arreglar el orden de migraciones ("dos carpetas sin timestamp mal ordenadas" — mencionado explícitamente en el mensaje del commit). Seguía intacta en este punto.
  3. **La consolidación de migraciones** (commit `f5dc2ca`, 2026-09-29, mismo día: "consolidar historial en baseline limpio 0_init + 0_seed") la perdió por accidente. El propio mensaje del commit dice que `0_init` se regeneró "desde el schema actual" (consistente con el flujo `prisma migrate diff --from-empty --to-schema-datamodel=schema.prisma` que se usa en este proyecto para reconstruir baselines). El problema: **Prisma no puede representar índices únicos parciales en `schema.prisma`** — el propio comentario en el schema ya lo advierte ("Partial unique index (no soportado por Prisma @@unique)"). Como el índice vivía solo como SQL crudo en una migración manual, nunca se capturó al reconstruir el baseline desde el schema declarativo. Confirmado: en el commit padre de la consolidación, el comentario del schema todavía apuntaba a la ruta vieja sin timestamp — ni siquiera se había actualizado tras el rename de Sprint 20, lo que sugiere que nadie volvió a tocar esa zona del schema entre el paso 2 y el paso 3.
  - **Conclusión:** es un efecto colateral de una limpieza de infraestructura (necesaria y bien intencionada — el historial de 84 migraciones estaba roto) que no tuvo en cuenta que algunas migraciones manuales (DDL que Prisma no modela) no sobreviven una reconstrucción "desde el schema". Vale la pena revisar si hay **otras** migraciones manuales de ese estilo que se hayan perdido de la misma forma — no se investigó eso en esta auditoría, solo este caso puntual.
- **Fix propuesto:** crear una migración nueva (no reusar el nombre viejo) con el mismo `CREATE UNIQUE INDEX ... WHERE estado NOT IN (...)`, actualizar el comentario del schema para que apunte a la ruta correcta.

### BUG-03 — Alta de cargo: el selector "¿Reemplaza una baja?" se perdió en un rewrite posterior
- [ ] Pendiente
- **Sprint:** 16 (Flujo vacante → designación)
- **Archivos:** `apps/web/src/modules/cargos/pages/AltaCargosPage.tsx`, `apps/web/src/modules/cargos/pages/BajaCargosPage.tsx`, campo `bajaOrigenId` ya existe en `prisma/schema.prisma:1217` y en `solicitudes-alta.service.ts:62` (backend intacto)
- **Qué pasa hoy:** el selector se implementó en el commit `bb8cc0e` (confirmado con `git show`), pero se eliminó del frontend en un commit posterior durante el rewrite de catálogo de Sprint 20/21 (confirmado con `git log -p --follow` sobre `AltaCargosPage.tsx`, las líneas aparecen borradas). `grep "bajaOrigenId"` sobre todo `apps/web` da cero resultados.
- **Impacto:** el backend sigue aceptando y persistiendo `bajaOrigenId`, pero ninguna UI lo puede enviar — queda `null` siempre en altas nuevas. El vínculo alta↔baja que el sprint resolvió quedó roto de nuevo, sin que nadie lo note (no rompe nada visiblemente, solo no vincula).
- **✅ Re-verificado manualmente (2026-10-06):** `bajaOrigenId` confirmado en `prisma/schema.prisma:1217/1231` y en `solicitudes-alta.schema.ts:21`/`solicitudes-alta.service.ts:62` (backend lo acepta y persiste). Grep de `bajaOrigenId` sobre **todo** `apps/web/src` da cero resultados — ni un solo archivo lo referencia. Tampoco hay rastro de una UI equivalente con otro nombre ("reemplaza", "bajaId", "selectBaja" en `AltaCargosPage.tsx`/`BajaCargosPage.tsx` también dan cero).
- **Fix propuesto:** reconstruir el selector en `AltaCargosPage.tsx` (combo de bajas confirmadas sin alta vinculada) y el link recíproco en `BajaCargosPage.tsx`, reutilizando el campo backend ya existente.

### BUG-04 — Autorización de `baja_cargo`: flujo completo es código muerto
- [ ] Pendiente
- **Sprint:** 15 (Autorización de Baja de Cargo) — superado por Sprint 17, nadie limpió ni actualizó el doc
- **Archivos:** `apps/api/src/modules/autorizaciones/autorizaciones.service.ts` (rama `baja_cargo`, líneas ~371-408 y ~136-149), `apps/web/src/modules/autorizaciones/pages/AutorizacionesPage.tsx` (`<ReferenciaBaja>`), `apps/web/src/modules/cargos/pages/BajaCargosPage.tsx:201` (filtro "Pendiente")
- **Qué pasa hoy:** Sprint 17 rediseñó el modelo — "SGRASV ya tiene la potestad, no necesita autorización del director" (comentario explícito en el código) — y las bajas nacen sin pasar por `crearAutorizacion`. La rama entera de aprobar/rechazar `baja_cargo` en `autorizaciones.service.ts`, el componente `ReferenciaBaja`, y el filtro "Pendiente" en `BajaCargosPage.tsx` siguen en el código, compilan, pero son inalcanzables — nunca se genera una `Autorizacion` de ese tipo.
- **Impacto:** no rompe nada activamente (es el modelo viejo, ya reemplazado correctamente), pero es código muerto que confunde a cualquiera que lo lea, y el filtro "Pendiente" en la UI de bajas nunca va a devolver resultados (parece un bug visible aunque no lo sea funcionalmente).
- **✅ Re-verificado manualmente (2026-10-06):** grep de `crearAutorizacion`/`'baja_cargo'` en `bajas.service.ts` y de `baja_cargo` en todo `apps/api/src` (fuera de `autorizaciones.service.ts`) da cero resultados — nada crea una `Autorizacion` de ese tipo. Confirmado además que `EstadoBaja` incluye `pendiente` como valor legítimo del enum (`schema.prisma:1088/1135`) y que `BajaCargosPage.tsx:201` ofrece esa opción en el filtro — pero como ningún código la deja en `pendiente` al confirmar (ver BUG-01, descartado: el flujo real siempre resuelve a `confirmada` o `resolucion_a_la_firma`), ese filtro nunca va a traer una fila.
- **Fix propuesto:** decisión de limpieza — borrar la rama `baja_cargo` de `autorizaciones.service.ts`/`AutorizacionesPage.tsx` y el filtro "Pendiente" de `BajaCargosPage.tsx`, o documentar explícitamente por qué se deja (ej. por si se revierte la decisión de Sprint 17). Pedir decisión antes de tocar.

### BUG-05 — Alta de cargo: validación de duplicados (RF-15) inalcanzable + link roto
- [ ] Pendiente
- **Sprint:** 07 (Trazabilidad alta de cargo) — superado por el rediseño de Sprint 13-D
- **Archivos:** `apps/api/src/modules/cargos/cargos.service.ts:242` (`createCargoService`, código intacto pero sin caller real), `apps/web/src/modules/cargos/pages/BajaCargosPage.tsx:95` (link roto)
- **Qué pasa hoy:**
  1. El flujo real de alta ya no pasa por `POST /api/v1/cargos` (`createCargoService`) sino por `POST /solicitudes-alta` → aprobación de director → `_aprobarAltaCargo()`. La validación de cargo duplicado con `body.forzar` (409 + confirmación) vive en `createCargoService`, que nadie invoca desde el flujo real — es inalcanzable. `_aprobarAltaCargo` no tiene ningún chequeo de duplicados.
  2. El modal "Crear de todos modos / Cancelar" (S7-7) nunca se construyó en el frontend real — ni rastro en `apps/web/src` de ese texto ni de lógica equivalente.
  3. `BajaCargosPage.tsx:95` tiene `<Link to="/cargos/altas">Ver alta →</Link>` pero el router solo define `cargos/alta` (singular) — navega a una ruta inexistente.
- **Impacto:** hoy se puede aprobar una solicitud de alta y generar un cargo duplicado (misma estructura: hospital+escalafón+puesto+especialidad) sin ninguna advertencia — exactamente lo que RF-15 decía resolver.
- **✅ Re-verificado manualmente (2026-10-06):** `createCargoService` solo tiene un caller real: la ruta `POST /api/v1/cargos` (`cargos.routes.ts:34`). Grep de esa ruta en todo `apps/web/src` da cero resultados — nada la invoca. `_aprobarAltaCargo` (líneas 267-320 de `autorizaciones.service.ts`) no tiene ningún `findFirst`/chequeo de duplicado en su cuerpo. El link roto se confirmó letra por letra: `BajaCargosPage.tsx:95` usa `/cargos/altas` (plural), el router solo define `cargos/alta` (singular, línea 143) y `cargos/alta-por-baja` — y no hay ninguna ruta catch-all (`path: '*'`) en `router.tsx`, así que el click deja la pantalla en blanco, no un 404 amigable.
- **Fix propuesto:** mover la validación de duplicados (o una versión equivalente) a `_aprobarAltaCargo` en `autorizaciones.service.ts`, con su propia UI de confirmación en el modal de aprobación de `AutorizacionesPage.tsx`. Arreglar el link roto (singular `cargos/alta`).

---

## 🟡 Medios

### BUG-06 — Designación CPH: falta búsqueda libre por nombre/CUIL/DNI/ID SIAL
- [ ] Pendiente
- **Sprint:** 18 (Designación CPH: búsqueda + especialidad + ID SIAL Rol)
- **Archivo:** `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx` (estado `designarSearch`, línea 513, nunca conectado a ningún `<input>`)
- **Qué pasa hoy:** el modal "Registrar designación" solo resuelve la persona automáticamente contra el orden de mérito del concurso (por CUIL exacto, línea ~746). Si el candidato no tiene CUIL o no matchea, no hay ningún fallback de búsqueda manual por nombre/DNI/ID SIAL, aunque el backend sí soporta `idSial` como filtro (`personas.service.ts:92-97`).
- **✅ Re-verificado manualmente (2026-10-06):** `designarSearch` se declara en la línea 513 y solo se escribe (`setDesignarSearch`) desde `seleccionarCandidatoOM`/resolución automática (líneas 725, 759, y 3 resets) — nunca desde un `onChange` de input. Leí el JSX completo del modal (líneas 1680-1760): cuando hay candidatos de orden de mérito, solo se listan como botones clicables; cuando no hay ninguno (`elegiblesOM.length === 0`), se muestra un cartel pidiendo calcular el orden de mérito primero — no hay ningún `<input>` de búsqueda libre en ningún estado del modal.
- **Fix propuesto:** agregar un input de búsqueda libre al modal, conectado a `GET /personas` con los filtros que ya soporta el backend.

### BUG-07 — Designación CPH: falta aviso de ID SIAL provisional
- [ ] Pendiente
- **Sprint:** 18 (idem anterior)
- **Archivo:** `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx` (Etapa 5)
- **Qué pasa hoy:** el backend genera un id sintético `MANUAL-{cargoId}-{fecha}` (`concursos-cph.service.ts:752`) cuando no hay ID SIAL real todavía, pero el frontend nunca detecta ese prefijo ni avisa al usuario que es provisional.
- **✅ Re-verificado manualmente (2026-10-06):** confirmado el literal `idSialRol = body.idSialRol ?? \`MANUAL-${cargoId.slice(0,8)}-${body.fechaDesde}\`` en `concursos-cph.service.ts:752`. Grep de `MANUAL-` sobre `ConcursoCphWizard.tsx` (todo el archivo) da cero resultados.
- **Fix propuesto:** mostrar un badge/aviso "⏳ ID SIAL provisional — pendiente de padrón" cuando `cargoSial?.startsWith('MANUAL-')`.

### BUG-08 — `roles_persona` es una tabla fantasma
- [ ] Pendiente
- **Sprint:** 21/22 (histórico de roles por persona)
- **Archivos:** `prisma/schema.prisma:555-568` (modelo existe), `apps/api/src/modules/padron/padron.service.ts` (nunca escribe ahí)
- **Qué pasa hoy:** la tabla está migrada, el pipeline Python del Dotaneitor ya calcula los datos necesarios (`id_sial_legajo`, `nro_rol`) en su salida — pero ningún código Node hace `tx.rolesPersona.create(...)`. Permanece vacía en cualquier entorno, siempre.
- **Impacto:** bajo hoy (nada lee de esta tabla todavía), pero cualquier feature futura que prometa "histórico de roles en la vista de Personas" (como dice el propio doc de Sprint 21) no va a tener datos.
- **✅ Re-verificado manualmente (2026-10-06):** grep de `rolesPersona`/`roles_persona` en todo `apps/api/src` da cero resultados (fuera del propio schema). `SELECT count(*) FROM roles_persona` contra la BD local viva devuelve `0`.
- **Fix propuesto:** decidir si se implementa el consumidor Node ahora o se documenta como deuda técnica explícita, dado que nada depende de esto todavía.

---

## ⚪ Bajos — higiene de documentación, sin impacto funcional

### BUG-09 — Nunca existió CI (GitHub Actions)
- [ ] Pendiente / decisión
- **Sprint:** 00 (S0-11, marcada ✅)
- No hay carpeta `.github/` en ningún commit del historial. Lint/build en PR nunca se automatizó.
- **✅ Re-verificado manualmente (2026-10-06):** `ls .github` → "No such file or directory".

### BUG-10 — Índice GIN para búsqueda de personas nunca se creó
- [ ] Pendiente
- **Sprint:** 03 (S3-11, marcada ✅)
- **Impacto:** la búsqueda funciona (`to_tsvector('spanish_unaccent', ...) @@ to_tsquery(...)`), pero sin índice hace sequential scan sobre las ~45k personas en cada búsqueda. Problema de performance, no de corrección.
- **✅ Re-verificado manualmente (2026-10-06):** `\di personas*` contra la BD local viva solo lista `personas_cuil_key`, `personas_especialidad_cph_idx`, `personas_numero_doc_idx` y la PK — todos btree normales, ningún GIN. Grep de `GIN`/`USING GIN`/`to_tsvector` en los 10 `migration.sql` reales no encuentra ningún `CREATE INDEX` de ese tipo (el único "match" de texto era un falso positivo de "BEGIN").
- **Fix propuesto:** `CREATE INDEX ... USING GIN (to_tsvector('spanish_unaccent', apellido_nombre))` en una migración nueva.

### BUG-11 — Docs desactualizados sin impacto funcional
- [ ] Sin acción necesaria, solo nota
- Sprint 02: describe el modelo `Especialidad`/`Puesto` que Sprint 20 reemplazó correctamente por `PuestoCargo`/`EspecialidadPuesto` — el doc nunca se actualizó pero no hay nada roto.
- Sprint 11: el endpoint `POST /concursos-cph/:id/autorizar` que describe fue reemplazado legítimamente en Sprint 13 — ese sprint sí documenta el borrado, pero el doc de Sprint 11 nunca se actualizó para decirlo.

---

## Sprints verificados sólidos (sin gaps)

00 (auth), 01, 05, 06, 08, 09, 10, 12/13, **17** (gap original descartado, ver nota en BUG-01 — la lógica de confirmación de bajas es correcta), 18-retenciones (cadena R/TTR), 19-designación (estado completo), 19-retenciones (vencimientos/comisión), 20, 21 (con la salvedad de BUG-08), 23 (auditado y cerrado en vivo esta sesión, ver `SPRINT_23_areas_programaticas.md` y la nota de Sprint 14 sobre S14 cerrado el 2026-10-06).
