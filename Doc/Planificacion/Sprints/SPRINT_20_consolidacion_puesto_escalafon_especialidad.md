# SPRINT 20 — Consolidación de catálogo Puesto/Escalafón/Especialidad + limpieza de BD de desarrollo

**Estado:** 📋 Planificado
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
| S20-1 | Auditoría final pre-wipe: correr y documentar el inventario de este doc contra el código real al momento de arrancar (confirmar que nada nuevo se agregó durante Sprint 18/19)                       | Jorge           | 1h   | 🔴        | 📋     |
| S20-2 | Schema: agregar `Cargo.puestoCargoId` (FK NOT NULL → `PuestoCargo`) y `Cargo.especialidadPuestoId` (FK nullable → `EspecialidadPuesto`, ya que no todo puesto tiene especialidad); mantener `literalPuesto`/`especialidadLegacy` como columnas de auditoría | Jorge           | 2h   | 🔴        | 📋     |
| S20-3 | Schema: mismo patrón (`puestoCargoId`/`especialidadPuestoId`) en `SolicitudAlta`, `ConcursoCph`, `ConcursoCeetps`                                                                                     | Jorge           | 2h   | 🔴        | 📋     |
| S20-4 | Curar manualmente el seed de `puestos_cargo`/`especialidades_puesto` (revisar y corregir el catálogo actual, que fue sembrado a mano con errores conocidos — ver migraciones `20260902_fix_especialidades`) antes de resetear la BD | Jorge           | 3h   | 🔴        | 📋     |
| S20-5 | **`prisma migrate reset`** en entorno de desarrollo (borra todo, aplica migraciones limpias desde cero, corre el seed curado de S20-4) — coordinar con Agustín antes de correrlo                    | Jorge           | 0.5h | 🔴        | 📋     |
| S20-6 | Reescribir `padron.service.ts`: al crear/actualizar un `Cargo`, resolver `puestoCargoId` contra el catálogo por escalafón+nombre (normalizado `LOWER(TRIM())`); si no hay match, **no crear el cargo silenciosamente** — encolarlo para revisión manual o crear el `PuestoCargo` explícitamente marcado como "pendiente de curar" (a definir con Jorge cuál de las dos). Reemplaza el `tx.escalafon.create` automático hoy existente por un mecanismo igual de explícito para puestos nuevos | Jorge           | 4h   | 🔴        | 📋     |
| S20-7 | Migrar `puestos.routes.ts`, `cargos.service.ts` (`listPuestosCargosService` + filtro `puesto`/`especialidad`), `personas.service.ts` (filtro `puesto`/`especialidad`) para leer/filtrar por `puestoCargoId`/`especialidadPuestoId` en vez de `GROUP BY LOWER(TRIM(literal_puesto))`                                | Jorge           | 3h   | 🔴        | 📋     |
| S20-8 | Desacoplar `codigoCargo.ts::prefijoDeCargo()` del texto libre: migrar las reglas de `.includes()` sobre `unificadorPuesto`/`agrupador` a reglas basadas en `PuestoCargo.tipoPuesto`/`modalidad` (enums ya existentes)                                | Jorge           | 3h   | 🔴        | 📋     |
| S20-9 | Migrar el matching de "concurso CPH ya abierto" en `padron.service.ts` (~línea 1493) de clave de texto (`literalPuesto` uppercased) a clave por `puestoCargoId`                                       | Jorge           | 2h   | 🟡        | 📋     |
| S20-10| Frontend: `ConcursoCeetpsDetail.tsx:316` — reemplazar el input libre de `puestoSolicitado` por el combobox contra catálogo (mismo patrón ya correcto de `AltaCargosPage.tsx`)                        | Agustín         | 2h   | 🔴        | 📋     |
| S20-11| Frontend: wizard de CPH/CEETPS y Alta de Cargos — confirmar que todos los combobox de puesto/especialidad mandan `puestoCargoId`/`especialidadPuestoId` al backend en vez de el string mostrado       | Agustín         | 3h   | 🔴        | 📋     |
| S20-12| Agregar `POST`/`PUT` a `puestos-cargo.routes.ts` (hoy solo lectura) para poder administrar el catálogo desde la app en vez de scripts SQL manuales                                                    | Jorge           | 2h   | 🟡        | 📋     |
| S20-13| Verificación e2e: alta de cargo, import de padrón con puesto nuevo (camino "no match"), filtro de Personas/Cargos por puesto/especialidad, wizard CPH/CEETPS completo, generación de código de cargo | Jorge + Agustín | 3h   | 🔴        | 📋     |

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
