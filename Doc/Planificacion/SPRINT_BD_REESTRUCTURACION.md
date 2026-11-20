# Sprint: Reestructuración de BD y Sincronización MSGC

> **Objetivo dual:**
> - **B** — Revisar, limpiar y redocumentar el DDL completo de la aplicación. Eliminar deuda acumulada, columnas muertas y tablas huérfanas. Dejar el schema como fuente de verdad real.
> - **C** — Implementar la sincronización semanal del Excel MSGC como proceso recurrente e idempotente. El Excel es la ley: `estado IN ('vigente','validacion_vacante') AND deleted_at IS NULL` debe igualar las filas del Excel en todo momento.
>
> **Branch de trabajo:** Neon_BD (`ep-rough-pond-aeuzuxh9-pooler`) — creado desde `srrhh-sync`. Producción (`ep-little-river-aexgqwxz`) no se toca hasta validación completa.
>
> **Documento relacionado:** `Doc/Contratos/ESTRUCTURA_BD.md` (se crea en este sprint como fuente de verdad del DDL revisado).
>
> Última actualización: 2026-12 — Fases 0–3 completadas. Revisión y actualización de estado.
> Estado: FASES 0–3 COMPLETADAS — en curso Fase 4.

---

## Principios que rigen este sprint

1. **El Excel MSGC es la ley** — al terminar, la cantidad de cargos vigentes + validacion_vacante debe igualar las filas del Excel. Es el número a vigilar en cada corrida.
2. **Neon_BD primero** — todo cambio se prueba en el branch de desarrollo antes de tocar producción.
3. **Simular antes de escribir** — cada fase tiene modo dry-run obligatorio. Jorge aprueba las cifras antes de ejecutar.
4. **Sin datos personales en logs/reportes** — CUIL, nombres e `id_sial_rol` no salen a ninguna salida.
5. **Idempotencia** — dos corridas con el mismo Excel dan el mismo resultado. La segunda no cambia nada.
6. **Documentar todo** — cada decisión de diseño queda en `ESTRUCTURA_BD.md`. Nada se decide de memoria.
7. **Rollback siempre disponible** — backup previo antes de cada fase destructiva. Transacciones únicas.

---

## Fase 0 — Conectar entorno local a Neon_BD ✅ COMPLETADA

**Objetivo:** tener el API local apuntando al branch de desarrollo para que todo el trabajo posterior no toque producción.

### Tareas

- [x] **0.1** Crear `docker-compose.neonbd.yml` — override que solo cambia `DATABASE_URL` al branch `Neon_BD`. No modifica el `.override.yml` que apunta a producción.
- [x] **0.2** Actualizar `.env` con la URL de `Neon_BD` para desarrollo local sin Docker.
- [x] **0.3** Levantar el contenedor con el nuevo override y verificar que el API responde.
- [x] **0.4** Correr `prisma migrate status` contra `Neon_BD` — confirmar que el schema está en sync (el branch viene de producción).
- [x] **0.5** Smoke test: login, listado de cargos, listado de personas, un snapshot de padrón.

**Criterio de salida:** ✅ el API local responde contra `Neon_BD` sin errores. `migrate status` sin migraciones pendientes.

---

## Fase 1 — Diagnóstico completo del DDL ✅ COMPLETADA

**Objetivo:** fotografiar el estado real de cada tabla: filas, columnas vivas vs muertas, índices, FKs, uso en código. Producir el documento `ESTRUCTURA_BD.md` con el estado actual y el estado objetivo de cada tabla.

### Tareas

- [x] **1.1** Ejecutar script de diagnóstico en Neon_BD — contar filas por tabla, listar columnas con `information_schema`, detectar columnas con 100% NULL.
- [x] **1.2** Auditar cada tabla contra el código — confirmar qué columnas lee/escribe el API actualmente.
- [x] **1.3** Clasificar cada tabla en una de tres categorías.
- [x] **1.4** Documentar hallazgos en `ESTRUCTURA_BD.md` (tabla por tabla).
- [x] **1.5** Responder las preguntas de diagnóstico de la sección siguiente con Jorge.

**Criterio de salida:** ✅ `ESTRUCTURA_BD.md` completo. Todas las preguntas de diagnóstico (Grupos A/B/C/D/E) cerradas.

### Tablas a auditar (inventario completo)

| Tabla | Filas estimadas | Clasificación inicial | Decisión pendiente |
|---|---|---|---|
| `personas` | ~50k | DEUDA | `apellido`/`nombre` separados: ¿se usan? |
| `hospitales` | 75 | VIVA | — |
| `escalafones` | ~20 | VIVA | — |
| `codigos_registro` | ~20 | VIVA | — |
| `regimenes` | ~10 | VIVA | — |
| `cargos` | ~55k | DEUDA | Ver §Deuda cargos |
| `ocupaciones` | ~50k | DEUDA | `estado_persona` muerta, `cuil_y_rol` legacy |
| `roles_persona` | ~50k | DEUDA | ¿Se usa? Pipeline v2 la llena |
| `puestos_cargo` | ~300 | VIVA | — |
| `especialidades_puesto` | ~295 | VIVA | — |
| `padron_snapshots` | 42 | VIVA | — |
| `padron_diff` | ~200k | VIVA | Particionado futuro |
| `padron_historico` | ~240k | VIVA | Crece sin límite — particionado |
| `padron_incidencias` | ~3.2k | VIVA | — |
| `kpis_dotacion_snapshot` | ~500 | DEUDA | Rediseño pendiente (B-15) |
| `concursos` | ~2k | VIVA | — |
| `concursos_cph` | ~2k | VIVA | — |
| `concursos_cph_desiertos` | ~50 | VIVA | — |
| `concursos_ceetps` | ~500 | VIVA | — |
| `sorteos_jurado` | ~100 | VIVA | — |
| `miembros_jurado_sorteados` | ~500 | VIVA | — |
| `inscriptos_concurso` | ~1k | VIVA | — |
| `ordenes_merito` | ~50 | VIVA | — |
| `orden_merito_integrantes` | ~200 | VIVA | — |
| `jornadas_sorteo` | ~20 | VIVA | — |
| `jornada_sorteo_concursos` | ~50 | VIVA | — |
| `bajas` | ~3k | VIVA | — |
| `baja_sial_snapshots` | ~10 | VIVA | — |
| `baja_sial_diffs` | ~5k | VIVA | — |
| `baja_sial_registros` | ~5k | VIVA | — |
| `autorizaciones` | ~200 | VIVA | — |
| `solicitudes_alta` | ~100 | VIVA | — |
| `organigramas` | ~800 | VIVA | — |
| `organigrama_uploads` | ~5 | VIVA | — |
| `areas_programaticas` | 13 | VIVA | — |
| `cesacs` | ~90 | VIVA | — |
| `unidades_fijas_apayc` | ~7 | VIVA | — |
| `pou` | ~500 | VIVA | — |
| `usuarios` | ~30 | VIVA | — |
| `roles` | 7 | VIVA | — |
| `permisos` | 26 | VIVA | — |
| `role_permisos` | ~110 | VIVA | — |
| `role_jerarquias` | ~10 | VIVA | — |
| `refresh_tokens` | variable | VIVA | TTL/purga |
| `audit_logs` | ~10k | VIVA | Particionado futuro |
| `etiquetas` | ~20 | VIVA | — |
| `etiquetas_cargo` | ~50 | VIVA | — |
| `etiquetas_concurso_cph` | ~50 | VIVA | — |
| `etiquetas_concurso_ceetps` | ~20 | VIVA | — |
| `etiquetas_baja` | ~20 | VIVA | — |
| `etiquetas_solicitud_alta` | ~10 | VIVA | — |
| `notificaciones` | ~200 | VIVA | — |
| `tareas_pendientes` | ~50 | VIVA | — |
| `concursos_asignados` | ~20 | VIVA | — |
| `usuario_siglas` | ~20 | VIVA | — |
| `sync_corridas` | ~5 | VIVA | — |
| `jcat_cargo_jefatura` | ~20 | VIVA | — |
| `ref_agrupadores` | ~2k | HUÉRFANA | DROP — pipeline v2 no la usa |
| `ref_unificadores_puesto` | ~3k | HUÉRFANA | DROP — pipeline v2 no la usa |
| `ref_especialidades_cuil` | ~49k | HUÉRFANA | DROP — pipeline v2 no la usa |
| `ref_correcciones_especialidad` | ~200 | HUÉRFANA | DROP — solo `/cruzar` legacy |
| `ref_especialidad_por_puesto` | ~100 | HUÉRFANA | DROP — solo `/cruzar` legacy |
| `ref_abreviaturas_tecnicas` | ~50 | VIVA | Pipeline v2 la usa |
| `ref_abreviaturas_titulo` | ~50 | VIVA | Pipeline v2 la usa |
| `ref_correcciones_lit_puesto` | ~100 | VIVA | Pipeline v2 la usa |
| `ref_conectores_minuscula` | ~20 | VIVA | Pipeline v2 la usa |
| `ref_sufijos_ordinales` | ~10 | VIVA | Pipeline v2 la usa |
| `msgc_puestos` | 1.595 | NUEVA | Esquema estrella MSGC |
| `msgc_personas` | 47.278 | NUEVA | Esquema estrella MSGC |
| `msgc_cargos` | 53.064 | NUEVA | Esquema estrella MSGC |
| `msgc_hechos_cargo_persona` | 53.064 | NUEVA | Esquema estrella MSGC — FKs cargo pendientes |

### Deuda conocida en `cargos`

| Columna | Estado | Acción |
|---|---|---|
| `literal_puesto` | Snapshot legacy del padrón | Mantener como auditoría — no es fuente de verdad |
| `especialidad_legacy` | Snapshot legacy del padrón | Mantener como auditoría — no es fuente de verdad |
| `agrupador` | Columna muerta (pipeline v2 no la escribe) | Confirmar y deprecar |
| `unificador_puesto` | Columna muerta (pipeline v2 no la escribe) | Confirmar y deprecar |
| `regimen` (string) | Convive con `regimen_id` (FK) | Deprecar el string cuando `regimen_id` esté completo |
| `codigo_legacy` | Columna nueva para Fase 2 MSGC | Agregar en migración |
| `puesto_codigo_sial` | ¿Se usa? | Auditar |
| `cod_agrupamiento` / `agrupamiento` | ¿Se usan? | Auditar |

### Deuda conocida en `ocupaciones`

| Columna | Estado | Acción |
|---|---|---|
| `estado_persona` | Muerta — reemplazada por `situacion_revista` | DROP (pendiente confirmar que no hay código que la lea) |
| `cuil` | Renombrada de `cuil_y_rol` — ahora guarda solo CUIL | OK — mantener |
| `dias_guardia` | Array — ¿se usa? | Auditar |

---

## Fase 2 — Limpieza DDL (tablas huérfanas y columnas muertas) ✅ COMPLETADA

**Objetivo:** eliminar lo que ya no se usa. Reducir el schema a lo que realmente existe.

**Prerrequisito:** Fase 1 completa + respuestas de Jorge a las preguntas de diagnóstico.

### Tareas

- [x] **2.1** Backup de las 5 tablas `ref_*` huérfanas antes de dropear.
- [x] **2.2** Eliminar endpoints legacy del Dotaneitor (`/procesar`, `/cruzar`, `/normalizar`, `/session`, `/preview`, `/historial`, `/guardar-bd`, `/ultima-actualizacion`).
- [x] **2.3** DROP de las 5 tablas `ref_*` huérfanas (`ref_agrupadores`, `ref_unificadores_puesto`, `ref_especialidades_cuil`, `ref_correcciones_especialidad`, `ref_especialidad_por_puesto`) — confirmado: no existen en `schema.prisma`.
- [x] **2.4** DROP de `ocupaciones.estado_persona` — confirmado: no existe en `schema.prisma`.
- [x] **2.5** DROP de `cargos.agrupador` y `cargos.unificador_puesto` — confirmado: no existen en `schema.prisma`.
- [x] **2.6** Agregar `cargos.codigo_legacy` (nullable VARCHAR(30)) — confirmado: `codigoLegacy String?` existe en `schema.prisma` con índice.
- [x] **2.7** Actualizar `Contrato_Datos.md` y `ESTRUCTURA_BD.md` con el schema limpio.
- [ ] **2.8** Activar `strict: true` en `apps/api/tsconfig.json` y corregir los errores que destape. ⚠️ PENDIENTE

**Criterio de salida:** ✅ Schema limpio confirmado contra `schema.prisma`. Pendiente: 2.8 (`strict: true`).

**Notas de ejecución:**
- `personas.apellido` / `personas.nombre` también dropeados (C3) — confirmado: no existen en `model Persona`.
- `roles_persona` dropeada (C4) — confirmado: no existe como modelo.
- `audit_logs` y `refresh_tokens` dropeadas (D3/D4) — confirmado: no existen como modelos.
- `cargos.cargo_ejecucion_id` agregado (A3) — confirmado: `cargoEjecucionId String?` con FK y relación `CargoEjecucion`.
- `padron_historico.estado_persona` dropeada — confirmado: no existe en `model PadronHistorico`.

---

## Fase 3 — Recodificación de prefijos de cargo (Fase 2 del MSGC sync) ✅ COMPLETADA (TypeScript)

**Objetivo:** que el acrónimo del Excel MSGC reemplace el prefijo del código de cargo. `CPH-POF-000123` → `CPH-P-000123`. Al terminar, ningún cargo tiene prefijo viejo.

**Prerrequisito:** Fase 2 completa. `cargos.codigo_legacy` existe.

### Tareas

- [x] **3.1** `acronimoMsgc` vive en `apps/api/src/shared/acronimoMsgc.ts`. Importado desde `codigoCargo.ts`.
- [x] **3.2** `prefijoDeCargo()` actualizado: interruptor `NOMENCLATURA_CODIGO_CARGO` selecciona `prefijoDeCargoMsgc` (acrónimos MSGC) o `prefijoDeCargoLegacy` (prefijos históricos). Default: `legacy`.
- [x] **3.3** `prefijoRemplazante()` actualizado: `msgc` → `R-{prefijo}` adelante; `legacy` → `{prefijo}-R` sufijo.
- [x] **3.4** `ParamsPrefijoCargo` limpiado: `agrupador` y `unificadorPuesto` eliminados, reemplazados por `literalPuesto?: string | null`. Todos los call sites actualizados (`derivarCargosConduccion.ts`, `autorizaciones.service.ts`, `cargos.service.ts`, `retenciones.service.ts`, `padron.service.ts`).
- [ ] **3.5** Script de recodificación de cargos existentes en BD. ⚠️ PENDIENTE
- [ ] **3.6** Resolver colisiones. ⚠️ PENDIENTE (bloqueado por 3.5)
- [ ] **3.7** Verificación en BD: `SELECT count(*) FROM cargos WHERE codigo ~ '^(CPH-POF|CPH-POU)'` = 0. ⚠️ PENDIENTE (bloqueado por 3.5)
- [x] **3.8** Tests unitarios: 115 tests verdes (4 archivos: `codigoCargo.test.ts`, `codigoCargo.legacy.test.ts`, `escalafonCph.unit.test.ts`, `alta-concursos-automaticos.unit.test.ts`).

**Criterio de salida parcial:** ✅ TypeScript limpio, 115 tests verdes. Pendiente: script de recodificación de BD (3.5–3.7) — se ejecuta cuando `NOMENCLATURA_CODIGO_CARGO=msgc` esté listo para activarse.

**Notas de ejecución:**
- El interruptor `legacy` (default) garantiza que producción no se ve afectada hasta que la BD esté recodificada.
- `POU Guardia`: criterio migrado de `unificador_puesto = 'POU Guardia'` a `UPPER(literal_puesto) LIKE '%GUARDIA%'`.
- TTR eliminado: todo remplazante es `R-`. Los de conducción son `R-CPH-J-*`.
- `agrupador` en `derivarCargosConduccion.ts` (campo BD `jcat:xxx`) es diferente al parámetro dropeado — se mantiene.

---

## Fase 4 — Catálogos completos (Fase 3 del MSGC sync)

**Objetivo:** que los catálogos del sistema resuelvan todas las filas del Excel. Categoría `j` de la simulación en cero.

### Tareas

- [x] **4.1** Crear `dim_efectores` con 94 efectores (77 de `hospitales` + 17 nuevos: 15 DGAH*, EAIT, SSSAME). FK desde `dim_puestos.efector` validada.
- [ ] **4.2** Resolver alias de puestos (equivalencias en el sistema, no en el Excel).
- [ ] **4.3** Actualizar `ANEXO_II_83` en `derivarRegimen.ts` (agregar `radio operador`, sacar `capellan` y `chofer de funcionario`).
- [ ] **4.4** Normalizar especialidad `enfermeria` → `Enfermeros ATC`.
- [ ] **4.5** Resolver residencias `RB`, `RPB`, `RES-J` por literal de puesto.
- [ ] **4.6** Recalcular `regimen_id` de las ocupaciones afectadas por el cambio de Anexo II.

**Criterio de salida:** simulación MSGC con categoría `j` = 0 (salvo excepciones aprobadas por Jorge).

---

## Fase 5 — Sincronización MSGC modo escritura (Fase 5 del MSGC sync)

**Objetivo:** aplicar a la BD lo que la simulación reporta. Idempotente y repetible cada semana.

**Prerrequisito:** Fases 3 y 4 completas. Simulación aprobada por Jorge. Backup previo.

### Tareas

- [ ] **5.1** Implementar modo escritura del sync (flag explícito, transacción única, `statement_timeout`).
- [ ] **5.2** Crear cargos faltantes (categorías c, d, e de la simulación).
- [ ] **5.3** Resolver vacantes con vínculos (ver Pregunta 2 de diagnóstico).
- [ ] **5.4** Pasar a `no_vigente` los cargos del sistema que no están en el Excel (categoría g).
- [ ] **5.5** Vincular cada cargo creado con su expediente de origen (columna M del Excel, concursos, bajas, padrón).
- [ ] **5.6** Verificar idempotencia: segunda corrida con el mismo Excel = cero cambios.
- [ ] **5.7** Registrar corrida en `sync_corridas`.

**Criterio de salida:** `vigente + validacion_vacante` = filas del Excel. Segunda corrida = cero cambios.

---

## Fase 6 — Proceso semanal MSGC automatizado

**Objetivo:** que la carga de un Excel nuevo actualice los cargos automáticamente, con reporte de diferencias.

### Tareas

- [ ] **6.1** Endpoint `POST /api/v1/msgc/sync` — recibe el Excel, corre simulación, devuelve reporte.
- [ ] **6.2** Endpoint `POST /api/v1/msgc/sync/aplicar` — aplica los cambios tras aprobación.
- [ ] **6.3** Reporte semanal: delta contra corrida anterior, desglose por acrónimo, sin datos personales.
- [ ] **6.4** Agregar modelos `msgc_*` al `schema.prisma` para consultas desde el API.
- [ ] **6.5** Re-resolver FKs de cargo en `msgc_hechos_cargo_persona` (quedaron en null — ver contexto de sesión).
- [ ] **6.6** Documentar el proceso en `Contrato_Padron.md` (sección MSGC).

**Criterio de salida:** carga de un Excel nuevo actualiza los cargos. Reporte generado sin datos personales.

---

## Fase 7 — Verificación final y documentación

- [ ] **7.1** Conteo final: `vigente + validacion_vacante` = filas del Excel, desglose por acrónimo.
- [ ] **7.2** Cero cargos con prefijo viejo.
- [ ] **7.3** Recalcular `sub_estado` de todos los cargos.
- [ ] **7.4** Revisar KPIs de dotación — si alguna migración los afectó, re-correr backfills.
- [ ] **7.5** `ESTRUCTURA_BD.md` actualizado con el schema final.
- [ ] **7.6** `Contrato_Datos.md` actualizado.
- [ ] **7.7** Aplicar cambios a producción siguiendo `DEPLOY_PRODUCCION.md §7`.

---

## Decisiones de diagnóstico — CERRADAS

> Todas las preguntas fueron respondidas. Este registro es inmutable.
> Es la fuente de verdad de cada decisión de diseño tomada antes de ejecutar el sprint.

---

### Grupo C — Columnas muertas

**C1. `cargos.agrupador` y `cargos.unificador_puesto`**
- **Decisión:** DROP. La regla de negocio que las generaba ya no existe en el pipeline v2.
- **Acción:** auditar todo el código antes de dropear para confirmar que nada las lee.

**C2. `ocupaciones.estado_persona`**
- **Decisión:** DROP. Reemplazada definitivamente por `situacion_revista`.
- **Catálogo cerrado de `situacion_revista`:** `activo` / `retencion_de_cargo` / `comisionado`. Solo estos tres valores.
- **Bloqueo:** NO es una situación de revista. Vive en `fecha_bloqueo` (columna separada, se mantiene). El padrón semanal trae la fecha si el cargo está bloqueado.
- **Acción:** auditar código, dropear columna, actualizar pipeline para no escribirla.

**C3. `personas.apellido` y `personas.nombre` (separados)**
- **Decisión:** DROP. No se usan en ningún endpoint ni reporte activo.
- **Columna que se usa:** `apellido_nombre` (campo completo). Es la fuente de verdad para mostrar el nombre.

**C4. `roles_persona`**
- **Decisión:** DROP completo de la tabla.
- **Motivo:** el historial de roles de una persona ya vive en `ocupaciones`. Una ocupación cerrada (`hasta IS NOT NULL`) ES el historial. No hace falta tabla separada.
- **Fix asociado en `getPersonaSialRolesService`:** sacar el filtro `AND o.hasta IS NULL` para devolver todos los roles (vigentes e históricos). Agregar `o.hasta`, `o.situacion_revista`, `cr.codigo || ' - ' || cr.literal`, `ep.nombre` al SELECT.

---

### Grupo A — Recodificación de prefijos

**A1. Códigos del Excel son la fuente de verdad**
- **Decisión:** el código del Excel es el código del sistema. No hay colisiones porque cada código del Excel tiene su persona con su CUIL — el Excel ya resolvió la unicidad.
- **Formato:** Excel usa 5 dígitos (`CPH-P-00001`). Sistema usa 6 (`CPH-P-000001`). Al importar se agrega un `0` adelante del secuencial.
- **Cargos no en el Excel:** pasan a `no_vigente`. Conservan su código actual.
- **`codigo_legacy`:** se agrega a `cargos` (nullable VARCHAR(30)) para guardar el código viejo antes de recodificar. Permite rollback y búsqueda por código anterior.

**A2. Autoridades Superiores (CR 25)**
- **Decisión:** todos los CR 25 pasan a prefijo `AS-xxxxxx`. Un solo prefijo para todos.
- **Los códigos `AS-MIN`, `AS-SS`, `AS-DG`, `AS-DGA` actuales son de testeo** — se reemplazan.
- **El nivel (MIN/SS/DG/DGA) no se guarda** — no es un requerimiento operativo activo.

**A3. Jefaturas ENF-J / TEC-J / EG-J**
- **Modelo:** el cargo de conducción (`ENF-J-000045`) contiene al cargo de ejecución (`ENF-000045`). El sufijo numérico es siempre el mismo — es la clave del vínculo.
- **Implementación:** columna nueva `cargo_ejecucion_id` (FK nullable en `cargos`). No se reusa `cargo_base_id` que ya tiene otro significado (cadena de retención).
- **Ciclo de vida:** cuando la persona deja la jefatura, `ENF-J-000045` se da de baja. `ENF-000045` queda vacante y va a concurso. El cargo de conducción está ligado a la persona, no existe independientemente.
- **Estructura:** cargo de conducción → ocupado por → cargo de ejecución → ocupado por → persona.

---

### Grupo B — Sincronización MSGC

**B1. Vacantes con vínculos**
- **Decisión:** el Excel manda. Se ajusta el cargo del sistema para que quede igual al Excel.
- **Casos con inconsistencias** que el sistema no puede resolver solo: NO se suben. Van al **Excel de análisis** para revisión manual.
- **Regla del Excel de análisis:** ningún cargo entra al sistema sin sigla, carrera y puesto resueltos. Cualquier fila con alguno de estos campos vacíos o sin equivalencia va al Excel de análisis.

**B2. "En validación" del Excel**
- Con expediente de baja en el Excel → `validacion_vacante`
- Sin expediente de baja → `vigente` + `sub_estado = vacante`

**B3. Concurso automático**
- **Decisión:** NO. El Excel ya indica qué cargos están en concurso. El sync crea el cargo con el estado que corresponde sin disparar apertura automática.

**B4. Mapeo completo de columnas del Excel**
- **Decisión:** todas las columnas del Excel se mapean al sistema. Ningún dato se descarta.

| Columna Excel | Destino en sistema |
|---|---|
| `Código de Cargo` | `cargos.codigo` (+ padding a 6 dígitos) |
| `Código de Registro` | `cargos.codigo_registro_id` |
| `Sigla` | `cargos.hospital_id` |
| `Literal Puesto` | `cargos.puesto_cargo_id` + `cargos.literal_puesto` |
| `CUIL / Expediente` | `ocupaciones` si es CUIL / `cargos.expediente` si es expediente de baja |
| `ID SIAL Rol` | `ocupaciones.id_sial_rol` |
| `Apellido y nombre` | `personas.apellido_nombre` (solo para cruce — no se sobreescribe) |
| `Especialidad del cargo` | `cargos.especialidad_puesto_id` + `cargos.especialidad_legacy` |
| `Especialidad del ocupante` | `personas.especialidad_cph` |
| `Situación de revista` | `ocupaciones.situacion_revista` |

> El mapeo completo se finaliza en la Fase 5 cuando se abra el Excel real columna por columna.

---

### Grupo D — Performance y arquitectura

**D1. Procesador_Meta4 — nuevo ETL**
- **Decisión:** reemplazar el Dotaneitor con un nuevo servicio `Procesador_Meta4` (Python/FastAPI).
- **Entrada:** mismo archivo Excel semanal Meta4/SIAL.
- **Reglas:** las mismas del Dotaneitor pero reescritas, vinculadas a las tablas del sistema, con lógica completa de completar especialidades vacías. Sin campos vacíos donde haya datos disponibles.
- **`padron_historico`:** tabla de hechos central. Se guarda todo — comportamiento de personas, carreras, especialidades por mes y año. Sin purga. Necesario para análisis histórico.
- **Lógica de diff:** se rediseña. El histórico denso en `padron_historico` reemplaza la necesidad de reconstruir estado desde diffs. Los diffs quedan como registro de cambios puntuales, no como fuente de verdad para KPIs ni gráficos.

**D2. `padron_diff`**
- **Decisión:** se rediseña junto con el Procesador_Meta4. La lógica actual genera problemas al reconstruir KPIs y gráficos. Con `padron_historico` como tabla de hechos, el diff es secundario.

**D3. `audit_logs`**
- **Decisión:** DROP de tabla y código en desarrollo. Se reimplementa mejor cuando corresponda.

**D4. `refresh_tokens`**
- **Decisión:** DROP de tabla y código en desarrollo. Se reimplementa mejor cuando corresponda.

---

### Grupo E — Siglas y catálogos

**E1. Siglas nuevas**
- **Decisión:** cruzar por nombre completo, no por sigla. Si dos siglas distintas del Excel corresponden a la misma entidad del sistema (ej. `SSAME` = `SSSAME`), se usa la del sistema.
- **Solo se agrega una sigla nueva** si no tiene equivalencia por nombre completo en `hospitales`.
- **Las equivalentes** heredan el universo y tipo del sistema — no se crean duplicados.

**E2. Puestos sin destino**
- **CR 87 (Nueva Carrera Enfermería):** el catálogo debe tener `enfermeria` y `licenciado en enfermeria` (minúscula, sin acento).
- **CR 85 (CEETPS):** cruzar por nombre normalizado contra el catálogo del sistema. Si hay equivalencia, se usa la del sistema. Sin equivalencia → Excel de análisis.
- **Normalización general:** la ley del puesto la da el padrón semanal. El sistema normaliza: minúscula, sin acento, vincula a la entrada existente del catálogo. Esta regla aplica tanto al sync MSGC como al padrón semanal.
- **Filas con puesto/sigla/carrera vacíos:** van al Excel de análisis. Ningún cargo entra al sistema sin estos tres campos resueltos.

---

## Riesgos transversales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Recodificación a medias deja dos formatos conviviendo | Media | Alto | Transacción única + verificación post-migración |
| Filtros por regex de prefijo dejan de reconocer jefaturas | Alta | Alto | Auditar todos los consumidores antes de recodificar |
| Sync MSGC apunta a producción por error | Baja | Crítico | Override de BD explícito + flag `--dry-run` obligatorio |
| `padron_historico` crece sin límite y degrada queries | Media | Medio | Particionado en Fase 7 si supera umbral |
| Excel MSGC cambia de semana a semana | Alta | Bajo | Proceso idempotente + reporte de delta |
| DROP de tabla huérfana que sí se usa en algún script olvidado | Baja | Medio | Backup previo + búsqueda en todo el repo antes de dropear |

---

## Orden de ejecución recomendado

```
Fase 0 (conectar Neon_BD)
    ↓
Fase 1 (diagnóstico + preguntas A/B/C/D/E)
    ↓ [esperar respuestas de Jorge]
Fase 2 (limpieza DDL — respuestas C)
    ↓
Fase 3 (recodificación — respuestas A)
    ↓
Fase 4 (catálogos — respuestas E)
    ↓
Fase 5 (sync escritura — respuestas B)
    ↓
Fase 6 (proceso semanal)
    ↓
Fase 7 (verificación + deploy a producción)
```

---

## Referencias

- `Doc/Contratos/ESTRUCTURA_BD.md` — DDL revisado (se crea en Fase 1)
- `Doc/Contratos/Contrato_Datos.md` — modelo de datos vigente
- `Doc/Contratos/Contrato_Logica_Cargo.md` — ciclo de vida del cargo
- `Doc/Contratos/Contrato_Padron.md` — flujo del padrón semanal
- `Doc/Desarrollo/SYNC_CARGOS_MSGC_DISENO_FASES_2_6.md` — diseño detallado de las fases MSGC
- `Doc/Planificacion/SPRINT_LIMPIEZA_Y_ARQUITECTURA.md` — backlog de limpieza acumulado
- `prisma/schema.prisma` — schema actual (fuente de verdad técnica)
