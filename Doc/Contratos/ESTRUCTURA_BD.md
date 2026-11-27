# Estructura de Base de Datos — SRRHH v2

> Fuente de verdad del DDL revisado. Se construye durante el Sprint de Reestructuración BD.
> Complementa `Contrato_Datos.md` (que documenta el modelo conceptual) con el estado
> real de cada tabla: filas, columnas vivas/muertas, índices, decisiones de limpieza.
>
> Estado: FASES 0–2 COMPLETADAS. Fase 3 TypeScript completa (BD pendiente).
> Última actualización: 2027-01 — Fase 5 operativa en producción. Primera confirmación exitosa. `dim_actividad_hechos` corregida: 48.606 actividades abiertas. Columnas reales documentadas: `efector` (no `hospital_sigla`), `salud_1er_cargo` (no `salud_primer_cargo`). Fixes de arquitectura Neon serverless documentados.

---

## Leyenda de clasificación

| Símbolo | Significado |
|---|---|
| ✅ VIVA | En uso activo. No tocar sin análisis previo. |
| ⚠️ DEUDA | En uso pero con columnas muertas o normalización incompleta. |
| 🗑️ HUÉRFANA | No la lee ni escribe ningún flujo vivo. Candidata a DROP. |
| 🆕 NUEVA | Creada en este sprint (esquema estrella MSGC). |

---

## Grupo 1 — Catálogos base

### `hospitales` ✅ VIVA
- **Filas:** 77
- **Uso:** fuente de verdad operativa. FK desde `cargos`, `concursos`, `bajas`, `usuarios`, etc.
- **Columnas a revisar:** ninguna — schema limpio.
- **Nota:** los efectores del padrón MSGC viven en `dim_efectores` (esquema estrella).

### `dim_efectores` 🆕
- **Filas:** 79 (64 activos, 15 inactivos)
- **PK:** `sigla` VARCHAR(20)
- **Uso:** catálogo de efectores del esquema estrella. Reemplazará a `hospitales` cuando el esquema estrella esté completo. FK desde `dim_puestos.efector` y `dim_cargos.efector`.
- **Columnas:** `sigla`, `nombre`, `nombre_completo`, `nombre_resumido`, `tipo`, `universo_totalizador`, `monovalencia`, `comuna`, `tamanio`, `tipificacion_ssah`, `activo`, `en_hospitales`
- **`nombre_completo`:** nombre formal del efector (ej. `Hospital General de Agudos Dr. Carlos G. Durand`). Fuente: columna `DESC_REP` del CSV del padrón. 66/79 poblados.
- **`en_hospitales`:** true = existe en `hospitales` operativo (64 registros).
- **Inactivos (15):** 12 efectores sin cargos que ya no existen + 3 adicionales. Se conservan para trazabilidad.
- **Excluidos:** 15 siglas DGAH* (Direcciones Adjuntas internas de hospitales) — no son efectores independientes.
- **Nota:** `SSAME` en `hospitales` es errata de `SSSAME`. Los cargos operativos siguen apuntando a `SSAME` en `hospitales` hasta que se migre.

### `escalafones` ✅ VIVA
- **Filas:** ~20
- **Uso:** catálogo de escalafones. FK desde `cargos`, `codigos_registro`, `puestos_cargo`, etc.
- **Columnas a revisar:** ninguna.

### `codigos_registro` ⚠️ DEPRECADA (contexto MSGC)
- **Filas:** ~20
- **Uso:** mapeo código numérico SIAL → escalafón canónico. Fuente de verdad para resolver escalafón al procesar el padrón.
- **Reemplazada por:** `dim_carreras` en el contexto MSGC (Fase 6.3). Sigue viva para flujos operativos no-MSGC.
- **Columnas a revisar:** ninguna.

### `regimenes` ✅ VIVA
- **Filas:** ~10
- **Uso:** clasificación de grupos de cargos. FK desde `cargos.regimen_id`.
- **Columnas a revisar:** ninguna.

### `puestos_cargo` ⚠️ DEPRECADA (contexto MSGC)
- **Filas:** ~300
- **Uso:** catálogo normalizado de puestos por escalafón. FK desde `cargos`, `solicitudes_alta`, `concursos_cph`, `concursos_ceetps`.
- **Reemplazada por:** `dim_puestos` en el contexto MSGC (Fase 6.2). Sigue viva para flujos operativos no-MSGC.
- **Columnas a revisar:** `pendiente_curar` — ¿cuántos registros tienen este flag en true?

### `especialidades_puesto` ⚠️ DEPRECADA (contexto MSGC)
- **Filas:** ~295
- **Uso:** especialidades válidas por puesto. FK desde `cargos`, `solicitudes_alta`, `concursos_cph`.
- **Reemplazada por:** `dim_puestos` en el contexto MSGC (Fase 6.2). Sigue viva para flujos operativos no-MSGC.
- **Columnas a revisar:** `pendiente_curar`, `grupo` (S25 — ¿poblado?).

### `jcat_cargo_jefatura` ✅ VIVA
- **Filas:** ~20
- **Uso:** mapeo JCAT → cargo de jefatura. Lo usa el Dotaneitor v2 para resolver `cargo_jefatura_puesto_id`.
- **Columnas a revisar:** ninguna.

---

## Grupo 2 — Entidades principales

### `personas` ⚠️ DEUDA
- **Filas:** ~50k
- **Uso:** entidad central. FK desde `ocupaciones`, `concursos`, `bajas`, `padron_historico`, etc.
- **Columnas a revisar:**

| Columna | Estado | Decisión |
|---|---|---|
| `apellido_nombre` | Viva — usada en documentos y vistas | Mantener |
| `apellido` / `nombre` | ✅ DROPEADAS — no existen en `schema.prisma` | Completado (C3) |
| `especialidad_cph` | Viva — se popula al aprobar snapshot | Mantener |
| `activo` | Viva — invariante: true si tiene ocupación vigente | Mantener |

### `cargos` ⚠️ DEUDA
- **Filas:** ~55k
- **Uso:** entidad central. FK desde casi todo.
- **Columnas a revisar:**

| Columna | Estado | Decisión |
|---|---|---|
| `id_sial` | Viva — legajo SIAL de la persona en importación inicial | Mantener (no identifica el cargo estructural) |
| `codigo` | Viva — código interno del sistema | Recodificar en Fase 3 (prefijos MSGC) — script pendiente |
| `codigo_legacy` | ✅ EXISTE — `codigoLegacy String?` con índice | Completado (A1) |
| `literal_puesto` | Snapshot legacy del padrón | Mantener como auditoría — no es fuente de verdad |
| `especialidad_legacy` | Snapshot legacy del padrón | Mantener como auditoría — no es fuente de verdad |
| `puesto_cargo_id` | Viva — FK al catálogo | Mantener |
| `especialidad_puesto_id` | Viva — FK al catálogo | Mantener |
| `agrupador` | ✅ DROPEADA — no existe en `schema.prisma` | Completado (C1) |
| `unificador_puesto` | ✅ DROPEADA — no existe en `schema.prisma` | Completado (C1) |
| `regimen` (string) | Legacy — convive con `regimen_id` | Deprecar cuando `regimen_id` esté completo |
| `regimen_id` | Viva — FK a `regimenes` | Mantener |
| `puesto_codigo_sial` | **Auditar** — ¿se usa? | Pendiente |
| `cod_agrupamiento` / `agrupamiento` | **Auditar** — ¿se usan? | Pendiente |
| `origen` | Viva — `padron`/`organigrama`/`manual` | Mantener |
| `cargo_ejecucion_id` | ✅ EXISTE — `cargoEjecucionId String?` con FK `CargoEjecucion` | Completado (A3) |
| `cesac_id` / `unidad_fija_id` | Vivas — S23 | Mantener |
| `cargo_retenido_id` / `cargo_base_id` | Vivas — cadena retención S18 | Mantener |

### `ocupaciones` ⚠️ DEUDA
- **Filas:** ~50k
- **Uso:** relación persona↔cargo con vigencia temporal. Fuente de verdad de quién ocupa qué hoy.
- **Columnas a revisar:**

| Columna | Estado | Decisión |
|---|---|---|
| `id_sial_rol` | Viva — UNIQUE, clave de cruce | Mantener |
| `cuil` | Viva — renombrada de `cuil_y_rol` | Mantener |
| `situacion_revista` | Viva — catálogo cerrado: activo/comision/retencion de cargo | Mantener |
| `estado_persona` | ✅ DROPEADA — no existe en `schema.prisma` | Completado (C2) |
| `fecha_bloqueo` | Fuente de verdad del bloqueo. El padrón trae la fecha si el cargo está bloqueado | MANTENER |
| `dias_guardia` | Auditar en Fase 1 | Pendiente |
| `cargo_jefatura_puesto_id` | Viva — S22-12 Opción B | Mantener |

### `roles_persona` ✅ DROPEADA
- **Decisión:** DROP completado. No existe como modelo en `schema.prisma`. El histórico de roles vive en `ocupaciones`. — C4 cerrada.
- **Fix asociado:** corregir `getPersonaSialRolesService` — sacar `AND o.hasta IS NULL`, agregar `o.hasta`, `o.situacion_revista`, `cr.codigo`, `ep.nombre` al SELECT. ⚠️ PENDIENTE

---

## Grupo 3 — Padrón semanal

### `padron_snapshots` ✅ VIVA
- **Filas:** 42
- **Uso:** cada carga semanal genera un snapshot. Inmutable una vez aprobado.
- **Columnas a revisar:** ninguna.

### `padron_diff` ⚠️ DEUDA — rediseño pendiente
- **Filas:** ~200k
- **Uso:** cambios detectados entre snapshot nuevo y estado actual.
- **Decisión D2:** se rediseña junto con el Procesador_Meta4. La lógica actual genera problemas al reconstruir KPIs y gráficos. Con `padron_historico` como tabla de hechos, el diff es secundario.

### `padron_historico` ✅ VIVA — tabla de hechos central
- **Filas:** ~240k (crece ~6k/semana)
- **Uso:** foto completa del padrón en cada fecha aprobada. Append-only. Fuente de verdad para análisis histórico de personas, carreras y especialidades por mes y año.
- **Decisión D1:** se guarda todo, sin purga. El Procesador_Meta4 la alimenta correctamente.
- **Columna `estado_persona`:** DROP — misma decisión que en `ocupaciones` (C2 cerrada).

### `padron_incidencias` ✅ VIVA
- **Filas:** ~3.2k
- **Uso:** incidencias del ciclo de vida del cargo, persistidas por snapshot en el paso 12.
- **Columnas a revisar:** ninguna.

---

## Grupo 4 — Concursos

### `concursos` ✅ VIVA
- **Filas:** ~2k
- **Uso:** registro de vacantes que originan proceso concursal. Tabla padre de CPH y CEETPS.

### `concursos_cph` ✅ VIVA
- **Filas:** ~2k
- **Uso:** seguimiento de concursos CPH (Ley 6.035). Estado calculado server-side.

### `concursos_cph_desiertos` ✅ VIVA
- **Filas:** ~50
- **Uso:** historial de rondas desiertas.

### `concursos_ceetps` ✅ VIVA
- **Filas:** ~500
- **Uso:** seguimiento de concursos ENF/TEC/EG.

### `sorteos_jurado` ✅ VIVA
- **Filas:** ~100

### `miembros_jurado_sorteados` ✅ VIVA
- **Filas:** ~500

### `inscriptos_concurso` ✅ VIVA
- **Filas:** ~1k

### `ordenes_merito` ✅ VIVA
- **Filas:** ~50

### `orden_merito_integrantes` ✅ VIVA
- **Filas:** ~200

### `jornadas_sorteo` / `jornada_sorteo_concursos` ✅ VIVA
- **Filas:** ~20 / ~50

---

## Grupo 5 — Bajas

### `bajas` ✅ VIVA
- **Filas:** ~3k

### `baja_sial_snapshots` ✅ VIVA
- **Filas:** ~10

### `baja_sial_diffs` ✅ VIVA
- **Filas:** ~5k

### `baja_sial_registros` ✅ VIVA
- **Filas:** ~5k

---

## Grupo 6 — Autorizaciones y solicitudes

### `autorizaciones` ✅ VIVA
- **Filas:** ~200

### `solicitudes_alta` ✅ VIVA
- **Filas:** ~100

---

## Grupo 7 — Organigrama y estructura

### `organigramas` ✅ VIVA
- **Filas:** ~800
- **Uso:** árbol estático de unidades organizativas. No cambia con el padrón.

### `organigrama_uploads` ✅ VIVA
- **Filas:** ~5

### `areas_programaticas` ✅ VIVA
- **Filas:** 13

### `cesacs` ✅ VIVA
- **Filas:** ~90

### `unidades_fijas_apayc` ✅ VIVA
- **Filas:** ~7

### `pou` ✅ VIVA
- **Filas:** ~500
- **Uso:** dotación por hospital/perfil/especialidad. Cada carga reemplaza la tabla entera.

---

## Grupo 8 — KPIs

### `kpis_dotacion_snapshot` ⚠️ DEUDA
- **Filas:** ~500
- **Uso:** evolución histórica de dotación por código de registro y situación de revista.
- **Deuda:** rediseño pendiente (backlog B-15). La forma en que se alimenta esta tabla va a cambiar.

---

## Grupo 9 — Seguridad y auditoría

### `usuarios` ✅ VIVA
- **Filas:** ~30

### `roles` / `permisos` / `role_permisos` ✅ VIVA
- **Filas:** 7 / 26 / ~110

### `role_jerarquias` ✅ VIVA
- **Filas:** ~10

### `refresh_tokens` ✅ DROPEADA
- **Decisión D4:** DROP completado. No existe como modelo en `schema.prisma`.

### `audit_logs` ✅ DROPEADA
- **Decisión D3:** DROP completado. No existe como modelo en `schema.prisma`.

---

## Grupo 10 — Etiquetas

### `etiquetas` + tablas pivote ✅ VIVA
- `etiquetas`: ~20 filas
- `etiquetas_cargo`, `etiquetas_concurso_cph`, `etiquetas_concurso_ceetps`, `etiquetas_baja`, `etiquetas_solicitud_alta`: pocas filas cada una.

---

## Grupo 11 — Notificaciones y tareas

### `notificaciones` ✅ VIVA
- **Filas:** ~200

### `tareas_pendientes` ✅ VIVA
- **Filas:** ~50

### `concursos_asignados` ✅ VIVA
- **Filas:** ~20

### `usuario_siglas` ✅ VIVA
- **Filas:** ~20

---

## Grupo 12 — Tablas de referencia Dotaneitor

### Tablas VIVAS (pipeline v2 las usa)

| Tabla | Filas | Uso |
|---|---|---|
| `ref_abreviaturas_tecnicas` | ~50 | Normalización de abreviaturas técnicas |
| `ref_abreviaturas_titulo` | ~50 | Normalización de abreviaturas de título |
| `ref_correcciones_lit_puesto` | ~100 | Correcciones de literal de puesto por cod_reg |
| `ref_conectores_minuscula` | ~20 | Conectores que van en minúscula |
| `ref_sufijos_ordinales` | ~10 | Sufijos ordinales |

### Tablas HUÉRFANAS ✅ DROPEADAS

> Todas dropeadas. No existen como modelos en `schema.prisma`.

| Tabla | Filas | Por qué quedó huérfana |
|---|---|---|
| `ref_agrupadores` | ~2k | Paso "agrupador" eliminado en pipeline v2 |
| `ref_unificadores_puesto` | ~3k | Paso "unificador" eliminado en pipeline v2 |
| `ref_especialidades_cuil` | ~49k | Cruce por CUIL reemplazado por catálogo + derivación por nombre |
| `ref_correcciones_especialidad` | ~200 | Solo `/cruzar` (endpoint legacy muerto) |
| `ref_especialidad_por_puesto` | ~100 | Solo `/cruzar` (endpoint legacy muerto) |

---

## Grupo 13 — Sync MSGC

### `sync_corridas` ✅ VIVA
- **Filas:** ~5
- **Uso:** bitácora de corridas del sync de cargos con el Excel MSGC.

---

## Grupo 14 — Esquema estrella MSGC 🆕

> Tablas de staging/mirror del padrón MSGC. Se alimentan desde el Excel semanal.
> La vinculación persona↔puesto se hace a través de `fact_asignaciones` (no dentro de `dim_puestos`).

### Arquitectura del esquema estrella

| Tabla | PK | Rol |
|---|---|---|
| `dim_puestos` | `id_sial_rol` | Atributos del puesto (cargo + rol). Un puesto = una persona a la vez. |
| `dim_personas` | `cuil` | Atributos de la persona. Una persona puede tener varios puestos. |
| `fact_asignaciones` | `id` | Vincula `id_sial_rol` ↔ `cuil` con fechas. Historial de asignaciones. |

**Regla de diseño:** `id_sial` y `cuil` son atributos de la persona — viven en `dim_personas` y `fact_asignaciones`, NO en `dim_puestos`.

### `dim_carreras` 🆕
- **PK:** `codigo_registro` VARCHAR(10)
- **Filas:** 16
- **Contenido:** catálogo de carreras/escalafones. Fuente de verdad para `dim_puestos.codigo_registro`.
- **Columnas:** `codigo_registro`, `lit_cod_reg`, `escalafon`, `activo`
- **Origen:** poblada desde `codigos_registro` + `escalafones` del sistema.

### Modelo de negocio: relación cargo ↔ puesto ↔ persona

**Dos instituciones, dos dominios:**
- **Hacienda** gestiona los *puestos* — crea, modifica y da de baja puestos en el padrón semanal. `dim_puestos` refleja su dominio.
- **MSGC** gestiona los *cargos* — crea cargos, concursa quién los ocupa. `dim_cargos` refleja su dominio.

**El vínculo cargo ↔ puesto se hace por persona:**
- Todo puesto necesita una persona.
- En un concurso se designa una persona → el cargo queda en espera hasta que esa persona aparezca en un nuevo puesto del padrón.
- El link `dim_cargos → dim_tipos_cargos` se hace por `(codigo_registro, literal_puesto)`. En producción puede haber diferencias de nomenclatura entre lo que declara MSGC y lo que carga Hacienda — eso es esperado y no rompe el esquema.
- La lógica de resolución cargo↔puesto por persona está implementada en las tablas operativas y se reformulará en Fase 5.

**`dim_tipos_cargos` como catálogo maestro:**
- Se puebla desde `dim_puestos` (padrón real de Hacienda) — es la fuente más completa y granular.
- `dim_cargos.literal_puesto` puede diferir del nombre en `dim_tipos_cargos` — es el nombre declarado por MSGC al crear el cargo. No es la fuente del catálogo.
- Ejemplo válido: `dim_tipos_cargos` tiene "medico de planta" con especialidad "cardiologia". El padrón trae "medico de planta" sin especialidad. Ambos linkean al mismo tipo. No es inconsistencia.

#### Regla de clasificación `tipo_cargo` en `dim_tipos_cargos`

Orden de precedencia (la primera regla que aplica gana):

| Prioridad | Condición | `tipo_cargo` |
|---|---|---|
| 1 | CR en `dim_carreras` con `escalafon` o `lit_cod_reg` ILIKE `%Docente%` o `%Residencia%` | `formacion` |
| 2 | `jcat` existe en `jcat_cargo_jefatura` con `familia = 'P'` y `cod_puesto IN ('01','03')` | `estructura` |
| 3 | `jcat` tiene cualquier valor no nulo (esté o no en `jcat_cargo_jefatura`) | `conduccion` |
| 4 | `jcat` es NULL | `ejecucion` |

**Sin hardcodeo**: todas las condiciones se derivan de la BD en runtime.
- Regla 1: leer CRs desde `dim_carreras`
- Regla 2: leer jcats de estructura desde `jcat_cargo_jefatura WHERE familia = 'P' AND cod_puesto IN ('01','03')`

**Fuente del `jcat`**: `dim_puestos.jcat`. Para cada `(codigo_registro, literal_puesto)` se toma el `jcat` más frecuente entre todos los `dim_puestos` que comparten esos valores.

**Caso borde confirmado**: `M26` (capellán, CR=83, baja 2016) no existe en `jcat_cargo_jefatura` pero tiene valor → regla 3 → `conduccion`.

**Nota:** los literales orgánicos (`div ...`, `secc ...`, `unid ...`, `dept ...`) en CR=25/60 son correctos por diseño — son los nombres de las unidades que esos cargos conducen.

### `dim_puestos` 🆕
- **PK:** `id_sial_rol` VARCHAR(12) (formato corto: `{id_sial}-{rol}`, ej: `001758874-10`)
- **Filas:** 65.046
- **Columnas actuales:**

| Columna | Tipo | Notas |
|---|---|---|
| `id_sial_rol` | VARCHAR(12) PK | Formato corto, sin cuil |
| `literal_puesto` | VARCHAR(200) | Fuente: padrón semanal, minúsculas sin tildes |
| `especialidad` | VARCHAR(200) | Fuente: padrón semanal, minúsculas sin tildes |
| `codigo_registro` | VARCHAR(10) FK→dim_carreras | 100% poblado |
| `cod_rep` | VARCHAR(10) | Código de repartición |
| `desc_rep` | VARCHAR(200) | Descripción repartición, minúsculas sin tildes |
| `jcat` | VARCHAR(10) | Solo jefaturas (~5.106 filas) |
| `doc_respald_alta` | VARCHAR(200) | Documento de alta |
| `efector` | VARCHAR(15) | Sigla del efector. **Nombre real de columna en BD: `efector`** (no `hospital_sigla`). FK → `dim_efectores.sigla` via subquery para evitar FK violation con siglas inexistentes. |
| `situacion_revista` | VARCHAR(50) | Minúsculas, sincronizado con padrón |
| `puesto_desde` | DATE | 100% poblado |
| `puesto_hasta` | DATE | NULL = activo |
| `motivo_baja` | VARCHAR(200) | Solo bajas |
| `doc_resp_baja` | VARCHAR(200) | Solo bajas |
| `sr_doc_respald` | VARCHAR(200) | Documento SR |
| `bloq_desde` | DATE | Fecha de bloqueo |
| `bl_motivo` | VARCHAR(200) | Motivo bloqueo, minúsculas |
| `escritorio` | VARCHAR(100) | Solo POU |
| `pou_desde` | DATE | Solo POU |
| `dia` | VARCHAR(20) | Solo POU |
| `doc_resp` | VARCHAR(200) | Documento POU |
| `padron_exist` | DATE | Fecha última vez visto en padrón activo |
| `bajas_exist` | DATE | Fecha última vez visto en padrón de bajas |

- **Columnas eliminadas:** `id_sial`, `cuil`, `cuil_anterior`, `escalafon` (reemplazada por FK a `dim_carreras`)
- **FK:** `codigo_registro → dim_carreras.codigo_registro`

### `dim_personas` 🆕
- **PK:** `cuil` VARCHAR(11)
- **Filas:** 49.653
- **Columnas actuales:**

| Columna | Tipo | Notas |
|---|---|---|
| `cuil` | VARCHAR(11) PK | 100% poblado |
| `id_sial` | VARCHAR(20) | 100% poblado |
| `apellido_nombre` | VARCHAR(200) | Con espacio tras coma, minúsculas |
| `fecha_nacimiento` | DATE | — |
| `sexo` | VARCHAR(10) | 100% poblado: f/m/nb |
| `especialidad` | VARCHAR(200) | ~43.265 poblados |
| `antiguedad_desde` | DATE | — |
| `telefono` | VARCHAR(20) | Sin espacios ni +54 |
| `mail_personal` | VARCHAR(255) | Minúsculas |
| `mail_laboral` | VARCHAR(255) | Minúsculas |
| `domicilio` | VARCHAR(255) | Minúsculas sin tildes |
| `localidad` | VARCHAR(150) | Minúsculas sin tildes |
| `provincia` | VARCHAR(100) | Minúsculas sin tildes |
| `salud_1er_cargo` | DATE | Fecha primer cargo en salud. **Nombre real de columna en BD: `salud_1er_cargo`** (no `salud_primer_cargo`). |
| `activo` | BOOLEAN | — |

- **Columnas eliminadas:** `apellido`, `nombre` (separados) — reemplazados por `apellido_nombre`

### `fact_asignaciones` 🆕
- **Contenido:** vincula `id_sial_rol` ↔ `cuil` con `fecha_desde` / `fecha_hasta`. Historial completo de asignaciones.
- **`es_actual`:** columna calculada (`fecha_hasta IS NULL`).

### `dim_actividad_hechos` 🆕
- **Filas:** 65.253 total, **48.606 abiertas** (`fecha_hasta IS NULL`) post-fix 2027-01
- **Índice único parcial:** `WHERE fecha_hasta IS NULL` sobre `id_sial_rol` — garantiza una sola actividad abierta por puesto a nivel BD (migración `20261209000000_dim_actividad_hechos_unique_abierta`).
- **Fix 2027-01:** 42.210 actividades tenían `fecha_desde = fecha_hasta` (bug de carga del 08-11 que abrió y cerró actividades el mismo día). Corregidas con `UPDATE ... SET fecha_hasta = NULL WHERE id IN (SELECT DISTINCT ON (id_sial_rol) ...)`. Resultado: 48.606 abiertas (antes 6.401). Quedan 116 puestos activos sin actividad abierta (datos sucios históricos).
- **Apertura:** cuando un puesto aparece nuevo en cargos (`fecha_desde = fecha_corte`, `fecha_hasta = NULL`).
- **Cierre con fecha real:** cuando bajas registra `cargoHasta`.
- **Cierre con `fechaCorte`:** cuando un puesto desaparece del padrón de cargos.

### Notas de arquitectura Neon serverless (críticas)

> Estas restricciones aplican a **todos** los procesadores de carga semanal.

- **Sin `$transaction` con upserts en loop** — Neon serverless no tolera transacciones largas. Causa `Transaction not found`. Reemplazar con operaciones directas en serie.
- **Sin `Promise.all` con múltiples queries** — Neon cierra conexiones por inactividad (`Error { kind: Closed }`). Todo debe ser en serie.
- **Bulk SQL pattern:** `INSERT ... ON CONFLICT DO UPDATE` con `Prisma.join(values)` en lotes de 500. Requiere deduplicación previa (Postgres no acepta el mismo valor de PK dos veces en el mismo comando).
- **FK en `dim_puestos.efector`:** referencia a `dim_efectores.sigla`. El bulk insert usa subquery `(SELECT sigla FROM dim_efectores WHERE sigla = $1 LIMIT 1)` para evitar FK violation con siglas inexistentes.
- **Buffer en memoria:** el `bufferStore` se pierde con cada rebuild del container. Sesiones en `pendiente_confirmacion` devuelven 410 tras rebuild — deben descartarse y re-subirse.
- **Orden de confirmación:** `ocupacion_pou` → `bajas_salud` → `cargos_salud` → `arbol`.
- **Filas:** 1.595
- **Contenido:** catálogo de literal_puesto + especialidad del Excel MSGC.

### `msgc_personas`
- **Filas:** 47.278
- **Contenido:** una fila por CUIL único con id_sial, id_sial_rol, situacion_revista, especialidad.

### `dim_cargos` 🆕
- **PK:** `codigo_cargo` VARCHAR — formato `PREFIJO-NNNNNN` (6 dígitos con ceros, ej: `CPH-P-002315`)
- **Filas:** 53.064
- **Dominio:** MSGC — reemplazará a `cargos` como fuente de verdad de cargos del sistema.
- **`cargo_id_sistema`:** UUID FK a `cargos.id` del sistema operativo (puede ser NULL para cargos sin equivalente).
- **`estado`:** valores normalizados `vigente` / `validacion_vacante` / `no_vigente` (minúscula, sin tilde). Los `no_vigente` aparecerán a partir de la primera carga semanal.
- **Columnas:** `codigo_cargo`, `codigo_registro`, `literal_puesto`, `efector`, `modalidad`, `estado`, `sub_estado`, `especialidad_cargo`, `cargo_id_sistema`, `tipo_cargo_id`, `especialidad_id`, `dia_pou`, `jornada_enfermeria`
- **Fixes aplicados (2026-11-24):** `estado` normalizado a minúscula (52.274 + 790 filas); `codigo_cargo` repaddeado a 6 dígitos (2.588 filas). Scripts: `scripts/fix-dim-cargos-normalizar.mjs`, `scripts/sql/fix_dim_cargos_padding.sql`.
- **Pendiente:** recodificación de prefijos legacy (Fase 3.5).

### `msgc_cargos` ⚠️ STAGING
- **Filas:** 53.064
- **Contenido:** tabla de staging del sync MSGC Fase 1. Contiene el mapeo cargo↔persona del corte 2026-11-01. Útil para Fase 7. No dropear hasta completar Fase 7.

### `msgc_hechos_cargo_persona`
- **Filas:** 53.064
- **Contenido:** vincula cargo ↔ persona ↔ puesto + FK al sistema.
- **Pendiente:** re-resolver `cargo_id` con el API apuntando a Neon_BD (Fase 6, tarea 6.5).

---

## Decisiones de diseño — TODAS CERRADAS

| Decisión | Detalle | Origen |
|---|---|---|
| `padron_historico` es append-only y tabla de hechos central | Nunca se modifica ni borra. Fuente de verdad para KPIs y gráficos históricos | Contrato_Datos + D1 |
| `sub_estado` de cargo se persiste y recalcula | No se deriva en runtime | S-estado_subestado |
| `especialidad_legacy` se mantiene como snapshot | No es fuente de verdad — la fuente es `especialidad_puesto_id` | S20/21/22 |
| Tablas `ref_*` huérfanas se dropean | Pipeline v2 no las usa. Backup previo. | C1 + sprint limpieza |
| `codigo_legacy` se agrega a `cargos` | Para rollback de la recodificación de prefijos MSGC | A1 |
| Sync MSGC es idempotente | Dos corridas con el mismo Excel = mismo resultado | B1 |
| Códigos del Excel son la fuente de verdad | Excel 5 dígitos + 1 cero = 6 dígitos del sistema | A1 |
| Sin colisiones de código | Cada código del Excel tiene su persona con su CUIL | A1 |
| Prefijo `AS` unificado | Todos CR 25 → `AS-xxxxxx`. Los `AS-MIN/SS/DG/DGA` son de testeo | A2 |
| `cargo_ejecucion_id` FK nueva en `cargos` | Vínculo jefatura → cargo base. Sufijo siempre igual. | A3 |
| Al dejar jefatura: cargo conducción se da de baja | El cargo de ejecución queda vacante y va a concurso | A3 |
| `ocupaciones.estado_persona` DROP | Reemplazada por `situacion_revista` (catálogo cerrado) | C2 |
| `situacion_revista` catálogo cerrado | `activo` / `retencion_de_cargo` / `comisionado` | C2 |
| `fecha_bloqueo` se mantiene | Fuente de verdad del bloqueo. El padrón trae la fecha. | C2 |
| `personas.apellido` / `nombre` DROP | No se usan | C3 |
| `roles_persona` DROP | Histórico vive en `ocupaciones` | C4 |
| Fix `getPersonaSialRolesService` | Sacar `AND o.hasta IS NULL`, agregar campos faltantes | C4 |
| `audit_logs` DROP en desarrollo | Se reimplementa mejor cuando corresponda | D3 |
| `refresh_tokens` DROP en desarrollo | Se reimplementa mejor cuando corresponda | D4 |
| Procesador_Meta4 reemplaza Dotaneitor | Python/FastAPI, mismas reglas reescritas, sin campos vacíos | D1 |
| Siglas: cruzar por nombre completo | Solo agregar si no tiene equivalencia real | E1 |
| CR 87: `enfermeria` y `licenciado en enfermeria` | Minúscula, sin acento | E2 |
| Filas sin puesto/sigla/carrera → Excel de análisis | Ningún cargo entra sin estos tres campos resueltos | B1 + E2 |
| `dim_puestos.id_sial` / `cuil` / `cuil_anterior` DROP | Son atributos de la persona, no del puesto. La vinculación persona↔puesto va por `fact_asignaciones` | Diseño esquema estrella |
| `dim_puestos.id_sial_rol` formato corto máx 12 chars | `{id_sial}-{rol}`, ej: `001758874-10`. Los formatos largos (con cuil) fueron corregidos | Limpieza BD |

---

## Historial de cambios

| Fecha | Cambio |
|---|---|
| 2026-11 | Documento inicial creado en Fase 1 del sprint de reestructuración |
| 2026-11 | Decisiones de diagnóstico Grupos A/B/C/D/E incorporadas. Todas las preguntas cerradas. |
| 2026-12 | Verificación contra `schema.prisma` real. Fases 0–2 confirmadas completas. Fase 3 TypeScript completa (script BD pendiente). |
| 2026-12 | `dim_puestos`: eliminadas columnas `id_sial`, `cuil`, `cuil_anterior`. Arquitectura esquema estrella documentada. `id_sial_rol` corregido a formato corto (máx 12 chars) en `dim_puestos` y `ocupaciones`. |
| 2026-12 | `dim_efectores` creada (79 filas: 64 activos, 15 inactivos). 15 DGAH eliminadas. FK `dim_puestos.efector` y `dim_cargos.efector` validadas. `dim_cargos.sigla` renombrada a `efector`. Tarea 4.1 completada. |
| 2026-12 | Regla de clasificación `tipo_cargo` documentada: formacion (docentes/residentes por CR) → estructura (jcat P60/P61) → conduccion (jcat no nulo) → ejecucion (jcat NULL). Los literales orgánicos en CR=25/60 son correctos por diseño. |
| 2026-11-24 | `dim_cargos` documentada: PK `codigo_cargo` formato `PREFIJO-NNNNNN`, dominio MSGC, FK `cargo_id_sistema → cargos.id`. Fixes: `estado` normalizado a minúscula, `codigo_cargo` repaddeado a 6 dígitos. `codigos_registro`, `puestos_cargo`, `especialidades_puesto` marcadas como deprecadas en contexto MSGC (reemplazadas por `dim_carreras`, `dim_puestos`). |
| 2027-01 | Fase 5 operativa en producción. Primera confirmación exitosa (sesión `fa3e1a5d`) con los 4 tipos. `dim_puestos.efector` documentado como nombre real de columna (no `hospital_sigla`). `dim_personas.salud_1er_cargo` documentado como nombre real (no `salud_primer_cargo`). `dim_actividad_hechos` corregida: fix 42.210 actividades con `fecha_desde = fecha_hasta` → 48.606 abiertas. Notas de arquitectura Neon serverless agregadas (sin `$transaction`, sin `Promise.all`, bulk SQL en lotes de 500, FK via subquery). Estado de tablas post-confirmación documentado en `SPRINT_BD_REESTRUCTURACION.md` §5.8. |
