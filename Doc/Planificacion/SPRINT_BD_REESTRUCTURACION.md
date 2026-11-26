# Sprint: Reestructuración de BD y Sincronización MSGC

> **Objetivo dual:**
> - **B** — Revisar, limpiar y redocumentar el DDL completo de la aplicación. Eliminar deuda acumulada, columnas muertas y tablas huérfanas. Dejar el schema como fuente de verdad real.
> - **C** — Implementar la sincronización semanal del Excel MSGC como proceso recurrente e idempotente. El Excel es la ley: `estado IN ('vigente','validacion_vacante') AND deleted_at IS NULL` debe igualar las filas del Excel en todo momento.
>
> **Branch de trabajo:** Neon producción (`ep-little-river-aexgqwxz-pooler`) — el branch `Neon_BD` (`ep-rough-pond-aeuzuxh9`) fue el entorno de desarrollo durante las Fases 0–6; los cambios ya fueron aplicados a producción.
>
> **Documento relacionado:** `Doc/Contratos/ESTRUCTURA_BD.md` (fuente de verdad del DDL revisado).
>
> Última actualización: 2027-01 — Fase 5 completada: primera confirmación exitosa (sesión `fa3e1a5d`) con los 4 tipos (ocupacion_pou, bajas_salud, cargos_salud, arbol). Procesadores reescritos con bulk SQL. Fix `dim_actividad_hechos`: 48.606 actividades abiertas. Estado de tablas post-confirmación documentado.
> Estado: FASES 0–8 COMPLETADAS. FASE 5 OPERATIVA EN PRODUCCIÓN. PENDIENTE: Fase 9.

---

## Principios que rigen este sprint

1. **El Excel MSGC es la ley** — al terminar, la cantidad de cargos vigentes + validacion_vacante debe igualar las filas del Excel.
2. **Neon_BD primero** — todo cambio se prueba en el branch de desarrollo antes de tocar producción.
3. **Simular antes de escribir** — cada fase tiene modo dry-run obligatorio. Jorge aprueba las cifras antes de ejecutar.
4. **Sin datos personales en logs/reportes** — CUIL, nombres e `id_sial_rol` no salen a ninguna salida.
5. **Idempotencia** — dos corridas con el mismo Excel dan el mismo resultado. La segunda no cambia nada.
6. **Documentar todo** — cada decisión de diseño queda en `ESTRUCTURA_BD.md`. Nada se decide de memoria.
7. **Rollback siempre disponible** — backup previo antes de cada fase destructiva. Transacciones únicas.
8. **Las tablas `dim_*` son el destino** — `dim_puestos`, `dim_personas`, `dim_efectores`, `dim_carreras` y `dim_actividad_hechos` reemplazan a `puestos_cargo`, `especialidades_puesto`, `hospitales`, `codigos_registro` y `ocupaciones` como fuente de verdad del padrón MSGC. Las tablas operativas se deprecan gradualmente.

---

## Fase 0 — Conectar entorno local a Neon_BD ✅ COMPLETADA

**Objetivo:** tener el API local apuntando al branch de desarrollo para que todo el trabajo posterior no toque producción.

- [x] **0.1** Crear `docker-compose.neonbd.yml` — override que solo cambia `DATABASE_URL` al branch `Neon_BD`.
- [x] **0.2** Actualizar `.env` con la URL de `Neon_BD` para desarrollo local sin Docker.
- [x] **0.3** Levantar el contenedor con el nuevo override y verificar que el API responde.
- [x] **0.4** Correr `prisma migrate status` contra `Neon_BD` — sin migraciones pendientes.
- [x] **0.5** Smoke test: login, listado de cargos, listado de personas, un snapshot de padrón.

**Criterio de salida:** ✅ API local responde contra `Neon_BD`. `migrate status` limpio.

---

## Fase 1 — Diagnóstico completo del DDL ✅ COMPLETADA

**Objetivo:** fotografiar el estado real de cada tabla. Producir `ESTRUCTURA_BD.md`.

- [x] **1.1** Script de diagnóstico en Neon_BD — filas por tabla, columnas con 100% NULL.
- [x] **1.2** Auditar cada tabla contra el código.
- [x] **1.3** Clasificar cada tabla (VIVA / DEUDA / HUÉRFANA / NUEVA).
- [x] **1.4** Documentar en `ESTRUCTURA_BD.md`.
- [x] **1.5** Cerrar todas las preguntas de diagnóstico (Grupos A/B/C/D/E) con Jorge.

**Criterio de salida:** ✅ `ESTRUCTURA_BD.md` completo. Todas las preguntas cerradas.

---

## Fase 2 — Limpieza DDL ✅ COMPLETADA

**Objetivo:** eliminar tablas huérfanas y columnas muertas.

- [x] **2.1** Backup de las 5 tablas `ref_*` huérfanas.
- [x] **2.2** Eliminar endpoints legacy del Dotaneitor.
- [x] **2.3** DROP de 5 tablas `ref_*` huérfanas.
- [x] **2.4** DROP `ocupaciones.estado_persona`.
- [x] **2.5** DROP `cargos.agrupador` y `cargos.unificador_puesto`.
- [x] **2.6** Agregar `cargos.codigo_legacy` (nullable VARCHAR(30)).
- [x] **2.7** Actualizar `ESTRUCTURA_BD.md`.
- [x] **2.8** Activar `strict: true` en `apps/api/tsconfig.json`. ✅ COMPLETADO — 0 errores de producción. `tsconfig.test.json` con `vitest/globals`.

**Notas:** `personas.apellido/nombre`, `roles_persona`, `audit_logs`, `refresh_tokens`, `padron_historico.estado_persona` también dropeados. `cargos.cargo_ejecucion_id` agregado.

**Criterio de salida:** ✅ Schema limpio. Pendiente: 2.8.

---

## Fase 3 — Recodificación de prefijos de cargo ✅ COMPLETADA (TypeScript)

**Objetivo:** que el acrónimo del Excel MSGC reemplace el prefijo del código de cargo. `CPH-POF-000123` → `CPH-P-000123`.

- [x] **3.1** `acronimoMsgc` en `apps/api/src/shared/acronimoMsgc.ts`.
- [x] **3.2** `prefijoDeCargo()` con interruptor `NOMENCLATURA_CODIGO_CARGO` (default: `legacy`).
- [x] **3.3** `prefijoRemplazante()`: `msgc` → `R-{prefijo}`; `legacy` → `{prefijo}-R`.
- [x] **3.4** `ParamsPrefijoCargo` limpiado. Todos los call sites actualizados.
- [x] **3.5** Script de recodificación de prefijos en `dim_cargos` (tabla destino). ✅ COMPLETADO — `dim_cargos` fue poblada directamente con acrónimos MSGC. 24 prefijos, todos correctos. Sin prefijos legacy (`CPH-POF`/`CPH-POU`/`TEC-POF`/`TEC-POU`) en la tabla.
- [x] **3.6** Resolver colisiones de código. ✅ COMPLETADO — sin colisiones detectadas (cada `codigo_cargo` es único por diseño de la carga).
- [x] **3.7** Verificación: `SELECT count(*) FROM dim_cargos WHERE codigo_cargo ~ '^(CPH-POF|CPH-POU|TEC-POF|TEC-POU)'` = 0. ✅ COMPLETADO — resultado: 0.
- [x] **3.8** 115 tests verdes.

**Criterio de salida:** ✅ TypeScript limpio, tests verdes, prefijos MSGC correctos en `dim_cargos` (24 prefijos, 0 legacy).

---

## Fase 4 — Esquema estrella: poblado, calidad y catálogos ✅ EN CURSO

**Objetivo:** tener el esquema estrella (`dim_*`) completo, limpio y consistente como base para reemplazar las tablas operativas. Las tablas `dim_*` son la fuente de verdad del padrón MSGC.

**Contexto de diseño:** `dim_puestos` reemplaza a `puestos_cargo` + `especialidades_puesto`. `dim_personas` reemplaza a `personas` para el contexto MSGC. `dim_efectores` reemplaza a `hospitales` para el esquema estrella. `dim_actividad_hechos` es la tabla de hechos de actividad (reemplaza el rol de `ocupaciones` en el contexto MSGC). `dim_carreras` reemplaza a `codigos_registro` + `escalafones` en el contexto MSGC.

### 4.1 — Efectores ✅ COMPLETADA
- [x] Crear `dim_efectores` con 79 efectores (64 activos, 15 inactivos).
- [x] Unificar siglas conflictivas: `SSAME` → `SSSAME`, `UAIEAIT` → `EAIT` en `dim_puestos` y `dim_cargos`.
- [x] Marcar `UAIEAIT` como inactivo. Poblar nombres de `EAIT` y `SSSAME`.
- [x] FK `dim_puestos.efector → dim_efectores.sigla` validada.

### 4.2 — dim_puestos: calidad y cobertura ✅ COMPLETADA
- [x] Limpiar registros con `id_sial_rol` compuesto (len=25/27) — eliminados 53.865 registros.
- [x] Normalizar prefijos `CPH-J-POF-` → `CPH-J-P-` y `CPH-J-POU-` → `CPH-J-G-` (2.336 registros).
- [x] Poblar `dia_pou` en `dim_cargos` via join `cargo_id_sistema → ocupaciones → dim_puestos` — 6.204/7.228 POU con día.
- [x] Sincronizar `situacion_revista`, `puesto_desde`, `puesto_hasta` desde CSV cargos y bajas (50.291 + 16.046 registros).
- [x] **4.2.1** Auditar literales de puesto en `dim_puestos` contra `dim_tipos_cargos` — 332 pares únicos `(codigo_registro, literal_puesto)`, 0 sin match. Cubiertos por repoblado de tarea 4.5.
- [x] **4.2.2** Literales CR 87 (`licenciado en enfermeria`, `enfermero profesional`) y CR 85 (42 literales únicos) — todos presentes en `dim_tipos_cargos`. Sin entradas faltantes.
- [x] **4.2.3** `cod_rep` y `desc_rep` — cobertura 100% (65.046/65.046 puestos con ambos campos poblados).

### 4.3 — dim_personas: calidad ✅ COMPLETADA
- [x] Sincronizar `apellido_nombre`, `sexo`, `fecha_nacimiento` desde CSV cargos — 47.085/47.485 actualizadas.
- [x] Poblar `salud_1er_cargo` desde CSV.

### 4.4 — dim_actividad_hechos: limpieza e importación ✅ COMPLETADA
- [x] Eliminar 53.865 registros con `id_sial_rol` compuesto (len=25/27).
- [x] Normalizar prefijos `CPH-J-POF-` → `CPH-J-P-` y `CPH-J-POU-` → `CPH-J-G-`.
- [x] Corregir 20 actuales que estaban en CSV bajas → cerrar con `fecha_hasta`.
- [x] Corregir 3 con `situacion_revista` diferente al CSV.
- [x] Importar 233 activos faltantes del CSV cargos.
- [x] Importar 16.001 históricos del CSV bajas.
- [x] Limpiar `fecha_hasta > 2100` (fechas `4000-01-01` → NULL).
- [x] Estado final: 65.253 registros, 6.411 actuales (`es_actual=true`).

### 4.5 — dim_tipos_cargos y dim_especialidades ✅ COMPLETADA
- [x] Auditar estado de `dim_tipos_cargos` — detectado que estaba poblado desde `dim_cargos.literal_puesto` (nombre de carrera, no tipo real). 16 filas incorrectas.
- [x] Definir regla de clasificación `tipo_cargo` sin hardcodeo — todo leído desde `jcat_cargo_jefatura` y `dim_carreras`.
- [x] Repoblar `dim_tipos_cargos` desde `dim_puestos` (fuente correcta): 332 filas únicas por `(codigo_registro, literal_puesto)`.
- [x] Poblar `dim_especialidades` desde `dim_puestos.especialidad`: 1.314 filas.
- [x] Poblar `dim_cargos.tipo_cargo_id` best-effort via `dim_actividad_hechos → dim_puestos`: 2.336/53.064 filas. Resto desde UI en producción.
- [x] Poblar `dim_cargos.especialidad_id` best-effort: 901 filas.
- [x] Agregar FK formal `dim_cargos.codigo_registro → dim_carreras` en schema Prisma.
- [x] Renombrar `dim_cargos.literal_puesto` → `literalPuestoLegacy` y `especialidad_cargo` → `especialidadLegacy` en Prisma.
- [x] Documentar regla `tipo_cargo` y modelo de negocio cargo↔puesto↔persona en `ESTRUCTURA_BD.md`.
- [x] `db push` ejecutado — BD sincronizada. Drops aplicados: `agrupador`, `unificador_puesto`, `estado_persona` en `cargos`/`padron_historico`, `audit_logs`, `refresh_tokens`, `ref_correcciones_especialidad`, `ref_especialidad_por_puesto`.

### 4.6 — dim_carreras ✅ COMPLETADA
- [x] **4.6.1** Cobertura completa — todos los CRs de `dim_puestos` tienen entrada en `dim_carreras`. 0 puestos con `codigo_registro` NULL.
- [x] **4.6.2** `escalafon` poblado en los 16 registros. Sin faltantes.

### 4.8 — dim_gestionables ✅ COMPLETADA
- [x] Definir modelo `DimGestionables` en schema Prisma — FK a `dim_carreras`, campos `tipo_concurso`, `genera_cargos`, `supervisada`, `regimen_override`, `activo`.
- [x] `db push` ejecutado — tabla creada en Neon_BD.
- [x] Poblar 7 carreras gestionables: CR 22, 23, 24, 37, 83, 85, 87.
- [x] `regimen_override` poblado donde el régimen es fijo (22, 23, 24, 37, 87). NULL para 83 y 85 (excepción por literal).
- [x] Script idempotente `_poblar-dim-gestionables.ts` — upsert seguro para corridas futuras.

### 4.7 — Catálogos operativos: ANEXO_II_83 y jornada enfermería ✅ COMPLETADA
- [x] **4.7.1** Sincronizar `ANEXO_II_83` en `derivarRegimen.ts` con `ANEXO_II_EXCEL` de `acronimoMsgc.ts`: sacar `capellan` y `chofer de funcionario`, agregar `radio operador` y `radio operador de emergencias`. Agregar `chofer de ambulancias` (plural del Excel).
- [x] **4.7.2** Normalizar especialidad `enfermeria` en `dim_puestos`/`dim_personas` — descartado: `dim_puestos` se guarda tal cual el padrón de Hacienda. ATC/ATP no es especialidad sino jornada contractual.
- [x] **4.7.3** Residencias CR 24 en `dim_puestos` — todos los literales tienen acrónimo derivable. Sin trabajo.
- [x] **4.7.4** Recalcular `regimen_id` en `cargos` para los 268 afectados: 27 salen del Anexo II → Carrera Administrativa, 234 entran → Carrera Administrativa anexo II, 7 con NULL corregidos.
- [x] **4.7.5** Nuevo campo `jornada_enfermeria VARCHAR(3)` en `dim_cargos`: 11.904 cargos CR 87 poblados con `ATC`. CR 85 queda NULL (puestos de enfermería real no existen como cargos en el sistema aún). Editable desde UI.

**Criterio de salida:** `dim_*` completas y consistentes. Simulación MSGC con categoría `j` = 0 (salvo excepciones aprobadas).

---

## Fase 5 — Servicio de carga semanal de archivos ✅ SCHEMA COMPLETADO / Procesadores pendientes

**Objetivo:** módulo interno en `apps/api` que permita subir desde el frontend los archivos semanales de Hacienda (Cargos, Bajas, Árbol, Ocupación POU), actualice las tablas `dim_*` de forma limpia e idempotente, y genere un informe de cambios por cada subida con histórico completo para análisis de evolución.

**Archivos semanales identificados:**

| Archivo | Filas aprox. | Actualiza |
|---|---|---|
| `Cargos_salud_YYYYMMDD.xlsx` | 49.556 x 50 cols | `dim_puestos`, `dim_personas`, `dim_actividad_hechos` |
| `Bajas_salud_YYYYMMDD.xlsx` | 16.047 x 31 cols | `dim_actividad_hechos` (cierre), `dim_personas` |
| `Arbol_Salud_YYYYMMDD.xlsx` | 4.374 x 8 cols | `organigramas` / `dim_efectores` |
| `Ocupacion_POU_DD-MM.xlsx` | 489 base + 5.944 detalle | tabla `pou` (ocupación actual) |

> **POU_HISTORICO** (decreto) queda fuera — no es semanal, cambia solo cuando sale una resolución nueva. Se carga con script puntual.

**Decisión de arquitectura:** módulo interno (no microservicio). Comparte Prisma client y lógica de negocio existente. Procesamiento async en background para no bloquear el event loop con 49k filas.

### 5.1 — Schema BD ✅ COMPLETADA
- [x] **5.1.1** Definir y agregar al schema Prisma las 5 tablas con prefijo `dim_carga_*`.
- [x] **5.1.2** `dim_carga_sesiones` — registro central por subida: tipo, fecha_archivo, estado, informe JSON, usuario, timestamps.
- [x] **5.1.3** `dim_carga_archivos` — archivo físico por sesión: filename, filas, sha256.
- [x] **5.1.4** `dim_carga_diffs` — cambios campo a campo: tabla_afectada, tipo_diff (nuevo/modificado/eliminado), clave, valor_anterior, valor_nuevo.
- [x] **5.1.5** `dim_carga_padron_snapshot` — foto completa del padrón por carga: id_sial_rol, cuil, apellido_nombre, codigo_registro, lit_cod_reg, cod_rep, desc_rep, literal_puesto, especialidad, situacion_revista, jcat, cargo_desde, cargo_hasta, fecha_corte. Permite reconstruir estado en cualquier fecha.
- [x] **5.1.6** `dim_carga_kpis_periodo` — métricas agregadas por mes/año/carrera/efector: total_activos, total_vacantes, total_nuevos, total_bajas, total_personas. Permite comparar evolución entre períodos y años.
- [x] **5.1.7** Enums `TipoCargaSemanal` (cargos_salud, bajas_salud, arbol, ocupacion_pou) y `EstadoCargaSemanal` (procesando, completado, error).
- [x] **5.1.8** Relación `Usuario → DimCargaSesion` agregada al modelo `Usuario`.
- [x] **5.1.9** Migración `20261206000000_dim_carga_semanal` creada y aplicada a Neon_BD. BD sincronizada.

**Índices clave en `dim_carga_padron_snapshot`:** `(cuil, fecha_corte)`, `(fecha_corte, codigo_registro)`, `id_sial_rol`, `cod_rep` — optimizados para las consultas de evolución histórica.

**Volumen estimado:** 49k filas × 52 semanas ≈ 2.5M filas/año en `dim_carga_padron_snapshot`. Manejable en Postgres con los índices definidos.

### 5.2 — Módulo API: endpoint de upload ✅ COMPLETADA
- [x] **5.2.1** Crear módulo `apps/api/src/modules/carga-semanal/`.
- [x] **5.2.2** Endpoint `POST /api/v1/carga-semanal/upload` — acepta **múltiples archivos** en un solo request. Detecta el tipo de cada uno por nombre. Crea una única sesión multi-archivo. Lanza todos los previews en paralelo (background).
- [x] **5.2.3** Endpoint `GET /api/v1/carga-semanal/sesiones` — lista sesiones con estado e informe.
- [x] **5.2.4** Endpoint `GET /api/v1/carga-semanal/sesiones/:id/diffs` — diffs de una sesión paginados.
- [x] **5.2.5** Validación de sha256 — si el archivo ya fue procesado (mismo hash), rechazar con 409.
- [x] **5.2.6** Dispatcher async `procesadores/index.ts` — `despacharPreview` (lanza por tipo, pasa `tiposEnSesion` para coordinar estado) y `despacharConfirmar` (aplica en paralelo todos los tipos con preview).
- [x] **5.2.7** `crearSesionMultiService` — crea sesión con N archivos en una sola operación.
- [x] **5.2.8** `registrarResumenParcial` — merge incremental del informe JSON; marca `pendiente_confirmacion` automáticamente cuando todos los tipos con preview terminaron.
- [x] **5.2.9** Buffer store keyed por `sesionId → Map<tipo, buffer>` para soportar múltiples tipos por sesión.
- [x] **5.2.10** Procesadores directos (arbol, ocupacion_pou, pou_decreto) reciben `marcarCompletado` flag — no marcan la sesión si hay tipos con preview pendientes.
- [x] **5.2.11** Prisma client regenerado con los nuevos modelos `dim_carga_*`.
- [x] **5.2.12** Módulo registrado en `app.ts` bajo `/api/v1/carga-semanal`.

### 5.3 — Procesador: cargos_salud ✅ COMPLETADA Y OPERATIVA EN PRODUCCIÓN
- [x] **5.3.1** Parser del Excel `Cargos_salud` — 50 columnas mapeadas a tipos TypeScript, fechas `4000-01-01` normalizadas a null.
- [x] **5.3.2** Upsert `dim_puestos` en lotes de 500 — compara contra estado actual, genera diffs por campo (literal_puesto, especialidad, codigo_registro, cod_rep, situacion_revista, efector).
- [x] **5.3.3** Upsert `dim_personas` — una entrada por CUIL, actualiza apellido_nombre, sexo, contacto, domicilio.
- [x] **5.3.4** Apertura `dim_actividad_hechos` — detecta puestos nuevos en el padrón, inserta fila con `fecha_desde = fecha_corte`, `fecha_hasta = NULL`. Guard contra duplicados (consulta previa de filas abiertas).
- [x] **5.3.5** Cierre `dim_actividad_hechos` — detecta puestos que desaparecieron del padrón y setea `fecha_hasta`.
- [x] **5.3.6** Insertar en `dim_carga_padron_snapshot` — foto completa de las filas con fecha_corte.
- [x] **5.3.7** Upsert `dim_carga_kpis_periodo` — agrega por mes/carrera/efector con totales activos/personas/nuevos/bajas.
- [x] **5.3.8** Informe JSON con totales por tabla — guardado en `dim_carga_sesiones.informe`.
- [x] **5.3.9** Flujo dos fases: `parsearYDiffearCargosSalud` (fase 1 — preview, marca `pendiente_confirmacion`) + `aplicarCambiosCargosSalud` (fase 2 — confirmar, respeta resoluciones por fila).
- [x] **5.3.10** Validaciones/advertencias por fila: CUIL vs DNI, emails, fechas invertidas.
- [x] **5.3.11** Bug fix: `dim_actividad_hechos` ahora abre filas para puestos nuevos (antes solo cerraba eliminados).
- [x] **5.3.12** Migración `20261209000000_dim_actividad_hechos_unique_abierta` — índice único parcial `WHERE fecha_hasta IS NULL` sobre `id_sial_rol` para garantizar integridad a nivel BD.

### 5.4 — Procesador: bajas_salud ✅ COMPLETADA Y OPERATIVA EN PRODUCCIÓN
- [x] **5.4.1** Parser del Excel `Bajas_salud` — 31 columnas incluyendo MOT_BAJA, CARGO_HASTA.
- [x] **5.4.2** Upsert `dim_puestos` con campos de baja: puesto_hasta, motivo_baja, doc_resp_baja, bajas_exist.
- [x] **5.4.3** Upsert `dim_personas` — actualiza datos básicos, marca activo=false.
- [x] **5.4.4** Cierre `dim_actividad_hechos` — setea fecha_hasta con la fecha de baja real de cada puesto.
- [x] **5.4.5** Snapshot parcial y diffs generados.
- [x] **5.4.6** Flujo dos fases: `parsearYDiffearBajasSalud` (fase 1 — preview) + `aplicarCambiosBajasSalud` (fase 2 — confirmar). Sin resoluciones por fila (bajas se aplican todas).
- [x] **5.4.7** Reescritura con bulk SQL: `dim_puestos` INSERT ON CONFLICT en lotes de 500 con deduplicación por `id_sial_rol`. `dim_personas` updateMany bulk por CUILs únicos. `dim_actividad_hechos` UPDATE FROM (VALUES ...) bulk con fecha real de baja. Logs en cada paso.
- [x] **5.4.8** Bugs corregidos durante primera confirmación: `filasConBaja` declarada dos veces (eliminada duplicación); columna real `efector` (no `hospital_sigla`) en `dim_puestos`; columna real `salud_1er_cargo` (no `salud_primer_cargo`) en `dim_personas`; deduplicación de `id_sial_rol` con `Map` antes del bulk insert; FK violation en `efector` resuelta con subquery `SELECT sigla FROM dim_efectores WHERE sigla = $1`.

### 5.5 — Procesador: arbol ✅ COMPLETADA
- [x] **5.5.1** Parser del Excel `Arbol_Salud` — 8 columnas, filas AREA descartadas, desc_rep normalizado.
- [x] **5.5.2** Herencia de universo_totalizador y regimen_empleo del historial (mismo mecanismo que `reemplazarOrganigramaService`).
- [x] **5.5.3** Swap atómico `organigramas` — DELETE + createMany en transacción, diffs calculados antes.
- [x] **5.5.4** Sync `dim_efectores` — actualiza nombre para siglas cuyo desc_rep cambió.

### 5.6 — Procesador: ocupacion_pou ✅ COMPLETADA
- [x] **5.6.1** Parser hoja `Base` (489 filas) — SIGLA, PERFIL, ESPECIALIDAD, dotaciones, activos, vacantes.
- [x] **5.6.2** Upsert tabla `pou` en lotes — diffs por dotacion_total, activos, vacantes.
- [x] **5.6.3** Diffs e informe generados.

### 5.7 — Frontend: pantalla de revisión de diff ✅ COMPLETADA
- [x] **5.7.1** `useCargaSemanal.ts` — agregado `pendiente_confirmacion` al tipo `EstadoCarga`, `COLOR_ESTADO` actualizado.
- [x] **5.7.2** Hooks nuevos: `useCargaDiffs`, `useCargaSesion` (con polling mientras `procesando`), `useConfirmarCarga`, `useDescartarCarga`.
- [x] **5.7.3** Tipo `ResolucionesConfirmar` exportado desde el hook.
- [x] **5.7.4** Componente `PanelRevision` — cards resumen (nuevos/modificados/eliminados/personas), tabla de advertencias de calidad, tabla de puestos nuevos, tabla de modificados con selector `Aplicar nuevo / Mantener actual` por fila, tabla de eliminados con selector `Cerrar actividad / Mantener` por fila.
- [x] **5.7.5** `CargaSemanalPage` refactorizada — muestra `PanelRevision` automáticamente al subir un archivo; botón "Revisar" en el historial para sesiones `pendiente_confirmacion` huérfanas.
- [x] **5.7.6** Historial actualizado con estado `pendiente_confirmacion` (badge azul).

**Criterio de salida:** ✅ ALCANZADO. Los 4 procesadores operativos. Primera confirmación exitosa (sesión `fa3e1a5d`, 2027-01) con los 4 tipos. Subida desde UI genera informe con diffs y actualiza `dim_*`. `dim_carga_padron_snapshot` permite responder: cargos de una persona, personas de un cargo, evolución mensual por carrera.

### 5.8 — Estado de tablas post-primera-confirmación (sesión `fa3e1a5d`) ✅

| Tabla | Total | Detalle |
|---|---|---|
| `dim_puestos` | 65.336 | 49.292 en padrón activo, 16.105 con baja |
| `dim_personas` | 50.694 | 47.228 activas, 3.466 inactivas |
| `dim_actividad_hechos` | 48.606 abiertas | Fix aplicado: 42.210 actividades con `fecha_desde = fecha_hasta` (bug carga 08-11) reabiertas |
| `dim_incidencias` | 2.099 | Bajas gestionables |
| `dim_cargos` | 53.064 | 790 en `validacion_vacante` |
| `dim_carga_padron_snapshot` | 65.692 filas | KPIs: 458 combinaciones |

**Fix `dim_actividad_hechos` (2027-01):** detectadas 42.210 actividades con `fecha_desde = fecha_hasta` (bug de la carga del 08-11 que abrió y cerró actividades el mismo día). Fix: `UPDATE dim_actividad_hechos SET fecha_hasta = NULL WHERE id IN (SELECT DISTINCT ON (id_sial_rol) id ... ORDER BY id_sial_rol, fecha_desde DESC)` — reabre la última actividad cerrada incorrectamente por puesto. Resultado: 48.606 abiertas (antes 6.401). Quedan 116 puestos activos sin actividad abierta (datos sucios históricos, no críticos).

**Fixes de arquitectura aplicados durante confirmación:**
- `$transaction` con upserts en loop → reemplazado por operaciones directas en serie (Neon serverless no tolera transacciones largas).
- `Promise.all` con múltiples queries → serializado (Neon cierra conexiones por inactividad).
- Upserts individuales (~49k filas) → bulk SQL `INSERT ... ON CONFLICT DO UPDATE` en lotes de 500.
- `registrarResumenParcial` con parámetro `tiposEnSesion` hecho opcional (default `[]`). Eliminadas llamadas desde los `aplicar*` para evitar que el estado vuelva a `pendiente_confirmacion`.
- Endpoint `/confirmar`: cuando no hay buffer (410), marca la sesión como `error` con mensaje claro antes de lanzar la excepción.
- Frontend `handleConfirmar`: try/catch con `setError` para mostrar errores al usuario.

---

## Fase 6 — Integración dim_* → reemplazo de tablas operativas ⚠️ EN CURSO

**Estrategia:** no reescribir los servicios existentes (SQL raw profundo que depende de `ocupaciones`/`personas`/`hospitales`). Crear módulos paralelos que lean desde `dim_*`. El frontend consume ambos durante la transición.

### 6.4 — dim_actividad_hechos como fuente de verdad de actividad MSGC ✅ COMPLETADA (módulo paralelo)
- [x] **6.4.1** Módulo `dim-dotacion` creado en `apps/api/src/modules/dim-dotacion/`.
- [x] **6.4.2** `listDimDotacionService` — listado paginado de actividad actual (`fecha_hasta IS NULL`) con JOIN a `dim_puestos`, `dim_personas`, `dim_carreras`, `dim_efectores`. Filtros: efector, codigoRegistro, situacionRevista, idSialRol, cuil, apellidoNombre.
- [x] **6.4.3** `getDimDotacionKpisService` — KPIs de actividad actual: totalActivos, personasUnicas, porSituacionRevista, porCarrera, porEfector.
- [x] **6.4.4** `getDimActividadDetalleService` — historial completo de actividad de un `id_sial_rol` (todas las filas, no solo la actual).
- [x] **6.4.5** Endpoints registrados en `app.ts` bajo `/api/v1/dim-dotacion`.
- [x] **6.4.6** Verificar consistencia entre `/dotacion` (legacy) y `/dim-dotacion` (nuevo). Script SQL en `scripts/sql/verificacion_consistencia_dim_dotacion.sql`. 6 queries: totales globales, en-dim-no-legacy, en-legacy-no-dim, resumen ejecutivo, discrepancias por efector, discrepancias por carrera. Las diferencias esperadas son: (a) puestos sin `id_sial_rol` en `ocupaciones` (cargos manuales no-MSGC), (b) dedup de espejo de jefatura que legacy aplica y dim no, (c) puestos en `dim_actividad_hechos` importados del CSV histórico que no tienen ocupación vigente en el sistema.
- [x] **6.4.7** Migrar frontend de dotación para consumir `/dim-dotacion`. Solapa "MSGC" agregada en `DotacionPage.tsx` — hook `useDimDotacion.ts` con los 3 endpoints, componente `PanelMsgc` con KPI cards, filtros (efector/carrera/situación/búsqueda libre), tabla paginada con sort, panel de historial de actividad por `id_sial_rol`. El flujo legacy (Sistema) queda intacto.

### 6.1 - Migrar hospitales -> dim_efectores COMPLETADA (catalogo paralelo)
- [x] **6.1.1** Endpoint `GET /api/v1/dim-dotacion/efectores` - catalogo de efectores activos desde `dim_efectores`. Reemplaza `GET /api/v1/hospitales` para el contexto MSGC.
- [x] **6.1.2** Hook `useDimEfectores()` en `useDimDotacion.ts` - staleTime 5 min.
- [x] **6.1.3** `PanelMsgc` usa `useDimEfectores` para el selector de efector con label descriptiva (sigla - nombre).
- [x] **6.1.4** Deprecar uso directo de `hospitales` en el sync MSGC. ✅ COMPLETADO — `dim_efectores` es la fuente en contexto MSGC. `hospitales` marcada en `ESTRUCTURA_BD.md`.

### 6.2 - Migrar puestos_cargo + especialidades_puesto -> dim_puestos COMPLETADA (catalogo paralelo)
- [x] **6.2.1** Endpoint `GET /api/v1/dim-dotacion/puestos?efector=&codigoRegistro=` - pares (literalPuesto, especialidad) unicos desde `dim_puestos`. Reemplaza `GET /api/v1/puestos-cargo` para el contexto MSGC.
- [x] **6.2.2** Hook `useDimPuestos(efector?, codigoRegistro?)` en `useDimDotacion.ts` - acotado al primer efector/carrera seleccionados.
- [x] **6.2.3** Filtros `literalPuesto` y `especialidad` agregados al schema, buildWhere y DimDotacionFilters.
- [x] **6.2.4** `PanelMsgc` usa `useDimPuestos` para los selectores de Puesto y Especialidad.
- [x] **6.2.5** Deprecar `puestos_cargo` y `especialidades_puesto` en `ESTRUCTURA_BD.md`. ✅ COMPLETADO — marcadas ⚠️ DEPRECADAS (contexto MSGC), reemplazadas por `dim_puestos`.
### 6.3 - Migrar codigos_registro -> dim_carreras COMPLETADA (catalogo paralelo)
- [x] **6.3.1** Endpoint `GET /api/v1/dim-dotacion/carreras` - catalogo de carreras activas desde `dim_carreras`. Reemplaza `GET /api/v1/codigos-registro` para el contexto MSGC.
- [x] **6.3.2** Hook `useDimCarreras()` en `useDimDotacion.ts` - staleTime 5 min.
- [x] **6.3.3** `PanelMsgc` usa `useDimCarreras` para el selector de carrera con label descriptiva (cr - litCodReg).
- [x] **6.3.4** Marcar `codigos_registro` como deprecada en `ESTRUCTURA_BD.md`. ✅ COMPLETADO — marcada ⚠️ DEPRECADA (contexto MSGC), reemplazada por `dim_carreras`.
---

## Fase 7 — Trazabilidad de cambios en carga semanal ⚠️ EN CURSO

**Objetivo:** que el panel de revisión muestre con precisión qué cambia en `dim_puestos`, `dim_personas` y `dim_actividad_hechos` antes de confirmar cada carga.

- [x] **7.1** Diffs de `dim_actividad_hechos` en procesador `cargos-salud` (fase 1/preview): actividades a abrir (puestos nuevos) y a cerrar (puestos eliminados). Commit `87ae25f`.
- [x] **7.2** Diffs de `dim_actividad_hechos` en procesador `bajas-salud` (fase 1/preview): actividades a cerrar con fecha real de baja. Commit `87ae25f`.
- [x] **7.3** Frontend `PanelRevision`: 2 cards nuevas (Actividades a abrir / Actividades a cerrar) + tablas con `id_sial_rol` y fecha. Commit `87ae25f`.
- [x] **7.4** Preview/confirmar para procesador `arbol` — `parsearYDiffearArbol` (fase 1) + `aplicarCambiosArbol` (fase 2). `arbol` agregado a `TIPOS_CON_PREVIEW`. Commit `e8f5d8e`.
- [x] **7.5** Preview/confirmar para procesador `ocupacion_pou` — `parsearYDiffearOcupacionPou` (fase 1) + `aplicarCambiosOcupacionPou` (fase 2). `ocupacion_pou` agregado a `TIPOS_CON_PREVIEW`. Commit `78bdbf0`.
- [x] **7.6** Panel multi-archivo: tabs por tipo cuando la sesión tiene más de un archivo. Cards y tablas adaptadas al tipo visible. `TABLAS_POR_TIPO` y `detectarTipoPorFilename` en el hook. Commit `4d04ddd`.
- [x] **7.7** Registrar corrida en `sync_corridas` al confirmar — `modo='carga_semanal'`, `excelSha256` del primer archivo, `resumen` del informe de la sesión. Commit `8cc78cf`.

**Estado: FASE 7 COMPLETADA.**

---

## Fase 8 — Incidencias y concursos dim_* ✅ COMPLETADA

**Objetivo:** que la carga semanal detecte automáticamente puestos nuevos y bajas gestionables, los registre en `dim_incidencias`, y vincule POU con `dim_puestos`.

- [x] **8.1** Puestos nuevos gestionables → `dim_incidencias { tipo: puesto_nuevo_gestionable }`. No gestionables → `dim_cargos { codigoCargo: idSialRol }`. Preview muestra `gestionables.puestosNuevos`.
- [x] **8.2** Vinculación automática POU↔dim_puestos al confirmar `ocupacion_pou`: JOIN `(sigla, perfil, especialidad)` ↔ `(hospitalSigla, literalPuesto, especialidad)` → `dim_pou_ocupacion_puestos.createMany` con `skipDuplicates`.
- [x] **8.3** Bajas gestionables → `dim_incidencias { tipo: baja_gestionable }`. Puente `dim_actividad_hechos` para resolver `codigo_cargo`. `dim_cargos.updateMany` → `validacion_vacante`. Preview muestra `gestionables.bajas`.
- [x] **8.4** DROP tablas `msgc_cargos`, `msgc_hechos_cargo_persona`, `msgc_personas`, `msgc_puestos` — eliminadas de BD y schema.
- [x] **8.5** Documentación: sección "Carga semanal dim_* — Flujo de decisiones (Fase 8)" en `Contrato_Padron.md`.
- [x] **8.6** Helper `gestionables.ts` — `clasificarGestionablesBulk()` con cache en memoria. Fuente de verdad: `dim_gestionables`. Sin hardcodeo en procesadores.
- [x] **8.7** Schema: modelos `DimIncidencia`, `DimConcurso`, `DimConcursoCph`, `DimConcursoCeetps`, enums `TipoIncidencia`, `EstadoIncidencia`. Relaciones inversas en `DimEfectores` y `DimCargaSesion`.
- [x] **8.8** Fix build Vercel: `TipoConcursoFila` = `'cph' | 'ceetps'` (sin `'sin_concurso'`). Corregido en `historicoCargos.ts`, test y `AltaCargosPage.tsx`.
- [x] **8.9** `dim_gestionables` corregida: CR 24 eliminado, CR 23 → CPH, CR 83 → CEETPS/`Nueva Carrera Administrativa`, CR 85 → `regimen_override: CEETPS`.
- [x] **8.10** Tabla `usuarios` renombrada a `dim_usuarios` — todas las tablas del nuevo diagrama tienen prefijo `dim_`.

**Criterio de salida:** ✅ Carga semanal genera incidencias automáticas. `dim_*` 100% consistente. Build sin errores.

---

## Fase 9 — Frontend incidencias + concursos dim_* ⚠️ PENDIENTE

**Objetivo:** pantalla de gestión de incidencias y concursos generados por la carga semanal.

- [ ] **9.1** Listado de `dim_incidencias` pendientes — filtros por tipo, efector, carrera. Badge de cantidad en el menú.
- [ ] **9.2** Acción "Iniciar concurso" desde una incidencia → crea `dim_concurso` + `dim_concurso_cph` o `dim_concurso_ceetps` (Etapa 1). Incidencia pasa a `resuelta`.
- [ ] **9.3** Acción "Descartar" desde una incidencia → estado `descartada` con motivo opcional.
- [ ] **9.4** Listado de `dim_concurso` — filtros por tipo, estado, efector. Vista detalle con campos de Etapa 1.
- [ ] **9.5** Endpoints API: `GET /api/v1/dim-incidencias`, `POST /api/v1/dim-incidencias/:id/iniciar-concurso`, `POST /api/v1/dim-incidencias/:id/descartar`, `GET /api/v1/dim-concursos`.
- [ ] **9.6** `ESTRUCTURA_BD.md` actualizado con schema final (incluye `dim_usuarios`, tablas nuevas Fase 8).
- [ ] **9.7** `Contrato_Datos.md` actualizado.
- [ ] **9.8** Aplicar cambios a producción siguiendo `DEPLOY_PRODUCCION.md §7`.

---

## Limpieza de tablas obsoletas ✅ COMPLETADA

**Ejecutada:** 2026-12. Migraciones aplicadas a producción (`ep-little-river-aexgqwxz`) vía `prisma migrate deploy`.

**Migraciones aplicadas:**
- `20261208000000_estado_carga_preview` — agrega valor `pendiente_confirmacion` al enum `EstadoCargaSemanal`.
- `20261209000000_dim_actividad_hechos_unique_abierta` — índice único parcial `WHERE fecha_hasta IS NULL` sobre `id_sial_rol`. Requirió fix previo: 1 duplicado abierto (`001734918-4`) cerrado con `fecha_hasta = fecha_desde` de la fila más reciente.
- `20261210000000_drop_tablas_obsoletas` — DROP de 30 tablas obsoletas.

**Dropeadas (30 tablas):**
- 22 tablas `tmp_bk_*` — backups de scripts de corrección puntual, todas con `@@ignore` en Prisma
- 3 tablas `tmp_esp_*` / `tmp_oct` — snapshots de especialidades y volcado de octubre
- `organigramas_backup_pre_arbol` — backup pre-carga de árbol
- `backfill_vv_audit` — auditoría de backfill puntual
- `bajas_id_map` — mapa de ids de migración de bajas
- `desdoblado_mapeo_cargos` — mapa de cargos desdoblados

**Schema Prisma:** 2209 → 1709 líneas (−500). 82 modelos activos. `Database schema is up to date!`

**Pendiente confirmar con Jorge antes de dropear:**
- `msgc_*` (4 tablas) — staging del sync MSGC Fase 1. Contienen el mapeo cargo↔persona del corte 2026-11-01 útil para Fase 7.
- `dim_tipos_cargos`, `dim_especialidades` — creadas en Fase 4, no consumidas por endpoints activos pero potencialmente útiles para Fase 7.

**Scripts de diagnóstico y DROP:** `scripts/sql/diagnostico_tablas_candidatas_drop.sql` y `scripts/sql/drop_tablas_obsoletas.sql`.

---

## Mapa de reemplazo dim_* → tablas operativas

| Tabla operativa | Reemplazada por | Estado |
|---|---|---|
| `hospitales` (contexto MSGC) | `dim_efectores` | Fase 6.1 |
| `puestos_cargo` | `dim_puestos` | Fase 6.2 |
| `especialidades_puesto` | `dim_puestos` | Fase 6.2 |
| `codigos_registro` (contexto MSGC) | `dim_carreras` | Fase 6.3 |
| `ocupaciones` (contexto MSGC) | `dim_actividad_hechos` | Fase 6.4 |
| `personas` (contexto MSGC) | `dim_personas` | Fase 6.4 |

> Las tablas operativas **no se dropean** en este sprint — siguen vivas para los flujos no-MSGC (concursos, bajas, padrón semanal). El DROP se planifica en un sprint posterior una vez que todos los consumidores estén migrados.

---

## Decisiones de diagnóstico — CERRADAS

> Todas las preguntas fueron respondidas. Este registro es inmutable.

### Grupo C — Columnas muertas

**C1.** `cargos.agrupador` y `cargos.unificador_puesto` → DROP. ✅ Ejecutado.

**C2.** `ocupaciones.estado_persona` → DROP. Catálogo cerrado `situacion_revista`: `activo` / `retencion_de_cargo` / `comisionado`. ✅ Ejecutado.

**C3.** `personas.apellido` / `personas.nombre` → DROP. Se usa `apellido_nombre`. ✅ Ejecutado.

**C4.** `roles_persona` → DROP. Histórico vive en `ocupaciones`. Fix `getPersonaSialRolesService`: sacar `AND o.hasta IS NULL`, agregar `o.hasta`, `o.situacion_revista`, `cr.codigo`, `ep.nombre`. ✅ Tabla dropeada. Fix pendiente.

### Grupo A — Recodificación de prefijos

**A1.** Códigos del Excel son la fuente de verdad. Excel 5 dígitos + 1 cero = 6 dígitos del sistema. `codigo_legacy` para rollback. ✅ Implementado en TypeScript. Script BD pendiente.

**A2.** Todos los CR 25 → prefijo `AS-xxxxxx`. Nivel (MIN/SS/DG/DGA) no se guarda. ✅ Implementado en TypeScript.

**A3.** Jefaturas ENF-J/TEC-J/EG-J: columna nueva `cargo_ejecucion_id` (FK nullable). Sufijo numérico igual = clave del vínculo. ✅ Columna creada.

### Grupo B — Sincronización MSGC

**B1.** El Excel manda. Casos irresolubles → Excel de análisis. Ningún cargo entra sin sigla, carrera y puesto resueltos.

**B2.** "En validación": con expediente de baja → `validacion_vacante`; sin expediente → `vigente` + `sub_estado = vacante`.

**B3.** Sin concurso automático. El sync crea el cargo con el estado que corresponde.

**B4.** Todas las columnas del Excel se mapean al sistema.

### Grupo D — Performance y arquitectura

**D1.** Procesador_Meta4 (Python/FastAPI) reemplaza el Dotaneitor. `padron_historico` es tabla de hechos central, append-only.

**D2.** `padron_diff` se rediseña con el Procesador_Meta4.

**D3/D4.** `audit_logs` y `refresh_tokens` → DROP. ✅ Ejecutado.

### Grupo E — Siglas y catálogos

**E1.** Cruzar por nombre completo. Solo agregar sigla nueva si no tiene equivalencia real. ✅ Ejecutado en `dim_efectores`.

**E2.** CR 87: `enfermeria` y `licenciado en enfermeria` (minúscula, sin acento). CR 85: cruzar por nombre normalizado. Filas sin puesto/sigla/carrera → Excel de análisis.

---

## Riesgos transversales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Recodificación a medias deja dos formatos conviviendo | Media | Alto | Transacción única + verificación post-migración |
| Filtros por regex de prefijo dejan de reconocer jefaturas | Alta | Alto | Auditar todos los consumidores antes de recodificar |
| Sync MSGC apunta a producción por error | Baja | Crítico | Override de BD explícito + flag `--dry-run` obligatorio |
| `padron_historico` crece sin límite y degrada queries | Media | Medio | Particionado en Fase 8 si supera umbral |
| Excel MSGC cambia de semana a semana | Alta | Bajo | Proceso idempotente + reporte de delta |
| DROP de tabla huérfana que sí se usa en algún script olvidado | Baja | Medio | Backup previo + búsqueda en todo el repo antes de dropear |
| Migración dim_* rompe flujos operativos no-MSGC | Media | Alto | Las tablas operativas no se dropean hasta que todos los consumidores estén migrados |

---

## Orden de ejecución

```
Fase 0 ✅ → Fase 1 ✅ → Fase 2 ✅ → Fase 3 ✅ (TypeScript)
    ↓
Fase 4 ✅ (esquema estrella — COMPLETADA)
    ↓
Fase 5 (carga semanal — EN CURSO)
    ↓
Fase 6 (integración dim_* → reemplazo tablas operativas)
    ↓
Fase 7 (sync MSGC escritura)
    ↓
Fase 8 ✅ (incidencias y concursos dim_*)
    ↓
Fase 9 (frontend incidencias + concursos + deploy)
```

---

## Referencias

- `Doc/Contratos/ESTRUCTURA_BD.md` — DDL revisado
- `Doc/Contratos/Contrato_Datos.md` — modelo de datos vigente
- `Doc/Contratos/Contrato_Logica_Cargo.md` — ciclo de vida del cargo
- `Doc/Contratos/Contrato_Padron.md` — flujo del padrón semanal
- `Doc/Desarrollo/SYNC_CARGOS_MSGC_DISENO_FASES_2_6.md` — diseño detallado fases MSGC
- `Doc/Planificacion/SPRINT_LIMPIEZA_Y_ARQUITECTURA.md` — backlog de limpieza acumulado
- `prisma/schema.prisma` — schema actual (fuente de verdad técnica)
