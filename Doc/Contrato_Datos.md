# Contrato de Datos — SRRHH v2

> Fuente de verdad del modelo de datos. Ninguna tabla se crea sin estar definida aquí primero.
> Última actualización: 2026-09 (Post-Sprint 5)
> Estado: VIGENTE

---

## Principios del modelo

1. **Histórico inmutable** — ningún registro se borra físicamente. Todo tiene `deleted_at` o tabla de histórico.
2. **Persona como entidad central** — una persona existe independientemente de si tiene cargo activo.
3. **Cargo como entidad independiente** — un cargo existe aunque esté vacante o deprecado.
4. **Separación ocupación / cargo / persona** — la relación persona↔cargo es una entidad propia con vigencia temporal.
5. **Padrón semanal como evento** — cada carga semanal es un evento inmutable que genera un snapshot y un diff.
6. **Fuente de verdad única** — cada dato tiene exactamente una tabla que lo posee. Sin columnas duplicadas entre tablas.

---

## Mapa de entidades

```
personas ──────────────────────────────────────────────┐
    │                                                   │
    │  (una persona puede tener N ocupaciones)          │
    ▼                                                   │
ocupaciones ◄──── cargos ◄──── hospitales              │
                    │                                   │
                    ├──── escalafones                   │
                    └──── codigos_registro              │
                                                        │
bajas ──────────────────────────────────────────────────┤
    │  (origen de vacante)                              │
    ▼                                                   │
concursos ──────────────────────────────────────────────┤
    │                                                   │
    ├──► concursos_cph                                  │
    └──► concursos_ceetps                               │
                                                        │
padron_snapshots ──► padron_diff                        │
        │                                               │
        └──► padron_historico ──────────────────────────┘
             (foto completa por fecha)
```

---

## Tablas

### `personas`
Una fila por persona única. Existe aunque ya no trabaje.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | Identificador interno |
| `cuil` | VARCHAR(11) UNIQUE | CUIL sin guiones |
| `numero_doc` | VARCHAR(20) | Número de documento |
| `tipo_doc` | VARCHAR(10) | DNI, LC, LE, etc. |
| `apellido_nombre` | VARCHAR(200) | Apellido y nombre completo |
| `fecha_nacimiento` | DATE | — |
| `sexo` | VARCHAR(10) | — |
| `especialidad_principal` | VARCHAR(200) | Especialidad médica si aplica |
| `telefono` | VARCHAR(20) | — |
| `mail_personal` | VARCHAR(255) | — |
| `mail_laboral` | VARCHAR(255) | — |
| `domicilio` | VARCHAR(255) | — |
| `localidad` | VARCHAR(150) | — |
| `provincia` | VARCHAR(100) | — |
| `antiguedad_desde` | DATE | Fecha del primer cargo en el sistema |
| `activo` | BOOLEAN | True si tiene al menos una ocupación activa |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Índices:** `cuil` (UNIQUE), `numero_doc`, `apellido_nombre` (GIN tsvector con config `spanish_unaccent` para búsqueda full-text sin acentos)

---

### `hospitales`
Efectores del sistema de salud. Tabla de referencia.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `sigla` | VARCHAR(20) UNIQUE | Código del efector (ej: HGACA) |
| `nombre` | VARCHAR(200) | Nombre completo |
| `universo_totalizador` | VARCHAR(100) | Agrupador de universo |
| `tipo` | VARCHAR(100) | Tipo de hospital |
| `monovalencia` | VARCHAR(100) | — |
| `activo` | BOOLEAN | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

---

### `escalafones`
Catálogo de escalafones. Tabla de referencia.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `codigo` | VARCHAR(20) UNIQUE | CPH, ENF, TEC, EG, AS, etc. |
| `nombre` | VARCHAR(100) | Nombre completo |
| `activo` | BOOLEAN | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Nota:** `GET /api/v1/escalafones` filtra solo los que tienen al menos un cargo real (`cargos: { some: {} }`), excluyendo los del seed sin datos reales.

---

### `codigos_registro`
Catálogo de códigos de registro SIAL.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `codigo` | VARCHAR(10) UNIQUE | Código numérico (ej: 37, 23, 24) |
| `literal` | VARCHAR(100) | Descripción del código |
| `escalafon_id` | UUID FK → escalafones | — |

---

### `cargos`
Una posición estructural. Existe independientemente de quién lo ocupa.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `id_sial` | VARCHAR(50) UNIQUE | ID en el sistema SIAL del GCBA |
| `codigo` | VARCHAR(30) UNIQUE nullable | Código interno: `{CARRERA}[-{TIPO}][-{MODALIDAD}]-{seq 6 dígitos}` (ej. `CPH-POF-000056`). Se genera al crear el cargo (padrón o alta manual). Cargos manuales usan `MANUAL-{codigo}` como `id_sial` sintético. |
| `hospital_id` | UUID FK → hospitales | — |
| `escalafon_id` | UUID FK → escalafones | — |
| `codigo_registro_id` | UUID FK → codigos_registro | — |
| `literal_puesto` | VARCHAR(200) | Descripción del puesto |
| `especialidad` | VARCHAR(200) | Especialidad si aplica |
| `agrupador` | VARCHAR(150) | Agrupador funcional |
| `unificador_puesto` | VARCHAR(200) | Unificador de puestos |
| `regimen` | VARCHAR(50) | Régimen de empleo (Salud / General / Docente) |
| `codigo_repa` | VARCHAR(20) | Código de repartición SIAL |
| `descripcion_repa` | VARCHAR(200) | Descripción de repartición |
| `cod_agrupamiento` | VARCHAR(20) | Código de agrupamiento SIAL |
| `agrupamiento` | VARCHAR(150) | Descripción de agrupamiento |
| `cod_familia` | VARCHAR(20) | Código de familia SIAL |
| `lit_familia` | VARCHAR(150) | Literal de familia |
| `puesto_codigo_sial` | VARCHAR(20) | Código de puesto en SIAL |
| `estado` | ENUM | `vigente` \| `no_vigente` |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Índices:** `id_sial` (UNIQUE), `codigo` (UNIQUE), `hospital_id`, `escalafon_id`, `estado`

---

### `ocupaciones`
La relación persona↔cargo con vigencia temporal. Fuente de verdad de quién ocupa qué hoy.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `persona_id` | UUID FK → personas | — |
| `cargo_id` | UUID FK → cargos | — |
| `id_sial_rol` | VARCHAR(50) UNIQUE | ID del rol en SIAL (ej: 000110898-2) |
| `cuil_y_rol` | VARCHAR(80) | CUIL + número de rol |
| `situacion_revista` | VARCHAR(50) | Activo \| Retencion de Cargo \| Comision |
| `estado_persona` | VARCHAR(50) | Activo \| Bloqueado \| Comision |
| `desde` | DATE | Inicio de la ocupación |
| `hasta` | DATE | Fin (NULL = activo actualmente) |
| `cargo_desde` | DATE | Fecha de inicio del cargo en SIAL (CARGO_DESDE del Excel) |
| `cargo_hasta` | DATE | Fecha de fin del cargo en SIAL (CARGO_HASTA del Excel) |
| `codigo_jefaturas` | VARCHAR(10) | Código de jefatura (ej: P60, P61) |
| `jefe_escalafon` | VARCHAR(50) | — |
| `documentacion_jefatura` | TEXT | — |
| `comentarios_jefaturas` | TEXT | — |
| `escritorio` | VARCHAR(100) | — |
| `pou_desde` | DATE | — |
| `documentacion_pou` | TEXT | — |
| `comision` | VARCHAR(150) | — |
| `repa_comision` | VARCHAR(200) | — |
| `sr_doc_respaldo` | TEXT | — |
| `sr_comentario` | TEXT | — |
| `cr_comentario` | TEXT | — |
| `fecha_bloqueo` | DATE | — |
| `bloqueo_comentario` | TEXT | — |
| `bloq_motivo` | VARCHAR(200) | — |
| `cod_situacion` | VARCHAR(10) | — |
| `documentacion_del_rol` | TEXT | — |
| `documentacion_baja` | TEXT | — |
| `dias_guardia` | String[] | Array de días de guardia |
| `snapshot_id` | UUID FK → padron_snapshots | Snapshot que originó este registro |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Índices:** `persona_id`, `cargo_id`, `id_sial_rol`, `hasta`

**Invariante:** `hasta IS NULL` = ocupación activa. No hay campo `activo` boolean.

---

### `padron_snapshots`
Cada carga semanal genera un snapshot. Es inmutable una vez aprobado.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `fecha_asignada` | DATE UNIQUE | Fecha del padrón (del nombre del archivo) |
| `filename` | VARCHAR(200) | Nombre del archivo original |
| `total_registros` | INTEGER | Total de filas del Excel subido (no del diff) |
| `procesado_por` | UUID FK → usuarios | Usuario que subió el archivo |
| `estado` | ENUM | `procesando` \| `pendiente` \| `aprobado` \| `rechazado` \| `error` |
| `aprobado_por` | UUID FK → usuarios | — |
| `aprobado_at` | TIMESTAMPTZ | — |
| `paso_actual` | VARCHAR(100) | Paso actual del pipeline (para polling) |
| `error_msg` | TEXT | Mensaje de error si `estado = error` |
| `archivo_resultado_path` | VARCHAR(500) | Ruta del Excel resultado generado por Dotaneitor |
| `archivo_calidad_path` | VARCHAR(500) | Ruta del reporte de calidad generado por Dotaneitor |
| `created_at` | TIMESTAMPTZ | — |

**Regla:** un snapshot `procesando` o `pendiente` bloquea nuevas cargas.

---

### `padron_diff`
Cambios detectados entre el snapshot nuevo y el estado actual. Se genera al procesar.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `snapshot_id` | UUID FK → padron_snapshots | — |
| `tipo` | ENUM | `nuevo` \| `modificado` \| `eliminado` |
| `id_sial_rol` | VARCHAR(50) | ID SIAL del rol afectado |
| `campo` | VARCHAR(100) | Campo que cambió (solo en `modificado`) |
| `valor_anterior` | TEXT | — |
| `valor_nuevo` | TEXT | — |
| `aprobado` | BOOLEAN | Si fue incluido en la aprobación final |
| `created_at` | TIMESTAMPTZ | — |

---

### `padron_historico`
Foto completa del padrón en cada fecha aprobada.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `snapshot_id` | UUID FK → padron_snapshots | — |
| `fecha_asignada` | DATE | Desnormalizado para queries rápidas |
| `persona_id` | UUID FK → personas | — |
| `cargo_id` | UUID FK → cargos | — |
| `id_sial_rol` | VARCHAR(50) | — |
| `escalafon` | VARCHAR(50) | Desnormalizado para performance |
| `hospital_sigla` | VARCHAR(20) | Desnormalizado para performance |
| `literal_puesto` | VARCHAR(200) | — |
| `especialidad` | VARCHAR(200) | — |
| `agrupador` | VARCHAR(150) | — |
| `estado_persona` | VARCHAR(50) | — |
| `situacion_revista` | VARCHAR(50) | — |

**Regla:** solo inserción. Nunca se modifica ni se borra.

---

### `concursos`
Registro de vacantes que originan un proceso concursal.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `persona_id` | UUID FK → personas | Persona que dejó el cargo (nullable si es ampliación) |
| `cargo_id` | UUID FK → cargos | — |
| `hospital_id` | UUID FK → hospitales | — |
| `baja_id` | UUID FK → bajas nullable | Baja que originó el concurso (null si es ampliación) |
| `origen` | VARCHAR(50) | Baja \| Cobertura Dotación \| Ampliación \| POU→POF |
| `fecha_vacante` | DATE | Fecha en que se generó la vacante |
| `motivo` | VARCHAR(200) | Motivo de la vacante |
| `expediente` | VARCHAR(150) | Número de expediente |
| `tipo_concurso` | ENUM | `cph` \| `ceetps` \| `sin_concurso` |
| `registrado_por` | UUID FK → usuarios | — |
| `created_at` | TIMESTAMPTZ | — |

---

### `concursos_cph`
Seguimiento de concursos de la Carrera Profesional Hospitalaria (Ley 6.035).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `concurso_id` | UUID FK → concursos UNIQUE | — |
| `cargo_id` | UUID FK → cargos | — |
| `hospital_id` | UUID FK → hospitales | — |
| `estado` | ENUM | `no_iniciado` \| `activo` \| `finalizado` \| `suspendido` \| `desierto` |
| `sub_estado` | VARCHAR(50) | 19 niveles calculados por `calcConcursoCph()` — no editable |
| `sub_estado_3` | VARCHAR(50) | 8 niveles resumidos para KPIs/alertas — no editable |
| `especialidad_solicitada` | VARCHAR(200) | — |
| `ee_baja` | VARCHAR(150) | Expediente de baja |
| `fecha_baja` | DATE | — |
| `ee_concurso` | VARCHAR(150) | Expediente del concurso |
| `fecha_ee_concurso` | DATE | — |
| `fecha_autorizacion` | DATE | — |
| `sorteo_jurado` | DATE | — |
| `disposicion` | VARCHAR(100) | Disposición de llamado |
| `fecha_insc_desde` | DATE | — |
| `fecha_insc_hasta` | DATE | — |
| `fecha_examen` | DATE | — |
| `fecha_orden_merito` | DATE | — |
| `fecha_ifacs` | DATE | — |
| `fecha_insal` | DATE | — |
| `ee_designacion` | VARCHAR(150) | — |
| `carga_documentacion` | BOOLEAN | — |
| `fecha_apto_medico` | DATE | — |
| `fecha_ite` | DATE | — |
| `proyecto_resolucion` | BOOLEAN | — |
| `reso_a_la_firma` | BOOLEAN | — |
| `resolucion_designacion` | VARCHAR(100) | — |
| `fecha_resolucion` | DATE | — |
| `cargo_sial` | VARCHAR(50) | Código SIAL del cargo asignado tras la designación |
| `dispo_desierta` | VARCHAR(50) | — |
| `fecha_dispo_desierta` | DATE | — |
| `persona_designada_id` | UUID FK → personas | — |
| `suspendido` | BOOLEAN | — |
| `observaciones` | TEXT | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Sub-estados (calculados, no editables directamente):**
`VACANTE → A-CARATULADO → A-AUTZN → B-SORTEO JUR → C-DISPO DE LLAMADO → D-EXAMEN PUBLICADO → E-ORDEN DE MERITO → F-IFACS → G-INSAL → H-TAD → I-CARGA DOCU → J-APTO MED → K-ITE → L-PYCTO DE RESO → M-RESO A LA FIRMA → N-DESIGNADO → O-ALTA SIAL → P-SUSPENDIDO → Q-DESIERTO`

**Sub-estado 3 (resumido):**
`A-VALID. VCTE → B-AUTORIZADO → C-INSCRIPCION → D-ETAPA EVAL → E-ADJUDI → F-PROX.A DESIG → G-RESOLUCION → H-DESIERTO`

**Índice parcial único:** `CREATE UNIQUE INDEX ... WHERE estado NOT IN ('finalizado','desierto')` — garantiza que no haya dos concursos CPH abiertos para el mismo cargo.

---

### `concursos_ceetps`
Seguimiento de concursos ENF / TEC / EG (Leyes 6.767 / 6.035 / 471).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `concurso_id` | UUID FK → concursos UNIQUE | — |
| `cargo_id` | UUID FK → cargos | — |
| `hospital_id` | UUID FK → hospitales | — |
| `escalafon_id` | UUID FK → escalafones | ENF \| TEC \| EG |
| `estado` | ENUM | `sin_autorizar` \| `autorizado` \| `en_proceso` \| `finalizado` \| `desierto` |
| `expediente_concurso` | VARCHAR(150) | — |
| `puesto_solicitado` | VARCHAR(200) | — |
| `dispo_llamado` | VARCHAR(500) | — |
| `fecha_ifacs` | DATE | — |
| `fecha_insal` | DATE | — |
| `expediente_designacion` | VARCHAR(150) | — |
| `dispo_designacion` | VARCHAR(500) | — |
| `resolucion_designacion` | VARCHAR(500) | — |
| `persona_designada_id` | UUID FK → personas | — |
| `observaciones` | TEXT | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Estado calculado server-side** por `calcEstadoCeetps()` en cada write. No editable por el cliente.

---

### `bajas`
Registro de bajas de cargo que originan vacantes.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `cargo_id` | UUID FK → cargos | — |
| `hospital_id` | UUID FK → hospitales | — |
| `persona_id` | UUID FK → personas nullable | Persona que deja el cargo (null si es ampliación) |
| `fecha_baja` | DATE | Fecha en que se produce la vacante |
| `tipo_baja` | VARCHAR(100) nullable | Campo libre — 97% vacío en datos reales. Lista sugerida: Cargo retenido, Interino, Jubilación, Cambio de Efector, Renuncia, Pase a Planta, Fallecimiento |
| `motivo` | VARCHAR(500) | — |
| `tipificador_origen` | VARCHAR(200) nullable | Campo libre para trazabilidad (ej: "Bajas 2025", "Ampliación 2026") |
| `genera_concurso` | BOOLEAN default true | Si true, crea el seguimiento concursal automáticamente |
| `estado` | ENUM | `pendiente` \| `confirmada` \| `anulada` |
| `observaciones` | TEXT | — |
| `registrado_por` | UUID FK → usuarios | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Índices:** `cargo_id`, `hospital_id`, `estado`

---

### `usuarios`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `username` | VARCHAR(64) UNIQUE | — |
| `email` | VARCHAR(255) UNIQUE | — |
| `password_hash` | VARCHAR(255) | bcrypt |
| `rol` | ENUM | `admin` \| `editor` \| `viewer` \| `director` \| `concursales_cph` \| `concursales_ceetps` |
| `hospital_id` | UUID FK → hospitales | Solo para rol `director` |
| `activo` | BOOLEAN | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

---

### `refresh_tokens`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `usuario_id` | UUID FK → usuarios | — |
| `token_hash` | VARCHAR(128) UNIQUE | SHA-256 del token |
| `family_id` | VARCHAR(64) | Agrupa tokens de una sesión |
| `expires_at` | TIMESTAMPTZ | — |
| `revocado` | BOOLEAN | — |
| `created_at` | TIMESTAMPTZ | — |

---

### `audit_logs`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `usuario_id` | UUID FK → usuarios | — |
| `accion` | VARCHAR(32) | create \| update \| delete \| login \| approve |
| `entidad` | VARCHAR(64) | Nombre de la tabla afectada |
| `entidad_id` | VARCHAR(64) | ID del registro afectado |
| `cambios` | JSONB | `{ campo: { antes, despues } }` |
| `ip` | VARCHAR(64) | — |
| `created_at` | TIMESTAMPTZ | — |

---

## Catálogos de apoyo

### `especialidades` y `puestos`
Catálogos paralelos sin FK desde `Cargo` — `Cargo` mantiene campos de texto libre. Permiten normalización progresiva sin romper el modelo existente. `Especialidad.prioritaria` marca las especialidades principales.

### Tablas `ref_*` (mapeos Dotaneitor)
Se cargan una vez y se actualizan cuando cambian las reglas de negocio. Reemplazan los datos hardcodeados que tenía el Dotaneitor original.

| Tabla | Contenido |
|---|---|
| `ref_agrupadores` | Mapeo escalafon + literal_puesto → agrupador |
| `ref_unificadores_puesto` | Mapeo cruce → unificador de puestos |
| `ref_especialidades_cuil` | Lookup especialidad por CUIL (CPH, suplentes, residentes) |
| `ref_abreviaturas_tecnicas` | Abreviaturas técnicas a normalizar |
| `ref_abreviaturas_titulo` | Abreviaturas de título a normalizar |
| `ref_correcciones_lit_puesto` | Correcciones de literal de puesto por cod_reg |
| `ref_correcciones_especialidad` | Correcciones de especialidad |
| `ref_especialidad_por_puesto` | Especialidad inferida por agrupador |
| `ref_conectores_minuscula` | Conectores que van en minúscula (de, del, la, etc.) |
| `ref_sufijos_ordinales` | Sufijos ordinales (1ro, 2do, etc.) |

---

## Flujo del padrón semanal

```
Archivo Excel semanal
        ↓
  padron_snapshots  (estado: procesando)
        ↓
  Dotaneitor procesa → Node calcula diff → genera padron_diff
        ↓
  estado: pendiente
        ↓
  Usuario revisa diff en pantalla Validación
        ↓
  Aprueba → snapshot.estado = aprobado
        ↓
  ┌──────────────────────────────────────┐
  │  ocupaciones  → se actualiza         │  ← quién trabaja hoy
  │  padron_historico → inserta snapshot │  ← foto inmutable de esa fecha
  │  personas → se crea si es nuevo      │  ← registro permanente
  │  cargos → se crea si es nuevo        │  ← registro permanente + genera codigo
  └──────────────────────────────────────┘
```

---

## Convenciones

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas | snake_case plural | `padron_snapshots` |
| Columnas | snake_case | `fecha_asignada` |
| PKs | `id` UUID | `id` |
| FKs | `{tabla_singular}_id` | `persona_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` | — |
| Enums | snake_case | `no_iniciado` |
| Índices | `idx_{tabla}_{columna}` | `idx_ocupaciones_persona_id` |

---

## Reglas que no se negocian

1. **UUID como PK** en todas las tablas — no autoincremental.
2. **Soft delete** — `deleted_at` timestamp. Nunca `DELETE` en producción.
3. **Timestamps en UTC** — `TIMESTAMPTZ`. La conversión a hora local es responsabilidad del frontend.
4. **Sin columnas duplicadas** — si un dato está en `hospitales`, no se repite en `cargos`. Se usa FK.
5. **Desnormalización solo en `padron_historico`** — documentada explícitamente, por performance analítica.
6. **Migraciones versionadas** — todo cambio de esquema es una migración Prisma con nombre descriptivo.
7. **`padron_historico` es append-only** — nunca se modifica ni se borra una fila de esa tabla.
8. **Estado calculado server-side** — `estado`/`subEstado` de concursos se calculan en el backend, nunca se aceptan del cliente.
