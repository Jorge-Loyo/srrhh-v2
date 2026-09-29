# SPRINT 20 — Consolidación de catálogo Puesto/Escalafón/Especialidad + limpieza de BD de desarrollo

**Estado:** ✅ Completo, con el pipeline de import de padrón verificado de punta a punta (simulado, sin Excel real) — schema, migración, reset, catálogo curado, backend y frontend (incluido el wizard CPH) listos. Se encontró y arregló en este sprint un bug crítico preexistente que impedía crear `Cargo` para filas del padrón sin CODIGO DE REGISTRO (ver "Notas — hallazgos de este sprint"). Suite de tests backend en verde (226/228, los 2 restantes son deuda de testing preexistente no de este sprint) y build de frontend limpio. Solo queda pendiente un click-through manual en browser real y un Excel real a través del microservicio Dotaneitor — no ejecutables desde este entorno.
**Autores:** Jorge (backend) + Agustín (frontend)
**Depende de:** Sprint 18 — Designación CPH ✅, Sprint 18 — Retenciones ✅, Sprint 19 ✅ (ver "Secuenciación" abajo)
**Precondición de negocio:** la BD actual es de **desarrollo**, sin datos de producción — se autoriza borrarla y arrancar de cero. Este sprint es la última oportunidad de hacerlo antes de que entre información real al sistema.

---

## Objetivo

1. Que **todo** el sistema (backend, frontend, import del padrón, microservicio Dotaneitor) use un único catálogo fuente de verdad para puesto/escalafón/especialidad (`Escalafon` + `PuestoCargo` + `EspecialidadPuesto`, con FK reales), en vez de las ~20 columnas de texto libre paralelas detectadas hoy en el schema.
2. Aprovechar que no hay datos de producción para hacerlo **directo** (FK obligatoria desde el día uno donde corresponda), sin el costoso camino de nullable-FK + backfill + dual-read + drop diferido que sí sería obligatorio con datos reales.
3. Dejar registrado un roadmap de fases posteriores para lo que no entra en este sprint por volumen (ver "Fuera de alcance / próximos sprints").

## Contexto: qué está mal hoy

Investigación previa a este sprint (ver conversación con Claude Code, 2026-09-21) relevó:

- `cargos.literal_puesto` y `cargos.especialidad_legacy` son texto libre sin FK, cargados desde el padrón SIAL semanal y desde el alta manual, sin normalizar mayúsculas/espacios — genera duplicados en todos los dropdowns que agrupan por estas columnas (`GET /api/v1/puestos`, `listPuestosCargosService`).
- Ya existe un catálogo real y vivo (`puestos_cargo` + `especialidades_puesto`, con FK a `Escalafon`) pero **no está conectado** a `cargos.literal_puesto` — alimenta solo los selectores de formularios (Alta de Cargos, wizard CPH/CEETPS), no el dato real que trae el padrón.
- Precedente de fracaso directo: migración `20260910000001_especialidades_fk` creó `especialidades` + `cargos.especialidad_id` con FK, pero **nadie migró el código consumidor**, y `20260925000000_drop_especialidades` la eliminó 15 días después por "no usada en ninguna query activa". No repetir este patrón: no alcanza con crear la FK, hay que migrar los consumidores en el mismo sprint que se activa.
- Inventario completo de superficie a consolidar (referencia, no se resuelve entera en este sprint):
  - Modelos con puesto en texto libre: `Cargo`, `SolicitudAlta`, `ConcursoCph.puestoSolicitado`, `ConcursoCeetps.puestoSolicitado`, `OrdenMerito`, `MiembroJuradoSorteado`, `PadronHistorico`, `BajaSialDiff`, `BajaSialRegistro`.
  - Modelos con especialidad en texto libre: `Cargo.especialidadLegacy`, `Persona.especialidadPrincipal`/`especialidadCph`, `SolicitudAlta`, `ConcursoCph.especialidadSolicitada`, `InscriptoConcurso`, `OrdenMerito`, `OrdenMeritoIntegrante`, `Postulante`, `MiembroJuradoSorteado`, `Pou`, `BajaSialDiff`.
  - 9 tablas de mapeo texto→texto fuera del catálogo: `RefAgrupador`, `RefUnificadorPuesto`, `RefEspecialidadCuil`, `RefCorreccionLitPuesto`, `RefCorreccionEspecialidad`, `RefEspecialidadPorPuesto`, `BajaSialSnapshot`/`Diff`/`Registro`.
  - Microservicio Python `services/dotaneitor/*` que produce estas columnas hoy.
  - Lógica de negocio crítica montada sobre el texto: `apps/api/src/shared/codigoCargo.ts::prefijoDeCargo()` (decide el código público del cargo por pattern-matching de substrings sobre `unificadorPuesto`/`agrupador`) y el matching de "concurso CPH ya abierto" en `padron.service.ts` (~línea 1493, clave `hospitalId:escalafonId:literalPuesto` en texto).
  - Único punto confirmado de generación activa de basura nueva en frontend: input libre de `puestoSolicitado` en `ConcursoCeetpsDetail.tsx:316`.

## Secuenciación — por qué va después de Sprint 18 (x2) y Sprint 19

Al 2026-09-21 hay **dos sprints en curso en paralelo** bajo el mismo número "18":
- `SPRINT_18_designacion_cph_especialidad.md` — usa activamente `especialidad_cph`/`especialidad_principal` de `Persona`.
- `SPRINT_18_retenciones_cadena_cargos.md` — agrega campos nuevos a `Cargo` (tipoOrigen, cargoRetenidoId, cargoBaseId) y genera cargos R/TTR copiando `escalafonId` del cargo base.

Y `Sprint 19` (vencimientos/renovación de retenciones) depende de que el Sprint 18 de Retenciones esté terminado.

**Este sprint (20) debe ejecutarse recién cuando los tres (18 CPH, 18 Retenciones, 19) estén completos**, por dos razones concretas:
1. Ambos Sprint 18 tocan directamente campos que este sprint va a rediseñar (`Cargo.escalafonId` en la cadena de retenciones, `Persona.especialidadCph` en designación CPH) — hacerlo en paralelo genera conflictos de merge y retrabajo, no ahorra tiempo.
2. La limpieza de BD (`prisma migrate reset`) borra cualquier dato de prueba que esos sprints estén usando para verificar end-to-end — hacerlo a mitad de esos sprints invalida su propio testing.

**No** hace falta esperar a nada más allá de esos tres — no hay ningún otro sprint planificado (Sprint 14 y siguientes) que dependa de que este sprint 20 pase primero, salvo que se decida bloquear la carga de datos reales/producción hasta que este sprint cierre (recomendado, ver Criterio de éxito).

## Modelo correcto (alcance de este sprint)

```
Escalafon (FK real, ya existe)
   └── PuestoCargo (FK real a Escalafon, ya existe — nombre, modalidad, tipoPuesto)
          └── EspecialidadPuesto (FK real a PuestoCargo, ya existe)

Cargo
   ├── escalafonId      → Escalafon        (ya existe, OK)
   ├── puestoCargoId     → PuestoCargo      (NUEVO — reemplaza literalPuesto como dato normalizado)
   └── especialidadPuestoId → EspecialidadPuesto (NUEVO — reemplaza especialidadLegacy)

literalPuesto / especialidadLegacy: se mantienen como columnas de AUDITORÍA
(texto crudo tal cual vino del padrón SIAL esa semana, para trazabilidad/debug),
pero dejan de ser la fuente de lectura de ningún filtro, dropdown ni lógica de negocio.
```

Como no hay datos de producción, `puestoCargoId` se crea **obligatorio** (`NOT NULL`) directamente en `Cargo` — no hace falta el paso intermedio de "nullable + backfill" que sí sería obligatorio con datos reales en juego. El import del padrón deja de poder crear un `Cargo` sin resolver antes su `PuestoCargo` (ver S20-6).

## Tareas

| #     | Tarea                                                                                                                                                                                                 | Dev             | Est. | Prioridad | Estado |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | --------- | ------ |
| S20-1 | Auditoría final pre-wipe: correr y documentar el inventario de este doc contra el código real al momento de arrancar (confirmar que nada nuevo se agregó durante Sprint 18/19)                       | Jorge           | 1h   | 🔴        | ✅     |
| S20-2 | Schema: agregar `Cargo.puestoCargoId` (FK NOT NULL → `PuestoCargo`) y `Cargo.especialidadPuestoId` (FK nullable → `EspecialidadPuesto`, ya que no todo puesto tiene especialidad); mantener `literalPuesto`/`especialidadLegacy` como columnas de auditoría | Jorge           | 2h   | 🔴        | ✅     |
| S20-3 | Schema: mismo patrón (`puestoCargoId`/`especialidadPuestoId`) en `SolicitudAlta`, `ConcursoCph`, `ConcursoCeetps`                                                                                     | Jorge           | 2h   | 🔴        | ✅     |
| S20-4 | Curar manualmente el seed de `puestos_cargo`/`especialidades_puesto` (revisar y corregir el catálogo actual, que fue sembrado a mano con errores conocidos — ver migraciones `20260902_fix_especialidades`) antes de resetear la BD | Jorge           | 3h   | 🔴        | ✅     |
| S20-5 | **`prisma migrate reset`** en entorno de desarrollo (borra todo, aplica migraciones limpias desde cero, corre el seed curado de S20-4) — coordinar con Agustín antes de correrlo                    | Jorge           | 0.5h | 🔴        | ✅     |
| S20-6 | Reescribir `padron.service.ts`: al crear/actualizar un `Cargo`, resolver `puestoCargoId` contra el catálogo por escalafón+nombre (normalizado `LOWER(TRIM())`); si no hay match, **no crear el cargo silenciosamente** — encolarlo para revisión manual o crear el `PuestoCargo` explícitamente marcado como "pendiente de curar" (a definir con Jorge cuál de las dos). Reemplaza el `tx.escalafon.create` automático hoy existente por un mecanismo igual de explícito para puestos nuevos | Jorge           | 4h   | 🔴        | ✅     |
| S20-7 | Migrar `puestos.routes.ts`, `cargos.service.ts` (`listPuestosCargosService` + filtro `puesto`/`especialidad`), `personas.service.ts` (filtro `puesto`/`especialidad`) para leer/filtrar por `puestoCargoId`/`especialidadPuestoId` en vez de `GROUP BY LOWER(TRIM(literal_puesto))`                                | Jorge           | 3h   | 🔴        | ✅     |
| S20-8 | Desacoplar `codigoCargo.ts::prefijoDeCargo()` del texto libre: migrar las reglas de `.includes()` sobre `unificadorPuesto`/`agrupador` a reglas basadas en `PuestoCargo.tipoPuesto`/`modalidad` (enums ya existentes)                                | Jorge           | 3h   | 🔴        | ✅     |
| S20-9 | Migrar el matching de "concurso CPH ya abierto" en `padron.service.ts` (~línea 1493) de clave de texto (`literalPuesto` uppercased) a clave por `puestoCargoId`                                       | Jorge           | 2h   | 🟡        | ✅     |
| S20-10| Frontend: `ConcursoCeetpsDetail.tsx:316` — reemplazar el input libre de `puestoSolicitado` por el combobox contra catálogo (mismo patrón ya correcto de `AltaCargosPage.tsx`)                        | Agustín         | 2h   | 🔴        | ✅     |
| S20-11| Frontend: wizard de CPH/CEETPS y Alta de Cargos — todos los combobox de puesto/especialidad mandan `puestoCargoId`/`especialidadPuestoId` al backend (2026-09-29: se completó también `ConcursoCphWizard.tsx`, quedaba pendiente del pase anterior) | Agustín         | 3h   | 🔴        | ✅     |
| S20-12| Agregar `POST`/`PUT` a `puestos-cargo.routes.ts` (hoy solo lectura) para poder administrar el catálogo desde la app en vez de scripts SQL manuales                                                    | Jorge           | 2h   | 🟡        | ✅     |
| S20-13| Verificación e2e: alta de cargo (✅ HTTP real), auto-creación `pendienteCurar` (✅ script directo), persistencia FK en `ConcursoCph` (✅ script directo), suite de tests backend (✅ 226/228, ver nota), build de frontend (✅). Falta: import de padrón real con Excel, wizard CPH/CEETPS con datos reales de punta a punta | Jorge + Agustín | 3h   | 🔴        | 🟡     |

**Total estimado:** ~30.5h

## Dependencias entre tareas

```
S20-1 ──► S20-4 ──► S20-5 ──┬─► S20-6 ──► S20-9
                             ├─► S20-2 ──► S20-3 ──► S20-7
                             └─► S20-8

S20-7 + S20-8 ──► S20-10 ──► S20-11 ──► S20-13
S20-12 es independiente, puede ir en paralelo
```

## Criterio de éxito

- [ ] `prisma migrate reset` corrido en desarrollo; BD arranca limpia con el catálogo `puestos_cargo`/`especialidades_puesto` curado como único origen de puesto/especialidad para cargos nuevos.
- [ ] Ningún `Cargo` nuevo puede crearse (ni por import de padrón, ni por alta manual, ni por wizard CPH/CEETPS) sin un `puestoCargoId` válido.
- [ ] Los dropdowns de Personas y Cargos (`/api/v1/puestos`, `listPuestosCargosService`) ya no muestran duplicados por casing — porque ya no agrupan texto, filtran por FK.
- [ ] `codigoCargo.ts::prefijoDeCargo()` y el matching de concurso-abierto ya no dependen de `.includes()`/comparación de string sobre `literalPuesto`/`unificadorPuesto`/`agrupador`.
- [ ] `literalPuesto`/`especialidadLegacy` siguen existiendo como snapshot de auditoría del padrón, pero ningún filtro/dropdown/lógica de negocio los lee.
- [ ] **Antes de cargar cualquier dato real/de producción, este sprint debe estar cerrado.** No cargar producción sobre un schema a mitad de esta migración.

## Notas

- Fuera de alcance de este sprint (quedan como roadmap para sprints futuros, a numerar cuando se planifiquen en detalle):
  - Consumidores secundarios: `OrdenMerito`/`OrdenMeritoIntegrante`, `Postulante`, `MiembroJuradoSorteado` (evaluar cuáles deben quedar como snapshot histórico legítimo, ej. el acta de sorteo de jurado, vs. cuáles deben migrar a FK), `Persona.especialidadPrincipal`/`especialidadCph`, `Pou.especialidad`.
  - Las 9 tablas `Ref*`/`BajaSial*` y el microservicio Python `services/dotaneitor/*` — decidir si el pipeline pasa a escribir directo contra el catálogo o se mantiene como capa de corrección previa.
  - Eliminación definitiva de las columnas `literalPuesto`/`especialidadLegacy` (y equivalentes en otros modelos) — recién cuando se confirme en uso real que ningún consumidor las lee.
- Decisión explícita de este sprint: dado que la BD es de desarrollo sin datos de producción, se prioriza dejar el **núcleo** (Cargo, SolicitudAlta, Concursos, import del padrón, lógica de código de cargo) resuelto de una vez con FK obligatoria, en vez de repetir el patrón gradual nullable-FK-luego-backfill que sería obligatorio si hubiera datos reales en juego.

## Notas — hallazgos de este sprint (2026-09-29)

**Hallazgo crítico, fuera del alcance original pero bloqueante para S20-5:**
`prisma migrate reset` desde una base vacía **nunca había funcionado** en este
proyecto — no es algo que este sprint haya roto, ya estaba roto antes. Se
encontró y arregló al intentar correr el reset:

1. `20260901_puestos_cargo` (+ 4 migraciones más del catálogo) insertaban
   puestos con `escalafon_id` hardcodeado a UUIDs que existían en la base de
   desarrollo de esa sesión pero **nunca se crearon vía migración** — no
   replicable desde cero. Se neutralizaron esos INSERTs (quedan solo las
   sentencias DDL); el catálogo real ahora se puebla en `prisma/seed.ts` a
   partir de `prisma/catalogo-puestos-curado.json` (S20-4).
2. Dos carpetas de migración sin prefijo de fecha (`sprint5_bajas_ceetps`,
   `concurso_cph_unique_abierto`) ordenaban al final alfabéticamente en vez
   de por su lugar real en la historia — se renombraron con timestamp
   (`20260805000000_...`, `20260805010000_...`).
3. `20260900000000_s15_baja_cargo_autorizacion` usaba el tipo
   `TipoAutorizacion` antes de que `20260911000000_s13_autorizaciones` lo
   creara (el nombre de archivo "s15"/"s13" no coincidía con el orden de
   timestamp real) — se movió la creación del tipo a la migración que
   ordena primero, con guards idempotentes en ambas.
4. `20260926000000_sync_schema_completo` (506 líneas, auto-generada por
   `prisma migrate dev` reconciliando drift) tenía múltiples sentencias que
   fallaban en un replay desde cero (tipos/tablas/constraints que ya existían
   o que nunca se habían creado) — se reescribió completa con guards
   idempotentes (`IF EXISTS`/`IF NOT EXISTS`/bloques `DO` con
   `EXCEPTION WHEN duplicate_object`) sin cambiar el resultado final del
   schema.

Con estos cuatro arreglos, `prisma migrate reset --force` corre limpio de
punta a punta (77 migraciones) por primera vez. **Recomendación:** correr un
reset completo en CI o antes de cada sprint grande para detectar este tipo de
drift temprano, en vez de descubrirlo recién cuando hace falta.

**Catálogo curado (S20-4) — cobertura real:** el script
`apps/api/scripts/extraer_catalogo_puestos.ts` extrajo 514 puestos (167 ya
curados a mano + 347 nuevos desde los ~48k cargos reales pre-reset). De esos,
**376 se cargaron** tras el reset — los ~140 restantes estaban anclados a
escalafones "basura" (sufijo random, duplicados de `22`/`85`/`CPH` creados
automáticamente por el padrón en algún momento, ej. `Médicos-e47d1ac`,
`CEETPS-d7fc610`, `Escalafón Ge-af6efb0`) que no sobreviven un reset limpio.
Esto es un síntoma del mismo problema de duplicados que este sprint resuelve
para Puesto/Especialidad pero explícitamente **no** para Escalafón (fuera de
alcance, ver doc original). Cuando el padrón real se reimporte contra
escalafones estables (`22`, `85`, etc.), esos puestos se recrearán vía S20-6
(`pendienteCurar=true`) y pueden re-curarse desde el admin de catálogo
(S20-12) — no se perdió información, se perdió solo la curación previa de
esa porción.

**Actualización 2026-09-29 (segundo pase — "solucionar todo lo pendiente"):**
- `ConcursoCphWizard.tsx` **completado**: ahora deriva `puestoCargoSolicitadoId`/
  `especialidadPuestoSolicitadaId` del catálogo (`{id,nombre}`) a partir del
  string ya normalizado contra la BD, y los manda en el PATCH junto con el
  texto (S20-3 `ConcursoCph.puestoCargoSolicitadoId`/
  `especialidadPuestoSolicitadaId`, antes sin consumidor). Backend:
  `concursos-cph.schema.ts`/`concursos-cph.service.ts` actualizados para
  aceptar y proteger esos campos igual que los de texto.
- `codigoCargo.ts::prefijoDeCargo()` — se agregaron los 3 gaps reales
  detectados probando contra los 16 escalafones estables de la base
  post-reset (confirmados contra `dotacion-rrhh/Doc/REGLAS_NEGOCIO.MD` §2/§13):
  `"Nueva Carrera Prof. Hosp"` (22) → CPH, `"Residencias"` (24) → RES,
  `"Nueva Carrera Administrativa"` (83) → EG. También se corrigió `normStr()`
  para sacar acentos (NFD) — sin eso, el propio escalafón sembrado a mano
  `"Carrera de Técnicos de la Salud"` (código `TEC`) no matcheaba `.includes('TEC')`
  por el acento en "Técnicos" y caía a `CARGO`. Verificado: de los 16
  escalafones estables, 15 ahora resuelven a un prefijo real; solo `17B`
  (`"Régimen Modular Extraordinario PG"`, 1 solo puesto) queda en fallback
  `CARGO` por ambigüedad genuina, no vale la pena adivinar.
- Verificación adicional corrida: suite completa de tests backend
  (`vitest run` con API viva) — **226/228 verdes**, incluye los 35 tests de
  `codigoCargo.test.ts` sin regresiones. Los 2 que fallan
  (`concursos-bajas.http.test.ts`) no son de este sprint: asumen que la BD
  compartida de test ya tiene concursos CPH precargados (`meta.total > 0`,
  búsqueda por sigla "HGATA") — un diseño de test contra datos ambiente, no
  fixtures propios. Nunca se había detectado porque **el reset nunca había
  funcionado hasta este sprint** — es la primera vez que corre contra una
  base realmente vacía. No se tocó (redefinir esa suite a fixtures propios
  es una tarea aparte, más grande que "arreglar Sprint 20"). Build de
  frontend (`vite build`) también verificado limpio.
- Se corrió además una verificación directa contra la base (scripts
  descartables, no quedaron en el repo) confirmando: creación de `Cargo` vía
  HTTP con `puestoCargoId` real; auto-creación de `PuestoCargo` con
  `pendienteCurar=true` cuando no hay match, con idempotencia (reintentar el
  mismo literal no duplica); persistencia y lectura de
  `ConcursoCph.puestoCargoSolicitadoId`.

**Actualización 2026-09-29 (tercer pase — simulación del import de padrón, sin Excel real):**
No hay browser disponible en este entorno para clickear la UI, y el import
real de Excel pasa por el microservicio Python Dotaneitor (`services/dotaneitor`,
no levantado). En su lugar se simuló el pipeline real: se insertaron filas
`PadronDiff` (`tipo='nuevo'`, `aprobado=true`) directamente — el mismo shape
de JSON que produce `calcularDiff()` — y se llamó a
`aprobarSnapshotService()` de verdad (el código real de creación masiva de
Sprint 20, no un mock), con dos casos: un puesto ya existente en el catálogo
y un puesto inventado sin match. Esto **encontró un bug real y crítico,
preexistente (no introducido por este sprint), que rompía la creación de
Cargo para cualquier fila del padrón sin columna CODIGO DE REGISTRO**:

```ts
// ANTES (roto):
const escalafon = (datos.codigo_de_registro && escalafonPorCodRegCache.get(datos.codigo_de_registro))
  ?? escalafonCache.get(datos.escalafon ?? '')
```

`datos.codigo_de_registro` viene de `strVal()` y es `''` (string vacío), no
`undefined`, cuando la columna no está. `'' && x` evalúa a `''` (JS: `&&`
devuelve el primer operando falsy) — y `'' ?? fallback` **no** cae al
fallback porque `??` solo reacciona a `null`/`undefined`, no a `''`. Con
esto, cualquier fila real sin CODIGO DE REGISTRO nunca resolvía el
escalafón por nombre pese a que el comentario del código decía "primero por
CODIGO DE REGISTRO, luego por nombre" — el fallback estaba muerto. El
`Cargo` de esa fila simplemente **nunca se creaba, sin error, sin log** (el
`continue` es silencioso). Se corrigió el mismo patrón en las 4 ocurrencias
del archivo (creación masiva de cargos + 3 en el diagnóstico de padrón),
cambiando `x && y` por `x ? y : undefined` antes del `??`. Verificado:
- Re-corrida la misma simulación tras el fix → ambos `Cargo` se crean
  (`CPH-POF-000001`/`CPH-POU-000001`, prefijo correcto gracias al fix de
  `codigoCargo.ts` de este mismo pase), `Persona`/`Ocupacion` también, y el
  caso sin match dispara `pendienteCurar=true` con `modalidad`/`tipoPuesto`
  bien inferidos.
- Suite completa de nuevo: **226/228 verdes**, sin regresiones.
- No se sabe hace cuánto está este bug ni cuántas filas reales afectó en el
  pasado (dependía del padrón real siempre haber tenido CODIGO DE REGISTRO
  poblado, cosa que no se puede confirmar retroactivamente) — vale la pena
  que Jorge lo tenga presente para el próximo import real.

**Deuda explícita restante — genuinamente fuera de este sprint:**
- Import de padrón real con un Excel real de punta a punta a través del
  microservicio Dotaneitor (se simuló el resultado del parseo, no el parseo
  del Excel en sí).
- Wizard CPH/CEETPS con un concurso real completo de punta a punta en la UI
  real (se verificó el código, el contrato con el backend, y la creación
  masiva de cargos con datos simulados — no un click-through en browser, no
  disponible en este entorno).
- Suite `concursos-bajas.http.test.ts` depende de datos ambiente en vez de
  fixtures propios — recién visible ahora que el reset funciona.
- Prefijo `17B` sin regla — 1 solo puesto, cae a `CARGO` (fallback correcto,
  no un bug).
