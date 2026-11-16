# SPRINT 26 — Modificación de la POU (eliminar / modificar cargo) y clasificación de tablas en la limpieza

**Estado:** 📋 Planificado — bloqueado por la definición de negocio de la Parte A (ver "Decisiones previas")
**Autores:** Jorge (backend) + Agustín (frontend)
**Duración estimada:** a confirmar tras la definición | **Origen:** revisión de código posterior al Sprint 25

---

## Objetivo

Dos pendientes que salieron de revisar el código del Sprint 25 y que no se pueden cerrar solo con código:

1. **Parte A — POU.** En Alta de cargos → "Modificación de la POU", las acciones **Eliminar cargo POU** y **Modificar cargo POU** hoy no hacen lo que dice la pantalla. Definir qué deben hacer y implementarlo de punta a punta.
2. **Parte B — Limpieza.** El script `sync-cargos-msgc/limpieza.ts` no tiene clasificadas las tablas nuevas del Sprint 25. Hasta que se clasifiquen, 3 tests de `limpieza.test.ts` fallan.

---

## Decisiones previas (bloquean la Parte A)

La Parte A no se puede estimar ni arrancar sin responder esto con quien conozca el circuito POU:

| # | Pregunta | Por qué importa |
|---|----------|-----------------|
| D1 | **Eliminar cargo POU:** ¿da de baja el cargo de la norma? ¿En qué momento: al registrar la solicitud o al aprobarse la autorización? | Hoy crea una solicitud de alta, que al aprobarse crea un cargo: lo contrario de lo que dice la pantalla. |
| D2 | **Modificar cargo POU:** ¿cambia puesto/especialidad del cargo original, o crea uno nuevo y da de baja el viejo? | Hoy crea un cargo POU nuevo con otro puesto y no toca el original. |
| D3 | ¿Qué ocurre con la fila de la tabla `pou` (dotación / activos / vacantes) en cada caso? | La triangulación POU compara contra esa tabla. |
| D4 | ¿Qué muestra el PDF de la norma POU ("Modificación") para una baja y para una modificación? | El PDF hoy arma la norma completa desde solicitudes de alta. |
| D5 | ¿Solo cargos **vacantes**, o también ocupados? (la UI dice "vacante"; el selector ya filtra `soloVacantes`) | Define las validaciones al aprobar. |

---

## Estado actual (verificado en el código)

- **Frontend** — `apps/web/src/modules/cargos/pages/AltaCargosPage.tsx`: `FormModificacionPou` ofrece 4 acciones (`agregar`, `modificar`, `eliminar`, `pou_a_pof`). Cada ítem viaja al lote como una solicitud de alta.
- **Marcador en `observaciones`** (commit `553a605`): el ítem lleva `operacionPou` y el marcador es `pou_eliminar:<cargoId>`, `pou_modificar:<cargoId>` o `pou_a_pof:<cargoId>`. Antes las tres operaciones guardaban `pou_a_pof:`.
- **Backend** — `solicitudes-alta.service.ts` guarda `observaciones` como texto (máx. 500). `autorizaciones.service.ts` (aprobar `alta_cargo`) crea los cargos desde la solicitud y **no lee el marcador**. Nada en la API interpreta `pou_*:`.
- **PDF** — `solicitudes-alta.pdf.ts` arma la norma POU completa a partir de las solicitudes; no distingue bajas ni modificaciones.

---

## Parte A — POU: eliminar y modificar cargo

### Tareas — Agustín (frontend)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S26-A1 | **Ahora, sin esperar la definición:** ocultar (o deshabilitar con aviso) "Eliminar cargo POU" y "Modificar cargo POU" en `ACCIONES_POU`, con un flag fácil de reactivar. Evita que se registren solicitudes con efecto contrario al esperado | 1h | 🔴 Crítico | ⬜ |
| S26-A2 | Adaptar `SubFormModificarEliminarPou` / `FormModificarEliminarPou` a lo definido en D1–D2 (textos, campos requeridos, resumen antes de registrar). Quitar el componente duplicado que quedó sin uso (`FormModificarEliminarPou`) | 4h | 🔴 Crítico | ⬜ |
| S26-A3 | Mostrar la operación (Eliminar / Modificar / Pasar a POF) en la lista de pendientes, en el modal de confirmación y en el historial de solicitudes | 3h | 🟡 Medio | ⬜ |
| S26-A4 | Tests del armado del marcador y del flag de acciones | 2h | 🟡 Medio | ⬜ |

### Tareas — Jorge (backend)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S26-A5 | Documentar las reglas definidas en D1–D5 en este sprint y en `ReglasNegocioModal` / `reglasData.ts` | 2h | 🔴 Crítico | ⬜ |
| S26-A6 | Persistir la operación de forma estructurada (campos `operacion_pou` y `cargo_origen_id` en `solicitudes_alta`) en lugar de depender del texto de `observaciones`. Migración idempotente (`ADD COLUMN IF NOT EXISTS`) + schema Zod del lote | 4h | 🔴 Crítico | ⬜ |
| S26-A7 | Al aprobar la autorización (`aprobarAutorizacionService`, rama `alta_cargo`): aplicar el efecto según la operación, dentro de la misma transacción. Validar que el cargo origen siga vigente y vacante (D5) | a estimar | 🔴 Crítico | ⬜ |
| S26-A8 | Actualizar la tabla `pou` según D3 (o recalcular la triangulación) | a estimar | 🟡 Medio | ⬜ |
| S26-A9 | PDF POU: reflejar bajas y modificaciones (D4) | a estimar | 🟡 Medio | ⬜ |
| S26-A10 | Tests unitarios de cada operación (aprobar, cargo ya ocupado, cargo ya dado de baja) | 4h | 🟡 Medio | ⬜ |

**Dependencias:** D1–D5 → S26-A5 → (S26-A6, S26-A7, S26-A8, S26-A9) → S26-A2/A3. S26-A1 es independiente y se puede hacer ya.

---

## Parte B — Clasificar las tablas nuevas en la limpieza

`apps/api/scripts/sync-cargos-msgc/limpieza.ts` exige clasificar cada tabla del schema (`BORRAR` / `CONSERVAR` / `PREGUNTA`). Faltan tres, todas del Sprint 25:

| Tabla | Propuesta (a confirmar por Jorge) | Fundamento |
|-------|-----------------------------------|------------|
| `usuario_siglas` | `CONSERVAR` | Configuración de qué hospitales atiende cada supervisor; depende de `usuarios` y `hospitales`, que se conservan |
| `etiquetas_concurso_ceetps` | `BORRAR` solo las filas de concursos que se borran | Es la hermana de `etiquetas_concurso_cph` (ya `BORRAR` con `alcance: fuera_excel`). Tiene FK con `ON DELETE CASCADE` a `concursos_ceetps`, así que debe ir **antes** de esa tabla en `TABLAS_BORRAR` (hijos antes que padres) |
| `concursos_asignados` | `BORRAR` las asignaciones de concursos que se borran; conservar el resto | No tiene FK a los concursos (`referencia_id` + `referencia_tipo`): si se borran los concursos quedan filas huérfanas |

### Tareas — Jorge (backend)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S26-B1 | Confirmar la clasificación de las 3 tablas | 0.5h | 🔴 Crítico | ⬜ |
| S26-B2 | Agregarlas a `CLASIFICACION` y, donde corresponda, a `TABLAS_BORRAR` en el orden correcto | 1h | 🔴 Crítico | ⬜ |
| S26-B3 | Que `limpieza.test.ts` pase completo (hoy fallan 3 tests: clasificación de tablas, integridad referencial y FK opcionales) | 0.5h | 🔴 Crítico | ⬜ |

**Cuidado:** lo que queda clasificado como `BORRAR` se elimina en la limpieza. Por eso la clasificación la confirma Jorge y no se infiere por convención.

---

## Ya resuelto en la revisión posterior al Sprint 25 (para trazabilidad)

Commits en `agustin` / `main` (`e2d9b02` … `72d44c6`):

- Encabezado "Etiquetas" duplicado en la tabla de concursos CPH.
- Bandeja CEETPS: el schema solo aceptaba estados CPH; ahora acepta ambos y cada estado se aplica a su tipo.
- `GET /usuarios/supervisores`: ahora exige `tareas.ver_kanban_sgrasv` o `tareas.asignar_concurso` y devuelve solo id, usuario, nombre, apellido, rol y siglas.
- Etiquetas de CEETPS: invalidación de queries.
- Notificaciones: los badges pasan a `GET /notificaciones/no-leidas/por-tipo` y el listado acepta `?tipos=a,b` (cambia lo que decía S25-D1, que calculaba los conteos en el cliente: el pedido de `limit: 200` superaba el máximo de 100 y devolvía 400).
- POU triangulación: se muestran los perfiles `profesional de la salud` y `tecnico/a de la salud`.
- Padrón: `aprobarDiffNuevoService` usa `esValidableContraConcurso`.
- Tests de la API: de 38 fallando a 3 (los de la Parte B).

**Pendiente de evaluar (fuera de este sprint):** la regla de coincidencia de especialidad al validar un cargo del padrón contra un concurso (hoy: una contiene a la otra; `sinespecialidad` es comodín). Los tests de `padron.enganche-concurso.test.ts` la dejan documentada.

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/modules/cargos/pages/AltaCargosPage.tsx` | S26-A1 a A4 |
| `apps/api/src/modules/solicitudes-alta/solicitudes-alta.service.ts` / `.schema.ts` | S26-A6 |
| `apps/api/src/modules/autorizaciones/autorizaciones.service.ts` | S26-A7 |
| `apps/api/src/modules/solicitudes-alta/solicitudes-alta.pdf.ts` | S26-A9 |
| `prisma/schema.prisma` + migración nueva | S26-A6 (correr a mano en Neon y marcar resuelta **antes** del push) |
| `apps/web/src/modules/cargos/components/reglasData.ts` | S26-A5 |
| `apps/api/scripts/sync-cargos-msgc/limpieza.ts` | S26-B2 |

---

## Criterio de éxito

- [ ] Decisiones D1–D5 respondidas y documentadas
- [ ] "Eliminar" y "Modificar" cargo POU tienen el efecto definido al aprobarse la autorización, o están ocultas hasta tenerlo
- [ ] La operación elegida queda guardada de forma estructurada y se ve en la UI y en el PDF
- [ ] Las 3 tablas del Sprint 25 están clasificadas y `limpieza.test.ts` pasa completo
- [ ] `tsc --noEmit` limpio en `apps/api` y `apps/web`

---

## Notas

- **Orden sugerido:** S26-A1 (ocultar acciones) y la Parte B pueden hacerse ya; el resto de la Parte A espera las decisiones.
- **Migraciones:** idempotentes, con el encabezado manual habitual (Jorge las corre en Neon y las marca resueltas antes del push, porque Render ejecuta `prisma migrate deploy` en cada arranque).
