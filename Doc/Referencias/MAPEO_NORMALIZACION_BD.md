# Mapeo de normalización de la base de datos

> Auditoría de la base **local** (Docker/WSL, `postgresql://srrhh_user:***@localhost:5433/srrhh_db`).
> Objetivo: mapear qué datos NO están en minúscula/sin tilde, qué columnas no son atómicas
> y qué tablas se podrían unificar. **Es un diagnóstico, no un plan de ejecución** — la
> normalización real se aplica con el Dotaneitor v2 (Sprints 20-22).
> Fecha: 2026-09-22 · Script reproducible: `scripts/audit_normalizacion.sql`

---

## Resumen ejecutivo

1. **La base está sin normalizar.** Prácticamente **todas** las columnas de texto de negocio
   están 100% en MAYÚSCULA (los valores vienen así del Excel del padrón SIAL). Una parte
   importante además tiene tildes/ñ.
2. **Hay 5 columnas con el mismo patrón "Apellido, Nombre"** que conviene atomizar en
   `apellido` + `nombre` (como ya lo hace `inscriptos_concurso`).
3. **`postulantes` + `postulantes_concurso` están vacías y duplican** a `inscriptos_concurso`
   (que sí tiene datos y ya está atomizada). Candidatas a unificar.
4. **Drift de migración:** `20260926000000_sync_schema_completo` figura aplicada pero
   `cantidad_cargos` sigue existiendo en `concursos_cph`/`concursos_ceetps` en local.
5. La familia POU (`pou` / `pou_cargas` / `pou_especialidad_mapeo`) y el par
   `concursos_cph`/`concursos_ceetps` **NO** conviene unificarlos (propósitos distintos).

---

## 1. Minúscula y sin tilde

Metodología: por columna, sobre los valores no nulos/no vacíos, se contó cuántos tienen
alguna letra mayúscula (`con_may`) y cuántos tienen vocal acentuada, ñ o ü (`con_tilde`).
Cuando `con_may == total`, **el 100% de las filas está en mayúscula**.

### Tablas maestras (impacto alto)

| Columna                           |  Total |   Con mayúsc. | Con tilde | Nota                            |
| --------------------------------- | -----: | ------------: | --------: | ------------------------------- |
| `cargos.literal_puesto`           | 53.346 | 53.346 (100%) |     9.786 | Puesto — clave para el catálogo |
| `cargos.descripcion_repa`         | 52.687 |          100% |    21.519 | Repartición                     |
| `cargos.agrupamiento`             | 21.783 |          100% |    15.154 |                                 |
| `cargos.agrupador`                | 50.231 |          100% |     3.089 |                                 |
| `cargos.unificador_puesto`        | 50.231 |          100% |     3.089 |                                 |
| `cargos.especialidad_legacy`      | 29.651 |          100% |       666 |                                 |
| `cargos.regimen`                  | 52.686 |          100% |         0 | Solo mayúscula (sin tilde)      |
| `cargos.lit_familia`              |      0 |             0 |         0 | **Columna vacía** — ver §4      |
| `personas.apellido_nombre`        | 49.161 |          100% |     1.455 | También no atómica (§2)         |
| `personas.domicilio`              | 35.298 |          100% |    22.365 | ~63% con tilde                  |
| `personas.localidad`              | 35.281 |          100% |    21.461 |                                 |
| `personas.especialidad_principal` | 23.664 |          100% |    12.873 |                                 |
| `personas.especialidad_cph`       | 16.226 |          100% |    12.412 | ~76% con tilde                  |
| `personas.provincia`              | 35.293 |          100% |         0 | Solo mayúscula                  |
| `personas.sexo`                   | 49.153 |          100% |         0 | Enum de hecho (M/F)             |
| `ocupaciones.situacion_revista`   | 53.408 |          100% |        25 | Enum de hecho                   |
| `ocupaciones.estado_persona`      | 53.408 |          100% |     1.804 |                                 |
| `ocupaciones.jefe_escalafon`      |  4.139 |          100% |         0 |                                 |
| `ocupaciones.repa_comision`       |     25 |          100% |        15 |                                 |
| `hospitales.nombre`               |     77 |          100% |         3 |                                 |
| `hospitales.tipo`                 |     76 |          100% |        31 |                                 |
| `escalafones.nombre`              |     20 |            19 |         5 |                                 |
| `especialidades_puesto.nombre`    |    336 |          100% |         0 |                                 |
| `puestos_cargo.nombre`            |    470 |          100% |        68 |                                 |

### Histórico y bajas SIAL (impacto muy alto por volumen)

| Columna                           |   Total | Con mayúsc. | Con tilde |
| --------------------------------- | ------: | ----------: | --------: |
| `padron_historico.escalafon`      | 167.301 |        100% |    34.579 |
| `padron_historico.literal_puesto` | 167.301 |        100% |    34.358 |
| `padron_historico.especialidad`   |  84.159 |        100% |    14.764 |
| `padron_historico.agrupador`      | 100.251 |        100% |     7.350 |
| `baja_sial_registros.ayn`         |  89.908 |        100% |     2.353 |
| `baja_sial_registros.desc_rep`    |  89.908 |        100% |    30.697 |
| `baja_sial_registros.lit_puesto`  |  89.908 |        100% |    19.090 |
| `baja_sial_registros.mot_baja`    |  89.902 |        100% |    17.810 |

> **Conclusión §1:** normalizar a minúscula/sin tilde afecta a casi toda la base. No es un
> parche puntual — es una decisión de pipeline: el Dotaneitor v2 debe entregar los datos ya
> normalizados y las tablas de corte (`padron_historico`, `baja_sial_registros`) se re-generan
> al reprocesar. Por eso conviene hacerlo en el reprocesamiento (S20-22), no con un UPDATE masivo
> retroactivo que se perdería en el próximo `migrate reset`.

**Excepciones que NO son texto libre** (son enums de hecho — decidir si se dejan en mayúscula
o se pasan a un enum real): `personas.sexo`, `ocupaciones.situacion_revista`,
`ocupaciones.estado_persona`. Y **columnas ya limpias de tilde** pero en mayúscula:
`cargos.regimen`, `personas.provincia`.

---

## 2. Atomización (un dato por columna)

### 2.1 Nombre de persona partido — patrón repetido en 5 tablas

Formato actual: `"Apellido(s), Nombre(s)"` en una sola columna. Ejemplos reales:
`Just Tiscornia, Alberto Santiago` · `Gonzalez Bernaldo de Quiros, Fernan` ·
`TISERA, ANTONELA` (en bajas SIAL, además en mayúscula).

| Tabla                       | Columna           |  Filas | Propuesta                                   |
| --------------------------- | ----------------- | -----: | ------------------------------------------- |
| `personas`                  | `apellido_nombre` | 49.161 | separar en `apellido` + `nombre`            |
| `baja_sial_registros`       | `ayn`             | 89.908 | separar en `apellido` + `nombre`            |
| `miembros_jurado_sorteados` | `apellido_nombre` |    132 | snapshot — evaluar si conviene              |
| `orden_merito_integrantes`  | `apellido_nombre` |      — | snapshot                                    |
| `postulantes`               | `apellido_nombre` |      0 | ver §3 (unificar con `inscriptos_concurso`) |

**Modelo de referencia ya correcto:** `inscriptos_concurso` **ya tiene `apellido` y `nombre`
separados**. Es el patrón a replicar.

> ⚠️ El corte por la primera coma cubre la mayoría, pero hay apellidos compuestos
> (`Gonzalez Bernaldo de Quiros`) que quedan enteros en `apellido` — correcto. El riesgo son
> registros sin coma; hay que contarlos antes de migrar.

### 2.2 Campos derivados / compuestos en `ocupaciones`

- `cuil_y_rol` = `"27246838076-1"` → **CUIL + nº de rol** concatenados. Redundante: el CUIL ya
  está en `personas.cuil` (vía `persona_id`) y el rol sale de `id_sial_rol`. Candidato a derivar
  en runtime en vez de almacenar.
- `id_sial_rol` = `"001812167-1-27246838076-1"` = **legajo SIAL + rol + CUIL + rol**. Es la
  clave natural del SIAL; se deja como identificador (no atomizar), pero documentar que empaqueta
  4 datos.

### 2.3 Convención de nombres — 1 sola columna fuera de norma

`ocupaciones."diasGuardia"` es la **única columna camelCase de toda la base** (las demás son
snake_case). Además está **vacía**. Renombrar a `dias_guardia` (o eliminar si no se usa).
Es un array `text[]` — el multivalor es legítimo, no requiere tabla aparte por ahora.

---

## 3. Tablas redundantes / unificables

### 3.1 SÍ unificar — `postulantes` + `postulantes_concurso` → `inscriptos_concurso`

| Tabla                  | Filas | Nombre                          | Estado                       |
| ---------------------- | ----: | ------------------------------- | ---------------------------- |
| `inscriptos_concurso`  |    80 | `apellido` + `nombre` (atómico) | **con datos, bien modelada** |
| `postulantes`          |     0 | `apellido_nombre` (junto)       | vacía                        |
| `postulantes_concurso` |     0 | —                               | vacía                        |

Las tres modelan lo mismo: **una persona anotada a un concurso CPH** (puede o no estar en el
padrón). `postulantes`/`postulantes_concurso` están vacías y usan el formato viejo de nombre.
**Propuesta:** consolidar en `inscriptos_concurso` y eliminar las dos vacías. Riesgo bajo (sin datos que migrar).

### 3.2 NO unificar

- **Familia POU** — `pou` (485, datos de dotación), `pou_cargas` (1, historial de upload del
  Excel), `pou_especialidad_mapeo` (12, mapeo especialidad POU→cargo). Son **3 propósitos
  distintos** (datos / auditoría de carga / catálogo de mapeo). Patrón sano, se dejan.
- **`concursos_cph` vs `concursos_ceetps`** — solo comparten 14 columnas; CPH tiene decenas de
  campos propios (flujo de 17 sub-estados, jurado, orden de mérito). Unificar mezclaría dos
  procesos legales distintos (Ley 6.035 vs 6.767/471). Se dejan separadas.

---

## 4. Hallazgos adicionales (limpieza estructural)

| Hallazgo                  | Detalle                                                                                                                                                               | Acción sugerida                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drift de migración**    | `20260926000000_sync_schema_completo` figura aplicada en `_prisma_migrations`, pero `cantidad_cargos` sigue existiendo en `concursos_cph`/`concursos_ceetps` en local | Reconciliar en el reset de S20 (schema quedará como fuente de verdad). En local el campo AÚN existe pese a lo documentado en Contrato_Datos |
| **Tabla de backup**       | `_backup_cph_estados` (2.004 filas)                                                                                                                                   | Backup de una migración; borrar cuando no se necesite                                                                                       |
| **Vista**                 | `v_pou_triangulacion` es una VIEW, no tabla                                                                                                                           | Correcto, solo documentar                                                                                                                   |
| **Columna vacía**         | `cargos.lit_familia` (0 filas con dato)                                                                                                                               | Confirmar si se llena en algún flujo; si no, eliminar                                                                                       |
| **`cargos.especialidad`** | Ya no existe en BD (renombrada a `especialidad_legacy`)                                                                                                               | Ya reflejado en contratos                                                                                                                   |

---

## 5. Recomendación de secuencia (no ejecutar ahora)

La normalización (minúscula/sin tilde + atomización) se hace **en el reprocesamiento del
Dotaneitor v2**, no con UPDATEs retroactivos:

1. **S22 (Dotaneitor v2):** entregar `literal_puesto`, `especialidad`, `agrupador`, nombres,
   etc. **ya en minúscula y sin tilde** al escribir en BD. Definir excepciones (siglas, `sexo`,
   enums de `situacion_revista`).
2. **Atomización de nombre:** al reprocesar personas, escribir `apellido` + `nombre`
   (replicar `inscriptos_concurso`). Contar antes los registros sin coma.
3. **Unificar postulantes → inscriptos_concurso** y renombrar `"diasGuardia"` → `dias_guardia`
   en la misma tanda de cambios de schema (migración limpia, ambas tablas vacías / columna vacía).
4. Las tablas de corte (`padron_historico`, `baja_sial_registros`) quedan normalizadas al
   re-generarse desde el nuevo pipeline.

> Referencias: `Doc/Referencias/DOTANEITOR_DECISIONES.md`,
> `Doc/Planificacion/Sprints/SPRINT_22_dotaneitor_catalogo.md`.

---

## 6. Estado — correcciones ya planificadas (2026-09-22)

Estos hallazgos ya quedaron consolidados como decisiones (`DOTANEITOR_DECISIONES.md §9`) y como
tareas en los sprints. **Sprint 20 ya está terminado en otra rama**, por lo que entran en S21/S22
como migraciones nuevas sobre el schema de S20, aplicadas a la **toma de información** (sin limpieza
retroactiva).

| Hallazgo                                                            | Decisión                                                                                    | Tarea          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------- |
| Minúscula/sin tilde                                                 | Normalizar al cargar                                                                        | S22-3 / A22-1  |
| Nombre partido (5 tablas)                                           | `personas` única mantiene `apellido_nombre` **+** agrega `apellido`/`nombre` desde la carga | A21-3 + S22-15 |
| `cuil_y_rol`                                                        | Dejar solo `cuil`                                                                           | A21-4          |
| `id_sial_rol`                                                       | Separar ID SIAL + histórico de roles al cargar                                              | A21-4 + S22-16 |
| `diasGuardia` camelCase                                             | Corregir a `dias_guardia` (snake_case)                                                      | A21-5          |
| postulantes redundante                                              | Dejar solo `inscriptos_concurso`                                                            | A21-6          |
| `_backup_cph_estados`, `lit_familia` vacía, drift `cantidad_cargos` | Limpieza estructural                                                                        | A21-7          |
