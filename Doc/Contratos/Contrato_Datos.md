# Contrato de Datos — SRRHH v2

> Fuente de verdad del modelo de datos. Ninguna tabla se crea sin estar definida aquí primero.
> Última actualización: 2026-10 — Cerrada la reescritura puesto/especialidad (Sprints 20/21/22 ✅). S21-5 eliminó la columna `personas.especialidad_principal` (ahora derivada en runtime). Base previa (2026-09-22): sincronizado contra `prisma/schema.prisma` — tablas de Árbol/Organigrama (`organigramas`, `organigrama_uploads`), POU (`pou`), KPI de dotación (`kpis_dotacion_snapshot`), Autorizaciones (`autorizaciones`), Solicitudes de alta (`solicitudes_alta`), Jerarquía de roles (`role_jerarquias`), Notificaciones (`notificaciones`), Jornadas de sorteo (`jornadas_sorteo`), Inscriptos a concurso (`inscriptos_concurso`), Postulantes (`postulantes`, `postulantes_concurso`) y campos faltantes de `cargos` (retención/cadena), `personas` (`especialidad_cph`), `concursos_cph` (validación padrón + INSAL), `bajas` (vínculo padrón) y `audit_logs` (método/ruta). Corregidos 2 desfases: `cantidad_cargos` no existe en `concursos_cph`/`concursos_ceetps` y `desierto` no pertenece al enum de estado de CPH.
> Estado: VIGENTE
>
> ✅ **Reescritura puesto/especialidad cerrada (Sprints 20/21/22):** el catálogo `puestos_cargo`/`especialidades_puesto` y la resolución contra catálogo del Dotaneitor v2 ya están implementados y mergeados. La **normalización a minúscula/sin tilde** quedó resuelta vía búsqueda `spanish_unaccent` (sin reescribir los datos crudos). Las especialidades se resuelven con el patrón `especialidadSolicitada ?? especialidadPuesto.nombre ?? especialidad_legacy`. Ver `Doc/Referencias/DOTANEITOR_DECISIONES.md`, `Doc/Referencias/AUDITORIA_ESPECIALIDAD.md` y `Doc/Planificacion/Sprints/SPRINT_22_dotaneitor_catalogo.md`.

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
                    ├──── codigos_registro              │
                    └──── cargo_base/retenido (cadena)  │
                                                        │
solicitudes_alta ──► (al aprobar) crea cargos           │
bajas ──────────────────────────────────────────────────┤
    │  (origen de vacante)                              │
    ▼                                                   │
concursos ──────────────────────────────────────────────┤
    │                                                   │
    ├──► concursos_cph ──► inscriptos_concurso          │
    │         │            sorteos_jurado               │
    │         │            ordenes_merito               │
    │         └──► jornadas_sorteo (M:N)                 │
    └──► concursos_ceetps                               │
                                                        │
autorizaciones · notificaciones · audit_logs (transversales)
                                                        │
padron_snapshots ──► padron_diff                        │
        │            kpis_dotacion_snapshot             │
        └──► padron_historico ──────────────────────────┘
             (foto completa por fecha)

Catálogos independientes: organigramas (Árbol) · pou (Ocupación)
```

---

## Tablas

### `personas`

Una fila por persona única. Existe aunque ya no trabaje.

| Columna            | Tipo               | Descripción                                                                                                                              |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | UUID PK            | Identificador interno                                                                                                                    |
| `cuil`             | VARCHAR(11) UNIQUE | CUIL sin guiones                                                                                                                         |
| `numero_doc`       | VARCHAR(20)        | Número de documento                                                                                                                      |
| `tipo_doc`         | VARCHAR(10)        | DNI, LC, LE, etc.                                                                                                                        |
| `apellido_nombre`  | VARCHAR(200)       | Apellido y nombre completo                                                                                                               |
| `fecha_nacimiento` | DATE               | —                                                                                                                                        |
| `sexo`             | VARCHAR(10)        | —                                                                                                                                        |
| `especialidad_cph` | VARCHAR(200) null  | Especialidad CPH canónica (de `ref_especialidades_cuil` tipo=cph); se popula al aprobar cada snapshot y no cambia con el cargo. Indexada |
| `telefono`         | VARCHAR(20)        | —                                                                                                                                        |
| `mail_personal`    | VARCHAR(255)       | —                                                                                                                                        |
| `mail_laboral`     | VARCHAR(255)       | —                                                                                                                                        |
| `domicilio`        | VARCHAR(255)       | —                                                                                                                                        |
| `localidad`        | VARCHAR(150)       | —                                                                                                                                        |
| `provincia`        | VARCHAR(100)       | —                                                                                                                                        |
| `antiguedad_desde` | DATE               | Fecha del primer cargo en el sistema                                                                                                     |
| `activo`           | BOOLEAN            | True si tiene al menos una ocupación activa                                                                                              |
| `created_at`       | TIMESTAMPTZ        | —                                                                                                                                        |
| `updated_at`       | TIMESTAMPTZ        | —                                                                                                                                        |

**Índices:** `cuil` (UNIQUE), `numero_doc`, `apellido_nombre` (GIN tsvector con config `spanish_unaccent` para búsqueda full-text sin acentos)

> ⚠️ **Columna eliminada en Sprint 21 (S21-5):** `personas.especialidad_principal` ya no existe como columna. La especialidad del cargo actual se **deriva en runtime** desde el cargo ocupado vía `especialidadSolicitada ?? especialidadPuesto.nombre ?? especialidad_legacy` (catálogo primero). No se persiste en `personas`.

---

### `hospitales`

Efectores del sistema de salud. Tabla de referencia. Fuente de verdad para todos los selectores de sigla en la UI.

| Columna                | Tipo                  | Descripción                                                                                                                                                 |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | UUID PK               | —                                                                                                                                                           |
| `sigla`                | VARCHAR(20) UNIQUE    | Código del efector (ej: HGAIP)                                                                                                                              |
| `nombre`               | VARCHAR(200)          | Nombre corto del efector (ej: Hospital Pirovano)                                                                                                            |
| `universo_totalizador` | VARCHAR(100)          | Agrupador de universo: `Hospitales` \| `APS` \| `Nivel Central` \| `SAME` \| `Bienestar`                                                                    |
| `tipo`                 | VARCHAR(100)          | Subtipo: `Hospitales de Agudos` \| `Hospitales Monovalentes` \| `Hospitales de Salud Mental` \| `Hospitales de Niños` \| `SS Atención Hospitalaria` \| etc. |
| `monovalencia`         | VARCHAR(100) nullable | Especialidad monovalente si aplica (ej: `Oncología`, `Infectología`)                                                                                        |
| `activo`               | BOOLEAN default true  | Si false, no aparece en selectores de la UI                                                                                                                 |
| `created_at`           | TIMESTAMPTZ           | —                                                                                                                                                           |
| `updated_at`           | TIMESTAMPTZ           | —                                                                                                                                                           |

**Datos:** 75 registros. Fuente: tabla `siglas` de dotacion-rrhh (migración `20260908000000_hospitales_enriquecer`).

**Uso en selectores:** los desplegables de sigla muestran `{sigla} — {nombre}` y pueden filtrarse por `universo_totalizador` o `tipo`. El endpoint `GET /api/v1/hospitales` devuelve todos los campos para permitir filtrado en el frontend.

**Universos disponibles:**

| universo_totalizador | Descripción                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `Hospitales`         | Hospitales de la red (agudos, monovalentes, salud mental, niños) |
| `APS`                | Atención Primaria de la Salud (Cesacs, Áreas Programáticas)      |
| `Nivel Central`      | Direcciones Generales y Subsecretarías del Ministerio            |
| `SAME`               | Sistema de Atención Médica de Emergencias                        |
| `Bienestar`          | Secretaría de Bienestar y Personas Mayores                       |

---

### `escalafones`

Catálogo de escalafones. Tabla de referencia. Solo los registros con `activo = true` son visibles en la UI.

| Columna      | Tipo               | Descripción                                           |
| ------------ | ------------------ | ----------------------------------------------------- |
| `id`         | UUID PK            | —                                                     |
| `codigo`     | VARCHAR(20) UNIQUE | Código corto interno                                  |
| `nombre`     | VARCHAR(100)       | Nombre canónico — fuente de verdad para mostrar en UI |
| `activo`     | BOOLEAN            | Solo `true` = visible en selectores y endpoints       |
| `created_at` | TIMESTAMPTZ        | —                                                     |
| `updated_at` | TIMESTAMPTZ        | —                                                     |

**Escalafones activos con datos reales (post-auditoría 2026-09):**

| Nombre | Cargos reales | Puestos catálogo | Códigos SIAL | Prefijo interno |
|---|---|---|---|
| Nueva Carrera Profesional Hospitalaria | ~24.572 | 50 | 22, 37 | `CPH-POF`, `CPH-POU`, `CPH-J-*`, `CPH-D`, `CPH-SD` |
| CEETPS | ~14.638 | 28 | 85 | `TEC-POF`, `TEC-POU` |
| Nueva Carrera Administrativa | ~6.341 | 156 | 83, 19 | `EG`, `EG-J`, `EG-D`, `EG-G` |
| Salud - Guardias | ~4.274 | 23 | 23 | `CPH` (correcto — guardias son CPH) |
| Residentes | ~3.378 | 8 | 24 | `RES` |
| Docentes Históricos | ~443 | 8 | 7, 07 | `DOC` |
| Carrera Gerencial | ~178 | 3 | 60 | `RG-CG` |
| Plantas Transitorias Acta 06/2014 | ~70 | 1 | 65 | `PT` |
| Autoridades Superiores | ~42 | 4 | 25 | `AS-DG`, `AS-SS`, `AS-MIN`, `AS-DGA` |
| Gabinete | ~34 | 1 | 17 | `PG` |
| Régimen Modular Extraordinario PG | ~10 | 1 | 17B | `PG` |
| Plantas Transitorias Modulo Operativo | ~3 | 1 | 16T | `MO` |
| Cuerpo Especialistas Profesionales | ~62 | 1 | 70 | `CT` |
| Nueva Carrera Enfermería | — | 2 | 87 | `ENF` |

**Regla:** `GET /api/v1/escalafones` filtra `activo = true`. Los registros inactivos son históricos (duplicados de migraciones anteriores) y no se eliminan por integridad referencial.

**Invariante:** `escalafon_id` en `cargos` y `codigos_registro` siempre apunta al mismo escalafón activo. Si difieren, hay un error de datos.

---

### `codigos_registro`

Mapeo de código numérico SIAL → escalafón canónico. Fuente de verdad para resolver a qué escalafón pertenece un cargo del padrón.

| Columna        | Tipo                  | Descripción                                                    |
| -------------- | --------------------- | -------------------------------------------------------------- |
| `id`           | UUID PK               | —                                                              |
| `codigo`       | VARCHAR(10) UNIQUE    | Código numérico SIAL (ej: 37, 23, 83)                          |
| `literal`      | VARCHAR(100)          | Nombre del escalafón tal como viene en `LIT_COD_REG` del Excel |
| `escalafon_id` | UUID FK → escalafones | Escalafón canónico activo al que pertenece este código         |

**Regla de uso:** cuando el padrón trae un `CODIGO DE REGISTRO`, se busca en esta tabla para obtener el `escalafon_id` correcto. El campo `ESCALAFON` del Excel es informativo y puede traer nombres históricos (`Médicos`, `CPH`, etc.) — nunca se usa como fuente de verdad para resolver el escalafón.

**Nota:** un escalafón puede tener más de un código (ej: CPH tiene 22 y 37). El normalizador Python (`normalizador_cargos.py`) unifica los nombres históricos en `ESCALAFON` y `LIT_COD_REG` antes de que lleguen a la BD.

---

### `organigramas`

Estructura jerárquica de unidades organizativas por efector y por sección administrativa (Nivel Central, APS). Árbol estático migrado 1:1 desde la tabla `organigramas` de la app vieja (dotacion-rrhh). No cambia con el padrón semanal: la app arma el árbol desde acá y le cruza en runtime quién ocupa cada nodo hoy (join por `codigo_reparticion` contra `cargos.codigo_repa`).

| Columna                | Tipo               | Descripción                                                          |
| ---------------------- | ------------------ | -------------------------------------------------------------------- |
| `id`                   | UUID PK            | —                                                                    |
| `lvl`                  | INTEGER            | Nivel de profundidad en el árbol                                     |
| `tipo`                 | VARCHAR(50)        | Tipo de nodo                                                         |
| `codigo_reparticion`   | VARCHAR(20) UNIQUE | Clave de cruce contra `cargos.codigo_repa`                           |
| `universo_totalizador` | VARCHAR(100) null  | Agrupador de universo                                                |
| `regimen_empleo`       | VARCHAR(200) null  | —                                                                    |
| `desc_rep`             | VARCHAR(200) null  | Descripción de la repartición                                        |
| `sigla`                | VARCHAR(20)        | Sigla (lógica, no FK dura a `hospitales`: hay nodos Ministerio/Área) |
| `padre`                | VARCHAR(100) null  | Código del nodo padre                                                |
| `path`                 | VARCHAR(600)       | Ruta de códigos hasta la raíz                                        |
| `path_nombres`         | VARCHAR(1200)      | Ruta de nombres hasta la raíz                                        |

**Índices:** `sigla`, `padre`, `universo_totalizador`. **Módulo:** `apps/api/src/modules/organigrama`.

---

### `organigrama_uploads`

Historial de cargas del Excel de estructura (módulo Árbol, solo admin). Cada Excel subido se registra acá para trazabilidad.

| Columna         | Tipo                    | Descripción                 |
| --------------- | ----------------------- | --------------------------- |
| `id`            | UUID PK                 | —                           |
| `filename`      | VARCHAR(255)            | Nombre del archivo original |
| `filas`         | INTEGER                 | Cantidad de filas cargadas  |
| `subido_por_id` | UUID FK → usuarios null | —                           |
| `created_at`    | TIMESTAMPTZ             | —                           |

---

### `pou`

Resumen de dotación (personal necesario/ocupado) por hospital, perfil y especialidad — foto cargada a mano desde el Excel "Ocupacion_POU" de RRHH. Migrado 1:1 desde la tabla `pou` de la app vieja. Cada carga de Excel reemplaza la tabla entera (sin histórico, por decisión explícita).

> **Ojo:** nombre superpuesto a propósito distinto de `ModalidadPuesto.pou` (el campo guardia/planta de un `Cargo` individual). Esta tabla es un conteo agregado por puesto de trabajo, no un dato de ningún cargo puntual.

| Columna             | Tipo              | Descripción       |
| ------------------- | ----------------- | ----------------- |
| `id`                | UUID PK           | —                 |
| `sigla`             | VARCHAR(10)       | Sigla del efector |
| `descripcion_sigla` | VARCHAR(100) null | —                 |
| `perfil`            | VARCHAR(50)       | —                 |
| `especialidad`      | VARCHAR(100)      | —                 |
| `dotacion_diaria`   | INTEGER null      | —                 |
| `dotacion_sem`      | INTEGER null      | —                 |
| `dotacion_total`    | INTEGER null      | —                 |
| `activos`           | INTEGER null      | —                 |
| `tecnicos`          | INTEGER null      | —                 |
| `vacantes`          | INTEGER null      | —                 |

**Único:** `(sigla, perfil, especialidad)`. **Índice:** `sigla`.

---

### `cargos`

Una posición estructural. Existe independientemente de quién lo ocupa.

| Columna               | Tipo                              | Descripción                                                                                                                                                                                                     |
| --------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | UUID PK                           | —                                                                                                                                                                                                               |
| `id_sial`             | VARCHAR(50) UNIQUE                | ID en el sistema SIAL del GCBA                                                                                                                                                                                  |
| `codigo`              | VARCHAR(30) UNIQUE nullable       | Código interno: `{CARRERA}[-{TIPO}][-{MODALIDAD}]-{seq 6 dígitos}` (ej. `CPH-POF-000056`). Se genera al crear el cargo (padrón o alta manual). Cargos manuales usan `MANUAL-{codigo}` como `id_sial` sintético. |
| `hospital_id`         | UUID FK → hospitales              | —                                                                                                                                                                                                               |
| `escalafon_id`        | UUID FK → escalafones             | —                                                                                                                                                                                                               |
| `codigo_registro_id`  | UUID FK → codigos_registro        | —                                                                                                                                                                                                               |
| `literal_puesto`      | VARCHAR(200)                      | Descripción del puesto                                                                                                                                                                                          |
| `especialidad_legacy` | VARCHAR(200)                      | Especialidad como texto libre (renombrada de `especialidad` en migración `20260910000001_especialidades_fk`). **Fuente de verdad para mostrar especialidad en UI.**                                             |
| `especialidad_id`     | UUID FK → especialidades nullable | FK al catálogo normalizado de especialidades (migración `20260910000001_especialidades_fk`). 16.853 cargos con FK activa.                                                                                       |
| `especialidad`        | ~~VARCHAR(200)~~                  | **Columna eliminada de BD.** No existe en la tabla real. Todo el código usa `especialidad_legacy`.                                                                                                              |
| `agrupador`           | VARCHAR(150)                      | Agrupador funcional                                                                                                                                                                                             |
| `unificador_puesto`   | VARCHAR(200)                      | Unificador de puestos                                                                                                                                                                                           |
| `regimen`             | VARCHAR(50)                       | Régimen de empleo (Salud / General / Docente)                                                                                                                                                                   |
| `codigo_repa`         | VARCHAR(20)                       | Código de repartición SIAL                                                                                                                                                                                      |
| `descripcion_repa`    | VARCHAR(200)                      | Descripción de repartición                                                                                                                                                                                      |
| `cod_agrupamiento`    | VARCHAR(20)                       | Código de agrupamiento SIAL                                                                                                                                                                                     |
| `agrupamiento`        | VARCHAR(150)                      | Descripción de agrupamiento                                                                                                                                                                                     |
| `cod_familia`         | VARCHAR(20)                       | Código de familia SIAL                                                                                                                                                                                          |
| `lit_familia`         | VARCHAR(150)                      | Literal de familia                                                                                                                                                                                              |
| `puesto_codigo_sial`  | VARCHAR(20)                       | Código de puesto en SIAL                                                                                                                                                                                        |
| `estado`              | ENUM                              | `vigente` \| `no_vigente` \| `validacion_vacante`                                                                                                                                                               |
| `estado_desde`        | DATE                              | Fecha en que el cargo entró al estado actual                                                                                                                                                                    |
| `expediente`          | VARCHAR(150)                      | Expediente de alta manual                                                                                                                                                                                       |
| `fecha_desde`         | DATE                              | Fecha de inicio del cargo (alta manual)                                                                                                                                                                         |
| `created_by_id`       | UUID FK → usuarios nullable       | Usuario que creó el cargo (alta manual). Null en cargos del padrón                                                                                                                                              |
| `tipo_origen`         | VARCHAR(5) nullable               | Rol en la cadena de retención (S18): `R` = remplazante de ejecución, `TTR` = remplazante de conducción, `null` = cargo normal                                                                                   |
| `cargo_retenido_id`   | UUID FK → cargos nullable         | Cargo que este está remplazando (null si no es remplazante)                                                                                                                                                     |
| `cargo_base_id`       | UUID FK → cargos nullable         | Cargo base de la cadena (desnormalizado). Null si este cargo ES el base                                                                                                                                         |
| `periodo_desde`       | DATE nullable                     | Inicio del período de conducción (solo TTR y bases de conducción)                                                                                                                                               |
| `periodo_hasta`       | DATE nullable                     | Fin del período de conducción                                                                                                                                                                                   |
| `periodo_renovado`    | BOOLEAN default false             | El período fue renovado                                                                                                                                                                                         |
| `fecha_renovacion`    | DATE nullable                     | Fecha de la última renovación de período                                                                                                                                                                        |
| `doc_renovacion`      | TEXT nullable                     | Acto administrativo de la última renovación de período (S19-4)                                                                                                                                                  |
| `created_at`          | TIMESTAMPTZ                       | —                                                                                                                                                                                                               |
| `updated_at`          | TIMESTAMPTZ                       | —                                                                                                                                                                                                               |
| `deleted_at`          | TIMESTAMPTZ                       | Soft delete                                                                                                                                                                                                     |

**Índices:** `id_sial` (UNIQUE), `codigo` (UNIQUE), `hospital_id`, `escalafon_id`, `estado`, `cargo_base_id`, `cargo_retenido_id`

**Estados:**

- `vigente` — activo en la estructura
- `no_vigente` — estado terminal, suprimido
- `validacion_vacante` — baja detectada por el padrón SIAL pendiente de confirmación administrativa (Sprint 8A)

**Cadena de retención (S18):** un cargo remplazante (`tipo_origen` = `R`/`TTR`) apunta al cargo que cubre vía `cargo_retenido_id` y al cargo base de la cadena vía `cargo_base_id`. Ver `Doc/Contratos/Contrato_Retenciones.md` y `Doc/Contratos/Contrato_Logica_Cargo.md` para el detalle de la lógica.

---

### `ocupaciones`

La relación persona↔cargo con vigencia temporal. Fuente de verdad de quién ocupa qué hoy.

| Columna                  | Tipo                       | Descripción                                               |
| ------------------------ | -------------------------- | --------------------------------------------------------- |
| `id`                     | UUID PK                    | —                                                         |
| `persona_id`             | UUID FK → personas         | —                                                         |
| `cargo_id`               | UUID FK → cargos           | —                                                         |
| `id_sial_rol`            | VARCHAR(50) UNIQUE         | ID del rol en SIAL (ej: 000110898-2)                      |
| `cuil_y_rol`             | VARCHAR(80)                | CUIL + número de rol                                      |
| `situacion_revista`      | VARCHAR(50)                | Activo \| Retencion de Cargo \| Comision                  |
| `estado_persona`         | VARCHAR(50)                | Activo \| Bloqueado \| Comision                           |
| `desde`                  | DATE                       | Inicio de la ocupación                                    |
| `hasta`                  | DATE                       | Fin (NULL = activo actualmente)                           |
| `cargo_desde`            | DATE                       | Fecha de inicio del cargo en SIAL (CARGO_DESDE del Excel) |
| `cargo_hasta`            | DATE                       | Fecha de fin del cargo en SIAL (CARGO_HASTA del Excel)    |
| `codigo_jefaturas`       | VARCHAR(10)                | Código de jefatura (ej: P60, P61)                         |
| `jefe_escalafon`         | VARCHAR(50)                | —                                                         |
| `documentacion_jefatura` | TEXT                       | —                                                         |
| `comentarios_jefaturas`  | TEXT                       | —                                                         |
| `escritorio`             | VARCHAR(100)               | —                                                         |
| `pou_desde`              | DATE                       | —                                                         |
| `documentacion_pou`      | TEXT                       | —                                                         |
| `comision`               | VARCHAR(150)               | —                                                         |
| `repa_comision`          | VARCHAR(200)               | —                                                         |
| `sr_doc_respaldo`        | TEXT                       | —                                                         |
| `sr_comentario`          | TEXT                       | —                                                         |
| `cr_comentario`          | TEXT                       | —                                                         |
| `fecha_bloqueo`          | DATE                       | —                                                         |
| `bloqueo_comentario`     | TEXT                       | —                                                         |
| `bloq_motivo`            | VARCHAR(200)               | —                                                         |
| `cod_situacion`          | VARCHAR(10)                | —                                                         |
| `documentacion_del_rol`  | TEXT                       | —                                                         |
| `documentacion_baja`     | TEXT                       | —                                                         |
| `dias_guardia`           | String[]                   | Array de días de guardia                                  |
| `snapshot_id`            | UUID FK → padron_snapshots | Snapshot que originó este registro                        |
| `created_at`             | TIMESTAMPTZ                | —                                                         |
| `updated_at`             | TIMESTAMPTZ                | —                                                         |

**Índices:** `persona_id`, `cargo_id`, `id_sial_rol`, `hasta`

**Invariante:** `hasta IS NULL` = ocupación activa. No hay campo `activo` boolean.

---

### `padron_snapshots`

Cada carga semanal genera un snapshot. Es inmutable una vez aprobado.

| Columna                  | Tipo               | Descripción                                                         |
| ------------------------ | ------------------ | ------------------------------------------------------------------- |
| `id`                     | UUID PK            | —                                                                   |
| `fecha_asignada`         | DATE UNIQUE        | Fecha del padrón (del nombre del archivo)                           |
| `filename`               | VARCHAR(200)       | Nombre del archivo original                                         |
| `total_registros`        | INTEGER            | Total de filas del Excel subido (no del diff)                       |
| `procesado_por`          | UUID FK → usuarios | Usuario que subió el archivo                                        |
| `estado`                 | ENUM               | `procesando` \| `pendiente` \| `aprobado` \| `rechazado` \| `error` |
| `aprobado_por`           | UUID FK → usuarios | —                                                                   |
| `aprobado_at`            | TIMESTAMPTZ        | —                                                                   |
| `paso_actual`            | VARCHAR(100)       | Paso actual del pipeline (para polling)                             |
| `error_msg`              | TEXT               | Mensaje de error si `estado = error`                                |
| `archivo_resultado_path` | VARCHAR(500)       | Ruta del Excel resultado generado por Dotaneitor                    |
| `archivo_calidad_path`   | VARCHAR(500)       | Ruta del reporte de calidad generado por Dotaneitor                 |
| `created_at`             | TIMESTAMPTZ        | —                                                                   |

**Regla:** un snapshot `procesando` o `pendiente` bloquea nuevas cargas.

---

### `padron_diff`

Cambios detectados entre el snapshot nuevo y el estado actual. Se genera al procesar.

| Columna          | Tipo                       | Descripción                             |
| ---------------- | -------------------------- | --------------------------------------- |
| `id`             | UUID PK                    | —                                       |
| `snapshot_id`    | UUID FK → padron_snapshots | —                                       |
| `tipo`           | ENUM                       | `nuevo` \| `modificado` \| `eliminado`  |
| `id_sial_rol`    | VARCHAR(50)                | ID SIAL del rol afectado                |
| `campo`          | VARCHAR(100)               | Campo que cambió (solo en `modificado`) |
| `valor_anterior` | TEXT                       | —                                       |
| `valor_nuevo`    | TEXT                       | —                                       |
| `aprobado`       | BOOLEAN                    | Si fue incluido en la aprobación final  |
| `created_at`     | TIMESTAMPTZ                | —                                       |

---

### `padron_historico`

Foto completa del padrón en cada fecha aprobada.

| Columna             | Tipo                       | Descripción                                                                        |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `id`                | UUID PK                    | —                                                                                  |
| `snapshot_id`       | UUID FK → padron_snapshots | —                                                                                  |
| `fecha_asignada`    | DATE                       | Desnormalizado para queries rápidas                                                |
| `persona_id`        | UUID FK → personas         | —                                                                                  |
| `cargo_id`          | UUID FK → cargos           | —                                                                                  |
| `id_sial_rol`       | VARCHAR(50)                | —                                                                                  |
| `cuil`              | VARCHAR(11) null           | Nullable en filas anteriores a S6-0 hasta el backfill; toda fila nueva lo completa |
| `escalafon`         | VARCHAR(50)                | Desnormalizado para performance                                                    |
| `hospital_sigla`    | VARCHAR(20)                | Desnormalizado para performance                                                    |
| `literal_puesto`    | VARCHAR(200)               | —                                                                                  |
| `especialidad`      | VARCHAR(200)               | —                                                                                  |
| `agrupador`         | VARCHAR(150)               | —                                                                                  |
| `unificador_puesto` | VARCHAR(200) null          | —                                                                                  |
| `estado_persona`    | VARCHAR(50)                | —                                                                                  |
| `situacion_revista` | VARCHAR(50)                | —                                                                                  |

**Índices:** `snapshot_id`, `fecha_asignada`, `persona_id`, `cargo_id`, `cuil`.

**Regla:** solo inserción. Nunca se modifica ni se borra.

---

### `kpis_dotacion_snapshot`

Resumen de evolución histórica de dotación por escalafón. Una fila por `(fecha, escalafon)`, insertada al aprobar cada snapshot de padrón (`padron.service.ts`, `aprobarSnapshotService`). El escalafón viene de `cargo_id → escalafones.nombre` (nombre canónico, no el texto desnormalizado de `padron_historico`).

| Columna     | Tipo         | Descripción                        |
| ----------- | ------------ | ---------------------------------- |
| `fecha`     | DATE         | Fecha del snapshot (parte de PK)   |
| `escalafon` | VARCHAR(100) | Nombre canónico (parte de PK)      |
| `personas`  | INTEGER      | Personas del escalafón en la fecha |

**PK compuesta:** `(fecha, escalafon)`. **Índice:** `fecha`.

> ⚠️ **Muta (backlog B-15):** el KPI mensual planificado (última foto de cada mes, armado en backend desde `ocupaciones`) va a rediseñar cómo se alimenta esta tabla. Ver `Doc/Referencias/DOTANEITOR_DECISIONES.md` y `Doc/Planificacion/PLAN_SCRUM_2026.md` (B-15).

---

### `concursos`

Registro de vacantes que originan un proceso concursal.

| Columna           | Tipo                     | Descripción                                                                                                                                     |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | UUID PK                  | —                                                                                                                                               |
| `persona_id`      | UUID FK → personas       | Persona que dejó el cargo (nullable si es ampliación)                                                                                           |
| `cargo_id`        | UUID FK → cargos         | —                                                                                                                                               |
| `hospital_id`     | UUID FK → hospitales     | —                                                                                                                                               |
| `baja_id`         | UUID FK → bajas nullable | Baja que originó el concurso (null si es ampliación)                                                                                            |
| `origen`          | VARCHAR(50)              | Baja \| Cobertura Dotación \| Ampliación \| POU→POF                                                                                             |
| `fecha_vacante`   | DATE                     | Fecha en que se generó la vacante                                                                                                               |
| `motivo`          | VARCHAR(200)             | Motivo de la vacante                                                                                                                            |
| `expediente`      | VARCHAR(150)             | Número de expediente                                                                                                                            |
| `tipo_concurso`   | ENUM                     | `cph` \| `ceetps` \| `sin_concurso`                                                                                                             |
| `motivo_concurso` | ENUM null                | Motivo tipificado cuando el concurso nace de una solicitud de alta (S14-1): `nuevo_cargo` \| `alta_por_baja`. Distinto del campo libre `motivo` |
| `registrado_por`  | UUID FK → usuarios       | —                                                                                                                                               |
| `created_at`      | TIMESTAMPTZ              | —                                                                                                                                               |

---

### `concursos_cph`

Seguimiento de concursos de la Carrera Profesional Hospitalaria (Ley 6.035).

| Columna                         | Tipo                                   | Descripción                                                                                                                                                                                                                             |
| ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | UUID PK                                | —                                                                                                                                                                                                                                       |
| `concurso_id`                   | UUID FK → concursos UNIQUE             | —                                                                                                                                                                                                                                       |
| `cargo_id`                      | UUID FK → cargos                       | —                                                                                                                                                                                                                                       |
| `hospital_id`                   | UUID FK → hospitales                   | —                                                                                                                                                                                                                                       |
| `estado`                        | ENUM                                   | `no_iniciado` \| `activo` \| `finalizado` \| `suspendido` (enum `EstadoConcursoCph`). Una ronda desierta no cambia el enum: deja el concurso en `suspendido` + sub-estado `Q-DESIERTO` y registra la ronda en `concursos_cph_desiertos` |
| `sub_estado`                    | VARCHAR(50)                            | 19 niveles calculados por `calcConcursoCph()` — no editable                                                                                                                                                                             |
| `sub_estado_3`                  | VARCHAR(50)                            | 8 niveles resumidos para KPIs/alertas — no editable                                                                                                                                                                                     |
| `especialidad_solicitada`       | VARCHAR(200)                           | —                                                                                                                                                                                                                                       |
| `ee_baja`                       | VARCHAR(150)                           | Expediente de baja                                                                                                                                                                                                                      |
| `fecha_baja`                    | DATE                                   | —                                                                                                                                                                                                                                       |
| `ee_concurso`                   | VARCHAR(150)                           | Expediente del concurso                                                                                                                                                                                                                 |
| `fecha_ee_concurso`             | DATE                                   | —                                                                                                                                                                                                                                       |
| `if_autorizacion`               | VARCHAR(150)                           | IF de autorización — número de documento que se completa en la apertura (Etapa 1) antes de solicitar la autorización a SGRASV. Visible en solo-lectura en etapas posteriores                                                            |
| `fecha_autorizacion`            | DATE                                   | —                                                                                                                                                                                                                                       |
| `sorteo_jurado`                 | DATE                                   | Fecha del sorteo de jurado (Etapa 2). El acta detallada vive en `sorteos_jurado`                                                                                                                                                        |
| `puesto_solicitado`             | VARCHAR(200)                           | Puesto que se solicita cubrir — distinto del literal de la baja en casos Jefaturas/Cobertura POU. Si es null, se asume el mismo que el de la baja                                                                                       |
| `tipo_gestion`                  | VARCHAR(20)                            | `centralizado` (interviene SGOCDCPS en la etapa 3) \| `descentralizado` (interviene un tercero). Informativo, se define en Etapa 2                                                                                                      |
| `disposicion`                   | VARCHAR(100)                           | Disposición de llamado                                                                                                                                                                                                                  |
| `fecha_insc_desde`              | DATE                                   | —                                                                                                                                                                                                                                       |
| `fecha_insc_hasta`              | DATE                                   | —                                                                                                                                                                                                                                       |
| `inscripcion_cerrada`           | BOOLEAN default false                  | Al cerrarse el período de inscripción de exámenes (Etapa 3) el sub-estado avanza de C a D                                                                                                                                               |
| `fecha_cierre_inscripcion`      | DATE                                   | Fecha del cierre de inscripción de exámenes                                                                                                                                                                                             |
| `presentados_confirmados`       | BOOLEAN default false                  | Al confirmarse se congela quién se presentó al examen                                                                                                                                                                                   |
| `orden_merito_confirmado`       | BOOLEAN default false                  | Al confirmarse se fija el ranking, `fecha_orden_merito` = hoy y el sub-estado avanza a E                                                                                                                                                |
| `fecha_examen`                  | DATE                                   | —                                                                                                                                                                                                                                       |
| `fecha_orden_merito`            | DATE                                   | —                                                                                                                                                                                                                                       |
| `fecha_ifacs`                   | DATE                                   | —                                                                                                                                                                                                                                       |
| `fecha_insal`                   | DATE                                   | —                                                                                                                                                                                                                                       |
| `ee_designacion`                | VARCHAR(150)                           | —                                                                                                                                                                                                                                       |
| `carga_documentacion`           | BOOLEAN                                | —                                                                                                                                                                                                                                       |
| `fecha_apto_medico`             | DATE                                   | —                                                                                                                                                                                                                                       |
| `fecha_ite`                     | DATE                                   | —                                                                                                                                                                                                                                       |
| `proyecto_resolucion`           | BOOLEAN                                | —                                                                                                                                                                                                                                       |
| `reso_a_la_firma`               | BOOLEAN                                | —                                                                                                                                                                                                                                       |
| `resolucion_designacion`        | VARCHAR(100)                           | —                                                                                                                                                                                                                                       |
| `fecha_resolucion`              | DATE                                   | —                                                                                                                                                                                                                                       |
| `cargo_sial`                    | VARCHAR(50)                            | Código SIAL del cargo asignado tras la designación                                                                                                                                                                                      |
| `dispo_desierta`                | VARCHAR(50)                            | —                                                                                                                                                                                                                                       |
| `fecha_dispo_desierta`          | DATE                                   | —                                                                                                                                                                                                                                       |
| `persona_designada_id`          | UUID FK → personas                     | Etapa 5 — designación oficial resuelta contra el padrón                                                                                                                                                                                 |
| `suspendido`                    | BOOLEAN default false                  | Concurso pausado. Manda sobre el semáforo de estado (un suspendido nunca aparece como activo/finalizado)                                                                                                                                |
| `ifacs`                         | VARCHAR(200)                           | Expediente IF del IFACS (dato del CSV histórico)                                                                                                                                                                                        |
| `insal`                         | VARCHAR(200)                           | Expediente IF del INSAL (dato del CSV histórico)                                                                                                                                                                                        |
| `insal_aceptado`                | BOOLEAN nullable                       | Respuesta de la persona propuesta al INSAL (Etapa 4). `null` = sin respuesta, `true` = aceptó. Si rechaza no se guarda `false`: se limpia `persona_designada_id` y el inscripto pasa a `insal_rechazados`                               |
| `insal_rechazados`              | TEXT[]                                 | IDs de `inscriptos_concurso` propuestos al INSAL que rechazaron el cargo — se excluyen del orden de mérito                                                                                                                              |
| `inscripto_reservado_id`        | UUID FK → inscriptos_concurso nullable | Etapa 4 — candidato del orden de mérito reservado para el INSAL (apunta a `inscriptos_concurso`, no al padrón). Se limpia si el candidato no acepta                                                                                     |
| `validado`                      | BOOLEAN default false                  | Etapa 5 — `true` cuando el padrón trae a la persona designada con un `id_sial_rol` cuyo cargo coincide en carrera y especialidad con el concurso                                                                                        |
| `validado_at`                   | TIMESTAMPTZ nullable                   | —                                                                                                                                                                                                                                       |
| `validado_id_sial_rol`          | VARCHAR(50) nullable                   | `id_sial_rol` del padrón que validó la designación                                                                                                                                                                                      |
| `cambio_especialidad`           | BOOLEAN default false                  | El concurso cambió de especialidad respecto de la baja de origen                                                                                                                                                                        |
| `motivo_cambio_especialidad`    | TEXT                                   | Justificación del cambio de especialidad                                                                                                                                                                                                |
| `q_inscriptos`                  | INTEGER                                | Cantidad de inscriptos (dato del CSV histórico / autocalculado)                                                                                                                                                                         |
| `pendiente_autorizacion`        | BOOLEAN default false                  | Modificación de sigla/código pendiente de aprobación por SGRASV                                                                                                                                                                         |
| `sigla_solicitada`              | VARCHAR nullable                       | Nueva sigla solicitada (dispara flujo Director → SGRASV)                                                                                                                                                                                |
| `codigo_registro_solicitado_id` | UUID FK nullable                       | Nuevo código de registro solicitado (ídem)                                                                                                                                                                                              |
| `aprobado_director`             | BOOLEAN default false                  | El Director ya aprobó el cambio de sigla/CR                                                                                                                                                                                             |
| `observaciones`                 | TEXT                                   | —                                                                                                                                                                                                                                       |
| `created_at`                    | TIMESTAMPTZ                            | —                                                                                                                                                                                                                                       |
| `updated_at`                    | TIMESTAMPTZ                            | —                                                                                                                                                                                                                                       |

**Sub-estados (calculados, no editables directamente):**
`VACANTE → A-CARATULADO → A-AUTZN → B-SORTEO JUR → C-DISPO DE LLAMADO → D-EXAMEN PUBLICADO → E-ORDEN DE MERITO → F-IFACS → G-INSAL → H-TAD → I-CARGA DOCU → J-APTO MED → K-ITE → L-PYCTO DE RESO → M-RESO A LA FIRMA → N-DESIGNADO → O-ALTA SIAL → P-SUSPENDIDO → Q-DESIERTO`

**Sub-estado 3 (resumido):**
`A-VALID. VCTE → B-AUTORIZADO → C-INSCRIPCION → D-ETAPA EVAL → E-ADJUDI → F-PROX.A DESIG → G-RESOLUCION → H-DESIERTO`

**Índice parcial único:** `CREATE UNIQUE INDEX ... WHERE estado NOT IN ('finalizado','suspendido')` — garantiza que no haya dos concursos CPH abiertos para el mismo cargo, incluso ante requests concurrentes.

**Etapas (5) del wizard:** 1-Apertura → 2-Autorización/Jurado → 3-Inscripción/Examen/Orden de mérito → 4-Adjudicación → 5-Resolución. "Declarar desierto" **no** es una etapa; es una acción que registra una ronda desierta (`concursos_cph_desiertos`) y deja el concurso en `suspendido` + sub-estado `Q-DESIERTO`.

---

### `concursos_cph_desiertos`

Historial de rondas desiertas de un concurso CPH. Un concurso puede tener N rondas desiertas antes de finalizar. Se conserva el snapshot del avance de la ronda que quedó desierta.

| Columna                                    | Tipo                    | Descripción                                         |
| ------------------------------------------ | ----------------------- | --------------------------------------------------- |
| `id`                                       | UUID PK                 | —                                                   |
| `concurso_cph_id`                          | UUID FK → concursos_cph | —                                                   |
| `nro_ronda`                                | INTEGER                 | Número de ronda desierta (1, 2, …)                  |
| `dispo_desierta`                           | VARCHAR(50)             | Disposición que declara desierta la ronda           |
| `fecha_dispo_desierta`                     | DATE                    | —                                                   |
| `sorteo_jurado` … `resolucion_designacion` | (varios)                | Snapshot de las fechas/datos de avance de esa ronda |
| `registrado_por_id`                        | UUID FK → usuarios null | —                                                   |
| `created_at`                               | TIMESTAMPTZ             | —                                                   |

---

## Jurados y Órdenes de mérito (Etapas 2 y 3)

> Estas cuatro tablas soportan el flujo **reutilizable** de jurados y órdenes de mérito entre concursos de la misma especialidad. Ver `Doc/Contrato_Concursos_CPH.md` para las reglas de compatibilidad, vigencia y reserva.

### `sorteos_jurado`

Acta de sorteo de jurado de un concurso CPH (Etapa 2). El jurado se sortea entre profesionales con cargo activo, misma profesión (escalafón) e idoneidad. Un concurso puede tener N sorteos (relanzamientos / ronda desierta); el vigente es el último por `fecha_sorteo`/`created_at`.

| Columna             | Tipo                    | Descripción                                                                                          |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                | UUID PK                 | —                                                                                                    |
| `concurso_cph_id`   | UUID FK → concursos_cph | —                                                                                                    |
| `fecha_sorteo`      | DATE                    | Base de la vigencia (6 meses) para reutilizar el jurado en otro concurso compatible                  |
| `semilla`           | VARCHAR(64)             | Semilla del RNG — permite reproducir/auditar el sorteo                                               |
| `criterios`         | JSONB                   | Snapshot de criterios (cantidad titulares/suplentes, antigüedad mínima, si exige especialidad, etc.) |
| `ambito`            | VARCHAR(20)             | `hospital` \| `sistema` \| `mixto` — alcance efectivo alcanzado por el sorteo                        |
| `observaciones`     | TEXT                    | Advertencias del sorteo (ej. "no se completó el suplente 3")                                         |
| `confirmado`        | BOOLEAN default false   | `false` = borrador editable (re-sorteable); `true` = acta final de solo lectura                      |
| `confirmado_at`     | TIMESTAMPTZ             | —                                                                                                    |
| `confirmado_por_id` | UUID FK → usuarios null | —                                                                                                    |
| `generado_por_id`   | UUID FK → usuarios null | —                                                                                                    |
| `created_at`        | TIMESTAMPTZ             | —                                                                                                    |

---

### `miembros_jurado_sorteados`

Un integrante del jurado sorteado. Guarda el snapshot de por qué fue elegible (para el acta), no solo el vínculo a la persona (el padrón cambia semanalmente).

| Columna               | Tipo                     | Descripción                                                                  |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `id`                  | UUID PK                  | —                                                                            |
| `sorteo_jurado_id`    | UUID FK → sorteos_jurado | —                                                                            |
| `persona_id`          | UUID FK → personas       | —                                                                            |
| `rol`                 | VARCHAR(10)              | `titular` \| `suplente`                                                      |
| `orden`               | INTEGER                  | Orden dentro del rol (1, 2, 3…)                                              |
| `apellido_nombre`     | VARCHAR(200)             | Snapshot del nombre al momento del sorteo                                    |
| `cuil`                | VARCHAR(11)              | —                                                                            |
| `hospital_id`         | UUID null                | —                                                                            |
| `hospital_nombre`     | VARCHAR(200)             | Snapshot del hospital                                                        |
| `puesto`              | VARCHAR(200)             | Snapshot del puesto                                                          |
| `reparticion`         | VARCHAR(200) null        | Repartición del cargo (`descripcion_repa`) — "jefe de qué" (unidad/servicio) |
| `especialidad`        | VARCHAR(200)             | Snapshot de la especialidad                                                  |
| `ambito`              | VARCHAR(20)              | `hospital` (misma unidad organizativa) \| `sistema`                          |
| `regla_aplicada`      | INTEGER null             | Regla de elegibilidad por la que entró (1, 2 o 3)                            |
| `cumple_especialidad` | BOOLEAN default false    | —                                                                            |
| `es_conduccion`       | BOOLEAN default false    | Ocupa cargo de conducción                                                    |
| `antiguedad_anios`    | INTEGER null             | —                                                                            |
| `created_at`          | TIMESTAMPTZ              | —                                                                            |

**Reglas de elegibilidad (prioridad R1 → R2 → R3):** dentro de cada regla se prioriza a quien cumple la especialidad. El match de especialidad **ignora lo que está entre paréntesis** (`Clínica Médica (Medicina Interna)` ≡ `Clínica Médica`) sin modificar los datos de la base — ver `Doc/DATA_CLEANING_ESPECIALIDADES.md`.

---

### `ordenes_merito`

Orden de mérito de un concurso — documento **reutilizable** entre concursos de la misma especialidad/puesto/escalafón. Vigencia: 6 meses desde `fecha_publicacion`, con prórroga opcional de 60 días.

| Columna             | Tipo                    | Descripción                                                     |
| ------------------- | ----------------------- | --------------------------------------------------------------- |
| `id`                | UUID PK                 | —                                                               |
| `concurso_cph_id`   | UUID FK → concursos_cph | Concurso que originó el orden de mérito                         |
| `especialidad`      | VARCHAR(200)            | —                                                               |
| `puesto`            | VARCHAR(200) null       | —                                                               |
| `expediente`        | VARCHAR(200) null       | IF del orden de mérito                                          |
| `fecha_publicacion` | DATE                    | Base de la vigencia                                             |
| `fecha_vencimiento` | DATE                    | `fecha_publicacion` + 6 meses (calculado al crear, no editable) |
| `fecha_prorroga`    | DATE null               | +60 días desde `fecha_vencimiento` (nullable = sin prórroga)    |
| `estado`            | ENUM                    | `vigente` \| `prorrogada` \| `vencida`                          |
| `observaciones`     | TEXT                    | —                                                               |
| `created_at`        | TIMESTAMPTZ             | —                                                               |
| `updated_at`        | TIMESTAMPTZ             | —                                                               |

**Índice:** `(especialidad, estado)` para localizar rápido órdenes vigentes al abrir un concurso de la misma especialidad.

---

### `orden_merito_integrantes`

Cada persona rankeada dentro de un orden de mérito. Un integrante puede reservarse/designarse desde otro concurso compatible (reutilización).

| Columna                     | Tipo                         | Descripción                                                                      |
| --------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `id`                        | UUID PK                      | —                                                                                |
| `orden_merito_id`           | UUID FK → ordenes_merito     | —                                                                                |
| `persona_id`                | UUID FK → personas null      | Nullable: el candidato puede no estar en el padrón                               |
| `cuil`                      | VARCHAR(11)                  | —                                                                                |
| `apellido_nombre`           | VARCHAR(200)                 | —                                                                                |
| `especialidad`              | VARCHAR(200) null            | —                                                                                |
| `posicion`                  | INTEGER                      | Lugar en el orden de mérito (1 = primero)                                        |
| `designado`                 | BOOLEAN default false        | Reservado/designado en un concurso. Marcar reserva ≠ terminar el concurso        |
| `concurso_cph_designado_id` | UUID FK → concursos_cph null | Qué concurso lo designó (trazabilidad de reutilización)                          |
| `anulado`                   | BOOLEAN default false        | Integrante ya no disponible (renunció / no se presentó) sin haber sido designado |
| `motivo_anulado`            | VARCHAR(300) null            | —                                                                                |
| `created_at`                | TIMESTAMPTZ                  | —                                                                                |

**Únicos:** `(orden_merito_id, posicion)` y `(orden_merito_id, cuil)`. **Índice:** `cuil`.

---

### `inscriptos_concurso`

Inscripto a un concurso CPH (Etapa 3 — Inscripción / Examen / OM). Se cargan a mano o por importación de Excel/CSV. La "cantidad de inscriptos" del concurso se autocalcula contando estas filas.

| Columna            | Tipo                    | Descripción                                                                                       |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `id`               | UUID PK                 | —                                                                                                 |
| `concurso_cph_id`  | UUID FK → concursos_cph | —                                                                                                 |
| `apellido`         | VARCHAR(120)            | —                                                                                                 |
| `nombre`           | VARCHAR(120)            | —                                                                                                 |
| `dni`              | VARCHAR(20) null        | —                                                                                                 |
| `cuil`             | VARCHAR(20) null        | —                                                                                                 |
| `sexo`             | VARCHAR(4) null         | M / F / NB / X                                                                                    |
| `fecha_nacimiento` | DATE null               | —                                                                                                 |
| `nacionalidad`     | VARCHAR(80) null        | —                                                                                                 |
| `telefono`         | VARCHAR(40) null        | —                                                                                                 |
| `email`            | VARCHAR(200) null       | —                                                                                                 |
| `titulo`           | VARCHAR(200) null       | —                                                                                                 |
| `matricula`        | VARCHAR(80) null        | —                                                                                                 |
| `especialidad`     | VARCHAR(200) null       | —                                                                                                 |
| `presento_examen`  | BOOLEAN default false   | Si se presentó al examen. Base del orden de mérito                                                |
| `nota`             | FLOAT null              | Nota del examen (0-10). Recalcula el orden de mérito (nota más alta = posición 1; empate por A/N) |
| `orden_merito`     | INTEGER null            | Posición (1 = primero). Solo presentados. Calculada de `nota`, no editable a mano                 |
| `observaciones`    | TEXT null               | —                                                                                                 |
| `created_at`       | TIMESTAMPTZ             | —                                                                                                 |
| `updated_at`       | TIMESTAMPTZ             | —                                                                                                 |

**Índice:** `concurso_cph_id`. Un inscripto puede quedar reservado para el INSAL en un concurso (`concursos_cph.inscripto_reservado_id`).

---

### `jornadas_sorteo` y `jornada_sorteo_concursos`

Una **jornada de sorteo** es un día en que se sortean los jurados de varios concursos CPH juntos. v1: se agenda la fecha y se asocian los concursos (que deben estar en sub-estado `B-SORTEO JUR`).

`jornadas_sorteo`:

| Columna         | Tipo                    | Descripción                                                             |
| --------------- | ----------------------- | ----------------------------------------------------------------------- |
| `id`            | UUID PK                 | —                                                                       |
| `fecha`         | DATE                    | Fecha de la jornada                                                     |
| `titulo`        | VARCHAR(200) null       | —                                                                       |
| `estado`        | VARCHAR(20)             | `planificada` \| `en_curso` \| `finalizada` (v1 usa solo `planificada`) |
| `observaciones` | TEXT null               | —                                                                       |
| `created_by_id` | UUID FK → usuarios null | —                                                                       |
| `created_at`    | TIMESTAMPTZ             | —                                                                       |
| `updated_at`    | TIMESTAMPTZ             | —                                                                       |

`jornada_sorteo_concursos` — pivote M:N jornada ↔ concurso_cph. PK compuesta `(jornada_id, concurso_cph_id)`, `ON DELETE CASCADE` en ambas FKs.

---

### `postulantes` y `postulantes_concurso`

Personas que se postulan a concursos CPH. Pueden o no estar en el padrón (`persona_id` nullable). Al cargar un CUIL que ya existe en `personas` se vincula automáticamente.

`postulantes`:

| Columna           | Tipo                           | Descripción                                      |
| ----------------- | ------------------------------ | ------------------------------------------------ |
| `id`              | UUID PK                        | —                                                |
| `persona_id`      | UUID FK → personas null UNIQUE | Null = postulante externo (no está en el padrón) |
| `cuil`            | VARCHAR(11) UNIQUE             | —                                                |
| `apellido_nombre` | VARCHAR(200)                   | —                                                |
| `especialidad`    | VARCHAR(200) null              | —                                                |
| `es_externo`      | BOOLEAN default false          | Vino del padrón o se postuló sin estar en planta |
| `created_at`      | TIMESTAMPTZ                    | —                                                |
| `updated_at`      | TIMESTAMPTZ                    | —                                                |

`postulantes_concurso`:

| Columna             | Tipo                    | Descripción                              |
| ------------------- | ----------------------- | ---------------------------------------- |
| `id`                | UUID PK                 | —                                        |
| `postulante_id`     | UUID FK → postulantes   | —                                        |
| `concurso_cph_id`   | UUID FK → concursos_cph | —                                        |
| `fecha_postulacion` | DATE                    | —                                        |
| `estado`            | ENUM                    | `inscripto` \| `admitido` \| `rechazado` |
| `observaciones`     | TEXT null               | —                                        |
| `created_at`        | TIMESTAMPTZ             | —                                        |

**Único:** `(postulante_id, concurso_cph_id)` — un postulante no se inscribe dos veces al mismo concurso. **Índice:** `concurso_cph_id`.

---

### `concursos_ceetps`

Seguimiento de concursos ENF / TEC / EG (Leyes 6.767 / 6.035 / 471).

| Columna                  | Tipo                       | Descripción                                                                   |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| `id`                     | UUID PK                    | —                                                                             |
| `concurso_id`            | UUID FK → concursos UNIQUE | —                                                                             |
| `cargo_id`               | UUID FK → cargos           | —                                                                             |
| `hospital_id`            | UUID FK → hospitales       | —                                                                             |
| `escalafon_id`           | UUID FK → escalafones      | ENF \| TEC \| EG                                                              |
| `estado`                 | ENUM                       | `sin_autorizar` \| `autorizado` \| `en_proceso` \| `finalizado` \| `desierto` |
| `expediente_concurso`    | VARCHAR(150)               | —                                                                             |
| `puesto_solicitado`      | VARCHAR(200)               | —                                                                             |
| `dispo_llamado`          | VARCHAR(500)               | —                                                                             |
| `fecha_ifacs`            | DATE                       | —                                                                             |
| `fecha_insal`            | DATE                       | —                                                                             |
| `expediente_designacion` | VARCHAR(150)               | —                                                                             |
| `dispo_designacion`      | VARCHAR(500)               | —                                                                             |
| `resolucion_designacion` | VARCHAR(500)               | —                                                                             |
| `carga_horaria`          | SMALLINT nullable          | Carga horaria en hs (Enfermería/Técnicos), máx. 2 dígitos                     |
| `apertura_2x18`          | BOOLEAN default false      | Excepción de Enfermería (código 87): un cargo de 35hs se abre en dos de 18hs  |
| `informe_apertura`       | VARCHAR(150) nullable      | IF de apertura                                                                |
| `expediente_concurso_2`  | VARCHAR(150) nullable      | Segundo expediente (apertura 2x18)                                            |
| `persona_designada_id`   | UUID FK → personas         | —                                                                             |
| `observaciones`          | TEXT                       | —                                                                             |
| `created_at`             | TIMESTAMPTZ                | —                                                                             |
| `updated_at`             | TIMESTAMPTZ                | —                                                                             |

**Estado calculado server-side** por `calcEstadoCeetps()` en cada write. No editable por el cliente.

---

### `bajas`

Registro de bajas de cargo que originan vacantes.

| Columna                  | Tipo                                | Descripción                                                           |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `id`                     | UUID PK                             | —                                                                     |
| `cargo_id`               | UUID FK → cargos                    | —                                                                     |
| `hospital_id`            | UUID FK → hospitales                | —                                                                     |
| `persona_id`             | UUID FK → personas nullable         | Persona que deja el cargo                                             |
| `fecha_baja`             | DATE                                | Fecha en que se produce la vacante                                    |
| `tipo_baja`              | VARCHAR(100) nullable               | Campo libre                                                           |
| `motivo`                 | VARCHAR(500)                        | —                                                                     |
| `tipificador_origen`     | VARCHAR(200) nullable               | Trazabilidad del origen (ej: "Bajas 2025")                            |
| `ee_baja`                | VARCHAR(500) nullable               | Expediente electrónico de la baja                                     |
| `partida_presupuestaria` | VARCHAR(100) nullable               | Partida presupuestaria del cargo                                      |
| `doc_respaldatoria`      | VARCHAR(500) nullable               | Documento respaldatorio                                               |
| `fecha_pase_paralelo`    | DATE nullable                       | Fecha de pase paralelo / GT                                           |
| `carga_horaria`          | INTEGER nullable                    | Carga horaria del cargo (hs)                                          |
| `genera_concurso`        | BOOLEAN default true                | Si true, crea el seguimiento concursal automáticamente                |
| `estado`                 | ENUM                                | `resolucion_a_la_firma` \| `pendiente` \| `confirmada` \| `anulada`   |
| `padron_vinculado_at`    | TIMESTAMPTZ nullable                | S17 — momento en que la baja se vinculó al archivo semanal del padrón |
| `snapshot_vinculado_id`  | UUID FK → padron_snapshots nullable | Snapshot del padrón que confirmó la baja                              |
| `observaciones`          | TEXT                                | —                                                                     |
| `registrado_por`         | UUID FK → usuarios                  | —                                                                     |
| `created_at`             | TIMESTAMPTZ                         | —                                                                     |
| `updated_at`             | TIMESTAMPTZ                         | —                                                                     |

**Índices:** `cargo_id`, `hospital_id`, `estado`

**Flujo de estados:**

- `resolucion_a_la_firma` — borrador editable, no toca el cargo ni crea concurso
- `pendiente` — confirmada, cargo pasa a `no_vigente`, concurso creado si aplica
- `confirmada` / `anulada` — estados finales

---

### `autorizaciones` (S13)

Autorización genérica: cualquier acción del sistema que requiere aprobación de un superior. `referencia_id` apunta al id del objeto origen (`ConcursoCph` o `SolicitudAlta`). Para CPH con cambio estructural se crean dos en cadena: primero `director`, y cuando aprueba se crea la de `sgrasv`.

| Columna                 | Tipo                    | Descripción                                                                            |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `id`                    | UUID PK                 | —                                                                                      |
| `tipo`                  | ENUM                    | `concurso_cph` \| `alta_cargo` \| `baja_cargo`                                         |
| `referencia_id`         | UUID                    | Id del objeto origen                                                                   |
| `referencia_tipo`       | VARCHAR(50)             | Tipo del objeto origen                                                                 |
| `estado`                | ENUM                    | `pendiente` \| `aprobada` \| `rechazada`                                               |
| `resolver_por_rol_slug` | VARCHAR(40)             | Slug del rol que debe resolver (sin FK a `roles`, igual que `notificaciones.rol_slug`) |
| `solicitado_por_id`     | UUID FK → usuarios null | —                                                                                      |
| `resuelto_por_id`       | UUID FK → usuarios null | —                                                                                      |
| `observaciones`         | TEXT null               | —                                                                                      |
| `created_at`            | TIMESTAMPTZ             | —                                                                                      |
| `updated_at`            | TIMESTAMPTZ             | —                                                                                      |

**Índices:** `referencia_id`, `(resolver_por_rol_slug, estado)`.

---

### `solicitudes_alta` (S7 / S16-8)

Solicitud de alta de cargo — no es un `Cargo` hasta ser aprobada por el director. Al aprobar se generan los `Cargo` reales con código asignado; al rechazar persiste para trazabilidad.

| Columna              | Tipo                            | Descripción                                                        |
| -------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `id`                 | UUID PK                         | —                                                                  |
| `hospital_id`        | UUID FK → hospitales            | —                                                                  |
| `escalafon_id`       | UUID FK → escalafones           | —                                                                  |
| `codigo_registro_id` | UUID FK → codigos_registro null | —                                                                  |
| `literal_puesto`     | VARCHAR(200)                    | —                                                                  |
| `especialidad`       | VARCHAR(200) null               | —                                                                  |
| `agrupador`          | VARCHAR(150) null               | —                                                                  |
| `unificador_puesto`  | VARCHAR(200) null               | —                                                                  |
| `regimen`            | VARCHAR(50) null                | —                                                                  |
| `expediente`         | VARCHAR(150) null               | —                                                                  |
| `desde`              | DATE null                       | —                                                                  |
| `cantidad`           | INTEGER default 1               | Cantidad de cargos a crear al aprobar                              |
| `estado`             | ENUM                            | `pendiente` \| `aprobada` \| `rechazada`                           |
| `baja_origen_id`     | UUID FK → bajas null            | S16-8 — baja que originó la vacante que viene a cubrir             |
| `es_transferencia`   | BOOLEAN default false           | —                                                                  |
| `solicitado_por_id`  | UUID FK → usuarios null         | —                                                                  |
| `cargos_creados_ids` | UUID[]                          | IDs de los `Cargo` creados al aprobar (uno por unidad de cantidad) |
| `observaciones`      | TEXT null                       | —                                                                  |
| `created_at`         | TIMESTAMPTZ                     | —                                                                  |
| `updated_at`         | TIMESTAMPTZ                     | —                                                                  |

**Índices:** `hospital_id`, `estado`. Etiquetable vía `etiquetas_solicitud_alta`.

---

### `role_jerarquias` (S13)

Jerarquía de roles — cimientos para asignación de tareas y permisos en cascada. Un rol puede tener múltiples padres e hijos.

| Columna          | Tipo        | Descripción             |
| ---------------- | ----------- | ----------------------- |
| `rol_hijo_slug`  | VARCHAR(40) | Slug del rol hijo (PK)  |
| `rol_padre_slug` | VARCHAR(40) | Slug del rol padre (PK) |

**PK compuesta:** `(rol_hijo_slug, rol_padre_slug)`.

---

### `notificaciones` (S10-1)

Alertas por rol destinatario. Deduplicación por `origen_key` para no crear la misma alerta dos veces.

| Columna       | Tipo                     | Descripción                                                                                                                                        |
| ------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID PK                  | —                                                                                                                                                  |
| `tipo`        | ENUM                     | `concurso_estancado` \| `concurso_iniciado` \| `baja_pendiente` \| `autorizacion_pendiente` \| `autorizacion_resuelta` \| `vencimiento_conduccion` |
| `rol_slug`    | VARCHAR(40)              | Rol destinatario (ej. `director`, `concursales_cph`)                                                                                               |
| `titulo`      | VARCHAR(200)             | —                                                                                                                                                  |
| `mensaje`     | TEXT                     | —                                                                                                                                                  |
| `origen_tipo` | VARCHAR(50) null         | Tipo del objeto que la originó (`concurso_cph`, `baja`, etc.)                                                                                      |
| `origen_id`   | UUID null                | —                                                                                                                                                  |
| `origen_key`  | VARCHAR(200) UNIQUE null | Clave de deduplicación (ej. `concurso_estancado:{id}:30d`)                                                                                         |
| `leida`       | BOOLEAN default false    | —                                                                                                                                                  |
| `creada_at`   | TIMESTAMPTZ              | —                                                                                                                                                  |
| `leida_at`    | TIMESTAMPTZ null         | —                                                                                                                                                  |

**Índices:** `(rol_slug, leida)`, `tipo`, `creada_at`.

---

### `usuarios`

| Columna         | Tipo                 | Descripción                  |
| --------------- | -------------------- | ---------------------------- |
| `id`            | UUID PK              | —                            |
| `username`      | VARCHAR(64) UNIQUE   | —                            |
| `email`         | VARCHAR(255) UNIQUE  | —                            |
| `password_hash` | VARCHAR(255)         | bcrypt                       |
| `role_id`       | UUID FK → roles      | Rol asignado (RBAC dinámico) |
| `hospital_id`   | UUID FK → hospitales | Solo para rol `director`     |
| `activo`        | BOOLEAN              | —                            |
| `created_at`    | TIMESTAMPTZ          | —                            |
| `updated_at`    | TIMESTAMPTZ          | —                            |

---

### `refresh_tokens`

| Columna      | Tipo                | Descripción                 |
| ------------ | ------------------- | --------------------------- |
| `id`         | UUID PK             | —                           |
| `usuario_id` | UUID FK → usuarios  | —                           |
| `token_hash` | VARCHAR(128) UNIQUE | SHA-256 del token           |
| `family_id`  | VARCHAR(64)         | Agrupa tokens de una sesión |
| `expires_at` | TIMESTAMPTZ         | —                           |
| `revocado`   | BOOLEAN             | —                           |
| `created_at` | TIMESTAMPTZ         | —                           |

---

### `roles`, `permisos` y `role_permisos` (Sprint 8 — RBAC dinámico)

Permiten gestionar los permisos de cada rol desde la UI sin tocar código. `usuarios.role_id` FK → `roles.id`.

| Tabla           | Filas | Descripción                                                                                                    |
| --------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| `roles`         | 7     | Roles del sistema (`admin`, `viewer`, `director`, `sgrasv`, `concursales_cph`, `concursales_ceetps`, `editor`) |
| `permisos`      | 26    | Catálogo de permisos disponibles por módulo/acción                                                             |
| `role_permisos` | ~110  | Tabla pivote rol ↔ permiso                                                                                     |

**Rol `sgrasv`:** resuelve autorizaciones de cambio de sigla/código de registro en concursos CPH. Puede actuar directamente o luego de que el Director apruebe (según si hay cambio de sigla/CR o no). Permiso: `concursos-cph.autorizar`.

---

### `baja_sial_snapshots` y `baja_sial_registros`

Archivo semanal de bajas del Ministerio de Salud (SIAL). Mismo patrón que `padron_snapshots` — upload, diff, aprobación.

**Columnas clave de `baja_sial_registros`:**

| Columna        | Fuente Excel  | Normalización                                                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------- |
| `escalafon`    | `ESCALAFON`   | Variantes históricas CPH unificadas al nombre canónico                             |
| `lit_cod_reg`  | `LIT_COD_REG` | Símbolo `\|` eliminado + variantes CPH unificadas                                  |
| `lit_puesto`   | `LIT_PUESTO`  | Sin normalización adicional (viene del Excel crudo)                                |
| `especialidad` | —             | No viene del Excel; se obtiene de `cargos.especialidad` vía triangulación por CUIL |
| `cod_reg`      | —             | No viene del Excel; se obtiene de `codigos_registro` vía triangulación por CUIL    |

**Triangulación:** al procesar cada snapshot, se cruzan los CUILs del archivo contra `personas` y `ocupaciones` activas (`hasta IS NULL`) para enriquecer cada diff con `existe_en_personas`, `tiene_ocup_activa`, `especialidad`, `hospital` y `cod_reg` reales de la BD.

**Normalización de escalafón y lit_cod_reg:** aplicada en `bajas-sial.service.ts` con el mismo set de variantes CPH que `normalizador_cargos.py`. Garantiza consistencia entre el flujo de bajas SIAL y el flujo del padrón semanal.

**Aprobación:** al aprobar un snapshot solo se actualiza el estado a `aprobado`. No impacta `ocupaciones`, `personas` ni `cargos` — las bajas reales se procesan por el padrón semanal (que detecta los `eliminados` y cierra ocupaciones).

---

### `puestos_cargo` y `especialidades_puesto`

Catálogo normalizado de puestos por escalafón. Alimenta los selectores de formularios (bajas, altas, wizard CPH).

| Columna        | Tipo                  | Descripción                          |
| -------------- | --------------------- | ------------------------------------ |
| `id`           | UUID PK               | —                                    |
| `escalafon_id` | UUID FK → escalafones | Escalafón al que pertenece el puesto |
| `nombre`       | VARCHAR(200)          | Nombre del puesto                    |
| `modalidad`    | ENUM                  | `pof` \| `pou` \| `ambos`            |
| `tipo_puesto`  | ENUM                  | `ejecucion` \| `conduccion`          |
| `activo`       | BOOLEAN               | —                                    |

**Regla `tipo_puesto`:** `conduccion` = puestos con `modalidad = 'ambos'` (Directores, Jefes). `ejecucion` = puestos con `modalidad = 'pof'` o `'pou'`.

**Endpoint:** `GET /api/v1/puestos-cargo?escalafonId=&modalidad=&tipoPuesto=` — filtra en memoria por `modalidad != 'ambos'` para `tipoPuesto=ejecucion` (no por enum Prisma, que falla en runtime).

`especialidades_puesto` contiene las especialidades válidas para cada puesto (295 registros). Alimenta el selector de especialidad en cascada.

---

### `audit_logs`

| Columna      | Tipo               | Descripción                                                                                                                 |
| ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `id`         | UUID PK            | —                                                                                                                           |
| `usuario_id` | UUID FK → usuarios | —                                                                                                                           |
| `accion`     | VARCHAR(32)        | create \| update \| delete \| login \| approve                                                                              |
| `entidad`    | VARCHAR(64)        | Nombre de la tabla afectada                                                                                                 |
| `entidad_id` | VARCHAR(64)        | ID del registro afectado                                                                                                    |
| `metodo`     | VARCHAR(10) null   | Método HTTP de la request (ej. `POST`). Red de seguridad cuando `accion` no alcanza. Null en registros previos a la columna |
| `ruta`       | VARCHAR(300) null  | Ruta completa de la request (ej. `/api/v1/padron/snapshots/xxx/rechazar`)                                                   |
| `cambios`    | JSONB              | `{ campo: { antes, despues } }`                                                                                             |
| `ip`         | VARCHAR(64)        | —                                                                                                                           |
| `created_at` | TIMESTAMPTZ        | —                                                                                                                           |

---

## Catálogos de apoyo

### `especialidades`

Catálogo normalizado de especialidades médicas. **181 registros activos.** Relacionado con `cargos` vía `especialidad_id` FK (16.853 cargos con FK activa).

| Columna      | Tipo         | Descripción                        |
| ------------ | ------------ | ---------------------------------- |
| `id`         | UUID PK      | —                                  |
| `nombre`     | VARCHAR(200) | Nombre canónico de la especialidad |
| `created_at` | TIMESTAMPTZ  | —                                  |

**Búsqueda:** el endpoint `GET /api/v1/cargos` usa `pg_trgm` (extensión `pg_trgm`, migración `20260910000002_pg_trgm`) para búsqueda fuzzy por especialidad — `similarity(e.nombre, $query) > 0.4` cubre variantes morfológicas ("cardiologo" → "Cardiologia"). JOIN: `LEFT JOIN especialidades e ON e.id = c.especialidad_id`.

**Patrón de fallback en frontend:** todo el código usa `especialidadLegacy ?? especialidad` para compatibilidad. El campo `especialidad` en el tipo `Cargo` de `packages/types` está marcado `@deprecated`.

### Tablas `ref_*` (mapeos Dotaneitor)

Se cargan una vez y se actualizan cuando cambian las reglas de negocio. Reemplazan los datos hardcodeados que tenía el Dotaneitor original.

| Tabla                           | Contenido                                                 |
| ------------------------------- | --------------------------------------------------------- |
| `ref_agrupadores`               | Mapeo escalafon + literal_puesto → agrupador              |
| `ref_unificadores_puesto`       | Mapeo cruce → unificador de puestos                       |
| `ref_especialidades_cuil`       | Lookup especialidad por CUIL (CPH, suplentes, residentes) |
| `ref_abreviaturas_tecnicas`     | Abreviaturas técnicas a normalizar                        |
| `ref_abreviaturas_titulo`       | Abreviaturas de título a normalizar                       |
| `ref_correcciones_lit_puesto`   | Correcciones de literal de puesto por cod_reg             |
| `ref_correcciones_especialidad` | Correcciones de especialidad                              |
| `ref_especialidad_por_puesto`   | Especialidad inferida por agrupador                       |
| `ref_conectores_minuscula`      | Conectores que van en minúscula (de, del, la, etc.)       |
| `ref_sufijos_ordinales`         | Sufijos ordinales (1ro, 2do, etc.)                        |

---

## Etiquetas (transversales)

Sistema de etiquetas coloreadas reutilizables, asignables a varias entidades vía tablas pivote. Cada asociación es una relación N–N con borrado en cascada.

### `etiquetas`

| Columna      | Tipo                 | Descripción                      |
| ------------ | -------------------- | -------------------------------- |
| `id`         | UUID PK              | —                                |
| `nombre`     | VARCHAR(100) UNIQUE  | —                                |
| `color`      | VARCHAR(20) null     | Hex o nombre CSS (ej. `#e11d48`) |
| `activo`     | BOOLEAN default true | —                                |
| `created_at` | TIMESTAMPTZ          | —                                |

### Tablas pivote de etiquetas

Todas con PK compuesta `(etiqueta_id, <entidad>_id)` y `ON DELETE CASCADE` en ambas FKs.

| Tabla                      | Asocia etiqueta con |
| -------------------------- | ------------------- |
| `etiquetas_cargo`          | `cargos`            |
| `etiquetas_concurso_cph`   | `concursos_cph`     |
| `etiquetas_baja`           | `bajas`             |
| `etiquetas_solicitud_alta` | `solicitudes_alta`  |

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

| Elemento   | Convención                               | Ejemplo                      |
| ---------- | ---------------------------------------- | ---------------------------- |
| Tablas     | snake_case plural                        | `padron_snapshots`           |
| Columnas   | snake_case                               | `fecha_asignada`             |
| PKs        | `id` UUID                                | `id`                         |
| FKs        | `{tabla_singular}_id`                    | `persona_id`                 |
| Timestamps | `created_at`, `updated_at`, `deleted_at` | —                            |
| Enums      | snake_case                               | `no_iniciado`                |
| Índices    | `idx_{tabla}_{columna}`                  | `idx_ocupaciones_persona_id` |

---

## Tablas eliminadas (historial)

| Tabla                        | Motivo de eliminación                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escalafon_codigos_registro` | Redundante con `codigos_registro`. Hacía lo mismo (código SIAL → escalafón) pero sin FK a `codigos_registro`. Eliminada en auditoría 2026-09. `padron.service.ts` migrado a usar `codigos_registro` directamente. |
| `puestos`                    | Vacía, sin FKs, sin uso en código. Eliminada en auditoría 2026-09. El catálogo de puestos vive en `puestos_cargo`.                                                                                                |

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
9. **`codigos_registro` es la fuente de verdad para resolver escalafón** — nunca usar el campo `ESCALAFON` del Excel directamente. El normalizador Python unifica nombres históricos antes de que lleguen a la BD.
10. **`escalafon_id` en `cargos` y `codigos_registro` deben coincidir** — si difieren, es un error de datos. El padrón usa `codigos_registro` para resolver el escalafón canónico.
