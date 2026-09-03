# SPRINT 2 — Dotaneitor optimizado + integración padrón

**Estado:** ✅ Completo — verificado end-to-end con datos reales 2026-08-25
**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Dotaneitor optimizado y conectado al flujo de padrón de SRRHH v2.

> Ver `Doc/Dotaneitor_Analisis.md` (secciones 6 y 7 para el mapeo de columnas y la deuda técnica de Sprint 0).

## Tareas

| #     | Tarea                                                                                                                    | Dev     | Est. | Prioridad  |     |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ------- | ---- | ---------- | --- |
| S2-1  | Aplicar optimizaciones identificadas en Sprint 0 al Dotaneitor                                                           | Agustin | 12h  | 🔴 Crítico | ✅ 8/9 — queda solo #5 (staleness de `MAPEO_ESPECIALIDAD_POR_PUESTO`), informativo |
| S2-2  | Endpoint `POST /api/v1/padron/upload`: recibe Excel, crea snapshot                                                       | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S2-3  | Integración Node → Python: enviar archivo, recibir diff                                                                  | Jorge   | 8h   | 🔴 Crítico | ✅  |
| S2-4  | Guardar `padron_diff` en BD con resultado del Dotaneitor                                                                 | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S2-5  | Endpoint `GET /api/v1/padron/snapshots/:id/diff` paginado                                                                | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S2-6  | Endpoint `POST /api/v1/padron/snapshots/:id/aprobar`                                                                     | Jorge   | 8h   | 🔴 Crítico | ✅  |
| S2-7  | Lógica de aprobación: actualizar ocupaciones, personas, cargos, historico                                                | Jorge   | 10h  | 🔴 Crítico | ✅  |
| S2-8  | Endpoint `POST /api/v1/padron/snapshots/:id/rechazar`                                                                    | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S2-9  | PadronPage: subir archivo + ver estado del job                                                                           | Agustin | 8h   | 🔴 Crítico | ✅  |
| S2-10 | PadronDiffPage: tabs Nuevos / Modificados / Eliminados                                                                   | Agustin | 10h  | 🔴 Crítico | ✅  |
| S2-11 | Badge en header cuando hay snapshot pendiente                                                                            | Agustin | 2h   | 🟡 Medio   | ✅  |
| S2-12 | Bloqueo: no se puede subir nuevo archivo con snapshot pendiente                                                          | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S2-13 | Schema: 7 tablas `ref_*` nuevas                                                                                          | Jorge   | —    | 🔴 Crítico | ✅  |
| S2-14 | Schema: catálogos `Especialidad` y `Puesto` como tablas de apoyo (sin FK desde `Cargo`)                                  | Jorge   | —    | 🔴 Crítico | ✅  |
| S2-15 | Campo `Especialidad.prioritaria Boolean @default(false)`                                                                 | Jorge   | —    | 🟡 Medio   | ✅  |
| S2-16 | Campos `archivoResultadoPath` y `archivoCalidadPath` en `PadronSnapshot`                                                 | Jorge   | —    | 🟡 Medio   | ✅  |
| S2-17 | Schema: 7 campos nuevos en `Persona`, 7 en `Cargo`, 19 en `Ocupacion`                                                   | Jorge   | —    | 🟡 Medio   | ✅  |
| S2-18 | Upload async: `POST /upload` dispara pipeline en background, devuelve inmediato con `snapshotId`                         | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S2-19 | Dotaneitor migrado de MySQL a Postgres (SQLAlchemy). Diff calculado por Node (Opción B)                                  | Jorge   | 8h   | 🔴 Crítico | ✅  |

## Criterio de éxito

- Flujo completo: subir Excel → ver diff → aprobar → datos en BD ✅
- Dotaneitor optimizado y documentado ✅
- `padron_historico` se popula correctamente al aprobar ✅
- Bloqueo de doble carga funciona ✅
- Sin datos hardcodeados en Dotaneitor: abreviaturas, correcciones y mapeos viven en tablas `ref_*` ✅
- Cada corrida de padrón queda archivada y es descargable ✅

## Verificación end-to-end real (2026-08-25)

Padrón real `Cargos_salud_20260802.xlsx` (47.203 filas). Conteos finales verificados en BD:
**45.083 personas, 46.889 cargos, 46.889 ocupaciones, 46.889 padron_historico**.

### Bugs encontrados solo en runtime (no en code review)

| # | Bug | Severidad | Fix |
| - | --- | --------- | --- |
| 1 | `POST /upload` se colgaba indefinidamente — stream del file part no se drenaba dentro del loop `for await` | 🔴 Crítica | `part.toBuffer()` inline dentro del loop |
| 2 | Pipeline Dotaneitor crasheaba en paso `procesar` — pandas infería columna `AGRUPADOR` como `float64` | 🔴 Crítica | `.astype('object')` explícito antes de la asignación condicional |
| 3 | `aprobarSnapshotService` fallaba con `P2000` — `Escalafon.codigo` es `VARCHAR(20)` pero se usaba el nombre completo | 🔴 Crítica | `codigo` generado como `nombre.slice(0,12) + '-' + randomUUID().slice(0,7)` |
| 4 | `aprobarSnapshotService` devolvía 200 OK sin crear personas ni ocupaciones — leía `datos.cuil` (inexistente) | 🔴 Crítica | Nueva función `cuilDe(datos)` que deriva CUIL desde `cuil_y_rol` |
